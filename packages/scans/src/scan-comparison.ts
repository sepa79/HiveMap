/**
 * Responsibility: Compare two immutable completed scans and classify finding and coverage changes.
 * Must not: Validate or mutate scan runs, inspect repositories, persist results, or modify graph state.
 * Contract: Implements completed-run comparison semantics in docs/specs/repository-scan.md.
 */
import {
  FINDING_SEVERITY_VALUES,
  type FindingEvidence,
  type FindingSeverity,
} from "./finding-validation.js";
import type { ScanCoverageException } from "./scan-coverage.js";
import type { CompletedScanRun } from "./scan-run.js";
import { ScanValidationError } from "./scan-validation-error.js";

export type ScanComparisonStatus = "resolved" | "still_open" | "changed" | "new" | "regressed" | "unverifiable";

export type ScanComparisonItem = {
  fingerprint: string;
  status: ScanComparisonStatus;
  before?: FindingEvidence;
  after?: FindingEvidence;
};

export type ScanComparison = {
  beforeScanId: string;
  afterScanId: string;
  profileId: string;
  profileVersionChanged: boolean;
  items: ScanComparisonItem[];
  coverage: {
    added: string[];
    removed: string[];
    failed: ScanCoverageException[];
  };
  verdict: "pass" | "fail";
};

export function compareCompletedScans(before: CompletedScanRun, after: CompletedScanRun): ScanComparison {
  if (before.profileId !== after.profileId) throw new ScanValidationError("Cannot compare scans from different profiles");
  const beforeByFingerprint = evidenceByFingerprint(before.findingEvidence, before.id);
  const afterByFingerprint = evidenceByFingerprint(after.findingEvidence, after.id);
  const failedTargets = new Set(after.coverage.failed.map((entry) => entry.target));
  const fingerprints = [...new Set([...beforeByFingerprint.keys(), ...afterByFingerprint.keys()])].sort();
  const items = fingerprints.map((fingerprint): ScanComparisonItem => {
    const previous = beforeByFingerprint.get(fingerprint);
    const current = afterByFingerprint.get(fingerprint);
    if (previous !== undefined && current === undefined) {
      const unverifiable = previous.sourceRefs.some((sourceRef) => failedTargets.has(sourceRef.target));
      return { fingerprint, status: unverifiable ? "unverifiable" : "resolved", before: previous };
    }
    if (previous === undefined && current !== undefined) return { fingerprint, status: "new", after: current };
    if (previous === undefined || current === undefined) throw new ScanValidationError("Invalid comparison state");
    if (current.finding.status === "unverifiable") {
      return { fingerprint, status: "unverifiable", before: previous, after: current };
    }
    if (current.finding.status === "resolved" || current.finding.status === "accepted") {
      return { fingerprint, status: "resolved", before: previous, after: current };
    }
    if (severityRank(current.finding.severity) > severityRank(previous.finding.severity)) {
      return { fingerprint, status: "regressed", before: previous, after: current };
    }
    const changed = stableFindingContent(previous) !== stableFindingContent(current);
    return { fingerprint, status: changed ? "changed" : "still_open", before: previous, after: current };
  });
  const profileVersionChanged = before.profileVersion !== after.profileVersion;
  const blocking = items.some((item) => {
    if (item.status === "unverifiable") return true;
    if (!["still_open", "regressed", "new"].includes(item.status)) return false;
    const evidence = item.after ?? item.before;
    return evidence !== undefined && ["high", "critical"].includes(evidence.finding.severity);
  });
  return {
    beforeScanId: before.id,
    afterScanId: after.id,
    profileId: before.profileId,
    profileVersionChanged,
    items,
    coverage: {
      added: after.coverage.discovered.filter((target) => !before.coverage.discovered.includes(target)).sort(),
      removed: before.coverage.discovered.filter((target) => !after.coverage.discovered.includes(target)).sort(),
      failed: after.coverage.failed,
    },
    verdict: profileVersionChanged || blocking ? "fail" : "pass",
  };
}

function evidenceByFingerprint(evidence: readonly FindingEvidence[], scanId: string): Map<string, FindingEvidence> {
  const result = new Map<string, FindingEvidence>();
  for (const item of evidence) {
    if (result.has(item.finding.fingerprint)) {
      throw new ScanValidationError(`Duplicate finding fingerprint in scan ${scanId}: ${item.finding.fingerprint}`);
    }
    result.set(item.finding.fingerprint, item);
  }
  return result;
}

function stableFindingContent(evidence: FindingEvidence): string {
  return JSON.stringify({
    label: evidence.label,
    notes: evidence.notes,
    sourceRefs: evidence.sourceRefs,
    kind: evidence.finding.kind,
    severity: evidence.finding.severity,
    confidence: evidence.finding.confidence,
    claims: evidence.finding.claims,
    affectedNodeIds: evidence.finding.affectedNodeIds,
    expectedOwner: evidence.finding.expectedOwner,
    recommendedAction: evidence.finding.recommendedAction,
  });
}

function severityRank(severity: FindingSeverity): number {
  return FINDING_SEVERITY_VALUES.indexOf(severity);
}
