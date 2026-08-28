/**
 * Responsibility: Coordinate typed HiveMap application commands over domain modules and storage ports.
 * Must not: Implement HTTP/MCP transports, crawl repositories implicitly, or make projections semantic authority.
 * Contract: Validates each command, mutates through HiveMapStore, and returns explicit typed responses.
 */
import { createHash } from "node:crypto";
import { posix as pathPosix } from "node:path";
import {
  validateExecuteRepositoryIndexRequest,
  validateBuildScanBoundaryMapRequest,
  validateGetScanProfileOverlayHelpRequest,
  validateSuggestScanProfileOverlayRequest,
  validateGetRepositoryIndexRequest,
  validateGetWorkspaceSummaryRequest,
  validateListRepositoryIndexesRequest,
  validateListRepositoryEvidenceCandidatesRequest,
  validateListWorkspaceSummariesRequest,
  validateResolveWorkspaceRequest,
  validateSearchRepositoryIndexRequest,
  validateListSimilarConceptsRequest,
  validateApplyGraphCommandsRequest,
  validateApplyProposalRequest,
  validateApproveProposalRequest,
  validateAssignCategoryRequest,
  validateStartRepositoryIndexRequest,
  validateUpsertConceptEmbeddingRequest,
  validateCreateProposalRequest,
  validateCreateWorkspaceRequest,
  validateGetProjectionRequest,
  validateRecordFeedbackRequest,
  validateRejectProposalRequest,
  validateCompareScansRequest,
  validateCompleteScanRequest,
  validateCreateScanFindingRequest,
  validateRecordScanCalibrationDecisionRequest,
  validateExportWorkspaceRequest,
  validateExportWorkspaceBundleRequest,
  validateImportWorkspaceRequest,
  validateImportWorkspaceBundleRequest,
  validateRecordScanCoverageRequest,
  validateStartScanRequest,
  validateUpdateFindingRequest,
  validateValidateScanFindingRequest,
  type ApplyGraphCommandsRequest,
  type ApplyGraphCommandsResponse,
  type ApplyProposalRequest,
  type ApplyProposalResponse,
  type ApproveProposalRequest,
  type ApproveProposalResponse,
  type AssignCategoryRequest,
  type AssignCategoryResponse,
  type BuildScanBoundaryMapRequest,
  type BuildScanBoundaryMapResponse,
  type CreateProjectionRequest,
  type CreateProjectionResponse,
  type CreateProposalRequest,
  type CreateProposalResponse,
  type CreateWorkspaceRequest,
  type CreateWorkspaceResponse,
  type GetWorkspaceSummaryRequest,
  type GetWorkspaceSummaryResponse,
  type GetScanProfileOverlayHelpRequest,
  type GetScanProfileOverlayHelpResponse,
  type ScanProfileOverlaySymptomHint,
  type ScanProfileOverlaySymptomId,
  type SuggestScanProfileOverlayRequest,
  type SuggestScanProfileOverlayResponse,
  type GetCategoriesResponse,
  type GetGraphRequest,
  type GetGraphResponse,
  type GetRepositoryIndexRequest,
  type GetRepositoryIndexResponse,
  type GetProjectionRequest,
  type GetProjectionResponse,
  type ListSimilarConceptsRequest,
  type ListSimilarConceptsResponse,
  type ListRepositoryIndexesRequest,
  type ListRepositoryIndexesResponse,
  type ListRepositoryEvidenceCandidatesRequest,
  type ListRepositoryEvidenceCandidatesResponse,
  type RepositoryEvidenceCandidate,
  type RepositoryEvidenceSource,
  type ScanCalibrationAssessment,
  type ScanCalibrationDecisionGuidance,
  type ScanCoverageSummary,
  type ScanFindingValidationAssessment,
  type ScanProfileOverlayResolution,
  type GetWorkspaceResponse,
  type ListFeedbackRequest,
  type ListFeedbackResponse,
  type ListProposalsRequest,
  type ListProposalsResponse,
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
  type ExecuteRepositoryIndexRequest,
  type ExecuteRepositoryIndexResponse,
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
  type RecordScanCalibrationDecisionRequest,
  type RecordScanCalibrationDecisionResponse,
  type RecordScanCoverageRequest,
  type RecordScanCoverageResponse,
  type ResolveWorkspaceRequest,
  type ResolveWorkspaceResponse,
  type SearchRepositoryIndexRequest,
  type SearchRepositoryIndexResponse,
  type StartScanRequest,
  type StartScanResponse,
  type StartRepositoryIndexRequest,
  type StartRepositoryIndexResponse,
  type UpdateFindingRequest,
  type UpdateFindingResponse,
  type UpsertConceptEmbeddingRequest,
  type UpsertConceptEmbeddingResponse,
  type ValidateScanFindingRequest,
  type ValidateScanFindingResponse,
  type WorkspaceSummary,
} from "@hivemap/api-contracts";
import { applyApprovedProposal, approvePendingProposal, DEFAULT_CAPTURE_POLICY, rejectPendingProposal } from "@hivemap/capture";
import { INITIAL_CATEGORY_CATALOG } from "@hivemap/categories";
import { applyGraphCommands } from "@hivemap/graph-core";
import { createDiveInProjection, createOverviewProjection, createProjectMapProjection } from "@hivemap/projections";
import {
  INITIAL_SCAN_PROFILES,
  compareCompletedScans,
  applyScanProfileOverlay,
  createBoundaryMapBuildConfig,
  createFindingNode,
  getScanProfileOverlayPath,
  SCAN_CALIBRATION_DECISION_VALUES,
  SCAN_PROFILE_OVERLAY_FORMAT_VERSION,
  toFindingEvidence,
  updateFindingNode,
  validateScanRun,
  type ScanCalibrationDecision,
  type ScanCalibrationDecisionRecord,
  type ScanCoverage,
  type ScanProfile,
  type ScanProfileOverlay,
  type CompletedScanRun,
  type InProgressScanRun,
} from "@hivemap/scans";
import {
  readWorkspaceBundle,
  createWorkspaceBundle,
  parseWorkspaceBundle,
  stableJson,
  writeWorkspaceBundle,
  type WorkspaceBundle,
  type HiveMapStore,
  type RepositoryFileRecord,
  type RepositoryDependencyRecord,
  type SimilarConceptMatchRecord,
  type RepositoryIndexRecord,
  type RepositoryChunkRecord,
  type RepositorySymbolRecord,
  type WorkspaceRecord,
  type WorkspaceState,
} from "@hivemap/storage";

import { buildBoundaryMapArtifact } from "./repository-boundary-map.js";
import { RepositoryIndexExecutionError, executeSafeRepositoryIndex, type RepositoryIndexExecutor } from "./repository-indexing.js";
import { RuntimeError } from "./runtime-error.js";
import {
  createScanProfileOverlayHelp,
  createScanCoverageWarnings,
  createSuggestedOverlayFields,
  deriveScanCoverage,
  findOverlaySymptomHint,
  resolveBoundaryMapBuildConfig,
  resolveScanProfileContext,
  serializeSuggestedOverlayPatch,
  summarizeRecordedCoverage,
} from "./scan-profile-coordinator.js";
import { createRepositoryEvidenceCandidates } from "./repository-evidence-candidates.js";
import { matchesAnyGlob, normalizeRepositoryPath } from "./repository-path.js";

export { RepositoryIndexExecutionError, executeSafeRepositoryIndex, type RepositoryIndexExecutor } from "./repository-indexing.js";
export { RuntimeError } from "./runtime-error.js";

export type HiveMapRuntimeOptions = {
  store: HiveMapStore;
  repositoryIndexExecutor?: RepositoryIndexExecutor;
  now?: () => string;
};

export class HiveMapRuntime {
  private readonly store: HiveMapStore;
  private readonly repositoryIndexExecutor: RepositoryIndexExecutor;
  private readonly now: () => string;

  constructor(options: HiveMapRuntimeOptions) {
    this.store = options.store;
    this.repositoryIndexExecutor = options.repositoryIndexExecutor ?? executeSafeRepositoryIndex;
    this.now = options.now ?? (() => new Date().toISOString());
  }

  async createWorkspace(request: CreateWorkspaceRequest): Promise<CreateWorkspaceResponse> {
    validateCreateWorkspaceRequest(request);
    const state = createInitialWorkspaceState(request);
    await this.store.saveWorkspaceState(state);
    return { workspace: state.workspace };
  }

  async listWorkspaceSummaries(request: ListWorkspaceSummariesRequest): Promise<ListWorkspaceSummariesResponse> {
    validateListWorkspaceSummariesRequest(request);
    const query = request.query?.trim();
    const items = (await this.store.listWorkspaces())
      .filter((workspace) => request.includeArchived === true || workspace.archived !== true)
      .map(toWorkspaceSummary)
      .filter((workspace) => query === undefined || scoreWorkspaceSummaryMatch(workspace, query) > 0)
      .sort((left, right) => compareWorkspaceSummaries(left, right, query))
      .slice(0, request.limit);
    return { items };
  }

  async getWorkspaceSummary(request: GetWorkspaceSummaryRequest): Promise<GetWorkspaceSummaryResponse> {
    validateGetWorkspaceSummaryRequest(request);
    return { workspace: toWorkspaceSummary(await this.store.getWorkspaceRecord(request.workspaceId)) };
  }

  async resolveWorkspace(request: ResolveWorkspaceRequest): Promise<ResolveWorkspaceResponse> {
    validateResolveWorkspaceRequest(request);
    const ref = request.ref.trim();
    const candidates = await this.store.listWorkspaces();
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

  async listWorkspaces(): Promise<ListWorkspacesResponse> {
    return { workspaces: await this.store.listWorkspaces() };
  }

  async getWorkspace(workspaceId: string): Promise<GetWorkspaceResponse> {
    return { state: await this.store.loadWorkspaceState(workspaceId) };
  }

  async getGraph(request: GetGraphRequest): Promise<GetGraphResponse> {
    const state = await this.store.loadWorkspaceState(request.workspaceId);
    return { graph: state.graph };
  }

  async listRepositoryIndexes(request: ListRepositoryIndexesRequest): Promise<ListRepositoryIndexesResponse> {
    validateListRepositoryIndexesRequest(request);
    await this.store.getWorkspaceRecord(request.workspaceId);
    return { indexes: await this.store.listRepositoryIndexes(request.workspaceId) };
  }

  async getRepositoryIndex(request: GetRepositoryIndexRequest): Promise<GetRepositoryIndexResponse> {
    validateGetRepositoryIndexRequest(request);
    await this.store.getWorkspaceRecord(request.workspaceId);
    return { index: await this.store.getRepositoryIndex(request.workspaceId, request.indexId) };
  }

  async startRepositoryIndex(request: StartRepositoryIndexRequest): Promise<StartRepositoryIndexResponse> {
    validateStartRepositoryIndexRequest(request);
    if (request.index.mode === "deep") {
      throw new RuntimeError("Deep repository indexing is not implemented in the current phase", {
        code: "REPOSITORY_INDEX_MODE_UNAVAILABLE",
        details: { mode: request.index.mode },
      });
    }
    await this.store.getWorkspaceRecord(request.workspaceId);
    const existing = await this.store.listRepositoryIndexes(request.workspaceId);
    if (existing.some((record) => record.id === request.index.id)) {
      throw new RuntimeError(`Repository index already exists: ${request.index.id}`, {
        code: "REPOSITORY_INDEX_EXISTS",
        details: { workspaceId: request.workspaceId, indexId: request.index.id },
      });
    }

    const index: RepositoryIndexRecord = {
      id: request.index.id,
      workspaceId: request.workspaceId,
      repositoryUrl: request.index.repositoryUrl,
      mode: request.index.mode,
      stage: "requested",
      requestedAt: request.index.requestedAt,
      updatedAt: request.index.requestedAt,
      actor: {
        agentId: request.index.actor.agentId,
        tool: request.index.actor.tool,
      },
      ...(request.index.requestedRef === undefined ? {} : { requestedRef: request.index.requestedRef }),
    };

    await this.store.upsertRepositoryIndex(index);
    return { index };
  }

  async executeRepositoryIndex(request: ExecuteRepositoryIndexRequest): Promise<ExecuteRepositoryIndexResponse> {
    validateExecuteRepositoryIndexRequest(request);
    const index = await this.store.getRepositoryIndex(request.workspaceId, request.indexId);
    if (index.mode !== "safe") {
      throw new RuntimeError("Only safe repository indexing is implemented in the current phase", {
        code: "REPOSITORY_INDEX_MODE_UNAVAILABLE",
        details: { mode: index.mode },
      });
    }
    if (isRepositoryIndexStageActive(index.stage)) {
      throw new RuntimeError(`Repository index is already running: ${index.id}`, {
        code: "REPOSITORY_INDEX_ALREADY_RUNNING",
        details: { indexId: index.id, stage: index.stage },
      });
    }

    await this.store.upsertRepositoryIndex(createRepositoryIndexExecutionRecord(index, this.now()));
    if (isRepositoryIndexTerminalStage(index.stage)) {
      await this.store.replaceRepositoryIndexContents(request.workspaceId, request.indexId, [], [], []);
    }

    try {
      await this.bumpRepositoryIndexStage(request.workspaceId, request.indexId, "checking_out");
      const result = await this.repositoryIndexExecutor({
        workspaceId: request.workspaceId,
        indexId: request.indexId,
        repositoryUrl: index.repositoryUrl,
        ...(index.requestedRef === undefined ? {} : { requestedRef: index.requestedRef }),
      });
      await this.bumpRepositoryIndexStage(request.workspaceId, request.indexId, "discovering", {
        resolvedCommit: result.resolvedCommit,
      });
      await this.bumpRepositoryIndexStage(request.workspaceId, request.indexId, "indexing_syntax", {
        resolvedCommit: result.resolvedCommit,
      });
      await this.bumpRepositoryIndexStage(request.workspaceId, request.indexId, "normalizing", {
        resolvedCommit: result.resolvedCommit,
      });
      await this.store.replaceRepositoryIndexContents(
        request.workspaceId,
        request.indexId,
        result.files,
        result.chunks,
        result.symbols ?? [],
        result.references ?? [],
        result.dependencies ?? [],
      );

      const completedAt = this.now();
      const completed: RepositoryIndexRecord = {
        ...(await this.store.getRepositoryIndex(request.workspaceId, request.indexId)),
        resolvedCommit: result.resolvedCommit,
        stage: "completed",
        updatedAt: completedAt,
        completedAt,
        stats: result.stats,
      };
      await this.store.upsertRepositoryIndex(completed);
      return { index: completed };
    } catch (error) {
      const completedAt = this.now();
      const failedIndex = await this.store.getRepositoryIndex(request.workspaceId, request.indexId);
      await this.store.upsertRepositoryIndex({
        ...stripRepositoryIndexOptionalState(failedIndex),
        stage: "failed",
        updatedAt: completedAt,
        completedAt,
        failure: normalizeRepositoryIndexFailure(error),
      });
      if (error instanceof RepositoryIndexExecutionError) {
        throw new RuntimeError(error.message, {
          code: error.code,
          details: { workspaceId: request.workspaceId, indexId: request.indexId },
        });
      }
      throw error;
    }
  }

  async searchRepositoryIndex(request: SearchRepositoryIndexRequest): Promise<SearchRepositoryIndexResponse> {
    validateSearchRepositoryIndexRequest(request);
    const index = await this.store.getRepositoryIndex(request.workspaceId, request.indexId);
    if (index.stage !== "completed") {
      throw new RuntimeError(`Repository index must be completed before search: ${index.id}`, {
        code: "REPOSITORY_INDEX_NOT_COMPLETED",
        details: { indexId: index.id, stage: index.stage },
      });
    }
    return {
      indexId: request.indexId,
      query: request.query,
      hits: await this.store.searchRepositoryIndex(request.workspaceId, request.indexId, request.query, request.limit ?? 20),
    };
  }

  async listRepositoryEvidenceCandidates(
    request: ListRepositoryEvidenceCandidatesRequest,
  ): Promise<ListRepositoryEvidenceCandidatesResponse> {
    validateListRepositoryEvidenceCandidatesRequest(request);
    const state = await this.store.loadWorkspaceState(request.workspaceId);
    const profile = findScanProfile(state, request.profileId, request.profileVersion);
    const index = await this.store.getRepositoryIndex(request.workspaceId, request.indexId);
    if (index.stage !== "completed") {
      throw new RuntimeError(`Repository index must be completed before retrieving evidence candidates: ${index.id}`, {
        code: "REPOSITORY_INDEX_NOT_COMPLETED",
        details: { indexId: index.id, stage: index.stage },
      });
    }

    const files = await this.store.listRepositoryIndexFiles(request.workspaceId, request.indexId);
    const chunks = await this.store.listRepositoryIndexChunks(request.workspaceId, request.indexId);
    const symbols = await this.store.listRepositoryIndexSymbols(request.workspaceId, request.indexId);
    const dependencies = await this.store.listRepositoryIndexDependencies(request.workspaceId, request.indexId);
    const profileContext = resolveScanProfileContext(profile, files, chunks, symbols);
    if (!profileContext.effectiveProfile.criteria.some((criterion) => criterion.id === request.criterionId)) {
      throw new RuntimeError(`Scan criterion not found in effective profile: ${request.criterionId}`, {
        code: "SCAN_CRITERION_NOT_FOUND",
        details: {
          profileId: request.profileId,
          profileVersion: request.profileVersion,
          criterionId: request.criterionId,
          overlayPath: profileContext.overlay.overlayPath,
        },
      });
    }

    const candidates = createRepositoryEvidenceCandidates({
      profile: profileContext.effectiveProfile,
      criterionId: request.criterionId,
      files,
      chunks,
      symbols,
      dependencies,
      limit: request.limit ?? 20,
      includedPaths: deriveScanCoverage(profileContext.effectiveProfile, files).included,
    });

    return {
      indexId: request.indexId,
      profileId: request.profileId,
      profileVersion: request.profileVersion,
      criterionId: request.criterionId,
      baseProfile: profileContext.baseProfile,
      effectiveProfile: profileContext.effectiveProfile,
      overlay: profileContext.overlay,
      coverageSummary: profileContext.coverageSummary,
      calibrationAssessment: createEvidenceCandidatesCalibrationAssessment(
        request.criterionId,
        profileContext.coverageSummary,
        profileContext.overlay,
        candidates,
      ),
      decisionGuidance: createCalibrationDecisionGuidance(
        createEvidenceCandidatesCalibrationAssessment(
          request.criterionId,
          profileContext.coverageSummary,
          profileContext.overlay,
          candidates,
        ),
      ),
      candidates,
    };
  }

  async buildScanBoundaryMap(request: BuildScanBoundaryMapRequest): Promise<BuildScanBoundaryMapResponse> {
    validateBuildScanBoundaryMapRequest(request);
    const state = await this.store.loadWorkspaceState(request.workspaceId);
    const run = findInProgressScan(state, request.scanId);
    requireCalibrationDecision(run, "build-boundary-map", "Building a boundary map");
    if (run.coverage === undefined) {
      throw new RuntimeError(`Scan coverage is required before building a boundary map: ${run.id}`, {
        code: "SCAN_COVERAGE_REQUIRED",
        details: { scanId: run.id },
      });
    }
    const repositoryIndexId = run.repository.repositoryIndexId;
    if (repositoryIndexId === undefined) {
      throw new RuntimeError(`Scan must reference a completed repository index before building a boundary map: ${run.id}`, {
        code: "SCAN_REPOSITORY_INDEX_REQUIRED",
        details: { scanId: run.id },
      });
    }
    const repositoryIndex = await this.store.getRepositoryIndex(request.workspaceId, repositoryIndexId);
    if (repositoryIndex.stage !== "completed" || repositoryIndex.resolvedCommit === undefined) {
      throw new RuntimeError(`Repository index must be completed before building a boundary map: ${repositoryIndex.id}`, {
        code: "REPOSITORY_INDEX_NOT_COMPLETED",
        details: { indexId: repositoryIndex.id, stage: repositoryIndex.stage },
      });
    }

    const files = await this.store.listRepositoryIndexFiles(request.workspaceId, repositoryIndexId);
    const chunks = await this.store.listRepositoryIndexChunks(request.workspaceId, repositoryIndexId);
    const symbols = await this.store.listRepositoryIndexSymbols(request.workspaceId, repositoryIndexId);
    const dependencies = await this.store.listRepositoryIndexDependencies(request.workspaceId, repositoryIndexId);
    const profile = findScanProfile(state, run.profileId, run.profileVersion);
    const boundaryMapConfig = resolveBoundaryMapBuildConfig(profile, files, chunks);

    try {
      const coverageSummary = summarizeRecordedCoverage(run.coverage, files, symbols);
      const boundaryMap = buildBoundaryMapArtifact({
        coverage: run.coverage,
        files,
        symbols,
        dependencies,
        revision: repositoryIndex.resolvedCommit,
        config: boundaryMapConfig,
      });
      return {
        scanId: run.id,
        profileId: run.profileId,
        profileVersion: run.profileVersion,
        repositoryIndexId,
        coverageSummary,
        calibrationAssessment: createBoundaryMapCalibrationAssessment(coverageSummary, boundaryMap),
        decisionGuidance: createCalibrationDecisionGuidance(createBoundaryMapCalibrationAssessment(coverageSummary, boundaryMap)),
        boundaryMap,
      };
    } catch (error) {
      if (error instanceof Error) {
        throw new RuntimeError(error.message, {
          code: "BOUNDARY_MAP_BUILD_FAILED",
          details: { scanId: run.id, repositoryIndexId },
        });
      }
      throw error;
    }
  }

  async getScanProfileOverlayHelp(request: GetScanProfileOverlayHelpRequest): Promise<GetScanProfileOverlayHelpResponse> {
    validateGetScanProfileOverlayHelpRequest(request);
    const state = await this.store.loadWorkspaceState(request.workspaceId);
    const profile = findScanProfile(state, request.profileId, request.profileVersion);
    return createScanProfileOverlayHelp(profile);
  }

  async suggestScanProfileOverlay(request: SuggestScanProfileOverlayRequest): Promise<SuggestScanProfileOverlayResponse> {
    validateSuggestScanProfileOverlayRequest(request);
    const state = await this.store.loadWorkspaceState(request.workspaceId);
    const run = findInProgressScan(state, request.scanId);
    if (run.effectiveProfile === undefined) {
      throw new RuntimeError(`Scan effective profile snapshot is required before suggesting overlay edits: ${run.id}`, {
        code: "SCAN_EFFECTIVE_PROFILE_REQUIRED",
        details: { scanId: run.id },
      });
    }

    const repositoryIndexId = run.repository.repositoryIndexId;
    if (repositoryIndexId === undefined) {
      throw new RuntimeError(`Scan must reference a completed repository index before suggesting overlay edits: ${run.id}`, {
        code: "SCAN_REPOSITORY_INDEX_REQUIRED",
        details: { scanId: run.id },
      });
    }

    const repositoryIndex = await this.store.getRepositoryIndex(request.workspaceId, repositoryIndexId);
    if (repositoryIndex.stage !== "completed") {
      throw new RuntimeError(`Repository index must be completed before suggesting overlay edits: ${repositoryIndex.id}`, {
        code: "REPOSITORY_INDEX_NOT_COMPLETED",
        details: { indexId: repositoryIndex.id, stage: repositoryIndex.stage },
      });
    }

    const baseProfile = findScanProfile(state, run.profileId, run.profileVersion);
    const files = await this.store.listRepositoryIndexFiles(request.workspaceId, repositoryIndexId);
    const chunks = await this.store.listRepositoryIndexChunks(request.workspaceId, repositoryIndexId);
    const symbols = await this.store.listRepositoryIndexSymbols(request.workspaceId, repositoryIndexId);
    const profileContext = resolveScanProfileContext(baseProfile, files, chunks, symbols);
    const boundaryMapConfig = resolveBoundaryMapBuildConfig(baseProfile, files, chunks);
    const symptom = findOverlaySymptomHint(run.effectiveProfile, request.symptomId);
    const suggestedFields = createSuggestedOverlayFields(run.effectiveProfile, boundaryMapConfig, symptom);

    return {
      scanId: run.id,
      profileId: run.profileId,
      profileVersion: run.profileVersion,
      overlay: profileContext.overlay,
      recommendedDecision: "refine-overlay",
      symptom,
      suggestedFields,
      suggestedOverlayPatch: serializeSuggestedOverlayPatch(run.effectiveProfile, suggestedFields),
      nextActions: [
        `Edit ${profileContext.overlay.overlayPath} using only the fields in this scaffold.`,
        "Record calibration decision refine-overlay before restarting the scan from the same completed repository index.",
        "Restart the scan with a new scan id and verify that the original calibration symptom disappears before creating findings.",
      ],
    };
  }

  async upsertConceptEmbedding(request: UpsertConceptEmbeddingRequest): Promise<UpsertConceptEmbeddingResponse> {
    validateUpsertConceptEmbeddingRequest(request);
    const state = await this.store.loadWorkspaceState(request.workspaceId);
    const node = findNodeById(state.graph, request.nodeId);
    if (node.type !== "concept") {
      throw new RuntimeError(`Embeddings currently support concept nodes only: ${request.nodeId}`, {
        code: "UNSUPPORTED_EMBEDDING_NODE_TYPE",
      });
    }

    const { contentDigest } = createConceptEmbeddingSource(node);
    await this.store.upsertConceptEmbedding({
      workspaceId: request.workspaceId,
      nodeId: request.nodeId,
      model: request.embedding.model,
      contentDigest,
      embedding: request.embedding.values,
      createdAt: request.embedding.updatedAt,
      updatedAt: request.embedding.updatedAt,
    });

    return {
      embedding: {
        workspaceId: request.workspaceId,
        nodeId: request.nodeId,
        model: request.embedding.model,
        dimensions: request.embedding.values.length,
        contentDigest,
        updatedAt: request.embedding.updatedAt,
      },
    };
  }

  async listSimilarConcepts(request: ListSimilarConceptsRequest): Promise<ListSimilarConceptsResponse> {
    validateListSimilarConceptsRequest(request);
    const state = await this.store.loadWorkspaceState(request.workspaceId);
    const sourceNode = findNodeById(state.graph, request.nodeId);
    if (sourceNode.type !== "concept") {
      throw new RuntimeError(`Similarity currently supports concept nodes only: ${request.nodeId}`, {
        code: "UNSUPPORTED_SIMILARITY_NODE_TYPE",
      });
    }

    const { contentDigest: sourceDigest } = createConceptEmbeddingSource(sourceNode);
    const sourceEmbedding = await this.store.getConceptEmbedding(request.workspaceId, request.nodeId, request.model);
    if (sourceEmbedding === undefined) {
      throw new RuntimeError(`Concept embedding not found for node ${request.nodeId} and model ${request.model}`, {
        code: "CONCEPT_EMBEDDING_MISSING",
      });
    }
    if (sourceEmbedding.contentDigest !== sourceDigest) {
      throw new RuntimeError(`Concept embedding is stale for node ${request.nodeId} and model ${request.model}`, {
        code: "CONCEPT_EMBEDDING_STALE",
      });
    }

    const conceptNodes = new Map(
      state.graph.nodes.filter((node) => node.type === "concept").map((node) => [node.id, node] as const),
    );
    const minScore = request.minScore ?? -1;
    const matches = (
      await this.store.listSimilarConceptEmbeddings(
        request.workspaceId,
        request.nodeId,
        request.model,
        Math.max(request.limit ?? 5, 5) * 5,
      )
    )
      .filter((candidate) => {
        const node = conceptNodes.get(candidate.nodeId);
        return node !== undefined && candidate.contentDigest === createConceptEmbeddingSource(node).contentDigest && candidate.score >= minScore;
      })
      .slice(0, request.limit ?? 5)
      .map((candidate) => toSimilarConceptMatch(candidate, conceptNodes));

    return {
      sourceNodeId: request.nodeId,
      model: request.model,
      matches,
    };
  }

  async applyGraphCommands(request: ApplyGraphCommandsRequest): Promise<ApplyGraphCommandsResponse> {
    validateApplyGraphCommandsRequest(request);
    const state = await this.store.loadWorkspaceState(request.workspaceId);
    const nextState = { ...state, graph: applyGraphCommands(state.graph, request.commands) };
    await this.store.saveWorkspaceState(nextState);
    return { graph: nextState.graph };
  }

  async getCategories(workspaceId: string): Promise<GetCategoriesResponse> {
    const state = await this.store.loadWorkspaceState(workspaceId);
    return { catalog: state.categoryCatalog, assignments: state.categoryAssignments };
  }

  async assignCategory(request: AssignCategoryRequest): Promise<AssignCategoryResponse> {
    const state = await this.store.loadWorkspaceState(request.workspaceId);
    validateAssignCategoryRequest(request, state.categoryCatalog, createTargetIndex(state));
    const nextState = { ...state, categoryAssignments: [...state.categoryAssignments, request.assignment] };
    await this.store.saveWorkspaceState(nextState);
    return { assignments: nextState.categoryAssignments };
  }

  async getProjection(request: GetProjectionRequest): Promise<GetProjectionResponse> {
    validateGetProjectionRequest(request);
    const state = await this.store.loadWorkspaceState(request.workspaceId);
    return { projection: findById(state.projections, request.projectionId, "Projection") };
  }

  async createProjection(request: CreateProjectionRequest): Promise<CreateProjectionResponse> {
    const state = await this.store.loadWorkspaceState(request.workspaceId);
    const projection =
      "type" in request.input
        ? createProjectMapProjection(state.graph, request.input)
        : "rootNodeId" in request.input
        ? createDiveInProjection(state.graph, request.input)
        : createOverviewProjection(state.graph, request.input);
    const nextState = { ...state, projections: [...state.projections, projection] };
    await this.store.saveWorkspaceState(nextState);
    return { projection };
  }

  async listFeedback(request: ListFeedbackRequest): Promise<ListFeedbackResponse> {
    const state = await this.store.loadWorkspaceState(request.workspaceId);
    return { feedbackEvents: state.feedbackEvents };
  }

  async recordFeedback(request: RecordFeedbackRequest): Promise<RecordFeedbackResponse> {
    validateRecordFeedbackRequest(request);
    const state = await this.store.loadWorkspaceState(request.workspaceId);
    const nextState = { ...state, feedbackEvents: [...state.feedbackEvents, request.feedbackEvent] };
    await this.store.saveWorkspaceState(nextState);
    return { feedbackEvents: nextState.feedbackEvents };
  }

  async listProposals(request: ListProposalsRequest): Promise<ListProposalsResponse> {
    const state = await this.store.loadWorkspaceState(request.workspaceId);
    return { proposals: state.proposals };
  }

  async createProposal(request: CreateProposalRequest): Promise<CreateProposalResponse> {
    validateCreateProposalRequest(request);
    const state = await this.store.loadWorkspaceState(request.workspaceId);
    const nextState = { ...state, proposals: [...state.proposals, request.proposal] };
    await this.store.saveWorkspaceState(nextState);
    return { proposal: request.proposal };
  }

  async applyProposal(request: ApplyProposalRequest): Promise<ApplyProposalResponse> {
    validateApplyProposalRequest(request);
    const state = await this.store.loadWorkspaceState(request.workspaceId);
    const proposal = findById(state.proposals, request.proposalId, "Proposal");
    const result = applyApprovedProposal(state.graph, proposal);
    const nextState = {
      ...state,
      graph: result.graph,
      proposals: state.proposals.map((candidate) => (candidate.id === proposal.id ? result.proposal : candidate)),
    };
    await this.store.saveWorkspaceState(nextState);
    return { graph: result.graph, proposal: result.proposal };
  }

  async approveProposal(request: ApproveProposalRequest): Promise<ApproveProposalResponse> {
    validateApproveProposalRequest(request);
    const state = await this.store.loadWorkspaceState(request.workspaceId);
    const proposal = findById(state.proposals, request.proposalId, "Proposal");
    const approvedProposal = approvePendingProposal(proposal);
    const nextState = {
      ...state,
      proposals: state.proposals.map((candidate) => (candidate.id === approvedProposal.id ? approvedProposal : candidate)),
    };
    await this.store.saveWorkspaceState(nextState);
    return { proposal: approvedProposal };
  }

  async rejectProposal(request: RejectProposalRequest): Promise<RejectProposalResponse> {
    validateRejectProposalRequest(request);
    const state = await this.store.loadWorkspaceState(request.workspaceId);
    const proposal = findById(state.proposals, request.proposalId, "Proposal");
    const rejectedProposal = rejectPendingProposal(proposal);
    const nextState = {
      ...state,
      proposals: state.proposals.map((candidate) => (candidate.id === rejectedProposal.id ? rejectedProposal : candidate)),
    };
    await this.store.saveWorkspaceState(nextState);
    return { proposal: rejectedProposal };
  }

  async listScanProfiles(request: ListScanProfilesRequest): Promise<ListScanProfilesResponse> {
    return { profiles: (await this.store.loadWorkspaceState(request.workspaceId)).scanProfiles };
  }

  async listScanRuns(request: ListScanRunsRequest): Promise<ListScanRunsResponse> {
    return { runs: (await this.store.loadWorkspaceState(request.workspaceId)).scanRuns };
  }

  async startScan(request: StartScanRequest): Promise<StartScanResponse> {
    validateStartScanRequest(request);
    const state = await this.store.loadWorkspaceState(request.workspaceId);
    if (state.scanRuns.some((run) => run.id === request.scan.id)) throw new RuntimeError(`Scan already exists: ${request.scan.id}`);
    const profile = findScanProfile(state, request.scan.profileId, request.scan.profileVersion);
    const repositoryIndex = await this.store.getRepositoryIndex(request.workspaceId, request.scan.repositoryIndexId);
    if (repositoryIndex.stage !== "completed" || repositoryIndex.resolvedCommit === undefined) {
      throw new RuntimeError(`Repository index must be completed before starting a scan: ${repositoryIndex.id}`, {
        code: "REPOSITORY_INDEX_NOT_COMPLETED",
        details: { indexId: repositoryIndex.id, stage: repositoryIndex.stage },
      });
    }
    const repositoryFiles = await this.store.listRepositoryIndexFiles(request.workspaceId, request.scan.repositoryIndexId);
    const repositoryChunks = await this.store.listRepositoryIndexChunks(request.workspaceId, request.scan.repositoryIndexId);
    const repositorySymbols = await this.store.listRepositoryIndexSymbols(request.workspaceId, request.scan.repositoryIndexId);
    const profileContext = resolveScanProfileContext(profile, repositoryFiles, repositoryChunks, repositorySymbols);
    const run: InProgressScanRun = {
      id: request.scan.id,
      profileId: request.scan.profileId,
      profileVersion: request.scan.profileVersion,
      effectiveProfile: profileContext.effectiveProfile,
      repository: createScanRepositoryFromIndex(request.scan.repositoryIndexId, repositoryIndex),
      actor: request.scan.actor,
      startedAt: request.scan.startedAt,
      status: "in_progress",
      coverage: deriveScanCoverage(profileContext.effectiveProfile, repositoryFiles),
      appliedCriteria: [],
      declaredOutputs: [],
      findingNodeIds: [],
      calibrationDecisions: [],
    };
    validateScanRun(run, state.scanProfiles, state.graph);
    await this.store.saveWorkspaceState({ ...state, scanRuns: [...state.scanRuns, run] });
    return {
      run,
      profile: profileContext.effectiveProfile,
      baseProfile: profileContext.baseProfile,
      overlay: profileContext.overlay,
      coverageSummary: profileContext.coverageSummary,
      workflowPhase: "calibration",
      calibrationChecklist: createScanCalibrationChecklist(
        profileContext.effectiveProfile,
        profileContext.overlay,
        profileContext.coverageSummary,
      ),
      calibrationAssessment: createStartScanCalibrationAssessment(
        profileContext.effectiveProfile,
        profileContext.overlay,
        profileContext.coverageSummary,
      ),
      decisionGuidance: createCalibrationDecisionGuidance(
        createStartScanCalibrationAssessment(
          profileContext.effectiveProfile,
          profileContext.overlay,
          profileContext.coverageSummary,
        ),
      ),
      instructions: createScanInstructions(profileContext.effectiveProfile, run, profileContext.overlay, profileContext.coverageSummary),
    };
  }

  async recordScanCalibrationDecision(
    request: RecordScanCalibrationDecisionRequest,
  ): Promise<RecordScanCalibrationDecisionResponse> {
    validateRecordScanCalibrationDecisionRequest(request);
    const state = await this.store.loadWorkspaceState(request.workspaceId);
    const run = findInProgressScan(state, request.scanId);
    const recordedDecision: ScanCalibrationDecisionRecord = {
      decision: request.decision,
      rationale: request.rationale,
      recordedAt: request.recordedAt,
    };
    const updated: InProgressScanRun = {
      ...run,
      calibrationDecisions: [...run.calibrationDecisions, recordedDecision],
    };
    validateScanRun(updated, state.scanProfiles, state.graph);
    await this.store.saveWorkspaceState({ ...state, scanRuns: replaceById(state.scanRuns, updated) });
    return { run: updated, recordedDecision };
  }

  async recordScanCoverage(request: RecordScanCoverageRequest): Promise<RecordScanCoverageResponse> {
    validateRecordScanCoverageRequest(request);
    const state = await this.store.loadWorkspaceState(request.workspaceId);
    const run = findInProgressScan(state, request.scanId);
    requireCalibrationDecision(run, "correct-coverage", "Recording corrected scan coverage");
    const updated: InProgressScanRun = { ...run, coverage: request.coverage };
    validateScanRun(updated, state.scanProfiles, state.graph);
    await this.store.saveWorkspaceState({ ...state, scanRuns: replaceById(state.scanRuns, updated) });
    return { run: updated };
  }

  async validateScanFinding(request: ValidateScanFindingRequest): Promise<ValidateScanFindingResponse> {
    validateValidateScanFindingRequest(request);
    const state = await this.store.loadWorkspaceState(request.workspaceId);
    const run = findInProgressScan(state, request.scanId);
    if (run.coverage === undefined) {
      throw new RuntimeError(`Scan coverage is required before validating findings: ${run.id}`, {
        code: "SCAN_COVERAGE_REQUIRED",
        details: { scanId: run.id },
      });
    }
    const repositoryIndexId = run.repository.repositoryIndexId;
    if (repositoryIndexId === undefined) {
      throw new RuntimeError(`Scan must reference a completed repository index before validating findings: ${run.id}`, {
        code: "SCAN_REPOSITORY_INDEX_REQUIRED",
        details: { scanId: run.id },
      });
    }

    const baseProfile = findScanProfile(state, run.profileId, run.profileVersion);
    const profile = run.effectiveProfile ?? baseProfile;
    if (!profile.criteria.some((criterion) => criterion.id === request.criterionId)) {
      throw new RuntimeError(`Scan criterion not found in effective profile: ${request.criterionId}`, {
        code: "SCAN_CRITERION_NOT_FOUND",
        details: {
          scanId: run.id,
          profileId: profile.id,
          profileVersion: profile.version,
          criterionId: request.criterionId,
        },
      });
    }

    const repositoryIndex = await this.store.getRepositoryIndex(request.workspaceId, repositoryIndexId);
    if (repositoryIndex.stage !== "completed") {
      throw new RuntimeError(`Repository index must be completed before validating findings: ${repositoryIndex.id}`, {
        code: "REPOSITORY_INDEX_NOT_COMPLETED",
        details: { indexId: repositoryIndex.id, stage: repositoryIndex.stage },
      });
    }

    const files = await this.store.listRepositoryIndexFiles(request.workspaceId, repositoryIndexId);
    const chunks = await this.store.listRepositoryIndexChunks(request.workspaceId, repositoryIndexId);
    const symbols = await this.store.listRepositoryIndexSymbols(request.workspaceId, repositoryIndexId);
    const dependencies = await this.store.listRepositoryIndexDependencies(request.workspaceId, repositoryIndexId);
    const profileContext = resolveScanProfileContext(baseProfile, files, chunks, symbols);
    const coverageSummary = summarizeRecordedCoverage(run.coverage, files, symbols);
    const overlay = profileContext.overlay;

    const structuralAssessment =
      request.boundaryMap === undefined
        ? createStartScanCalibrationAssessment(profile, overlay, coverageSummary)
        : createBoundaryMapCalibrationAssessment(coverageSummary, request.boundaryMap);
    if (structuralAssessment.classification !== "findings-ready") {
      return {
        scanId: run.id,
        criterionId: request.criterionId,
        assessment: mapCalibrationAssessmentToFindingValidation(structuralAssessment),
      };
    }

    const candidates = createRepositoryEvidenceCandidates({
      profile,
      criterionId: request.criterionId,
      files,
      chunks,
      symbols,
      dependencies,
      limit: 20,
      includedPaths: deriveScanCoverage(profile, files).included,
    });
    const evidenceAssessment = createEvidenceCandidatesCalibrationAssessment(
      request.criterionId,
      coverageSummary,
      overlay,
      candidates,
    );
    if (evidenceAssessment.classification !== "findings-ready") {
      return {
        scanId: run.id,
        criterionId: request.criterionId,
        assessment: mapCalibrationAssessmentToFindingValidation(evidenceAssessment),
      };
    }

    return {
      scanId: run.id,
      criterionId: request.criterionId,
      assessment: {
        classification: "likely-real-finding",
        confidence: candidates.some((candidate) => candidate.kind === "deterministic") ? "high" : "medium",
        summary: `The calibrated run has bounded evidence for criterion ${request.criterionId}; the next review step can focus on whether the suspected issue is a real finding.`,
        reasons: [
          `Structural calibration is findings-ready for scan ${run.id}.`,
          `Prepared evidence packets exist for criterion ${request.criterionId}.`,
        ],
        recommendedActions: [
          "Review the bounded candidate packets and create a finding only if the specific claims support a semantic problem.",
          "If the candidate packets still feel indirect, keep the result as a bounded open question instead of forcing a high-confidence finding.",
        ],
      },
    };
  }

  async createScanFinding(request: CreateScanFindingRequest): Promise<CreateScanFindingResponse> {
    validateCreateScanFindingRequest(request);
    const state = await this.store.loadWorkspaceState(request.workspaceId);
    if (state.capturePolicy.mode !== "delegated") {
      throw new RuntimeError(`scan_finding_create requires delegated capture; current mode is ${state.capturePolicy.mode}`);
    }
    const run = findInProgressScan(state, request.scanId);
    requireCalibrationDecision(run, "continue", "Creating scan findings");
    const profile = run.effectiveProfile ?? findScanProfile(state, run.profileId, run.profileVersion);
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
    await this.store.saveWorkspaceState({ ...state, graph, scanRuns: replaceById(state.scanRuns, updated) });
    return { node, run: updated };
  }

  async updateFinding(request: UpdateFindingRequest): Promise<UpdateFindingResponse> {
    validateUpdateFindingRequest(request);
    const state = await this.store.loadWorkspaceState(request.workspaceId);
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
    await this.store.saveWorkspaceState({ ...state, graph });
    return { node };
  }

  async completeScan(request: CompleteScanRequest): Promise<CompleteScanResponse> {
    validateCompleteScanRequest(request);
    const state = await this.store.loadWorkspaceState(request.workspaceId);
    const run = findInProgressScan(state, request.scanId);
    if (run.coverage === undefined) throw new RuntimeError(`Scan coverage has not been recorded: ${run.id}`);
    const repositoryIndexId = run.repository.repositoryIndexId;
    if (repositoryIndexId === undefined) {
      throw new RuntimeError(`Scan must reference a completed repository index before completion: ${run.id}`, {
        code: "SCAN_REPOSITORY_INDEX_REQUIRED",
        details: { scanId: run.id },
      });
    }
    const repositoryFiles = await this.store.listRepositoryIndexFiles(request.workspaceId, repositoryIndexId);
    const repositoryChunks = await this.store.listRepositoryIndexChunks(request.workspaceId, repositoryIndexId);
    const repositorySymbols = await this.store.listRepositoryIndexSymbols(request.workspaceId, repositoryIndexId);
    const baseProfile = findScanProfile(state, run.profileId, run.profileVersion);
    const profile = run.effectiveProfile ?? baseProfile;
    const profileContext = resolveScanProfileContext(baseProfile, repositoryFiles, repositoryChunks, repositorySymbols);
    const coverageSummary = summarizeRecordedCoverage(run.coverage, repositoryFiles, repositorySymbols);
    coverageSummary.warnings = createScanCoverageWarnings(profile, coverageSummary, profileContext.overlay);
    const completionCalibrationAssessment =
      request.boundaryMap === undefined
        ? createStartScanCalibrationAssessment(profile, profileContext.overlay, coverageSummary)
        : createBoundaryMapCalibrationAssessment(coverageSummary, request.boundaryMap);
    const runCarriesFindings = request.declaredOutputs.includes("findings") || run.findingNodeIds.length > 0;
    if (runCarriesFindings && request.calibrationOverrideReason === undefined) {
      requireCalibrationDecision(run, "continue", "Completing a findings-bearing scan");
    }
    if (runCarriesFindings && completionCalibrationAssessment.classification !== "findings-ready" && request.calibrationOverrideReason === undefined) {
      throw new RuntimeError(
        `Scan ${run.id} is not ready for findings-bearing completion under current calibration: ${completionCalibrationAssessment.classification}`,
        {
          code: "SCAN_CALIBRATION_NOT_READY",
          details: {
            scanId: run.id,
            classification: completionCalibrationAssessment.classification,
            summary: completionCalibrationAssessment.summary,
            reasons: completionCalibrationAssessment.reasons,
            recommendedActions: completionCalibrationAssessment.recommendedActions,
          },
        },
      );
    }
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
      ...(request.boundaryMap === undefined ? {} : { boundaryMap: request.boundaryMap }),
      ...(request.calibrationOverrideReason === undefined ? {} : { calibrationOverrideReason: request.calibrationOverrideReason }),
    };
    validateScanRun(completed, state.scanProfiles, state.graph);
    await this.store.saveWorkspaceState({ ...state, scanRuns: replaceById(state.scanRuns, completed) });
    return { run: completed };
  }

  async compareScans(request: CompareScansRequest): Promise<CompareScansResponse> {
    validateCompareScansRequest(request);
    const state = await this.store.loadWorkspaceState(request.workspaceId);
    const before = findCompletedScan(state, request.beforeScanId);
    const after = findCompletedScan(state, request.afterScanId);
    return { comparison: compareCompletedScans(before, after) };
  }

  async exportWorkspace(request: ExportWorkspaceRequest): Promise<ExportWorkspaceResponse> {
    validateExportWorkspaceRequest(request);
    const state = await this.store.loadWorkspaceState(request.workspaceId);
    return { path: request.targetPath, manifest: writeWorkspaceBundle(request.targetPath, state, request.exportedAt) };
  }

  async exportWorkspaceBundle(request: ExportWorkspaceBundleRequest): Promise<ExportWorkspaceBundleResponse> {
    validateExportWorkspaceBundleRequest(request);
    return createWorkspaceBundle(await this.store.loadWorkspaceState(request.workspaceId), request.exportedAt);
  }

  async importWorkspace(request: ImportWorkspaceRequest): Promise<ImportWorkspaceResponse> {
    validateImportWorkspaceRequest(request);
    return this.persistImportedBundle(readWorkspaceBundle(request.sourcePath), request.mode);
  }

  async importWorkspaceBundle(request: ImportWorkspaceBundleRequest): Promise<ImportWorkspaceBundleResponse> {
    validateImportWorkspaceBundleRequest(request);
    return this.persistImportedBundle(parseWorkspaceBundle(request.bytes), request.mode);
  }

  private async persistImportedBundle(
    bundle: WorkspaceBundle,
    mode: "new" | "replace",
  ): Promise<ImportWorkspaceResponse> {
    const exists = await this.store.workspaceExists(bundle.state.workspace.id);
    if (mode === "new" && exists) throw new RuntimeError(`Workspace already exists: ${bundle.state.workspace.id}`);
    if (mode === "replace" && !exists) throw new RuntimeError(`Workspace does not exist for replacement: ${bundle.state.workspace.id}`);
    if (mode === "replace") {
      await this.store.replaceWorkspaceState(bundle.state);
    } else {
      await this.store.saveWorkspaceState(bundle.state);
    }
    return { workspace: bundle.state.workspace, manifest: bundle.manifest };
  }

  private async bumpRepositoryIndexStage(
    workspaceId: string,
    indexId: string,
    stage: RepositoryIndexRecord["stage"],
    changes?: Partial<Pick<RepositoryIndexRecord, "resolvedCommit">>,
  ): Promise<void> {
    const current = await this.store.getRepositoryIndex(workspaceId, indexId);
    await this.store.upsertRepositoryIndex({
      ...current,
      stage,
      updatedAt: this.now(),
      ...(changes?.resolvedCommit === undefined ? {} : { resolvedCommit: changes.resolvedCommit }),
    });
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

function createScanRepositoryFromIndex(indexId: string, index: RepositoryIndexRecord): InProgressScanRun["repository"] {
  if (index.resolvedCommit === undefined) {
    throw new RuntimeError(`Repository index is missing resolved commit: ${index.id}`, {
      code: "REPOSITORY_INDEX_COMMIT_MISSING",
      details: { indexId },
    });
  }
  return {
    repositoryIndexId: indexId,
    root: `index:${indexId}`,
    ...(index.repositoryUrl.length === 0 ? {} : { repositoryUrl: index.repositoryUrl }),
    branch: index.requestedRef ?? "HEAD",
    revision: index.resolvedCommit,
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

function isRepositoryIndexStageActive(stage: RepositoryIndexRecord["stage"]): boolean {
  return stage !== "requested" && stage !== "completed" && stage !== "failed" && stage !== "cancelled";
}

function isRepositoryIndexTerminalStage(stage: RepositoryIndexRecord["stage"]): boolean {
  return stage === "completed" || stage === "failed" || stage === "cancelled";
}

function normalizeRepositoryIndexFailure(error: unknown): { code: string; message: string } {
  if (error instanceof RepositoryIndexExecutionError) {
    return { code: error.code, message: error.message };
  }
  if (error instanceof RuntimeError) {
    return { code: error.code, message: error.message };
  }
  if (error instanceof Error) {
    return { code: error.name, message: error.message };
  }
  return { code: "UNKNOWN_REPOSITORY_INDEX_ERROR", message: "Unknown repository indexing error" };
}

function stripRepositoryIndexOptionalState(index: RepositoryIndexRecord): RepositoryIndexRecord {
  return {
    id: index.id,
    workspaceId: index.workspaceId,
    repositoryUrl: index.repositoryUrl,
    ...(index.requestedRef === undefined ? {} : { requestedRef: index.requestedRef }),
    ...(index.resolvedCommit === undefined ? {} : { resolvedCommit: index.resolvedCommit }),
    mode: index.mode,
    stage: index.stage,
    requestedAt: index.requestedAt,
    updatedAt: index.updatedAt,
    ...(index.completedAt === undefined ? {} : { completedAt: index.completedAt }),
    actor: {
      agentId: index.actor.agentId,
      tool: index.actor.tool,
    },
    ...(index.failure === undefined ? {} : { failure: { ...index.failure } }),
    ...(index.stats === undefined ? {} : { stats: { ...index.stats } }),
  };
}

function createRepositoryIndexExecutionRecord(index: RepositoryIndexRecord, updatedAt: string): RepositoryIndexRecord {
  return {
    id: index.id,
    workspaceId: index.workspaceId,
    repositoryUrl: index.repositoryUrl,
    ...(index.requestedRef === undefined ? {} : { requestedRef: index.requestedRef }),
    mode: index.mode,
    stage: "resolving_ref",
    requestedAt: index.requestedAt,
    updatedAt,
    actor: {
      agentId: index.actor.agentId,
      tool: index.actor.tool,
    },
  };
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

function findNodeById(graph: WorkspaceState["graph"], nodeId: string) {
  const node = graph.nodes.find((candidate) => candidate.id === nodeId);
  if (node === undefined) {
    throw new RuntimeError(`Node not found: ${nodeId}`, { code: "NODE_NOT_FOUND" });
  }
  return node;
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

function requireCalibrationDecision(
  run: InProgressScanRun,
  expectedDecision: ScanCalibrationDecision,
  actionLabel: string,
): void {
  const latestDecision = run.calibrationDecisions[run.calibrationDecisions.length - 1];
  if (latestDecision?.decision === expectedDecision) {
    return;
  }
  throw new RuntimeError(`${actionLabel} requires explicit calibration decision ${expectedDecision} for scan ${run.id}`, {
    code: "SCAN_CALIBRATION_DECISION_REQUIRED",
    details: {
      scanId: run.id,
      requiredDecision: expectedDecision,
      ...(latestDecision === undefined
        ? {}
        : {
            latestDecision: latestDecision.decision,
            latestDecisionRecordedAt: latestDecision.recordedAt,
          }),
    },
  });
}

function findCompletedScan(state: WorkspaceState, scanId: string): CompletedScanRun {
  const run = findById(state.scanRuns, scanId, "Scan");
  if (run.status !== "completed") throw new RuntimeError(`Scan is not completed: ${scanId}`);
  return run;
}

function replaceById<T extends { id: string }>(items: readonly T[], replacement: T): T[] {
  return items.map((item) => (item.id === replacement.id ? replacement : item));
}

function createConceptEmbeddingSource(node: { id: string; label: string; type: string; notes?: string }) {
  const notes = node.notes?.trim();
  return {
    contentDigest: createHash("sha256")
      .update(
        stableJson({
          nodeId: node.id,
          type: node.type,
          label: node.label,
          notes: node.notes ?? "",
        }),
      )
      .digest("hex"),
    contentText: [`Type: ${node.type}`, `Label: ${node.label}`, ...(notes === undefined || notes.length === 0 ? [] : [`Notes: ${notes}`])].join(
      "\n",
    ),
  };
}

function toSimilarConceptMatch(
  candidate: SimilarConceptMatchRecord,
  conceptNodes: Map<string, { id: string; label: string }>,
): ListSimilarConceptsResponse["matches"][number] {
  const node = conceptNodes.get(candidate.nodeId);
  if (node === undefined) {
    throw new RuntimeError(`Concept node not found for similarity result: ${candidate.nodeId}`, {
      code: "SIMILARITY_NODE_NOT_FOUND",
    });
  }
  return {
    nodeId: candidate.nodeId,
    label: node.label,
    score: candidate.score,
    updatedAt: candidate.updatedAt,
  };
}

function createScanInstructions(
  profile: ReturnType<typeof findScanProfile>,
  run: InProgressScanRun,
  overlay: ScanProfileOverlayResolution,
  coverageSummary: ScanCoverageSummary,
): string[] {
  return [
    ...profile.instructions,
    `Calibration checkpoint: before creating findings, confirm that the effective profile, overlay status, and included repository shape match this repository.`,
    `Use the repository-index-derived coverage already attached to this run from ${run.repository.root} at revision ${run.repository.revision}.`,
    overlay.applied
      ? `Applied repository scan profile overlay from ${overlay.overlayPath}.`
      : `No repository scan profile overlay was found at ${overlay.overlayPath}; built-in profile defaults remain active.`,
    `Overlay guidance is available through ${overlay.guidanceTool}.`,
    `Review only coverage.included sources for normal scan execution; do not rediscover or expand inventory from a live repository.`,
    `When available for a profile criterion, retrieve repository evidence candidates first so agent review stays bounded to curated evidence packets instead of raw repository discovery.`,
    `Use scan_record_coverage only when you need one explicit full correction to the derived discovered/included/excluded/failed inventory.`,
    `Coverage summary: discovered ${coverageSummary.discoveredCount}, included ${coverageSummary.includedCount}, excluded ${coverageSummary.excludedCount}, failed ${coverageSummary.failedCount}.`,
    `Coverage was derived from include patterns: ${profile.scope.include.join(", ")}.`,
    `Coverage excludes sources matching: ${profile.scope.exclude.join(", ")}.`,
    ...coverageSummary.warnings.map((warning: string) => `Coverage warning: ${warning}`),
    `Record one explicit calibration decision before advancing the run: continue, refine-overlay, correct-coverage, build-boundary-map, or restart-scan.`,
    `Apply every criterion: ${profile.criteria.map((criterion) => criterion.id).join(", ")}.`,
    `Declare outputs: ${profile.requiredOutputs.join(", ")}.`,
  ];
}

function createScanCalibrationChecklist(
  profile: ReturnType<typeof findScanProfile>,
  overlay: ScanProfileOverlayResolution,
  coverageSummary: ScanCoverageSummary,
): string[] {
  return [
    `Confirm profile identity: ${profile.id}@${profile.version}.`,
    overlay.applied
      ? `Confirm the repository-local overlay at ${overlay.overlayPath} is intended for this repository shape.`
      : `Confirm that built-in defaults are acceptable because no repository-local overlay exists at ${overlay.overlayPath}.`,
    `Confirm included inventory shape before findings: ${coverageSummary.includedCount} included out of ${coverageSummary.discoveredCount} discovered sources.`,
    `Record one explicit calibration decision before coverage correction, boundary mapping, or findings.`,
    `If code/test/tool boundaries are unclear, build a boundary map before creating findings.`,
    `If calibration is wrong, refine the repository-local overlay or record one explicit coverage correction and restart the scan instead of forcing findings.`,
  ];
}

function createCalibrationDecisionGuidance(assessment: ScanCalibrationAssessment): ScanCalibrationDecisionGuidance {
  switch (assessment.classification) {
    case "findings-ready":
      return {
        decisionRequired: true,
        availableDecisions: [...SCAN_CALIBRATION_DECISION_VALUES],
        recommendedDecisions: ["continue"],
      };
    case "profile-gap":
      return {
        decisionRequired: true,
        availableDecisions: [...SCAN_CALIBRATION_DECISION_VALUES],
        recommendedDecisions: ["refine-overlay", "correct-coverage", "restart-scan"],
      };
    case "missing-evidence":
      return {
        decisionRequired: true,
        availableDecisions: [...SCAN_CALIBRATION_DECISION_VALUES],
        recommendedDecisions: ["continue", "build-boundary-map", "restart-scan"],
      };
    case "ambiguous-shape":
      return {
        decisionRequired: true,
        availableDecisions: [...SCAN_CALIBRATION_DECISION_VALUES],
        recommendedDecisions: ["build-boundary-map", "refine-overlay", "restart-scan"],
      };
  }
}

const MISSING_CONTRACT_DOC_QUESTION = "No contract-local documentation matched this boundary under current scan coverage.";
const MISSING_TEST_QUESTION = "No verifying test source was linked to this boundary under current scan coverage.";
const MISSING_ENTRYPOINT_QUESTION = "No public entrypoint was detected from exported or public top-level symbols.";

function createStartScanCalibrationAssessment(
  profile: ReturnType<typeof findScanProfile>,
  overlay: ScanProfileOverlayResolution,
  coverageSummary: ScanCoverageSummary,
): ScanCalibrationAssessment {
  if (coverageSummary.warnings.length > 0) {
    return {
      classification: "profile-gap",
      confidence: "high",
      summary: "The provisional scan shape looks wrong for this repository and should be recalibrated before findings.",
      reasons: [...coverageSummary.warnings],
      recommendedActions: [
        `Review the active overlay at ${overlay.overlayPath} and refine repository-specific scope or boundary settings.`,
        "If the profile is conceptually correct but inventory is still wrong, record one explicit coverage correction and restart the scan.",
      ],
    };
  }

  const codeOrTestScan =
    profile.sourceTypes.includes("code") || profile.sourceTypes.includes("test") || coverageSummary.includedCodeFileCount > 0;
  if (codeOrTestScan) {
    return {
      classification: "ambiguous-shape",
      confidence: "medium",
      summary: "Coverage is provisionally coherent, but repository structure still needs boundary calibration before findings.",
      reasons: [
        "No coverage warning indicates an immediate profile mismatch, but code/test/tool ownership has not yet been checked through a boundary artifact.",
      ],
      recommendedActions: [
        "Call scan_boundary_map_build before creating findings for code, test, or tool concerns.",
        "Use repository_evidence_candidates for representative criteria after the structural pass.",
      ],
    };
  }

  return {
    classification: "findings-ready",
    confidence: "medium",
    summary: "The provisional scan shape looks coherent enough to continue with bounded evidence review.",
    reasons: ["No coverage warning indicates an obvious profile mismatch at scan start."],
    recommendedActions: [
      "Use repository_evidence_candidates where available before creating findings.",
      "Create findings only for issues supported by bounded evidence from the calibrated run.",
    ],
  };
}

function createEvidenceCandidatesCalibrationAssessment(
  criterionId: string,
  coverageSummary: ScanCoverageSummary,
  overlay: ScanProfileOverlayResolution,
  candidates: readonly RepositoryEvidenceCandidate[],
): ScanCalibrationAssessment {
  if (coverageSummary.warnings.length > 0) {
    return {
      classification: "profile-gap",
      confidence: "high",
      summary: "Evidence candidate review is premature because the active scan shape still looks wrong for this repository.",
      reasons: [...coverageSummary.warnings],
      recommendedActions: [
        `Review the active overlay at ${overlay.overlayPath} before trusting missing or noisy evidence for criterion ${criterionId}.`,
        "Restart the scan after profile or coverage correction instead of turning calibration defects into findings.",
      ],
    };
  }

  if (candidates.length === 0) {
    return {
      classification: "missing-evidence",
      confidence: "medium",
      summary: `No bounded evidence candidates were prepared for criterion ${criterionId} under the current calibrated scope.`,
      reasons: [
        `Criterion ${criterionId} currently has no prepared evidence packets.`,
        "This may mean the repository has no matching evidence yet, or that the agent still needs direct bounded review.",
      ],
      recommendedActions: [
        "Review the bounded coverage directly for this criterion before creating a finding.",
        "If the suspected issue depends on unclear structure, build a boundary map before deciding whether the gap is real.",
      ],
    };
  }

  return {
    classification: "findings-ready",
    confidence: "medium",
    summary: `Bounded evidence candidates exist for criterion ${criterionId}; review can continue without rediscovering repository shape.`,
    reasons: [`Prepared evidence packets are available for criterion ${criterionId}.`],
    recommendedActions: [
      "Review the returned packets first and create findings only from claims they actually support.",
      "If the packets expose a structural gap, use boundary-map output to distinguish repository defects from process defects.",
    ],
  };
}

function createBoundaryMapCalibrationAssessment(
  coverageSummary: ScanCoverageSummary,
  boundaryMap: BuildScanBoundaryMapResponse["boundaryMap"],
): ScanCalibrationAssessment {
  if (coverageSummary.warnings.length > 0) {
    return {
      classification: "profile-gap",
      confidence: "high",
      summary: "Boundary output was built from a scan shape that still looks miscalibrated.",
      reasons: [...coverageSummary.warnings],
      recommendedActions: [
        "Refine the repository-local overlay or record one explicit coverage correction before trusting structural findings.",
        "Restart the scan from the same repository index after calibration changes.",
      ],
    };
  }

  const boundariesMissingEntrypoints = boundaryMap.boundaries.filter((boundary) =>
    boundary.openQuestions?.includes(MISSING_ENTRYPOINT_QUESTION),
  );
  if (boundariesMissingEntrypoints.length > 0) {
    return {
      classification: "ambiguous-shape",
      confidence: "high",
      summary: "Boundary structure is still ambiguous enough that findings would risk mixing repository defects with scan interpretation gaps.",
      reasons: boundariesMissingEntrypoints.map(
        (boundary) => `${boundary.id} still lacks a clear public entrypoint under the current calibrated scope.`,
      ),
      recommendedActions: [
        "Review whether the active profile or overlay is missing repository-specific entrypoint rules or roots.",
        "If the repository shape is genuinely unusual, keep the result as an open question and avoid premature findings.",
      ],
    };
  }

  const evidenceGapBoundaries = boundaryMap.boundaries.filter((boundary) =>
    (boundary.openQuestions ?? []).some((question) => question === MISSING_CONTRACT_DOC_QUESTION || question === MISSING_TEST_QUESTION),
  );
  if (evidenceGapBoundaries.length > 0) {
    return {
      classification: "findings-ready",
      confidence: "high",
      summary: "Boundary shape is coherent; the remaining gaps now look like likely repository findings or evidence deficits rather than profile defects.",
      reasons: dedupeStrings(
        evidenceGapBoundaries.flatMap((boundary) =>
          (boundary.openQuestions ?? [])
            .filter((question) => question === MISSING_CONTRACT_DOC_QUESTION || question === MISSING_TEST_QUESTION)
            .map((question) => `${boundary.id}: ${question}`),
        ),
      ),
      recommendedActions: [
        "Review the affected boundaries against criteria such as missing-tests or undocumented-api before filing findings.",
        "Use repository_evidence_candidates and the boundary artifact together so evidence gaps stay bounded and explicit.",
      ],
    };
  }

  return {
    classification: "findings-ready",
    confidence: "high",
    summary: "Boundary shape looks coherent enough that remaining review work can focus on repository findings rather than scan calibration.",
    reasons: ["Boundary map produced stable boundaries, entrypoints, and relations without structural open questions."],
    recommendedActions: [
      "Use the boundary artifact as the working repository map for the rest of the scan.",
      "Create findings only for problems supported by bounded code, test, or contract evidence.",
    ],
  };
}

function mapCalibrationAssessmentToFindingValidation(
  assessment: ScanCalibrationAssessment,
): ScanFindingValidationAssessment {
  return {
    classification:
      assessment.classification === "findings-ready"
        ? "likely-real-finding"
        : assessment.classification,
    confidence: assessment.confidence,
    summary: assessment.summary,
    reasons: [...assessment.reasons],
    recommendedActions: [...assessment.recommendedActions],
  };
}

function dedupeStrings(values: readonly string[]): string[] {
  return [...new Set(values)];
}
