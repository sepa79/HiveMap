import { describe, expect, it } from "vitest";

import type { ProjectSourceRef } from "@hivemap/graph-core";

import {
  DOCUMENTATION_CONFLICTS_PROFILE,
  ScanValidationError,
  compareCompletedScans,
  createFindingNode,
  toFindingEvidence,
  updateFindingNode,
  validateFindingNode,
  validateScanCoverage,
  validateScanProfile,
  type CompletedScanRun,
} from "./index.js";

const sourceA: ProjectSourceRef = { role: "defines", source: "repo-doc", target: "docs/a.md", anchor: "Owner", revision: "a1" };
const sourceB: ProjectSourceRef = { role: "implements", source: "code", target: "src/a.ts", anchor: "owner", revision: "b1" };

describe("repository scans", () => {
  it("validates the built-in documentation profile", () => {
    expect(() => validateScanProfile(DOCUMENTATION_CONFLICTS_PROFILE)).not.toThrow();
  });

  it("requires complete, non-overlapping coverage", () => {
    expect(() =>
      validateScanCoverage({
        discovered: ["docs/a.md", "docs/b.md"],
        included: ["docs/a.md"],
        excluded: [{ target: "docs/b.md", reason: "Archived" }],
        failed: [],
      }),
    ).not.toThrow();
    expect(() =>
      validateScanCoverage({ discovered: ["docs/a.md"], included: ["docs/a.md"], excluded: [], failed: [{ target: "docs/a.md", reason: "Unreadable" }] }),
    ).toThrow(ScanValidationError);
  });

  it("creates and validates conflict finding nodes", () => {
    const node = createFindingNode("scan-a", {
      id: "finding-a",
      label: "Conflicting owner",
      notes: "The architecture and implementation disagree about ownership.",
      fingerprint: "owner-conflict",
      kind: "conflict",
      severity: "high",
      confidence: "high",
      criterionIds: ["contradictory-claims"],
      sources: [
        { sourceRef: sourceA, claim: "Module A owns the concern." },
        { sourceRef: sourceB, claim: "Module B owns the concern." },
      ],
      affectedNodeIds: [],
      expectedOwner: "docs/a.md#Owner",
      recommendedAction: "Align implementation documentation with the owning contract.",
    });

    expect(node.type).toBe("finding");
    expect(() => validateFindingNode(node)).not.toThrow();
    expect(toFindingEvidence(node).finding.fingerprint).toBe("owner-conflict");
  });

  it("rejects resolved findings without evidence", () => {
    expect(() =>
      createFindingNode("scan-a", {
        id: "finding-a",
        label: "Missing evidence",
        notes: "Cannot be resolved without proof.",
        fingerprint: "missing-evidence",
        kind: "stale",
        severity: "normal",
        confidence: "medium",
        status: "resolved",
        criterionIds: ["stale-documentation"],
        sources: [{ sourceRef: sourceA, claim: "The section is stale." }],
        affectedNodeIds: [],
      }),
    ).toThrow("Resolved finding requires resolution evidence");
  });

  it("updates active findings but requires evidence for resolution", () => {
    const node = createFindingNode("scan-a", {
      id: "finding-a",
      label: "Stale owner",
      notes: "The owner is stale.",
      fingerprint: "stale-owner",
      kind: "stale",
      severity: "normal",
      confidence: "medium",
      criterionIds: ["stale-documentation"],
      sources: [{ sourceRef: sourceA, claim: "The owner is stale." }],
      affectedNodeIds: [],
    });

    expect(() => updateFindingNode(node, { status: "resolved" })).toThrow("resolution evidence");
    expect(
      (updateFindingNode(node, { status: "resolved", resolutionEvidence: "Verified by scan-after." }).metadata?.finding as { status: string }).status,
    ).toBe("resolved");
  });

  it("compares completed scans by stable finding fingerprint", () => {
    const beforeFinding = createFindingNode("scan-before", {
      id: "finding-before",
      label: "Conflicting owner",
      notes: "Ownership conflicts.",
      fingerprint: "owner-conflict",
      kind: "conflict",
      severity: "high",
      confidence: "high",
      criterionIds: ["contradictory-claims"],
      sources: [{ sourceRef: sourceA, claim: "A owns it." }, { sourceRef: sourceB, claim: "B owns it." }],
      affectedNodeIds: [],
    });
    const before = completedRun("scan-before", [toFindingEvidence(beforeFinding)], ["docs/a.md", "src/a.ts"]);
    const after = completedRun("scan-after", [], ["docs/a.md", "src/a.ts"]);

    const comparison = compareCompletedScans(before, after);

    expect(comparison.items).toEqual([
      expect.objectContaining({ fingerprint: "owner-conflict", status: "resolved" }),
    ]);
    expect(comparison.verdict).toBe("pass");
  });

  it("does not claim resolution when a source failed in the second scan", () => {
    const finding = createFindingNode("scan-before", {
      id: "finding-before",
      label: "Stale owner",
      notes: "The owner is stale.",
      fingerprint: "stale-owner",
      kind: "stale",
      severity: "high",
      confidence: "high",
      criterionIds: ["stale-documentation"],
      sources: [{ sourceRef: sourceA, claim: "The owner is stale." }],
      affectedNodeIds: [],
    });
    const before = completedRun("scan-before", [toFindingEvidence(finding)], ["docs/a.md"]);
    const after = completedRun("scan-after", [], ["docs/a.md"]);
    after.coverage.included = [];
    after.coverage.failed = [{ target: "docs/a.md", reason: "Unreadable" }];

    const comparison = compareCompletedScans(before, after);

    expect(comparison.items[0]?.status).toBe("unverifiable");
    expect(comparison.verdict).toBe("fail");
  });
});

function completedRun(id: string, findingEvidence: CompletedScanRun["findingEvidence"], discovered: string[]): CompletedScanRun {
  return {
    id,
    profileId: DOCUMENTATION_CONFLICTS_PROFILE.id,
    profileVersion: DOCUMENTATION_CONFLICTS_PROFILE.version,
    repository: { root: "/repo", branch: "main", revision: id },
    actor: { agentId: "agent-a", tool: "codex" },
    startedAt: "2026-07-17T10:00:00.000Z",
    status: "completed",
    coverage: { discovered, included: [...discovered], excluded: [], failed: [] },
    appliedCriteria: DOCUMENTATION_CONFLICTS_PROFILE.criteria.map((criterion) => criterion.id),
    declaredOutputs: [...DOCUMENTATION_CONFLICTS_PROFILE.requiredOutputs],
    findingNodeIds: findingEvidence.map((evidence) => evidence.nodeId),
    completedAt: "2026-07-17T10:01:00.000Z",
    graphDigest: id,
    findingEvidence,
  };
}
