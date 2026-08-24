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
  validateBoundaryMap,
  validateScanCoverage,
  type BoundaryMapArtifact,
  type FindingNodeInput,
  type FindingNodeUpdate,
  type InProgressScanRun,
  type ScanComparison,
  type ScanCoverage,
  type ScanProfile,
  type ScanRequiredOutput,
  type ScanRun,
} from "@hivemap/scans";
import type { BundleManifest, WorkspaceRecord, WorkspaceState } from "@hivemap/storage";

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

export type RefreshConceptEmbeddingRequest = {
  workspaceId: string;
  nodeId: string;
  model: string;
  force?: boolean;
};

export type RefreshConceptEmbeddingResponse = {
  embedding: {
    workspaceId: string;
    nodeId: string;
    model: string;
    dimensions: number;
    contentDigest: string;
    updatedAt: string;
  };
  provider: string;
  status: "refreshed" | "unchanged";
};

export type BackfillConceptEmbeddingsRequest = {
  workspaceId: string;
  model: string;
  nodeIds?: string[];
  limit?: number;
  force?: boolean;
};

export type BackfillConceptEmbeddingsResponse = {
  workspaceId: string;
  model: string;
  provider: string;
  summary: {
    totalConcepts: number;
    selectedConcepts: number;
    refreshed: number;
    unchanged: number;
  };
  results: Array<{
    nodeId: string;
    label: string;
    status: "refreshed" | "unchanged";
    dimensions: number;
    contentDigest: string;
    updatedAt: string;
  }>;
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
  boundaryMap: BoundaryMapArtifact;
};

export type GetScanProfileOverlayHelpRequest = {
  workspaceId: string;
  profileId: string;
  profileVersion: number;
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
  baseScope: {
    include: string[];
    exclude: string[];
  };
  template: string;
  example: string;
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
  instructions: string[];
};

export type RecordScanCoverageRequest = { workspaceId: string; scanId: string; coverage: ScanCoverage };
export type RecordScanCoverageResponse = { run: InProgressScanRun };

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
};
export type CompleteScanResponse = { run: Extract<ScanRun, { status: "completed" }> };

export type CompareScansRequest = { workspaceId: string; beforeScanId: string; afterScanId: string };
export type CompareScansResponse = { comparison: ScanComparison };

export type ExportWorkspaceRequest = { workspaceId: string; targetPath: string; exportedAt: string };
export type ExportWorkspaceResponse = { path: string; manifest: BundleManifest };
export type ImportWorkspaceRequest = { sourcePath: string; mode: "new" | "replace" };
export type ImportWorkspaceResponse = { workspace: WorkspaceRecord; manifest: BundleManifest };
export type ListWorkspacesResponse = { workspaces: WorkspaceRecord[] };
export type ExportWorkspaceBundleRequest = { workspaceId: string; exportedAt: string };
export type ExportWorkspaceBundleResponse = { bytes: Uint8Array; manifest: BundleManifest };
export type ImportWorkspaceBundleRequest = { bytes: Uint8Array; mode: "new" | "replace" };
export type ImportWorkspaceBundleResponse = ImportWorkspaceResponse;

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
  | "concept_embedding_upsert"
  | "concept_embedding_refresh"
  | "concept_embedding_backfill"
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
  | "scan_finding_create"
  | "finding_update"
  | "scan_complete"
  | "scan_compare"
  | "workspace_export_zip"
  | "workspace_import_zip";

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
  concept_embedding_upsert: UpsertConceptEmbeddingRequest;
  concept_embedding_refresh: RefreshConceptEmbeddingRequest;
  concept_embedding_backfill: BackfillConceptEmbeddingsRequest;
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
  scan_finding_create: CreateScanFindingRequest;
  finding_update: UpdateFindingRequest;
  scan_complete: CompleteScanRequest;
  scan_compare: CompareScansRequest;
  workspace_export_zip: ExportWorkspaceRequest;
  workspace_import_zip: ImportWorkspaceRequest;
};

export type RestEndpointName =
  | "workspace.create"
  | "workspace.get"
  | "graph.get"
  | "repository-index.list"
  | "repository-index.get"
  | "repository-index.start"
  | "repository-index.execute"
  | "repository-index.search"
  | "repository-index.evidence-candidates"
  | "scan.boundary-map.build"
  | "scan-profile-overlay.help"
  | "concept-embedding.upsert"
  | "concept-embedding.refresh"
  | "concept-embedding.backfill"
  | "concept-similar.list"
  | "graph.commands.apply"
  | "categories.get"
  | "category.assign"
  | "projection.get"
  | "projection.create"
  | "feedback.list"
  | "feedback.record"
  | "proposal.list"
  | "proposal.create"
  | "proposal.approve"
  | "proposal.apply"
  | "proposal.reject"
  | "scan-profile.list"
  | "scan.list"
  | "scan.start"
  | "scan.coverage.record"
  | "scan.finding.create"
  | "finding.update"
  | "scan.complete"
  | "scan.compare"
  | "workspace.export"
  | "workspace.import";

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
  assertNonEmpty("index.repositoryUrl", request.index.repositoryUrl);
  if (request.index.requestedRef !== undefined) {
    assertNonEmpty("index.requestedRef", request.index.requestedRef);
  }
  assertRepositoryIndexMode("index.mode", request.index.mode);
  assertDate("index.requestedAt", request.index.requestedAt);
  assertNonEmpty("index.actor.agentId", request.index.actor.agentId);
  assertNonEmpty("index.actor.tool", request.index.actor.tool);
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

export function validateRefreshConceptEmbeddingRequest(request: RefreshConceptEmbeddingRequest): void {
  assertNonEmpty("workspaceId", request.workspaceId);
  assertNonEmpty("nodeId", request.nodeId);
  assertNonEmpty("model", request.model);
  if (request.force !== undefined && typeof request.force !== "boolean") {
    throw new ApiContractValidationError("force must be a boolean when provided");
  }
}

export function validateBackfillConceptEmbeddingsRequest(request: BackfillConceptEmbeddingsRequest): void {
  assertNonEmpty("workspaceId", request.workspaceId);
  assertNonEmpty("model", request.model);
  if (request.limit !== undefined && (!Number.isInteger(request.limit) || request.limit < 1)) {
    throw new ApiContractValidationError("limit must be a positive integer");
  }
  if (request.force !== undefined && typeof request.force !== "boolean") {
    throw new ApiContractValidationError("force must be a boolean when provided");
  }
  if (request.nodeIds !== undefined) {
    if (request.nodeIds.length === 0) {
      throw new ApiContractValidationError("nodeIds must contain at least one node id when provided");
    }
    for (const nodeId of request.nodeIds) {
      assertNonEmpty("nodeIds[]", nodeId);
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

export function validateExportWorkspaceRequest(request: ExportWorkspaceRequest): void {
  assertNonEmpty("workspaceId", request.workspaceId);
  assertNonEmpty("targetPath", request.targetPath);
  assertDate("exportedAt", request.exportedAt);
}

export function validateImportWorkspaceRequest(request: ImportWorkspaceRequest): void {
  assertNonEmpty("sourcePath", request.sourcePath);
  if (request.mode !== "new" && request.mode !== "replace") throw new ApiContractValidationError(`Unknown import mode: ${String(request.mode)}`);
}

export function validateExportWorkspaceBundleRequest(request: ExportWorkspaceBundleRequest): void {
  assertNonEmpty("workspaceId", request.workspaceId);
  assertDate("exportedAt", request.exportedAt);
}

export function validateImportWorkspaceBundleRequest(request: ImportWorkspaceBundleRequest): void {
  if (!(request.bytes instanceof Uint8Array) || request.bytes.byteLength === 0) {
    throw new ApiContractValidationError("bytes must contain a ZIP bundle");
  }
  if (request.mode !== "new" && request.mode !== "replace") throw new ApiContractValidationError(`Unknown import mode: ${String(request.mode)}`);
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
