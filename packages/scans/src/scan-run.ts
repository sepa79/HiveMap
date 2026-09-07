/**
 * Responsibility: Define and validate repository scan lifecycle records.
 * Must not: Mutate semantic graphs, compare completed scans, discover repository content, or persist runs.
 * Contract: Enforces scan-run evidence and completion rules in docs/specs/repository-scan.md.
 */
import type { SemanticGraph } from "@hivemap/graph-core";

import type { BoundaryMapArtifact } from "./boundary-map-contract.js";
import { validateBoundaryMap } from "./boundary-map-validation.js";
import { evidenceToNode } from "./finding-evidence-node.js";
import { validateFindingNode, type FindingEvidence } from "./finding-validation.js";
import {
  assertCanonicalRepositoryLocation,
  RepositoryLocationValidationError,
} from "./repository-location.js";
import { validateScanCoverage, type ScanCoverage } from "./scan-coverage.js";
import { validateScanProfile, type ScanProfile, type ScanRequiredOutput } from "./scan-profile.js";
import { ScanValidationError } from "./scan-validation-error.js";
import { assertDate, assertNonEmpty, assertOptionalNonEmpty, assertUnique } from "./scan-value-validation.js";

export type ScanRepository = {
  repositoryIndexId?: string;
  root: string;
  repositoryUrl?: string;
  branch: string;
  revision: string;
  worktreeDigest?: string;
};

export type ScanActor = {
  agentId: string;
  tool: string;
};

export const SCAN_CALIBRATION_DECISION_VALUES = [
  "continue",
  "refine-overlay",
  "correct-coverage",
  "build-boundary-map",
  "restart-scan",
] as const;
export type ScanCalibrationDecision = (typeof SCAN_CALIBRATION_DECISION_VALUES)[number];

export type ScanCalibrationDecisionRecord = {
  decision: ScanCalibrationDecision;
  rationale: string;
  recordedAt: string;
};

type ScanRunBase = {
  id: string;
  profileId: string;
  profileVersion: number;
  effectiveProfile?: ScanProfile;
  repository: ScanRepository;
  actor: ScanActor;
  startedAt: string;
  coverage?: ScanCoverage;
  appliedCriteria: string[];
  declaredOutputs: ScanRequiredOutput[];
  findingNodeIds: string[];
  calibrationDecisions: ScanCalibrationDecisionRecord[];
};

export type InProgressScanRun = ScanRunBase & {
  status: "in_progress";
};

export type CompletedScanRun = ScanRunBase & {
  status: "completed";
  coverage: ScanCoverage;
  completedAt: string;
  graphDigest: string;
  findingEvidence: FindingEvidence[];
  boundaryMap?: BoundaryMapArtifact;
  calibrationOverrideReason?: string;
};

export type ScanRun = InProgressScanRun | CompletedScanRun;

export function validateScanRun(run: ScanRun, profiles: readonly ScanProfile[], graph?: SemanticGraph): void {
  assertNonEmpty("scan.id", run.id);
  assertNonEmpty("scan.profileId", run.profileId);
  if (!Number.isInteger(run.profileVersion) || run.profileVersion < 1) {
    throw new ScanValidationError("scan.profileVersion must be positive");
  }
  const profile = profiles.find((candidate) => candidate.id === run.profileId && candidate.version === run.profileVersion);
  if (profile === undefined) throw new ScanValidationError(`Scan profile not found: ${run.profileId}@${run.profileVersion}`);
  const effectiveProfile = run.effectiveProfile ?? profile;
  validateScanProfile(effectiveProfile);
  if (effectiveProfile.id !== run.profileId || effectiveProfile.version !== run.profileVersion) {
    throw new ScanValidationError(`Scan effectiveProfile must match scan profile identity: ${run.profileId}@${run.profileVersion}`);
  }
  validateRepository(run.repository);
  assertNonEmpty("scan.actor.agentId", run.actor.agentId);
  assertNonEmpty("scan.actor.tool", run.actor.tool);
  assertDate("scan.startedAt", run.startedAt);
  assertUnique("scan.appliedCriteria", run.appliedCriteria);
  assertUnique("scan.declaredOutputs", run.declaredOutputs);
  assertUnique("scan.findingNodeIds", run.findingNodeIds);
  run.calibrationDecisions.forEach(validateScanCalibrationDecisionRecord);
  if (run.coverage !== undefined) validateScanCoverage(run.coverage);
  if (run.status === "in_progress") return;
  assertDate("scan.completedAt", run.completedAt);
  assertNonEmpty("scan.graphDigest", run.graphDigest);
  for (const criterion of effectiveProfile.criteria) {
    if (!run.appliedCriteria.includes(criterion.id)) {
      throw new ScanValidationError(`Scan did not apply required criterion: ${criterion.id}`);
    }
  }
  for (const output of effectiveProfile.requiredOutputs) {
    if (!run.declaredOutputs.includes(output)) throw new ScanValidationError(`Scan did not declare required output: ${output}`);
  }
  if (run.declaredOutputs.includes("boundary-map")) {
    if (run.boundaryMap === undefined) {
      throw new ScanValidationError("Completed scan declared boundary-map without boundaryMap evidence");
    }
    validateBoundaryMap(run.boundaryMap);
  } else if (run.boundaryMap !== undefined) {
    throw new ScanValidationError("Completed scan boundaryMap requires declared output boundary-map");
  }
  if (run.calibrationOverrideReason !== undefined && run.calibrationOverrideReason.trim().length === 0) {
    throw new ScanValidationError("Completed scan calibrationOverrideReason must be non-empty when present");
  }
  if (run.findingEvidence.length !== run.findingNodeIds.length) {
    throw new ScanValidationError("Completed scan finding evidence count mismatch");
  }
  const evidenceIds = run.findingEvidence.map((evidence) => evidence.nodeId);
  assertUnique("scan finding evidence ids", evidenceIds);
  for (const findingId of run.findingNodeIds) {
    if (!evidenceIds.includes(findingId)) throw new ScanValidationError(`Completed scan is missing finding evidence: ${findingId}`);
  }
  for (const evidence of run.findingEvidence) {
    validateFindingNode(evidenceToNode(evidence));
    if (evidence.finding.originScanId !== run.id) {
      throw new ScanValidationError(`Finding ${evidence.nodeId} originates in another scan`);
    }
  }
  if (graph !== undefined) {
    for (const findingId of run.findingNodeIds) {
      const node = graph.nodes.find((candidate) => candidate.id === findingId);
      if (node === undefined) throw new ScanValidationError(`Completed scan finding is missing from graph: ${findingId}`);
      validateFindingNode(node);
    }
  }
}

function validateScanCalibrationDecisionRecord(decision: ScanCalibrationDecisionRecord): void {
  if (!SCAN_CALIBRATION_DECISION_VALUES.includes(decision.decision)) {
    throw new ScanValidationError(`Unknown scan calibration decision: ${decision.decision}`);
  }
  assertNonEmpty("scanCalibrationDecision.rationale", decision.rationale);
  assertDate("scanCalibrationDecision.recordedAt", decision.recordedAt);
}

function validateRepository(repository: ScanRepository): void {
  assertOptionalNonEmpty("repository.repositoryIndexId", repository.repositoryIndexId);
  assertNonEmpty("repository.root", repository.root);
  if (repository.repositoryUrl !== undefined) {
    try {
      assertCanonicalRepositoryLocation(repository.repositoryUrl, "repository.repositoryUrl");
    } catch (error) {
      if (error instanceof RepositoryLocationValidationError) throw new ScanValidationError(error.message);
      throw error;
    }
  }
  assertNonEmpty("repository.branch", repository.branch);
  assertNonEmpty("repository.revision", repository.revision);
  assertOptionalNonEmpty("repository.worktreeDigest", repository.worktreeDigest);
}
