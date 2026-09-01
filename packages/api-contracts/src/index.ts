/**
 * Responsibility: Define and validate shared REST/MCP application request and response contracts.
 * Must not: Execute runtime commands, persist state, or implement transport lifecycle.
 * Contract: Untyped boundary input is validated once into canonical explicit HiveMap operation shapes.
 */
import {
  validateFeedbackEvent,
  validateGraphProposal,
  type FeedbackEvent,
  type GraphProposal,
} from "@hivemap/capture";
import {
  validateCategoryAssignment,
  type CategoryAssignment,
  type CategoryAssignmentTargetIndex,
  type CategoryCatalog,
} from "@hivemap/categories";
import { type GraphCommand, type SemanticGraph } from "@hivemap/graph-core";
import {
  validateProjection,
  type DiveInProjectionInput,
  type OverviewProjectionInput,
  type ProjectMapProjectionInput,
  type Projection,
} from "@hivemap/projections";
import {
  SCAN_CALIBRATION_DECISION_VALUES,
  normalizeRepositoryLocation,
  RepositoryLocationValidationError,
  validateBoundaryMap,
  validateScanCoverage,
  type BoundaryMapArtifact,
  type FindingNodeInput,
  type FindingNodeUpdate,
  type InProgressScanRun,
  type ScanCalibrationDecision,
  type ScanCalibrationDecisionRecord,
  type ScanComparison,
  type ScanCoverage,
  type ScanProfile,
  type ScanRequiredOutput,
  type ScanRun,
} from "@hivemap/scans";
import type { WorkspaceRecord, WorkspaceState } from "@hivemap/storage";

export type OperationResult<T> = {
  ok: true;
  value: T;
};

export type OperationError = {
  ok: false;
  error: {
    code: string;
    message: string;
  };
};

export type ApiResult<T> = OperationResult<T> | OperationError;

export type WorkspaceSummary = {
  id: string;
  slug?: string;
  name: string;
  archived?: boolean;
  updatedAt?: string;
};

export type CreateWorkspaceRequest = {
  workspace: WorkspaceRecord;
};

export type CreateWorkspaceResponse = {
  workspace: WorkspaceRecord;
};

export type ListWorkspaceSummariesRequest = {
  query?: string;
  limit?: number;
  includeArchived?: boolean;
};

export type ListWorkspaceSummariesResponse = {
  items: WorkspaceSummary[];
};

export type GetWorkspaceSummaryRequest = {
  workspaceId: string;
};

export type GetWorkspaceSummaryResponse = {
  workspace: WorkspaceSummary;
};

export type ResolveWorkspaceRequest = {
  ref: string;
};

export type ResolveWorkspaceResponse = {
  workspace: WorkspaceSummary;
};

export type GetWorkspaceResponse = {
  state: WorkspaceState;
};

export type GetGraphRequest = {
  workspaceId: string;
};

export type GetGraphResponse = {
  graph: SemanticGraph;
};

export type UpsertConceptEmbeddingRequest = {
  workspaceId: string;
  nodeId: string;
  embedding: {
    model: string;
    values: number[];
    updatedAt: string;
  };
};

export type UpsertConceptEmbeddingResponse = {
  embedding: {
    workspaceId: string;
    nodeId: string;
    model: string;
    dimensions: number;
    contentDigest: string;
    updatedAt: string;
  };
};

export type ListSimilarConceptsRequest = {
  workspaceId: string;
  nodeId: string;
  model: string;
  limit?: number;
  minScore?: number;
};

export type ListSimilarConceptsResponse = {
  sourceNodeId: string;
  model: string;
  matches: Array<{
    nodeId: string;
    label: string;
    score: number;
    updatedAt: string;
  }>;
};

export type RepositoryIndexMode = "safe" | "deep";

export type RepositoryIndexStage =
  | "requested"
  | "resolving_ref"
  | "checking_out"
  | "discovering"
  | "indexing_syntax"
  | "running_rules"
  | "embedding_changed_chunks"
  | "normalizing"
  | "completed"
  | "failed"
  | "cancelled";

export type RepositoryIndexActor = {
  agentId: string;
  tool: string;
};

export type RepositoryIndexFailure = {
  code: string;
  message: string;
};

export type RepositoryIndexStats = {
  fileCount: number;
  chunkCount: number;
  indexedBytes: number;
};

export type RepositoryIndexRecord = {
  id: string;
  workspaceId: string;
  repositoryUrl: string;
  requestedRef?: string;
  resolvedCommit?: string;
  mode: RepositoryIndexMode;
  stage: RepositoryIndexStage;
  requestedAt: string;
  updatedAt: string;
  completedAt?: string;
  actor: RepositoryIndexActor;
  failure?: RepositoryIndexFailure;
  stats?: RepositoryIndexStats;
};

export type ListRepositoryIndexesRequest = {
  workspaceId: string;
};

export type ListRepositoryIndexesResponse = {
  indexes: RepositoryIndexRecord[];
};

export type GetRepositoryIndexRequest = {
  workspaceId: string;
  indexId: string;
};

export type GetRepositoryIndexResponse = {
  index: RepositoryIndexRecord;
};

export type StartRepositoryIndexRequest = {
  workspaceId: string;
  index: Pick<RepositoryIndexRecord, "id" | "repositoryUrl" | "requestedRef" | "mode" | "requestedAt" | "actor">;
};

export type StartRepositoryIndexResponse = {
  index: RepositoryIndexRecord;
};

export type ExecuteRepositoryIndexRequest = {
  workspaceId: string;
  indexId: string;
};

export type ExecuteRepositoryIndexResponse = {
  index: RepositoryIndexRecord;
};

export type RepositorySearchHit = {
  kind: "file" | "chunk";
  filePath: string;
  language: string;
  sourceKind: string;
  score: number;
  snippet: string;
  startLine?: number;
  endLine?: number;
};

export type SearchRepositoryIndexRequest = {
  workspaceId: string;
  indexId: string;
  query: string;
  limit?: number;
};

export type SearchRepositoryIndexResponse = {
  indexId: string;
  query: string;
  hits: RepositorySearchHit[];
};

export type RepositoryEvidenceSource = {
  kind: "file" | "chunk";
  filePath: string;
  language: string;
  sourceKind: string;
  snippet: string;
  whySelected: string;
  startLine?: number;
  endLine?: number;
};

export type RepositoryEvidenceCandidate = {
  id: string;
  criterionId: string;
  signal: string;
  kind: "deterministic" | "requires_interpretation";
  title: string;
  summary: string;
  sources: RepositoryEvidenceSource[];
};

export type ScanProfileOverlayResolution = {
  status: "found" | "missing";
  source: "repo" | "defaults";
  applied: boolean;
  overlayPath: string;
  guidanceTool: "scan_profile_overlay_help";
  nextActionHint: string;
  mergedIncludeCount: number;
  mergedExcludeCount: number;
};

export type ScanCoverageSummary = {
  discoveredCount: number;
  includedCount: number;
  excludedCount: number;
  failedCount: number;
  discoveredCodeFileCount: number;
  includedCodeFileCount: number;
  discoveredTopLevelCodeSymbolCount: number;
  includedTopLevelCodeSymbolCount: number;
  warnings: string[];
};

export type ScanCalibrationClassification = "findings-ready" | "profile-gap" | "missing-evidence" | "ambiguous-shape";

export type ScanCalibrationAssessment = {
  classification: ScanCalibrationClassification;
  confidence: "low" | "medium" | "high";
  summary: string;
  reasons: string[];
  recommendedActions: string[];
};

export type ScanFindingValidationClassification =
  | "likely-real-finding"
  | "profile-gap"
  | "missing-evidence"
  | "ambiguous-shape";

export type ScanFindingValidationAssessment = {
  classification: ScanFindingValidationClassification;
  confidence: "low" | "medium" | "high";
  summary: string;
  reasons: string[];
  recommendedActions: string[];
};

export type ScanCalibrationDecisionGuidance = {
  decisionRequired: true;
  availableDecisions: ScanCalibrationDecision[];
  recommendedDecisions: ScanCalibrationDecision[];
};

export type ListRepositoryEvidenceCandidatesRequest = {
  workspaceId: string;
  indexId: string;
  profileId: string;
  profileVersion: number;
  criterionId: string;
  limit?: number;
};

export type ListRepositoryEvidenceCandidatesResponse = {
  indexId: string;
  profileId: string;
  profileVersion: number;
  criterionId: string;
  baseProfile: ScanProfile;
  effectiveProfile: ScanProfile;
  overlay: ScanProfileOverlayResolution;
  coverageSummary: ScanCoverageSummary;
  calibrationAssessment: ScanCalibrationAssessment;
  decisionGuidance: ScanCalibrationDecisionGuidance;
  candidates: RepositoryEvidenceCandidate[];
};

export type BuildScanBoundaryMapRequest = {
  workspaceId: string;
  scanId: string;
};

export type BuildScanBoundaryMapResponse = {
  scanId: string;
  profileId: string;
  profileVersion: number;
  repositoryIndexId: string;
  coverageSummary: ScanCoverageSummary;
  calibrationAssessment: ScanCalibrationAssessment;
  decisionGuidance: ScanCalibrationDecisionGuidance;
  boundaryMap: BoundaryMapArtifact;
};

export type GetScanProfileOverlayHelpRequest = {
  workspaceId: string;
  profileId: string;
  profileVersion: number;
};

export const SCAN_PROFILE_OVERLAY_SYMPTOM_VALUES = [
  "scope-roots",
  "boundary-map-heuristics",
  "duplicate-responsibility-selection",
  "duplicate-authority-selection",
  "missing-owner-materiality",
  "stale-documentation-currentness",
  "ssot-order",
] as const;

export type ScanProfileOverlaySymptomId = (typeof SCAN_PROFILE_OVERLAY_SYMPTOM_VALUES)[number];

export type ScanProfileOverlaySymptomHint = {
  id: ScanProfileOverlaySymptomId;
  symptom: string;
  fields: string[];
  rationale: string;
};

export type GetScanProfileOverlayHelpResponse = {
  profileId: string;
  profileVersion: number;
  overlayPath: string;
  format: "yaml";
  formatVersion: number;
  summary: string;
  defaultsBehavior: string;
  validationBehavior: string;
  guidanceTool: "scan_profile_overlay_help";
  mergeRules: string[];
  supportedFields: Array<{
    name: string;
    required: boolean;
    description: string;
  }>;
  overlayBuildWorkflow: string[];
  symptomToFieldHints: ScanProfileOverlaySymptomHint[];
  baseScope: {
    include: string[];
    exclude: string[];
  };
  template: string;
  example: string;
};

export type SuggestScanProfileOverlayRequest = {
  workspaceId: string;
  scanId: string;
  symptomId: ScanProfileOverlaySymptomId;
};

export type SuggestScanProfileOverlayResponse = {
  scanId: string;
  profileId: string;
  profileVersion: number;
  overlay: ScanProfileOverlayResolution;
  recommendedDecision: "refine-overlay";
  symptom: ScanProfileOverlaySymptomHint;
  suggestedFields: Array<{
    name: string;
    source: "effective-profile" | "boundary-map-config";
    currentValues: string[];
  }>;
  suggestedOverlayPatch: string;
  nextActions: string[];
};

export type ApplyGraphCommandsRequest = {
  workspaceId: string;
  commands: GraphCommand[];
};

export type ApplyGraphCommandsResponse = {
  graph: SemanticGraph;
};

export type GetCategoriesRequest = {
  workspaceId: string;
};

export type GetCategoriesResponse = {
  catalog: CategoryCatalog;
  assignments: CategoryAssignment[];
};

export type AssignCategoryRequest = {
  workspaceId: string;
  assignment: CategoryAssignment;
};

export type AssignCategoryResponse = {
  assignments: CategoryAssignment[];
};

export type GetProjectionRequest = {
  workspaceId: string;
  projectionId: string;
};

export type GetProjectionResponse = {
  projection: Projection;
};

export type CreateProjectionRequest = {
  workspaceId: string;
  input: OverviewProjectionInput | DiveInProjectionInput | ProjectMapProjectionInput;
};

export type CreateProjectionResponse = {
  projection: Projection;
};

export type ListFeedbackRequest = {
  workspaceId: string;
};

export type ListFeedbackResponse = {
  feedbackEvents: FeedbackEvent[];
};

export type RecordFeedbackRequest = {
  workspaceId: string;
  feedbackEvent: FeedbackEvent;
};

export type RecordFeedbackResponse = {
  feedbackEvents: FeedbackEvent[];
};

export type ListProposalsRequest = {
  workspaceId: string;
};

export type ListProposalsResponse = {
  proposals: GraphProposal[];
};

export type CreateProposalRequest = {
  workspaceId: string;
  proposal: GraphProposal;
};

export type CreateProposalResponse = {
  proposal: GraphProposal;
};

export type ApplyProposalRequest = {
  workspaceId: string;
  proposalId: string;
};

export type ApproveProposalRequest = {
  workspaceId: string;
  proposalId: string;
};

export type ApproveProposalResponse = {
  proposal: GraphProposal;
};

export type ApplyProposalResponse = {
  graph: SemanticGraph;
  proposal: GraphProposal;
};

export type RejectProposalRequest = {
  workspaceId: string;
  proposalId: string;
};

export type RejectProposalResponse = {
  proposal: GraphProposal;
};

export type ListScanProfilesRequest = { workspaceId: string };
export type ListScanProfilesResponse = { profiles: ScanProfile[] };
export type ListScanRunsRequest = { workspaceId: string };
export type ListScanRunsResponse = { runs: ScanRun[] };

export type StartScanRequest = {
  workspaceId: string;
  scan: Pick<InProgressScanRun, "id" | "profileId" | "profileVersion" | "actor" | "startedAt"> & {
    repositoryIndexId: string;
  };
};
export type StartScanResponse = {
  run: InProgressScanRun;
  profile: ScanProfile;
  baseProfile: ScanProfile;
  overlay: ScanProfileOverlayResolution;
  coverageSummary: ScanCoverageSummary;
  workflowPhase: "calibration";
  calibrationChecklist: string[];
  calibrationAssessment: ScanCalibrationAssessment;
  decisionGuidance: ScanCalibrationDecisionGuidance;
  instructions: string[];
};

export type RecordScanCoverageRequest = { workspaceId: string; scanId: string; coverage: ScanCoverage };
export type RecordScanCoverageResponse = { run: InProgressScanRun };

export type RecordScanCalibrationDecisionRequest = {
  workspaceId: string;
  scanId: string;
  decision: ScanCalibrationDecision;
  rationale: string;
  recordedAt: string;
};
export type RecordScanCalibrationDecisionResponse = {
  run: InProgressScanRun;
  recordedDecision: ScanCalibrationDecisionRecord;
};

export type ValidateScanFindingRequest = {
  workspaceId: string;
  scanId: string;
  criterionId: string;
  boundaryMap?: BoundaryMapArtifact;
};

export type ValidateScanFindingResponse = {
  scanId: string;
  criterionId: string;
  assessment: ScanFindingValidationAssessment;
};

export type CreateScanFindingRequest = { workspaceId: string; scanId: string; finding: FindingNodeInput };
export type CreateScanFindingResponse = { node: import("@hivemap/graph-core").GraphNode; run: InProgressScanRun };

export type UpdateFindingRequest = { workspaceId: string; findingNodeId: string; changes: FindingNodeUpdate };
export type UpdateFindingResponse = { node: import("@hivemap/graph-core").GraphNode };

export type CompleteScanRequest = {
  workspaceId: string;
  scanId: string;
  completedAt: string;
  appliedCriteria: string[];
  declaredOutputs: ScanRequiredOutput[];
  boundaryMap?: BoundaryMapArtifact;
  calibrationOverrideReason?: string;
};
export type CompleteScanResponse = { run: Extract<ScanRun, { status: "completed" }> };

export type CompareScansRequest = { workspaceId: string; beforeScanId: string; afterScanId: string };
export type CompareScansResponse = { comparison: ScanComparison };

export type ListWorkspacesResponse = { workspaces: WorkspaceRecord[] };

export type McpToolName =
  | "workspace_list"
  | "workspace_get"
  | "workspace_resolve"
  | "project_create"
  | "graph_get"
  | "repository_index_list"
  | "repository_index_get"
  | "repository_index_start"
  | "repository_index_execute"
  | "repository_search"
  | "repository_evidence_candidates"
  | "scan_boundary_map_build"
  | "scan_profile_overlay_help"
  | "scan_profile_overlay_suggest"
  | "concept_embedding_upsert"
  | "concept_similar_list"
  | "graph_command"
  | "category_assign"
  | "projection_get"
  | "projection_create"
  | "feedback_list"
  | "proposal_create"
  | "proposal_approve"
  | "proposal_apply"
  | "scan_profile_list"
  | "scan_list"
  | "scan_start"
  | "scan_record_coverage"
  | "scan_calibration_decide"
  | "scan_finding_validate"
  | "scan_finding_create"
  | "finding_update"
  | "scan_complete"
  | "scan_compare";

export type McpToolRequestMap = {
  workspace_list: ListWorkspaceSummariesRequest;
  workspace_get: GetWorkspaceSummaryRequest;
  workspace_resolve: ResolveWorkspaceRequest;
  project_create: CreateWorkspaceRequest;
  graph_get: GetGraphRequest;
  repository_index_list: ListRepositoryIndexesRequest;
  repository_index_get: GetRepositoryIndexRequest;
  repository_index_start: StartRepositoryIndexRequest;
  repository_index_execute: ExecuteRepositoryIndexRequest;
  repository_search: SearchRepositoryIndexRequest;
  repository_evidence_candidates: ListRepositoryEvidenceCandidatesRequest;
  scan_boundary_map_build: BuildScanBoundaryMapRequest;
  scan_profile_overlay_help: GetScanProfileOverlayHelpRequest;
  scan_profile_overlay_suggest: SuggestScanProfileOverlayRequest;
  concept_embedding_upsert: UpsertConceptEmbeddingRequest;
  concept_similar_list: ListSimilarConceptsRequest;
  graph_command: ApplyGraphCommandsRequest;
  category_assign: AssignCategoryRequest;
  projection_get: GetProjectionRequest;
  projection_create: CreateProjectionRequest;
  feedback_list: ListFeedbackRequest;
  proposal_create: CreateProposalRequest;
  proposal_approve: ApproveProposalRequest;
  proposal_apply: ApplyProposalRequest;
  scan_profile_list: ListScanProfilesRequest;
  scan_list: ListScanRunsRequest;
  scan_start: StartScanRequest;
  scan_record_coverage: RecordScanCoverageRequest;
  scan_calibration_decide: RecordScanCalibrationDecisionRequest;
  scan_finding_validate: ValidateScanFindingRequest;
  scan_finding_create: CreateScanFindingRequest;
  finding_update: UpdateFindingRequest;
  scan_complete: CompleteScanRequest;
  scan_compare: CompareScansRequest;
};

export class ApiContractValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ApiContractValidationError";
  }
}

export function validateCreateWorkspaceRequest(request: CreateWorkspaceRequest): void {
  validateWorkspaceRecordInput(request.workspace);
}

export function validateListWorkspaceSummariesRequest(request: ListWorkspaceSummariesRequest): void {
  if (request.query !== undefined) {
    assertNonEmpty("query", request.query);
  }

  if (request.limit !== undefined && (!Number.isInteger(request.limit) || request.limit < 1)) {
    throw new ApiContractValidationError("limit must be a positive integer");
  }
}

export function validateGetWorkspaceSummaryRequest(request: GetWorkspaceSummaryRequest): void {
  assertNonEmpty("workspaceId", request.workspaceId);
}

export function validateResolveWorkspaceRequest(request: ResolveWorkspaceRequest): void {
  assertNonEmpty("ref", request.ref);
}

export function validateGetGraphRequest(request: GetGraphRequest): void {
  assertNonEmpty("workspaceId", request.workspaceId);
}

export function validateListRepositoryIndexesRequest(request: ListRepositoryIndexesRequest): void {
  assertNonEmpty("workspaceId", request.workspaceId);
}

export function validateGetRepositoryIndexRequest(request: GetRepositoryIndexRequest): void {
  assertNonEmpty("workspaceId", request.workspaceId);
  assertNonEmpty("indexId", request.indexId);
}

export function validateStartRepositoryIndexRequest(request: StartRepositoryIndexRequest): void {
  assertNonEmpty("workspaceId", request.workspaceId);
  assertNonEmpty("index.id", request.index.id);
  normalizeRepositoryUrlIdentifier(request.index.repositoryUrl);
  if (request.index.requestedRef !== undefined) {
    assertNonEmpty("index.requestedRef", request.index.requestedRef);
    if (request.index.requestedRef.startsWith("-")) {
      throw new ApiContractValidationError("index.requestedRef must not begin with '-'");
    }
  }
  assertRepositoryIndexMode("index.mode", request.index.mode);
  assertDate("index.requestedAt", request.index.requestedAt);
  assertNonEmpty("index.actor.agentId", request.index.actor.agentId);
  assertNonEmpty("index.actor.tool", request.index.actor.tool);
}

export function normalizeRepositoryUrlIdentifier(repositoryUrl: string): string {
  try {
    return normalizeRepositoryLocation(repositoryUrl, "index.repositoryUrl");
  } catch (error) {
    if (error instanceof RepositoryLocationValidationError) {
      throw new ApiContractValidationError(error.message);
    }
    throw error;
  }
}

export function validateExecuteRepositoryIndexRequest(request: ExecuteRepositoryIndexRequest): void {
  assertNonEmpty("workspaceId", request.workspaceId);
  assertNonEmpty("indexId", request.indexId);
}

export function validateSearchRepositoryIndexRequest(request: SearchRepositoryIndexRequest): void {
  assertNonEmpty("workspaceId", request.workspaceId);
  assertNonEmpty("indexId", request.indexId);
  assertNonEmpty("query", request.query);
  if (request.limit !== undefined && (!Number.isInteger(request.limit) || request.limit < 1)) {
    throw new ApiContractValidationError("limit must be a positive integer");
  }
}

export function validateListRepositoryEvidenceCandidatesRequest(request: ListRepositoryEvidenceCandidatesRequest): void {
  assertNonEmpty("workspaceId", request.workspaceId);
  assertNonEmpty("indexId", request.indexId);
  assertNonEmpty("profileId", request.profileId);
  if (!Number.isInteger(request.profileVersion) || request.profileVersion < 1) {
    throw new ApiContractValidationError("profileVersion must be a positive integer");
  }
  assertNonEmpty("criterionId", request.criterionId);
  if (request.limit !== undefined && (!Number.isInteger(request.limit) || request.limit < 1)) {
    throw new ApiContractValidationError("limit must be a positive integer");
  }
}

export function validateBuildScanBoundaryMapRequest(request: BuildScanBoundaryMapRequest): void {
  assertNonEmpty("workspaceId", request.workspaceId);
  assertNonEmpty("scanId", request.scanId);
}

export function validateGetScanProfileOverlayHelpRequest(request: GetScanProfileOverlayHelpRequest): void {
  assertNonEmpty("workspaceId", request.workspaceId);
  assertNonEmpty("profileId", request.profileId);
  if (!Number.isInteger(request.profileVersion) || request.profileVersion < 1) {
    throw new ApiContractValidationError("profileVersion must be a positive integer");
  }
}

export function validateSuggestScanProfileOverlayRequest(request: SuggestScanProfileOverlayRequest): void {
  assertNonEmpty("workspaceId", request.workspaceId);
  assertNonEmpty("scanId", request.scanId);
  assertNonEmpty("symptomId", request.symptomId);
  if (!SCAN_PROFILE_OVERLAY_SYMPTOM_VALUES.includes(request.symptomId)) {
    throw new ApiContractValidationError(`Unknown scan profile overlay symptom: ${request.symptomId}`);
  }
}

export function validateUpsertConceptEmbeddingRequest(request: UpsertConceptEmbeddingRequest): void {
  assertNonEmpty("workspaceId", request.workspaceId);
  assertNonEmpty("nodeId", request.nodeId);
  assertNonEmpty("embedding.model", request.embedding.model);
  assertDate("embedding.updatedAt", request.embedding.updatedAt);
  if (request.embedding.values.length === 0) {
    throw new ApiContractValidationError("embedding.values must contain at least one number");
  }
  for (const value of request.embedding.values) {
    if (!Number.isFinite(value)) {
      throw new ApiContractValidationError("embedding.values must contain only finite numbers");
    }
  }
}

export function validateListSimilarConceptsRequest(request: ListSimilarConceptsRequest): void {
  assertNonEmpty("workspaceId", request.workspaceId);
  assertNonEmpty("nodeId", request.nodeId);
  assertNonEmpty("model", request.model);
  if (request.limit !== undefined && (!Number.isInteger(request.limit) || request.limit < 1)) {
    throw new ApiContractValidationError("limit must be a positive integer");
  }
  if (request.minScore !== undefined && (!Number.isFinite(request.minScore) || request.minScore < -1 || request.minScore > 1)) {
    throw new ApiContractValidationError("minScore must be a finite number between -1 and 1");
  }
}

export function validateApplyGraphCommandsRequest(request: ApplyGraphCommandsRequest): void {
  assertNonEmpty("workspaceId", request.workspaceId);

  if (request.commands.length === 0) {
    throw new ApiContractValidationError("commands must contain at least one graph command");
  }
}

export function validateAssignCategoryRequest(
  request: AssignCategoryRequest,
  catalog: CategoryCatalog,
  targets: CategoryAssignmentTargetIndex,
): void {
  assertNonEmpty("workspaceId", request.workspaceId);
  validateCategoryAssignment(request.assignment, catalog, targets);
}

export function validateGetProjectionRequest(request: GetProjectionRequest): void {
  assertNonEmpty("workspaceId", request.workspaceId);
  assertNonEmpty("projectionId", request.projectionId);
}

export function validateCreateProjectionResponse(response: CreateProjectionResponse, graph: SemanticGraph): void {
  validateProjection(response.projection, graph);
}

export function validateRecordFeedbackRequest(request: RecordFeedbackRequest): void {
  assertNonEmpty("workspaceId", request.workspaceId);
  validateFeedbackEvent(request.feedbackEvent);
}

export function validateCreateProposalRequest(request: CreateProposalRequest): void {
  assertNonEmpty("workspaceId", request.workspaceId);
  validateGraphProposal(request.proposal);
}

export function validateApplyProposalRequest(request: ApplyProposalRequest): void {
  assertNonEmpty("workspaceId", request.workspaceId);
  assertNonEmpty("proposalId", request.proposalId);
}

export function validateApproveProposalRequest(request: ApproveProposalRequest): void {
  assertNonEmpty("workspaceId", request.workspaceId);
  assertNonEmpty("proposalId", request.proposalId);
}

export function validateRejectProposalRequest(request: RejectProposalRequest): void {
  assertNonEmpty("workspaceId", request.workspaceId);
  assertNonEmpty("proposalId", request.proposalId);
}

export function validateStartScanRequest(request: StartScanRequest): void {
  assertNonEmpty("workspaceId", request.workspaceId);
  assertNonEmpty("scan.id", request.scan.id);
  assertNonEmpty("scan.profileId", request.scan.profileId);
  if (!Number.isInteger(request.scan.profileVersion) || request.scan.profileVersion < 1) {
    throw new ApiContractValidationError("scan.profileVersion must be a positive integer");
  }
  assertNonEmpty("scan.repositoryIndexId", request.scan.repositoryIndexId);
  assertNonEmpty("scan.actor.agentId", request.scan.actor.agentId);
  assertNonEmpty("scan.actor.tool", request.scan.actor.tool);
  assertDate("scan.startedAt", request.scan.startedAt);
}

export function validateRecordScanCoverageRequest(request: RecordScanCoverageRequest): void {
  assertNonEmpty("workspaceId", request.workspaceId);
  assertNonEmpty("scanId", request.scanId);
  validateScanCoverage(request.coverage);
}

export function validateRecordScanCalibrationDecisionRequest(request: RecordScanCalibrationDecisionRequest): void {
  assertNonEmpty("workspaceId", request.workspaceId);
  assertNonEmpty("scanId", request.scanId);
  assertNonEmpty("decision", request.decision);
  if (!SCAN_CALIBRATION_DECISION_VALUES.includes(request.decision)) {
    throw new ApiContractValidationError(`Unknown scan calibration decision: ${request.decision}`);
  }
  assertNonEmpty("rationale", request.rationale);
  assertDate("recordedAt", request.recordedAt);
}

export function validateValidateScanFindingRequest(request: ValidateScanFindingRequest): void {
  assertNonEmpty("workspaceId", request.workspaceId);
  assertNonEmpty("scanId", request.scanId);
  assertNonEmpty("criterionId", request.criterionId);
  if (request.boundaryMap !== undefined) {
    validateBoundaryMap(request.boundaryMap);
  }
}

export function validateCreateScanFindingRequest(request: CreateScanFindingRequest): void {
  assertNonEmpty("workspaceId", request.workspaceId);
  assertNonEmpty("scanId", request.scanId);
  assertNonEmpty("finding.id", request.finding.id);
}

export function validateUpdateFindingRequest(request: UpdateFindingRequest): void {
  assertNonEmpty("workspaceId", request.workspaceId);
  assertNonEmpty("findingNodeId", request.findingNodeId);
  if (Object.keys(request.changes).length === 0) throw new ApiContractValidationError("finding changes must not be empty");
}

export function validateCompleteScanRequest(request: CompleteScanRequest): void {
  assertNonEmpty("workspaceId", request.workspaceId);
  assertNonEmpty("scanId", request.scanId);
  assertDate("completedAt", request.completedAt);
  if (request.appliedCriteria.length === 0) throw new ApiContractValidationError("appliedCriteria must not be empty");
  if (request.declaredOutputs.length === 0) throw new ApiContractValidationError("declaredOutputs must not be empty");
  if (request.calibrationOverrideReason !== undefined) {
    assertNonEmpty("calibrationOverrideReason", request.calibrationOverrideReason);
  }
  if (request.declaredOutputs.includes("boundary-map")) {
    if (request.boundaryMap === undefined) throw new ApiContractValidationError("boundaryMap is required when declaredOutputs includes boundary-map");
    validateBoundaryMap(request.boundaryMap);
  } else if (request.boundaryMap !== undefined) {
    throw new ApiContractValidationError("boundaryMap requires declaredOutputs to include boundary-map");
  }
}

export function validateCompareScansRequest(request: CompareScansRequest): void {
  assertNonEmpty("workspaceId", request.workspaceId);
  assertNonEmpty("beforeScanId", request.beforeScanId);
  assertNonEmpty("afterScanId", request.afterScanId);
  if (request.beforeScanId === request.afterScanId) throw new ApiContractValidationError("Scan comparison requires two different runs");
}

function assertNonEmpty(fieldName: string, value: string): void {
  if (value.trim().length === 0) {
    throw new ApiContractValidationError(`${fieldName} must be non-empty`);
  }
}

function assertDate(fieldName: string, value: string): void {
  assertNonEmpty(fieldName, value);

  if (Number.isNaN(Date.parse(value))) {
    throw new ApiContractValidationError(`${fieldName} must be a valid date string`);
  }
}

function assertRepositoryIndexMode(fieldName: string, value: RepositoryIndexMode): void {
  if (value !== "safe" && value !== "deep") {
    throw new ApiContractValidationError(`${fieldName} must be one of: safe, deep`);
  }
}

function validateWorkspaceRecordInput(workspace: WorkspaceRecord): void {
  assertNonEmpty("workspace.id", workspace.id);
  assertNonEmpty("workspace.name", workspace.name);
  assertDate("workspace.createdAt", workspace.createdAt);

  if (workspace.slug !== undefined) {
    assertNonEmpty("workspace.slug", workspace.slug);
  }

  if (workspace.updatedAt !== undefined) {
    assertDate("workspace.updatedAt", workspace.updatedAt);
  }
}
