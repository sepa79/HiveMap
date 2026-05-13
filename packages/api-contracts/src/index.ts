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
  type Projection,
} from "@hivemap/projections";
import type { SnapshotRecord, WorkspaceRecord, WorkspaceState } from "@hivemap/storage";

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
  input: OverviewProjectionInput | DiveInProjectionInput;
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
  | "proposal_apply";

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
  | "snapshot.create";

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
