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
  validateScanCoverage,
  type FindingNodeInput,
  type FindingNodeUpdate,
  type InProgressScanRun,
  type ScanComparison,
  type ScanCoverage,
  type ScanProfile,
  type ScanRequiredOutput,
  type ScanRun,
} from "@hivemap/scans";
import type { BundleManifest, SnapshotRecord, WorkspaceRecord, WorkspaceState } from "@hivemap/storage";

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

export type CreateWorkspaceRequest = {
  workspace: WorkspaceRecord;
};

export type CreateWorkspaceResponse = {
  workspace: WorkspaceRecord;
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

export type ListSnapshotsRequest = {
  workspaceId: string;
};

export type ListSnapshotsResponse = {
  snapshots: SnapshotRecord[];
};

export type CreateSnapshotRequest = {
  workspaceId: string;
  snapshot: Omit<SnapshotRecord, "graph" | "projection"> & {
    projectionId: string;
  };
};

export type CreateSnapshotResponse = {
  snapshot: SnapshotRecord;
};

export type ListScanProfilesRequest = { workspaceId: string };
export type ListScanProfilesResponse = { profiles: ScanProfile[] };
export type ListScanRunsRequest = { workspaceId: string };
export type ListScanRunsResponse = { runs: ScanRun[] };

export type StartScanRequest = {
  workspaceId: string;
  scan: Pick<InProgressScanRun, "id" | "profileId" | "profileVersion" | "repository" | "actor" | "startedAt">;
};
export type StartScanResponse = { run: InProgressScanRun; profile: ScanProfile; instructions: string[] };

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
  | "project_create"
  | "graph_get"
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
  project_create: CreateWorkspaceRequest;
  graph_get: GetGraphRequest;
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
  | "snapshot.list"
  | "snapshot.create"
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
  assertNonEmpty("workspace.id", request.workspace.id);
  assertNonEmpty("workspace.name", request.workspace.name);
  assertDate("workspace.createdAt", request.workspace.createdAt);
}

export function validateGetGraphRequest(request: GetGraphRequest): void {
  assertNonEmpty("workspaceId", request.workspaceId);
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

export function validateListSnapshotsRequest(request: ListSnapshotsRequest): void {
  assertNonEmpty("workspaceId", request.workspaceId);
}

export function validateCreateSnapshotRequest(request: CreateSnapshotRequest): void {
  assertNonEmpty("workspaceId", request.workspaceId);
  assertNonEmpty("snapshot.id", request.snapshot.id);
  assertDate("snapshot.createdAt", request.snapshot.createdAt);
  assertNonEmpty("snapshot.projectionId", request.snapshot.projectionId);
}

export function validateStartScanRequest(request: StartScanRequest): void {
  assertNonEmpty("workspaceId", request.workspaceId);
  assertNonEmpty("scan.id", request.scan.id);
  assertNonEmpty("scan.profileId", request.scan.profileId);
  if (!Number.isInteger(request.scan.profileVersion) || request.scan.profileVersion < 1) {
    throw new ApiContractValidationError("scan.profileVersion must be a positive integer");
  }
  assertNonEmpty("scan.repository.root", request.scan.repository.root);
  assertNonEmpty("scan.repository.branch", request.scan.repository.branch);
  assertNonEmpty("scan.repository.revision", request.scan.repository.revision);
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
