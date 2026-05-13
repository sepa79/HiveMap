import {
  validateApplyGraphCommandsRequest,
  validateApplyProposalRequest,
  validateApproveProposalRequest,
  validateAssignCategoryRequest,
  validateCreateProposalRequest,
  validateCreateSnapshotRequest,
  validateCreateWorkspaceRequest,
  validateGetProjectionRequest,
  validateRecordFeedbackRequest,
  validateRejectProposalRequest,
  type ApplyGraphCommandsRequest,
  type ApplyGraphCommandsResponse,
  type ApplyProposalRequest,
  type ApplyProposalResponse,
  type ApproveProposalRequest,
  type ApproveProposalResponse,
  type AssignCategoryRequest,
  type AssignCategoryResponse,
  type CreateProjectionRequest,
  type CreateProjectionResponse,
  type CreateProposalRequest,
  type CreateProposalResponse,
  type CreateSnapshotRequest,
  type CreateSnapshotResponse,
  type CreateWorkspaceRequest,
  type CreateWorkspaceResponse,
  type GetCategoriesResponse,
  type GetGraphRequest,
  type GetGraphResponse,
  type GetProjectionRequest,
  type GetProjectionResponse,
  type GetWorkspaceResponse,
  type ListFeedbackRequest,
  type ListFeedbackResponse,
  type ListProposalsRequest,
  type ListProposalsResponse,
  type ListSnapshotsRequest,
  type ListSnapshotsResponse,
  type RecordFeedbackRequest,
  type RecordFeedbackResponse,
  type RejectProposalRequest,
  type RejectProposalResponse,
} from "@hivemap/api-contracts";
import { applyApprovedProposal, approvePendingProposal, DEFAULT_CAPTURE_POLICY, rejectPendingProposal } from "@hivemap/capture";
import { INITIAL_CATEGORY_CATALOG } from "@hivemap/categories";
import { applyGraphCommands } from "@hivemap/graph-core";
import { createDiveInProjection, createOverviewProjection } from "@hivemap/projections";
import { type SqliteHiveMapStore, type WorkspaceState } from "@hivemap/storage";

export type HiveMapRuntimeOptions = {
  store: SqliteHiveMapStore;
};

export class RuntimeError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "RuntimeError";
  }
}

export class HiveMapRuntime {
  private readonly store: SqliteHiveMapStore;

  constructor(options: HiveMapRuntimeOptions) {
    this.store = options.store;
  }

  createWorkspace(request: CreateWorkspaceRequest): CreateWorkspaceResponse {
    validateCreateWorkspaceRequest(request);
    const state = createInitialWorkspaceState(request);
    this.store.saveWorkspaceState(state);
    return { workspace: state.workspace };
  }

  getWorkspace(workspaceId: string): GetWorkspaceResponse {
    return { state: this.store.loadWorkspaceState(workspaceId) };
  }

  getGraph(request: GetGraphRequest): GetGraphResponse {
    const state = this.store.loadWorkspaceState(request.workspaceId);
    return { graph: state.graph };
  }

  applyGraphCommands(request: ApplyGraphCommandsRequest): ApplyGraphCommandsResponse {
    validateApplyGraphCommandsRequest(request);
    const state = this.store.loadWorkspaceState(request.workspaceId);
    const nextState = { ...state, graph: applyGraphCommands(state.graph, request.commands) };
    this.store.saveWorkspaceState(nextState);
    return { graph: nextState.graph };
  }

  getCategories(workspaceId: string): GetCategoriesResponse {
    const state = this.store.loadWorkspaceState(workspaceId);
    return { catalog: state.categoryCatalog, assignments: state.categoryAssignments };
  }

  assignCategory(request: AssignCategoryRequest): AssignCategoryResponse {
    const state = this.store.loadWorkspaceState(request.workspaceId);
    validateAssignCategoryRequest(request, state.categoryCatalog, createTargetIndex(state));
    const nextState = { ...state, categoryAssignments: [...state.categoryAssignments, request.assignment] };
    this.store.saveWorkspaceState(nextState);
    return { assignments: nextState.categoryAssignments };
  }

  getProjection(request: GetProjectionRequest): GetProjectionResponse {
    validateGetProjectionRequest(request);
    const state = this.store.loadWorkspaceState(request.workspaceId);
    return { projection: findById(state.projections, request.projectionId, "Projection") };
  }

  createProjection(request: CreateProjectionRequest): CreateProjectionResponse {
    const state = this.store.loadWorkspaceState(request.workspaceId);
    const projection =
      "rootNodeId" in request.input
        ? createDiveInProjection(state.graph, request.input)
        : createOverviewProjection(state.graph, request.input);
    const nextState = { ...state, projections: [...state.projections, projection] };
    this.store.saveWorkspaceState(nextState);
    return { projection };
  }

  listFeedback(request: ListFeedbackRequest): ListFeedbackResponse {
    const state = this.store.loadWorkspaceState(request.workspaceId);
    return { feedbackEvents: state.feedbackEvents };
  }

  recordFeedback(request: RecordFeedbackRequest): RecordFeedbackResponse {
    validateRecordFeedbackRequest(request);
    const state = this.store.loadWorkspaceState(request.workspaceId);
    const nextState = { ...state, feedbackEvents: [...state.feedbackEvents, request.feedbackEvent] };
    this.store.saveWorkspaceState(nextState);
    return { feedbackEvents: nextState.feedbackEvents };
  }

  listProposals(request: ListProposalsRequest): ListProposalsResponse {
    const state = this.store.loadWorkspaceState(request.workspaceId);
    return { proposals: state.proposals };
  }

  createProposal(request: CreateProposalRequest): CreateProposalResponse {
    validateCreateProposalRequest(request);
    const state = this.store.loadWorkspaceState(request.workspaceId);
    const nextState = { ...state, proposals: [...state.proposals, request.proposal] };
    this.store.saveWorkspaceState(nextState);
    return { proposal: request.proposal };
  }

  applyProposal(request: ApplyProposalRequest): ApplyProposalResponse {
    validateApplyProposalRequest(request);
    const state = this.store.loadWorkspaceState(request.workspaceId);
    const proposal = findById(state.proposals, request.proposalId, "Proposal");
    const result = applyApprovedProposal(state.graph, proposal);
    const nextState = {
      ...state,
      graph: result.graph,
      proposals: state.proposals.map((candidate) => (candidate.id === proposal.id ? result.proposal : candidate)),
    };
    this.store.saveWorkspaceState(nextState);
    return { graph: result.graph, proposal: result.proposal };
  }

  approveProposal(request: ApproveProposalRequest): ApproveProposalResponse {
    validateApproveProposalRequest(request);
    const state = this.store.loadWorkspaceState(request.workspaceId);
    const proposal = findById(state.proposals, request.proposalId, "Proposal");
    const approvedProposal = approvePendingProposal(proposal);
    const nextState = {
      ...state,
      proposals: state.proposals.map((candidate) => (candidate.id === approvedProposal.id ? approvedProposal : candidate)),
    };
    this.store.saveWorkspaceState(nextState);
    return { proposal: approvedProposal };
  }

  rejectProposal(request: RejectProposalRequest): RejectProposalResponse {
    validateRejectProposalRequest(request);
    const state = this.store.loadWorkspaceState(request.workspaceId);
    const proposal = findById(state.proposals, request.proposalId, "Proposal");
    const rejectedProposal = rejectPendingProposal(proposal);
    const nextState = {
      ...state,
      proposals: state.proposals.map((candidate) => (candidate.id === rejectedProposal.id ? rejectedProposal : candidate)),
    };
    this.store.saveWorkspaceState(nextState);
    return { proposal: rejectedProposal };
  }

  listSnapshots(request: ListSnapshotsRequest): ListSnapshotsResponse {
    const state = this.store.loadWorkspaceState(request.workspaceId);
    return { snapshots: state.snapshots };
  }

  createSnapshot(request: CreateSnapshotRequest): CreateSnapshotResponse {
    validateCreateSnapshotRequest(request);
    const state = this.store.loadWorkspaceState(request.workspaceId);
    const projection = findById(state.projections, request.snapshot.projectionId, "Projection");
    const snapshot = {
      id: request.snapshot.id,
      createdAt: request.snapshot.createdAt,
      projectionId: request.snapshot.projectionId,
      graph: state.graph,
      projection,
    };
    const nextState = { ...state, snapshots: [...state.snapshots, snapshot] };
    this.store.saveWorkspaceState(nextState);
    return { snapshot };
  }
}

function createInitialWorkspaceState(request: CreateWorkspaceRequest): WorkspaceState {
  return {
    workspace: request.workspace,
    graphId: `${request.workspace.id}:graph`,
    graph: { nodes: [], edges: [] },
    categoryCatalog: INITIAL_CATEGORY_CATALOG,
    categoryAssignments: [],
    capturePolicy: DEFAULT_CAPTURE_POLICY,
    feedbackEvents: [],
    proposals: [],
    projections: [],
    snapshots: [],
  };
}

function createTargetIndex(state: WorkspaceState) {
  return {
    nodeIds: state.graph.nodes.map((node) => node.id),
    edgeIds: state.graph.edges.map((edge) => edge.id),
    projectionIds: state.projections.map((projection) => projection.id),
  };
}

function findById<T extends { id: string }>(items: readonly T[], id: string, label: string): T {
  const item = items.find((candidate) => candidate.id === id);
  if (item === undefined) {
    throw new RuntimeError(`${label} not found: ${id}`);
  }
  return item;
}
