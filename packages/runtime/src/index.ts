import { createHash } from "node:crypto";

import {
  validateGetWorkspaceSummaryRequest,
  validateListWorkspaceSummariesRequest,
  validateResolveWorkspaceRequest,
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
  validateCompareScansRequest,
  validateCompleteScanRequest,
  validateCreateScanFindingRequest,
  validateExportWorkspaceRequest,
  validateExportWorkspaceBundleRequest,
  validateImportWorkspaceRequest,
  validateImportWorkspaceBundleRequest,
  validateRecordScanCoverageRequest,
  validateStartScanRequest,
  validateUpdateFindingRequest,
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
  type GetWorkspaceSummaryRequest,
  type GetWorkspaceSummaryResponse,
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
  type CompareScansRequest,
  type CompareScansResponse,
  type CompleteScanRequest,
  type CompleteScanResponse,
  type CreateScanFindingRequest,
  type CreateScanFindingResponse,
  type ExportWorkspaceRequest,
  type ExportWorkspaceResponse,
  type ExportWorkspaceBundleRequest,
  type ExportWorkspaceBundleResponse,
  type ImportWorkspaceRequest,
  type ImportWorkspaceResponse,
  type ImportWorkspaceBundleRequest,
  type ImportWorkspaceBundleResponse,
  type ListWorkspacesResponse,
  type ListWorkspaceSummariesRequest,
  type ListWorkspaceSummariesResponse,
  type ListScanProfilesRequest,
  type ListScanProfilesResponse,
  type ListScanRunsRequest,
  type ListScanRunsResponse,
  type RecordScanCoverageRequest,
  type RecordScanCoverageResponse,
  type ResolveWorkspaceRequest,
  type ResolveWorkspaceResponse,
  type StartScanRequest,
  type StartScanResponse,
  type UpdateFindingRequest,
  type UpdateFindingResponse,
  type WorkspaceSummary,
} from "@hivemap/api-contracts";
import { applyApprovedProposal, approvePendingProposal, DEFAULT_CAPTURE_POLICY, rejectPendingProposal } from "@hivemap/capture";
import { INITIAL_CATEGORY_CATALOG } from "@hivemap/categories";
import { applyGraphCommands } from "@hivemap/graph-core";
import { createDiveInProjection, createOverviewProjection, createProjectMapProjection } from "@hivemap/projections";
import {
  INITIAL_SCAN_PROFILES,
  compareCompletedScans,
  createFindingNode,
  toFindingEvidence,
  updateFindingNode,
  validateScanRun,
  type CompletedScanRun,
  type InProgressScanRun,
} from "@hivemap/scans";
import {
  readWorkspaceBundle,
  createWorkspaceBundle,
  parseWorkspaceBundle,
  stableJson,
  writeWorkspaceBundle,
  type SqliteHiveMapStore,
  type WorkspaceRecord,
  type WorkspaceState,
} from "@hivemap/storage";

export type HiveMapRuntimeOptions = {
  store: SqliteHiveMapStore;
};

export class RuntimeError extends Error {
  readonly code: string;
  readonly details?: unknown;

  constructor(message: string, options?: { code?: string; details?: unknown }) {
    super(message);
    this.name = "RuntimeError";
    this.code = options?.code ?? "RUNTIME_ERROR";
    this.details = options?.details;
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

  listWorkspaceSummaries(request: ListWorkspaceSummariesRequest): ListWorkspaceSummariesResponse {
    validateListWorkspaceSummariesRequest(request);
    const query = request.query?.trim();
    const items = this.store
      .listWorkspaces()
      .filter((workspace) => request.includeArchived === true || workspace.archived !== true)
      .map(toWorkspaceSummary)
      .filter((workspace) => query === undefined || scoreWorkspaceSummaryMatch(workspace, query) > 0)
      .sort((left, right) => compareWorkspaceSummaries(left, right, query))
      .slice(0, request.limit);
    return { items };
  }

  getWorkspaceSummary(request: GetWorkspaceSummaryRequest): GetWorkspaceSummaryResponse {
    validateGetWorkspaceSummaryRequest(request);
    return { workspace: toWorkspaceSummary(this.store.getWorkspaceRecord(request.workspaceId)) };
  }

  resolveWorkspace(request: ResolveWorkspaceRequest): ResolveWorkspaceResponse {
    validateResolveWorkspaceRequest(request);
    const ref = request.ref.trim();
    const candidates = this.store.listWorkspaces();
    const exactId = candidates.find((workspace) => workspace.id === ref);
    if (exactId !== undefined) {
      return { workspace: toWorkspaceSummary(exactId) };
    }

    const normalizedRef = normalizeWorkspaceRef(ref);
    const exactSlugMatches = candidates.filter((workspace) => workspace.slug !== undefined && normalizeWorkspaceRef(workspace.slug) === normalizedRef);
    const exactSlugMatch = exactSlugMatches[0];
    if (exactSlugMatch !== undefined && exactSlugMatches.length === 1) {
      return { workspace: toWorkspaceSummary(exactSlugMatch) };
    }
    if (exactSlugMatches.length > 1) {
      throw createWorkspaceAmbiguousError(ref, exactSlugMatches);
    }

    const exactNameMatches = candidates.filter((workspace) => normalizeWorkspaceRef(workspace.name) === normalizedRef);
    const exactNameMatch = exactNameMatches[0];
    if (exactNameMatch !== undefined && exactNameMatches.length === 1) {
      return { workspace: toWorkspaceSummary(exactNameMatch) };
    }
    if (exactNameMatches.length > 1) {
      throw createWorkspaceAmbiguousError(ref, exactNameMatches);
    }

    throw createWorkspaceNotFoundError(ref);
  }

  listWorkspaces(): ListWorkspacesResponse {
    return { workspaces: this.store.listWorkspaces() };
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
      "type" in request.input
        ? createProjectMapProjection(state.graph, request.input)
        : "rootNodeId" in request.input
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

  listScanProfiles(request: ListScanProfilesRequest): ListScanProfilesResponse {
    return { profiles: this.store.loadWorkspaceState(request.workspaceId).scanProfiles };
  }

  listScanRuns(request: ListScanRunsRequest): ListScanRunsResponse {
    return { runs: this.store.loadWorkspaceState(request.workspaceId).scanRuns };
  }

  startScan(request: StartScanRequest): StartScanResponse {
    validateStartScanRequest(request);
    const state = this.store.loadWorkspaceState(request.workspaceId);
    if (state.scanRuns.some((run) => run.id === request.scan.id)) throw new RuntimeError(`Scan already exists: ${request.scan.id}`);
    const profile = findScanProfile(state, request.scan.profileId, request.scan.profileVersion);
    const run: InProgressScanRun = {
      ...request.scan,
      status: "in_progress",
      appliedCriteria: [],
      declaredOutputs: [],
      findingNodeIds: [],
    };
    validateScanRun(run, state.scanProfiles, state.graph);
    this.store.saveWorkspaceState({ ...state, scanRuns: [...state.scanRuns, run] });
    return { run, profile, instructions: createScanInstructions(profile) };
  }

  recordScanCoverage(request: RecordScanCoverageRequest): RecordScanCoverageResponse {
    validateRecordScanCoverageRequest(request);
    const state = this.store.loadWorkspaceState(request.workspaceId);
    const run = findInProgressScan(state, request.scanId);
    const updated: InProgressScanRun = { ...run, coverage: request.coverage };
    validateScanRun(updated, state.scanProfiles, state.graph);
    this.store.saveWorkspaceState({ ...state, scanRuns: replaceById(state.scanRuns, updated) });
    return { run: updated };
  }

  createScanFinding(request: CreateScanFindingRequest): CreateScanFindingResponse {
    validateCreateScanFindingRequest(request);
    const state = this.store.loadWorkspaceState(request.workspaceId);
    if (state.capturePolicy.mode !== "delegated") {
      throw new RuntimeError(`scan_finding_create requires delegated capture; current mode is ${state.capturePolicy.mode}`);
    }
    const run = findInProgressScan(state, request.scanId);
    const profile = findScanProfile(state, run.profileId, run.profileVersion);
    for (const criterionId of request.finding.criterionIds) {
      if (!profile.criteria.some((criterion) => criterion.id === criterionId)) {
        throw new RuntimeError(`Finding references criterion outside scan profile: ${criterionId}`);
      }
    }
    for (const nodeId of request.finding.affectedNodeIds) {
      if (!state.graph.nodes.some((node) => node.id === nodeId)) throw new RuntimeError(`Finding references missing affected node: ${nodeId}`);
    }
    const node = createFindingNode(run.id, request.finding);
    const graph = applyGraphCommands(state.graph, [
      { id: `scan-${run.id}-finding-${node.id}`, type: "node.create", payload: { node } },
    ]);
    const updated: InProgressScanRun = { ...run, findingNodeIds: [...run.findingNodeIds, node.id] };
    this.store.saveWorkspaceState({ ...state, graph, scanRuns: replaceById(state.scanRuns, updated) });
    return { node, run: updated };
  }

  updateFinding(request: UpdateFindingRequest): UpdateFindingResponse {
    validateUpdateFindingRequest(request);
    const state = this.store.loadWorkspaceState(request.workspaceId);
    const current = findById(state.graph.nodes, request.findingNodeId, "Finding node");
    const node = updateFindingNode(current, request.changes);
    const graph = applyGraphCommands(state.graph, [
      {
        id: `finding-update-${request.findingNodeId}-${Date.now()}`,
        type: "node.update",
        payload: {
          id: node.id,
          changes: { notes: node.notes as string, metadata: node.metadata as NonNullable<typeof node.metadata> },
        },
      },
    ]);
    this.store.saveWorkspaceState({ ...state, graph });
    return { node };
  }

  completeScan(request: CompleteScanRequest): CompleteScanResponse {
    validateCompleteScanRequest(request);
    const state = this.store.loadWorkspaceState(request.workspaceId);
    const run = findInProgressScan(state, request.scanId);
    if (run.coverage === undefined) throw new RuntimeError(`Scan coverage has not been recorded: ${run.id}`);
    const findingEvidence = run.findingNodeIds.map((nodeId) => toFindingEvidence(findById(state.graph.nodes, nodeId, "Finding node")));
    const completed: CompletedScanRun = {
      ...run,
      status: "completed",
      coverage: run.coverage,
      completedAt: request.completedAt,
      appliedCriteria: request.appliedCriteria,
      declaredOutputs: request.declaredOutputs,
      graphDigest: createHash("sha256").update(stableJson(state.graph)).digest("hex"),
      findingEvidence,
    };
    validateScanRun(completed, state.scanProfiles, state.graph);
    this.store.saveWorkspaceState({ ...state, scanRuns: replaceById(state.scanRuns, completed) });
    return { run: completed };
  }

  compareScans(request: CompareScansRequest): CompareScansResponse {
    validateCompareScansRequest(request);
    const state = this.store.loadWorkspaceState(request.workspaceId);
    const before = findCompletedScan(state, request.beforeScanId);
    const after = findCompletedScan(state, request.afterScanId);
    return { comparison: compareCompletedScans(before, after) };
  }

  exportWorkspace(request: ExportWorkspaceRequest): ExportWorkspaceResponse {
    validateExportWorkspaceRequest(request);
    const state = this.store.loadWorkspaceState(request.workspaceId);
    return { path: request.targetPath, manifest: writeWorkspaceBundle(request.targetPath, state, request.exportedAt) };
  }

  exportWorkspaceBundle(request: ExportWorkspaceBundleRequest): ExportWorkspaceBundleResponse {
    validateExportWorkspaceBundleRequest(request);
    return createWorkspaceBundle(this.store.loadWorkspaceState(request.workspaceId), request.exportedAt);
  }

  importWorkspace(request: ImportWorkspaceRequest): ImportWorkspaceResponse {
    validateImportWorkspaceRequest(request);
    return this.persistImportedBundle(readWorkspaceBundle(request.sourcePath), request.mode);
  }

  importWorkspaceBundle(request: ImportWorkspaceBundleRequest): ImportWorkspaceBundleResponse {
    validateImportWorkspaceBundleRequest(request);
    return this.persistImportedBundle(parseWorkspaceBundle(request.bytes), request.mode);
  }

  private persistImportedBundle(
    bundle: ReturnType<typeof readWorkspaceBundle>,
    mode: "new" | "replace",
  ): ImportWorkspaceResponse {
    const exists = this.store.workspaceExists(bundle.state.workspace.id);
    if (mode === "new" && exists) throw new RuntimeError(`Workspace already exists: ${bundle.state.workspace.id}`);
    if (mode === "replace" && !exists) throw new RuntimeError(`Workspace does not exist for replacement: ${bundle.state.workspace.id}`);
    if (mode === "replace") {
      this.store.replaceWorkspaceState(bundle.state);
    } else {
      this.store.saveWorkspaceState(bundle.state);
    }
    return { workspace: bundle.state.workspace, manifest: bundle.manifest };
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
    scanProfiles: INITIAL_SCAN_PROFILES,
    scanRuns: [],
  };
}

function toWorkspaceSummary(workspace: WorkspaceRecord): WorkspaceSummary {
  const summary: WorkspaceSummary = {
    id: workspace.id,
    name: workspace.name,
  };
  if (workspace.slug !== undefined) {
    summary.slug = workspace.slug;
  }
  if (workspace.archived === true) {
    summary.archived = true;
  }
  if (workspace.updatedAt !== undefined) {
    summary.updatedAt = workspace.updatedAt;
  }
  return summary;
}

function createTargetIndex(state: WorkspaceState) {
  return {
    nodeIds: state.graph.nodes.map((node) => node.id),
    edgeIds: state.graph.edges.map((edge) => edge.id),
    projectionIds: state.projections.map((projection) => projection.id),
  };
}

function normalizeWorkspaceRef(value: string): string {
  return value.trim().toLocaleLowerCase();
}

function scoreWorkspaceSummaryMatch(workspace: WorkspaceSummary, query: string): number {
  const normalizedQuery = normalizeWorkspaceRef(query);
  const values = [workspace.id, workspace.slug, workspace.name]
    .filter((value): value is string => value !== undefined)
    .map(normalizeWorkspaceRef);

  if (values.some((value) => value === normalizedQuery)) {
    return 3;
  }

  if (values.some((value) => value.startsWith(normalizedQuery))) {
    return 2;
  }

  if (values.some((value) => value.includes(normalizedQuery))) {
    return 1;
  }

  return 0;
}

function compareWorkspaceSummaries(left: WorkspaceSummary, right: WorkspaceSummary, query?: string): number {
  const leftArchived = left.archived === true ? 1 : 0;
  const rightArchived = right.archived === true ? 1 : 0;
  if (leftArchived !== rightArchived) {
    return leftArchived - rightArchived;
  }

  const leftScore = query === undefined ? 0 : scoreWorkspaceSummaryMatch(left, query);
  const rightScore = query === undefined ? 0 : scoreWorkspaceSummaryMatch(right, query);
  if (leftScore !== rightScore) {
    return rightScore - leftScore;
  }

  const leftUpdatedAt = Date.parse(left.updatedAt ?? "");
  const rightUpdatedAt = Date.parse(right.updatedAt ?? "");
  if (!Number.isNaN(leftUpdatedAt) || !Number.isNaN(rightUpdatedAt)) {
    if (Number.isNaN(leftUpdatedAt)) return 1;
    if (Number.isNaN(rightUpdatedAt)) return -1;
    if (leftUpdatedAt !== rightUpdatedAt) return rightUpdatedAt - leftUpdatedAt;
  }

  const nameOrder = left.name.localeCompare(right.name);
  if (nameOrder !== 0) {
    return nameOrder;
  }

  return left.id.localeCompare(right.id);
}

function createWorkspaceNotFoundError(ref: string): RuntimeError {
  return new RuntimeError(`Workspace not found: ${ref}`, {
    code: "workspace_not_found",
    details: { ref },
  });
}

function createWorkspaceAmbiguousError(ref: string, candidates: readonly WorkspaceRecord[]): RuntimeError {
  return new RuntimeError(`Workspace reference is ambiguous: ${ref}`, {
    code: "workspace_ambiguous",
    details: { ref, candidates: candidates.map(toWorkspaceSummary) },
  });
}

function findById<T extends { id: string }>(items: readonly T[], id: string, label: string): T {
  const item = items.find((candidate) => candidate.id === id);
  if (item === undefined) {
    throw new RuntimeError(`${label} not found: ${id}`);
  }
  return item;
}

function findScanProfile(state: WorkspaceState, profileId: string, profileVersion: number) {
  const profile = state.scanProfiles.find((candidate) => candidate.id === profileId && candidate.version === profileVersion);
  if (profile === undefined) throw new RuntimeError(`Scan profile not found: ${profileId}@${profileVersion}`);
  return profile;
}

function findInProgressScan(state: WorkspaceState, scanId: string): InProgressScanRun {
  const run = findById(state.scanRuns, scanId, "Scan");
  if (run.status !== "in_progress") throw new RuntimeError(`Scan is not in progress: ${scanId}`);
  return run;
}

function findCompletedScan(state: WorkspaceState, scanId: string): CompletedScanRun {
  const run = findById(state.scanRuns, scanId, "Scan");
  if (run.status !== "completed") throw new RuntimeError(`Scan is not completed: ${scanId}`);
  return run;
}

function replaceById<T extends { id: string }>(items: readonly T[], replacement: T): T[] {
  return items.map((item) => (item.id === replacement.id ? replacement : item));
}

function createScanInstructions(profile: ReturnType<typeof findScanProfile>): string[] {
  return [
    ...profile.instructions,
    `Rediscover sources using include patterns: ${profile.scope.include.join(", ")}.`,
    `Exclude only sources matching: ${profile.scope.exclude.join(", ")}.`,
    `Apply every criterion: ${profile.criteria.map((criterion) => criterion.id).join(", ")}.`,
    `Declare outputs: ${profile.requiredOutputs.join(", ")}.`,
  ];
}
