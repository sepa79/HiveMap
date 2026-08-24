import { createHash } from "node:crypto";
import { posix as pathPosix } from "node:path";
import {
  validateBackfillConceptEmbeddingsRequest,
  validateExecuteRepositoryIndexRequest,
  validateBuildScanBoundaryMapRequest,
  validateGetScanProfileOverlayHelpRequest,
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
  validateRefreshConceptEmbeddingRequest,
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
  type BackfillConceptEmbeddingsRequest,
  type BackfillConceptEmbeddingsResponse,
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
  type ScanCoverageSummary,
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
  type RecordScanCoverageRequest,
  type RecordScanCoverageResponse,
  type RefreshConceptEmbeddingRequest,
  type RefreshConceptEmbeddingResponse,
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
  SCAN_PROFILE_OVERLAY_FORMAT_VERSION,
  toFindingEvidence,
  updateFindingNode,
  validateScanRun,
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

import { EmbeddingProviderError, type EmbeddingProviderRegistry } from "./embeddings.js";
import { buildBoundaryMapArtifact } from "./repository-boundary-map.js";
import { RepositoryIndexExecutionError, executeSafeRepositoryIndex, type RepositoryIndexExecutor } from "./repository-indexing.js";

export * from "./embeddings.js";
export { RepositoryIndexExecutionError, executeSafeRepositoryIndex, type RepositoryIndexExecutor } from "./repository-indexing.js";

export type HiveMapRuntimeOptions = {
  store: HiveMapStore;
  embeddingProviders?: EmbeddingProviderRegistry;
  repositoryIndexExecutor?: RepositoryIndexExecutor;
  now?: () => string;
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
  private readonly store: HiveMapStore;
  private readonly embeddingProviders: EmbeddingProviderRegistry;
  private readonly repositoryIndexExecutor: RepositoryIndexExecutor;
  private readonly now: () => string;

  constructor(options: HiveMapRuntimeOptions) {
    this.store = options.store;
    this.embeddingProviders = options.embeddingProviders ?? {};
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

    return {
      indexId: request.indexId,
      profileId: request.profileId,
      profileVersion: request.profileVersion,
      criterionId: request.criterionId,
      baseProfile: profileContext.baseProfile,
      effectiveProfile: profileContext.effectiveProfile,
      overlay: profileContext.overlay,
      coverageSummary: profileContext.coverageSummary,
      candidates: createRepositoryEvidenceCandidates({
        profile: profileContext.effectiveProfile,
        criterionId: request.criterionId,
        files,
        chunks,
        symbols,
        dependencies,
        limit: request.limit ?? 20,
      }),
    };
  }

  async buildScanBoundaryMap(request: BuildScanBoundaryMapRequest): Promise<BuildScanBoundaryMapResponse> {
    validateBuildScanBoundaryMapRequest(request);
    const state = await this.store.loadWorkspaceState(request.workspaceId);
    const run = findById(state.scanRuns, request.scanId, "Scan");
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
      return {
        scanId: run.id,
        profileId: run.profileId,
        profileVersion: run.profileVersion,
        repositoryIndexId,
        coverageSummary: summarizeRecordedCoverage(run.coverage, files, symbols),
        boundaryMap: buildBoundaryMapArtifact({
          coverage: run.coverage,
          files,
          symbols,
          dependencies,
          revision: repositoryIndex.resolvedCommit,
          config: boundaryMapConfig,
        }),
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

  async refreshConceptEmbedding(request: RefreshConceptEmbeddingRequest): Promise<RefreshConceptEmbeddingResponse> {
    validateRefreshConceptEmbeddingRequest(request);
    const state = await this.store.loadWorkspaceState(request.workspaceId);
    const node = findNodeById(state.graph, request.nodeId);
    if (node.type !== "concept") {
      throw new RuntimeError(`Embeddings currently support concept nodes only: ${request.nodeId}`, {
        code: "UNSUPPORTED_EMBEDDING_NODE_TYPE",
      });
    }

    const modelRef = resolveEmbeddingModelRef(this.embeddingProviders, request.model);
    const source = createConceptEmbeddingSource(node);
    const existing = await this.store.getConceptEmbedding(request.workspaceId, request.nodeId, request.model);
    if (request.force !== true && existing !== undefined && existing.contentDigest === source.contentDigest) {
      return {
        embedding: {
          workspaceId: existing.workspaceId,
          nodeId: existing.nodeId,
          model: existing.model,
          dimensions: existing.embedding.length,
          contentDigest: existing.contentDigest,
          updatedAt: existing.updatedAt,
        },
        provider: modelRef.provider.id,
        status: "unchanged",
      };
    }

    const [embedding] = await embedWithProvider(modelRef.provider.id, request.model, () =>
      modelRef.provider.embed({
        model: modelRef.providerModel,
        inputs: [source.contentText],
      }),
    );
    if (embedding === undefined) {
      throw new RuntimeError(`Embedding provider returned no vector for node ${request.nodeId}`, {
        code: "EMBEDDING_PROVIDER_EMPTY_RESULT",
      });
    }
    const updatedAt = this.now();
    await this.store.upsertConceptEmbedding({
      workspaceId: request.workspaceId,
      nodeId: request.nodeId,
      model: request.model,
      contentDigest: source.contentDigest,
      embedding,
      createdAt: existing?.createdAt ?? updatedAt,
      updatedAt,
    });

    return {
      embedding: {
        workspaceId: request.workspaceId,
        nodeId: request.nodeId,
        model: request.model,
        dimensions: embedding.length,
        contentDigest: source.contentDigest,
        updatedAt,
      },
      provider: modelRef.provider.id,
      status: "refreshed",
    };
  }

  async backfillConceptEmbeddings(request: BackfillConceptEmbeddingsRequest): Promise<BackfillConceptEmbeddingsResponse> {
    validateBackfillConceptEmbeddingsRequest(request);
    const state = await this.store.loadWorkspaceState(request.workspaceId);
    const modelRef = resolveEmbeddingModelRef(this.embeddingProviders, request.model);
    const concepts = state.graph.nodes.filter(isConceptNode);
    const conceptById = new Map(concepts.map((node) => [node.id, node] as const));
    const selectedNodes = selectConceptNodes(concepts, conceptById, request.nodeIds, request.limit);
    const existingEmbeddings = new Map(
      await Promise.all(
        selectedNodes.map(async (node) => [
          node.id,
          await this.store.getConceptEmbedding(request.workspaceId, node.id, request.model),
        ] as const),
      ),
    );

    const unchangedResults: BackfillConceptEmbeddingsResponse["results"] = [];
    const refreshQueue: Array<{ node: (typeof selectedNodes)[number]; source: ReturnType<typeof createConceptEmbeddingSource> }> = [];
    for (const node of selectedNodes) {
      const source = createConceptEmbeddingSource(node);
      const existing = existingEmbeddings.get(node.id);
      if (request.force !== true && existing !== undefined && existing.contentDigest === source.contentDigest) {
        unchangedResults.push({
          nodeId: node.id,
          label: node.label,
          status: "unchanged",
          dimensions: existing.embedding.length,
          contentDigest: existing.contentDigest,
          updatedAt: existing.updatedAt,
        });
        continue;
      }

      refreshQueue.push({ node, source });
    }

    const refreshedResults: BackfillConceptEmbeddingsResponse["results"] = [];
    for (const batch of chunkEmbeddingInputs(refreshQueue, modelRef.provider.maxBatchSize)) {
      const embeddings = await embedWithProvider(modelRef.provider.id, request.model, () =>
        modelRef.provider.embed({
          model: modelRef.providerModel,
          inputs: batch.map((item) => item.source.contentText),
        }),
      );
      const updatedAt = this.now();

      for (const [index, item] of batch.entries()) {
        const embedding = embeddings[index];
        if (embedding === undefined) {
          throw new RuntimeError(`Embedding provider returned no vector for concept node ${item.node.id}`, {
            code: "EMBEDDING_PROVIDER_EMPTY_RESULT",
          });
        }
        const existing = existingEmbeddings.get(item.node.id);
        await this.store.upsertConceptEmbedding({
          workspaceId: request.workspaceId,
          nodeId: item.node.id,
          model: request.model,
          contentDigest: item.source.contentDigest,
          embedding,
          createdAt: existing?.createdAt ?? updatedAt,
          updatedAt,
        });
        refreshedResults.push({
          nodeId: item.node.id,
          label: item.node.label,
          status: "refreshed",
          dimensions: embedding.length,
          contentDigest: item.source.contentDigest,
          updatedAt,
        });
      }
    }

    const resultByNodeId = new Map<string, BackfillConceptEmbeddingsResponse["results"][number]>();
    for (const item of refreshedResults) {
      resultByNodeId.set(item.nodeId, item);
    }
    for (const item of unchangedResults) {
      resultByNodeId.set(item.nodeId, item);
    }

    const results = selectedNodes.map((node) => {
      const result = resultByNodeId.get(node.id);
      if (result === undefined) {
        throw new RuntimeError(`Backfill result missing for concept node ${node.id}`, {
          code: "EMBEDDING_BACKFILL_RESULT_MISSING",
        });
      }
      return result;
    });

    return {
      workspaceId: request.workspaceId,
      model: request.model,
      provider: modelRef.provider.id,
      summary: {
        totalConcepts: concepts.length,
        selectedConcepts: selectedNodes.length,
        refreshed: refreshedResults.length,
        unchanged: unchangedResults.length,
      },
      results,
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
    };
    validateScanRun(run, state.scanProfiles, state.graph);
    await this.store.saveWorkspaceState({ ...state, scanRuns: [...state.scanRuns, run] });
    return {
      run,
      profile: profileContext.effectiveProfile,
      baseProfile: profileContext.baseProfile,
      overlay: profileContext.overlay,
      coverageSummary: profileContext.coverageSummary,
      instructions: createScanInstructions(profileContext.effectiveProfile, run, profileContext.overlay, profileContext.coverageSummary),
    };
  }

  async recordScanCoverage(request: RecordScanCoverageRequest): Promise<RecordScanCoverageResponse> {
    validateRecordScanCoverageRequest(request);
    const state = await this.store.loadWorkspaceState(request.workspaceId);
    const run = findInProgressScan(state, request.scanId);
    const updated: InProgressScanRun = { ...run, coverage: request.coverage };
    validateScanRun(updated, state.scanProfiles, state.graph);
    await this.store.saveWorkspaceState({ ...state, scanRuns: replaceById(state.scanRuns, updated) });
    return { run: updated };
  }

  async createScanFinding(request: CreateScanFindingRequest): Promise<CreateScanFindingResponse> {
    validateCreateScanFindingRequest(request);
    const state = await this.store.loadWorkspaceState(request.workspaceId);
    if (state.capturePolicy.mode !== "delegated") {
      throw new RuntimeError(`scan_finding_create requires delegated capture; current mode is ${state.capturePolicy.mode}`);
    }
    const run = findInProgressScan(state, request.scanId);
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

type ScanProfileContext = {
  baseProfile: ScanProfile;
  effectiveProfile: ScanProfile;
  overlay: ScanProfileOverlayResolution;
  coverageSummary: ScanCoverageSummary;
};

function resolveScanProfileContext(
  baseProfile: ScanProfile,
  files: readonly RepositoryFileRecord[],
  chunks: readonly RepositoryChunkRecord[],
  symbols: readonly RepositorySymbolRecord[],
): ScanProfileContext {
  const overlayPath = normalizeRepositoryPath(getScanProfileOverlayPath(baseProfile));
  const overlayFile = files.find((file) => normalizeRepositoryPath(file.path) === overlayPath);
  if (overlayFile === undefined) {
    const overlay = createMissingScanProfileOverlayResolution(baseProfile, overlayPath);
    return {
      baseProfile,
      effectiveProfile: baseProfile,
      overlay,
      coverageSummary: createScanCoverageSummary(baseProfile, files, symbols, overlay),
    };
  }

  const overlay = readScanProfileOverlayFromRepository(baseProfile, overlayPath, chunks);
  let effectiveProfile: ScanProfile;
  try {
    effectiveProfile = applyScanProfileOverlay(baseProfile, overlay);
  } catch (error) {
    throw createScanProfileOverlayInvalidError(baseProfile, overlayPath, error);
  }
  const overlayResolution: ScanProfileOverlayResolution = {
    status: "found",
    source: "repo",
    applied: true,
    overlayPath,
    guidanceTool: "scan_profile_overlay_help",
    nextActionHint: `Repository overlay from ${overlayPath} is active. Call scan_profile_overlay_help for the merge contract and supported fields.`,
    mergedIncludeCount: overlay.include?.length ?? 0,
    mergedExcludeCount:
      (overlay.exclude?.length ?? 0) +
      (overlay.archivePatterns?.length ?? 0) +
      (overlay.legacyPatterns?.length ?? 0) +
      (overlay.generatedPatterns?.length ?? 0),
  };

  return {
    baseProfile,
    effectiveProfile,
    overlay: overlayResolution,
    coverageSummary: createScanCoverageSummary(effectiveProfile, files, symbols, overlayResolution),
  };
}

function deriveScanCoverage(profile: ScanProfile, files: readonly RepositoryFileRecord[]): ScanCoverage {
  const discovered = files.map((file) => normalizeRepositoryPath(file.path)).sort();
  const included: string[] = [];
  const excluded: ScanCoverage["excluded"] = [];

  for (const target of discovered) {
    if (!matchesAnyGlob(target, profile.scope.include)) {
      excluded.push({ target, reason: "excluded by profile include rules" });
      continue;
    }
    if (matchesAnyGlob(target, profile.scope.exclude)) {
      excluded.push({ target, reason: "excluded by profile exclude rules" });
      continue;
    }
    included.push(target);
  }

  return {
    discovered,
    included,
    excluded: excluded.sort((left, right) => left.target.localeCompare(right.target)),
    failed: [],
  };
}

function createMissingScanProfileOverlayResolution(profile: ScanProfile, overlayPath: string): ScanProfileOverlayResolution {
  return {
    status: "missing",
    source: "defaults",
    applied: false,
    overlayPath,
    guidanceTool: "scan_profile_overlay_help",
    nextActionHint: `No repository overlay was found at ${overlayPath}. Defaults remain active; call scan_profile_overlay_help for the template and merge rules.`,
    mergedIncludeCount: 0,
    mergedExcludeCount: 0,
  };
}

function readScanProfileOverlayFromRepository(
  profile: ScanProfile,
  overlayPath: string,
  chunks: readonly RepositoryChunkRecord[],
): ScanProfileOverlay {
  try {
    return parseScanProfileOverlayYaml(
      readRepositoryIndexedFileText(overlayPath, chunks),
      overlayPath,
    );
  } catch (error) {
    throw createScanProfileOverlayInvalidError(profile, overlayPath, error);
  }
}

function resolveBoundaryMapBuildConfig(
  profile: ScanProfile,
  files: readonly RepositoryFileRecord[],
  chunks: readonly RepositoryChunkRecord[],
) {
  const overlayPath = normalizeRepositoryPath(getScanProfileOverlayPath(profile));
  const overlayFile = files.find((file) => normalizeRepositoryPath(file.path) === overlayPath);
  if (overlayFile === undefined) {
    return createBoundaryMapBuildConfig();
  }
  const overlay = readScanProfileOverlayFromRepository(profile, overlayPath, chunks);
  return createBoundaryMapBuildConfig(overlay);
}

function createScanCoverageSummary(
  profile: ScanProfile,
  files: readonly RepositoryFileRecord[],
  symbols: readonly RepositorySymbolRecord[],
  overlay: ScanProfileOverlayResolution,
): ScanCoverageSummary {
  const coverage = deriveScanCoverage(profile, files);
  const discoveredPaths = new Set(coverage.discovered);
  const includedPaths = new Set(coverage.included);
  const codePaths = new Set(
    files
      .filter((file) => file.sourceKind === "code")
      .map((file) => normalizeRepositoryPath(file.path))
      .filter((path) => discoveredPaths.has(path)),
  );
  const topLevelCodeSymbols = symbols.filter(
    (symbol) => symbol.parentSymbolKey === undefined && codePaths.has(normalizeRepositoryPath(symbol.filePath)),
  );
  const includedTopLevelCodeSymbols = topLevelCodeSymbols.filter((symbol) => includedPaths.has(normalizeRepositoryPath(symbol.filePath)));

  const summary: ScanCoverageSummary = {
    discoveredCount: coverage.discovered.length,
    includedCount: coverage.included.length,
    excludedCount: coverage.excluded.length,
    failedCount: coverage.failed.length,
    discoveredCodeFileCount: codePaths.size,
    includedCodeFileCount: [...codePaths].filter((path) => includedPaths.has(path)).length,
    discoveredTopLevelCodeSymbolCount: topLevelCodeSymbols.length,
    includedTopLevelCodeSymbolCount: includedTopLevelCodeSymbols.length,
    warnings: [],
  };
  summary.warnings = createScanCoverageWarnings(profile, summary, overlay);
  return summary;
}

function summarizeRecordedCoverage(
  coverage: ScanCoverage,
  files: readonly RepositoryFileRecord[],
  symbols: readonly RepositorySymbolRecord[],
): ScanCoverageSummary {
  const discoveredPaths = new Set(coverage.discovered.map(normalizeRepositoryPath));
  const includedPaths = new Set(coverage.included.map(normalizeRepositoryPath));
  const codePaths = new Set(
    files
      .filter((file) => file.sourceKind === "code")
      .map((file) => normalizeRepositoryPath(file.path))
      .filter((path) => discoveredPaths.has(path)),
  );
  const topLevelCodeSymbols = symbols.filter(
    (symbol) => symbol.parentSymbolKey === undefined && codePaths.has(normalizeRepositoryPath(symbol.filePath)),
  );
  const includedTopLevelCodeSymbols = topLevelCodeSymbols.filter((symbol) => includedPaths.has(normalizeRepositoryPath(symbol.filePath)));

  return {
    discoveredCount: coverage.discovered.length,
    includedCount: coverage.included.length,
    excludedCount: coverage.excluded.length,
    failedCount: coverage.failed.length,
    discoveredCodeFileCount: codePaths.size,
    includedCodeFileCount: [...codePaths].filter((path) => includedPaths.has(path)).length,
    discoveredTopLevelCodeSymbolCount: topLevelCodeSymbols.length,
    includedTopLevelCodeSymbolCount: includedTopLevelCodeSymbols.length,
    warnings: [],
  };
}

function createScanCoverageWarnings(
  profile: ScanProfile,
  summary: ScanCoverageSummary,
  overlay: ScanProfileOverlayResolution,
): string[] {
  if (profile.id !== "code-quality-review" || summary.discoveredCodeFileCount === 0) {
    return [];
  }

  const warnings: string[] = [];
  const includedCodeFileRatio = summary.includedCodeFileCount / summary.discoveredCodeFileCount;
  const includedTopLevelSymbolRatio =
    summary.discoveredTopLevelCodeSymbolCount === 0
      ? 1
      : summary.includedTopLevelCodeSymbolCount / summary.discoveredTopLevelCodeSymbolCount;

  if (summary.includedCodeFileCount === 0) {
    warnings.push(
      `Profile coverage includes no code files in this repository index. Add ${overlay.overlayPath} or call ${overlay.guidanceTool} to customize repository-specific code roots.`,
    );
    return warnings;
  }

  if (includedCodeFileRatio < 0.2 || includedTopLevelSymbolRatio < 0.2) {
    warnings.push(
      `Profile coverage only includes ${summary.includedCodeFileCount}/${summary.discoveredCodeFileCount} code files and ${summary.includedTopLevelCodeSymbolCount}/${summary.discoveredTopLevelCodeSymbolCount} top-level code symbols. Add ${overlay.overlayPath} or call ${overlay.guidanceTool} if this repository uses non-default code roots.`,
    );
  }

  return warnings;
}

function createScanProfileOverlayHelp(profile: ScanProfile): GetScanProfileOverlayHelpResponse {
  const overlayPath = getScanProfileOverlayPath(profile);
  const templateLines = [
    `formatVersion: ${SCAN_PROFILE_OVERLAY_FORMAT_VERSION}`,
    `profileId: ${profile.id}`,
    "name: Repository code review",
    "description: Repository-specific code review profile for the current layout.",
    "instructions:",
    "  - Review service boundaries before local symptoms.",
    "include:",
    "  - services/**",
    "exclude:",
    "  - vendor/**",
    "archivePatterns:",
    "  - archive/**",
    "legacyPatterns:",
    "  - legacy/**",
    "generatedPatterns:",
    "  - generated/**",
    "sourceTypes:",
    "  - code",
    "  - test",
    "criteria:",
    "  - contract-drift: Implementation behavior differs from the owning contract.",
    "ssotOrder:",
    "  - AGENTS.md",
    "  - docs/specs/**",
    "requiredOutputs:",
    "  - findings",
    "boundaryMapRoots:",
    "  - packages:package",
    "  - services:service",
    "boundaryMapContractPathMarkers:",
    "  - /specs/",
    "boundaryMapContractFileStems:",
    "  - contract",
    "  - api",
    "boundaryMapIgnoredTokens:",
    "  - docs",
    "  - tests",
    "boundaryMapTestDirectoryNames:",
    "  - tests",
    "  - qa",
    "boundaryMapRoutePathMarkers:",
    "  - /routes/",
    "boundaryMapRouteNameSuffixes:",
    "  - route",
    "boundaryMapApiPathMarkers:",
    "  - /api/",
    "boundaryMapApiNameSuffixes:",
    "  - handler",
  ];
  const exampleLines =
    profile.id === "code-quality-review"
      ? [
          `formatVersion: ${SCAN_PROFILE_OVERLAY_FORMAT_VERSION}`,
          "profileId: code-quality-review",
          "name: Services code quality review",
          "description: Review service-oriented runtime and storage code in this repository.",
          "instructions:",
          "  - Review service boundaries before component-level findings.",
          "  - Treat runtime contracts in docs/specs as the primary authority for this repository.",
          "include:",
          "  - services/**",
          "  - modules/**",
          "exclude:",
          "  - temp/**",
          "archivePatterns:",
          "  - archived/**",
          "legacyPatterns:",
          "  - legacy-ui/**",
          "generatedPatterns:",
          "  - '**/*.generated.ts'",
          "sourceTypes:",
          "  - specification",
          "  - code",
          "  - test",
          "criteria:",
          "  - duplicate-responsibility: Multiple services own the same runtime policy behavior.",
          "  - undocumented-api: A public service behavior lacks an owning contract.",
          "ssotOrder:",
          "  - AGENTS.md",
          "  - docs/specs/**",
          "  - services/**",
          "requiredOutputs:",
          "  - document-inventory",
          "  - findings",
          "  - boundary-map",
          "boundaryMapRoots:",
          "  - services:service",
          "  - shared:library",
          "boundaryMapContractPathMarkers:",
          "  - /contracts/",
          "  - /specs/",
          "boundaryMapContractFileStems:",
          "  - runtime-policy",
          "  - api",
          "boundaryMapIgnoredTokens:",
          "  - docs",
          "  - tests",
          "boundaryMapTestDirectoryNames:",
          "  - tests",
          "  - qa",
          "boundaryMapRoutePathMarkers:",
          "  - /routes/",
          "boundaryMapRouteNameSuffixes:",
          "  - router",
          "boundaryMapApiPathMarkers:",
          "  - /rpc/",
          "boundaryMapApiNameSuffixes:",
          "  - policy",
        ]
      : [
          `formatVersion: ${SCAN_PROFILE_OVERLAY_FORMAT_VERSION}`,
          `profileId: ${profile.id}`,
          "instructions:",
          "  - Review archived docs only when they still claim current authority.",
          "exclude:",
          "  - docs/archive/**",
          "archivePatterns:",
          "  - historical/**",
          "ssotOrder:",
          "  - AGENTS.md",
          "  - docs/specs/**",
          "boundaryMapRoots:",
          "  - src:module",
          "boundaryMapTestDirectoryNames:",
          "  - tests",
        ];

  return {
    profileId: profile.id,
    profileVersion: profile.version,
    overlayPath,
    format: "yaml",
    formatVersion: SCAN_PROFILE_OVERLAY_FORMAT_VERSION,
    summary: `Optional repository-local overlay for ${profile.id}@${profile.version}. Use it when the default scan profile definition does not match the repository layout, authority order, or review recipe.`,
    defaultsBehavior: `If ${overlayPath} is missing, HiveMap uses the built-in ${profile.id}@${profile.version} scope without fallback side effects.`,
    validationBehavior: `If ${overlayPath} exists but is invalid, scan_start and repository_evidence_candidates fail with SCAN_PROFILE_OVERLAY_INVALID. HiveMap does not silently ignore a bad overlay.`,
    guidanceTool: "scan_profile_overlay_help",
    mergeRules: [
      "name and description replace the built-in profile presentation fields for this repository.",
      "instructions replaces the built-in ordered scan instructions for this repository.",
      "include appends repository-specific include globs to the built-in profile include list.",
      "exclude appends repository-specific exclude globs to the built-in profile exclude list.",
      "archivePatterns, legacyPatterns, and generatedPatterns append to the effective exclude list.",
      "sourceTypes replaces the built-in source type list.",
      "criteria replaces the built-in criterion list; use '- criterion-id: description' entries.",
      "ssotOrder replaces the built-in SSOT precedence order.",
      "requiredOutputs replaces the built-in required output list.",
      "boundaryMapRoots replaces the built-in root-to-boundary-kind rules for scan_boundary_map_build.",
      "boundaryMapContractPathMarkers replaces the built-in contract path markers for boundary-map documentation linking.",
      "boundaryMapContractFileStems replaces the built-in documentation filename stems treated as contract-like for boundary mapping.",
      "boundaryMapIgnoredTokens replaces the built-in generic token ignore list used when matching docs to boundaries.",
      "boundaryMapTestDirectoryNames replaces the built-in test-directory names used when deriving test-suite boundary roots.",
      "boundaryMapRoutePathMarkers and boundaryMapRouteNameSuffixes replace the built-in route entrypoint detection heuristics.",
      "boundaryMapApiPathMarkers and boundaryMapApiNameSuffixes replace the built-in API entrypoint detection heuristics.",
      "profileId must exactly match the target scan profile id.",
      `formatVersion must equal ${SCAN_PROFILE_OVERLAY_FORMAT_VERSION}.`,
    ],
    supportedFields: [
      { name: "formatVersion", required: true, description: "Exact overlay schema version for fail-fast validation." },
      { name: "profileId", required: true, description: "Exact target scan profile id, for example code-quality-review." },
      { name: "name", required: false, description: "Replacement repository-specific profile name." },
      { name: "description", required: false, description: "Replacement repository-specific profile description." },
      { name: "instructions", required: false, description: "Replacement ordered scan instructions for this repository." },
      { name: "include", required: false, description: "Additional repository-specific include globs to append to the base profile." },
      { name: "exclude", required: false, description: "Additional repository-specific exclude globs to append to the base profile." },
      { name: "archivePatterns", required: false, description: "Archive-only globs appended to the effective exclude list." },
      { name: "legacyPatterns", required: false, description: "Legacy-only globs appended to the effective exclude list." },
      { name: "generatedPatterns", required: false, description: "Generated-code globs appended to the effective exclude list." },
      { name: "sourceTypes", required: false, description: "Replacement source type list for this repository." },
      { name: "criteria", required: false, description: "Replacement criterion list using '- criterion-id: description' entries." },
      { name: "ssotOrder", required: false, description: "Replacement SSOT precedence order for this repository." },
      { name: "requiredOutputs", required: false, description: "Replacement required output list for this repository." },
      { name: "boundaryMapRoots", required: false, description: "Replacement root rules for boundary-map build in path-prefix:boundary-kind format." },
      { name: "boundaryMapContractPathMarkers", required: false, description: "Replacement path markers treated as contract-like documentation for boundary mapping." },
      { name: "boundaryMapContractFileStems", required: false, description: "Replacement filename stems treated as contract-like documentation for boundary mapping." },
      { name: "boundaryMapIgnoredTokens", required: false, description: "Replacement generic token ignore list used when matching docs to boundaries." },
      { name: "boundaryMapTestDirectoryNames", required: false, description: "Replacement directory-name markers treated as test-suite roots during boundary mapping." },
      { name: "boundaryMapRoutePathMarkers", required: false, description: "Replacement path markers used to classify route entrypoints during boundary mapping." },
      { name: "boundaryMapRouteNameSuffixes", required: false, description: "Replacement symbol-name suffixes used to classify route entrypoints during boundary mapping." },
      { name: "boundaryMapApiPathMarkers", required: false, description: "Replacement path markers used to classify API entrypoints during boundary mapping." },
      { name: "boundaryMapApiNameSuffixes", required: false, description: "Replacement symbol-name suffixes used to classify API entrypoints during boundary mapping." },
    ],
    baseScope: {
      include: [...profile.scope.include],
      exclude: [...profile.scope.exclude],
    },
    template: templateLines.join("\n"),
    example: exampleLines.join("\n"),
  };
}

function createRepositoryEvidenceCandidates(options: {
  profile: ScanProfile;
  criterionId: string;
  files: readonly RepositoryFileRecord[];
  chunks: readonly RepositoryChunkRecord[];
  symbols: readonly RepositorySymbolRecord[];
  dependencies: readonly RepositoryDependencyRecord[];
  limit: number;
}): RepositoryEvidenceCandidate[] {
  const includedPaths = new Set(deriveScanCoverage(options.profile, options.files).included);
  const includedFiles = options.files.filter((file) => includedPaths.has(normalizeRepositoryPath(file.path)));
  const includedChunks = options.chunks.filter((chunk) => includedPaths.has(normalizeRepositoryPath(chunk.filePath)));
  const includedSymbols = options.symbols.filter((symbol) => includedPaths.has(normalizeRepositoryPath(symbol.filePath)));
  const includedDependencies = options.dependencies.filter((dependency) => includedPaths.has(normalizeRepositoryPath(dependency.filePath)));

  switch (options.profile.id) {
    case "documentation-conflicts":
      switch (options.criterionId) {
        case "contradictory-claims":
          return buildContradictoryClaimCandidates(includedFiles, includedChunks, options.limit);
        case "stale-documentation":
          return buildStaleDocumentationCandidates(options.profile, includedFiles, includedChunks, options.limit);
        case "broken-references":
          return buildBrokenReferenceCandidates(options.files, includedChunks, options.chunks, options.limit);
        case "duplicate-authority":
          return buildDuplicateAuthorityCandidates(includedChunks, options.limit);
        case "missing-owner":
          return buildMissingOwnerCandidates(includedFiles, includedChunks, options.limit);
        default:
          return [];
      }
    case "code-quality-review":
      switch (options.criterionId) {
        case "duplicate-responsibility":
          return buildDuplicateResponsibilityCandidates(includedFiles, includedSymbols, includedDependencies, options.limit);
        default:
          return [];
      }
    default:
      return [];
  }
}

const TOP_LEVEL_RESPONSIBILITY_SYMBOL_KINDS = new Set(["class", "interface", "enum", "record", "function"]);
const NON_MATERIAL_DUPLICATE_RESPONSIBILITY_PATH_PATTERNS = [
  "**/archive/**",
  "**/archives/**",
  "**/archived/**",
  "**/legacy/**",
  "**/deprecated/**",
  "**/generated/**",
  "**/__generated__/**",
  "**/*.generated.*",
  "**/fixtures/**",
  "**/__fixtures__/**",
  "**/examples/**",
  "**/example/**",
  "**/samples/**",
  "**/sample/**",
  "**/demo/**",
  "**/demos/**",
  "**/mocks/**",
  "**/__mocks__/**",
  "**/*.mock.*",
  "**/*.stories.*",
  "**/storybook/**",
] as const;

function buildDuplicateResponsibilityCandidates(
  files: readonly RepositoryFileRecord[],
  symbols: readonly RepositorySymbolRecord[],
  dependencies: readonly RepositoryDependencyRecord[],
  limit: number,
): RepositoryEvidenceCandidate[] {
  const codePaths = new Set(
    files
      .filter((file) => file.sourceKind === "code")
      .filter((file) => isMaterialDuplicateResponsibilityPath(file.path))
      .map((file) => normalizeRepositoryPath(file.path)),
  );
  const groups = new Map<string, RepositorySymbolRecord[]>();
  const dependencyNeighborhoods = createDependencyNeighborhoodIndex(codePaths, dependencies);

  for (const symbol of symbols) {
    if (!codePaths.has(normalizeRepositoryPath(symbol.filePath))) {
      continue;
    }
    if (symbol.parentSymbolKey !== undefined) {
      continue;
    }
    if (!symbol.isExported && !symbol.isPublic) {
      continue;
    }
    if (!TOP_LEVEL_RESPONSIBILITY_SYMBOL_KINDS.has(symbol.kind)) {
      continue;
    }
    const normalizedName = symbol.name.trim().toLocaleLowerCase();
    if (normalizedName.length === 0) {
      continue;
    }
    const existing = groups.get(normalizedName);
    if (existing === undefined) {
      groups.set(normalizedName, [symbol]);
    } else {
      existing.push(symbol);
    }
  }

  return [...groups.entries()]
    .map(([normalizedName, group]) => {
      const topology = describeDuplicateResponsibilityTopology(group, dependencyNeighborhoods);
      return {
      normalizedName,
      group: group.sort(compareRepositorySymbols),
      topology,
    };
    })
    .filter(({ group }) => new Set(group.map((symbol) => symbol.filePath)).size > 1)
    .sort((left, right) => {
      const countDelta = right.group.length - left.group.length;
      if (countDelta !== 0) {
        return countDelta;
      }
      const sharedDependencyDelta = right.topology.sharedDependencyCount - left.topology.sharedDependencyCount;
      if (sharedDependencyDelta !== 0) {
        return sharedDependencyDelta;
      }
      const directDependencyDelta = right.topology.directDependencyCount - left.topology.directDependencyCount;
      if (directDependencyDelta !== 0) {
        return directDependencyDelta;
      }
      return left.normalizedName.localeCompare(right.normalizedName);
    })
    .slice(0, limit)
    .map(({ normalizedName, group, topology }) => {
      const displayName = group[0]?.name ?? normalizedName;
      const topologySummary = createDuplicateResponsibilityTopologySummary(topology);
      return {
        id: `duplicate-responsibility:${normalizedName}`,
        criterionId: "duplicate-responsibility",
        signal: "duplicate-responsibility",
        kind: "requires_interpretation",
        title: `Repeated top-level symbol: ${displayName}`,
        summary:
          topologySummary === undefined
            ? `Top-level exported/public symbol '${displayName}' appears in multiple covered code files. Review whether responsibility is intentionally split or duplicated.`
            : `Top-level exported/public symbol '${displayName}' appears in multiple covered code files. ${topologySummary} Review whether responsibility is intentionally split or duplicated.`,
        sources: group.map((symbol) => ({
          kind: "chunk",
          filePath: symbol.filePath,
          language: symbol.language,
          sourceKind: "code",
          snippet: `${symbol.kind} ${symbol.qualifiedName}`,
          startLine: symbol.startLine,
          endLine: symbol.endLine,
          whySelected: createDuplicateResponsibilityWhySelected(symbol.filePath, topology),
        })),
      };
    });
}

function isMaterialDuplicateResponsibilityPath(path: string): boolean {
  return !matchesAnyGlob(normalizeRepositoryPath(path).toLocaleLowerCase(), NON_MATERIAL_DUPLICATE_RESPONSIBILITY_PATH_PATTERNS);
}

function compareRepositorySymbols(left: RepositorySymbolRecord, right: RepositorySymbolRecord): number {
  const fileDelta = left.filePath.localeCompare(right.filePath);
  if (fileDelta !== 0) {
    return fileDelta;
  }
  const lineDelta = left.startLine - right.startLine;
  if (lineDelta !== 0) {
    return lineDelta;
  }
  return left.qualifiedName.localeCompare(right.qualifiedName);
}

function createDependencyNeighborhoodIndex(
  codePaths: ReadonlySet<string>,
  dependencies: readonly RepositoryDependencyRecord[],
): Map<string, Set<string>> {
  const neighborhoods = new Map<string, Set<string>>();
  for (const dependency of dependencies) {
    const sourcePath = normalizeRepositoryPath(dependency.filePath);
    if (!codePaths.has(sourcePath)) {
      continue;
    }
    const identity = createDependencyTopologyIdentity(dependency);
    if (identity === undefined) {
      continue;
    }
    const existing = neighborhoods.get(sourcePath);
    if (existing === undefined) {
      neighborhoods.set(sourcePath, new Set([identity]));
    } else {
      existing.add(identity);
    }
  }
  return neighborhoods;
}

function createDependencyTopologyIdentity(dependency: RepositoryDependencyRecord): string | undefined {
  if (dependency.targetFilePath !== undefined) {
    return `${dependency.kind}:${normalizeRepositoryPath(dependency.targetFilePath).toLocaleLowerCase()}`;
  }
  if (dependency.kind === "call") {
    return undefined;
  }
  const normalizedTargetText = dependency.targetText.trim().toLocaleLowerCase();
  return normalizedTargetText.length === 0 ? undefined : `${dependency.kind}:${normalizedTargetText}`;
}

function describeDuplicateResponsibilityTopology(
  group: readonly RepositorySymbolRecord[],
  dependencyNeighborhoods: Map<string, Set<string>>,
): {
  sharedDependencyCount: number;
  directDependencyCount: number;
  perFileSharedCounts: Map<string, number>;
} {
  const filePaths = [...new Set(group.map((symbol) => normalizeRepositoryPath(symbol.filePath)))];
  const groupPathSet = new Set(filePaths.map((filePath) => filePath.toLocaleLowerCase()));
  const dependencyOccurrences = new Map<string, Set<string>>();
  const perFileSharedCounts = new Map<string, number>();
  let directDependencyCount = 0;

  for (const filePath of filePaths) {
    const neighborhood = dependencyNeighborhoods.get(filePath) ?? new Set<string>();
    for (const identity of neighborhood) {
      const filesForDependency = dependencyOccurrences.get(identity);
      if (filesForDependency === undefined) {
        dependencyOccurrences.set(identity, new Set([filePath]));
      } else {
        filesForDependency.add(filePath);
      }
      const targetPath = identity.slice(identity.indexOf(":") + 1);
      if (groupPathSet.has(targetPath) && targetPath !== filePath.toLocaleLowerCase()) {
        directDependencyCount += 1;
      }
    }
  }

  let sharedDependencyCount = 0;
  for (const filesForDependency of dependencyOccurrences.values()) {
    if (filesForDependency.size < 2) {
      continue;
    }
    sharedDependencyCount += 1;
    for (const filePath of filesForDependency) {
      perFileSharedCounts.set(filePath, (perFileSharedCounts.get(filePath) ?? 0) + 1);
    }
  }

  return {
    sharedDependencyCount,
    directDependencyCount,
    perFileSharedCounts,
  };
}

function createDuplicateResponsibilityTopologySummary(topology: {
  sharedDependencyCount: number;
  directDependencyCount: number;
}): string | undefined {
  if (topology.sharedDependencyCount > 0) {
    const dependencyLabel = topology.sharedDependencyCount === 1 ? "dependency target" : "dependency targets";
    return `The peer modules share ${topology.sharedDependencyCount} ${dependencyLabel}.`;
  }
  if (topology.directDependencyCount > 0) {
    return "The peer modules depend on one another directly.";
  }
  return undefined;
}

function createDuplicateResponsibilityWhySelected(
  filePath: string,
  topology: {
    sharedDependencyCount: number;
    perFileSharedCounts: Map<string, number>;
  },
): string {
  const normalizedPath = normalizeRepositoryPath(filePath);
  const sharedCount = topology.perFileSharedCounts.get(normalizedPath) ?? 0;
  if (sharedCount > 0) {
    const dependencyLabel = sharedCount === 1 ? "dependency target" : "dependency targets";
    return `Covered code file exposes the same top-level symbol name and shares ${sharedCount} ${dependencyLabel} with peer modules.`;
  }
  return "Covered code file exposes the same top-level symbol name as another module.";
}

function buildBrokenReferenceCandidates(
  files: readonly RepositoryFileRecord[],
  sourceChunks: readonly RepositoryChunkRecord[],
  referenceChunks: readonly RepositoryChunkRecord[],
  limit: number,
): RepositoryEvidenceCandidate[] {
  const existingPaths = new Set(files.map((file) => normalizeRepositoryPath(file.path)));
  const headingsByFile = collectMarkdownHeadingsByFile(referenceChunks);
  const candidates: RepositoryEvidenceCandidate[] = [];

  for (const chunk of sourceChunks) {
    if (chunk.sourceKind !== "documentation") {
      continue;
    }
    const lines = chunk.text.split("\n");
    for (let offset = 0; offset < lines.length; offset += 1) {
      const line = lines[offset] ?? "";
      for (const match of line.matchAll(/\[[^\]]+\]\(([^)]+)\)/g)) {
        const rawTarget = (match[1] ?? "").trim();
        const resolvedReference = resolveRepositoryLinkReference(chunk.filePath, rawTarget);
        if (resolvedReference === undefined) {
          continue;
        }
        const targetExists = existingPaths.has(resolvedReference.targetPath);
        const missingFile = !targetExists;
        const missingHeading =
          targetExists &&
          resolvedReference.fragment !== undefined &&
          !fileContainsHeading(headingsByFile, resolvedReference.targetPath, resolvedReference.fragment);
        if (!missingFile && !missingHeading) {
          continue;
        }
        const summary = missingFile
          ? `Repository-relative link points to a missing target: ${resolvedReference.targetPath}`
          : `Repository-relative link points to a missing heading fragment: ${resolvedReference.targetPath}#${resolvedReference.fragment}`;
        const whySelected = missingFile
          ? `Unresolved repository-relative link target: ${rawTarget}`
          : `Referenced heading fragment was not found: #${resolvedReference.fragment}`;
        candidates.push({
          id: createEvidenceCandidateId("broken-reference", chunk.filePath, String(chunk.startLine + offset), rawTarget),
          criterionId: "broken-references",
          signal: "broken-reference",
          kind: "deterministic",
          title: `Broken repository reference in ${chunk.filePath}`,
          summary,
          sources: [
            {
              kind: "chunk",
              filePath: chunk.filePath,
              language: chunk.language,
              sourceKind: chunk.sourceKind,
              startLine: chunk.startLine + offset,
              endLine: chunk.startLine + offset,
              snippet: line.trim(),
              whySelected,
            },
          ],
        });
        if (candidates.length >= limit) {
          return candidates;
        }
      }
    }
  }

  return candidates;
}

function buildContradictoryClaimCandidates(
  files: readonly RepositoryFileRecord[],
  chunks: readonly RepositoryChunkRecord[],
  limit: number,
): RepositoryEvidenceCandidate[] {
  const chunksByFile = new Map<string, RepositoryChunkRecord[]>();
  for (const chunk of chunks) {
    const current = chunksByFile.get(chunk.filePath) ?? [];
    current.push(chunk);
    chunksByFile.set(chunk.filePath, current);
  }
  const contradictionClaims = collectContradictionClaims(
    files.filter((file) => isMaterialContradictionDocument(file, chunksByFile.get(file.path) ?? [])),
    chunks,
  );
  const candidates: RepositoryEvidenceCandidate[] = [];

  for (let leftIndex = 0; leftIndex < contradictionClaims.length; leftIndex += 1) {
    const left = contradictionClaims[leftIndex];
    if (left === undefined) {
      continue;
    }
    for (let rightIndex = leftIndex + 1; rightIndex < contradictionClaims.length; rightIndex += 1) {
      const right = contradictionClaims[rightIndex];
      if (right === undefined || right.filePath === left.filePath || right.kind !== left.kind) {
        continue;
      }
      const contradictionMatch = matchContradictionClaimPair(left, right);
      if (contradictionMatch?.kind === "status" && left.kind === "status" && right.kind === "status") {
        candidates.push({
          id: createEvidenceCandidateId("contradictory-claims", left.filePath, String(left.line), right.filePath, String(right.line)),
          criterionId: "contradictory-claims",
          signal: "contradictory-claim",
          kind: "requires_interpretation",
          title: "Two documentation sources make opposite status claims",
          summary: `Two sources make opposite ${left.group} claims about ${contradictionMatch.sharedSubjects.join(", ")} within ${contradictionMatch.sharedContext.join(", ")}.`,
          sources: [left.source, right.source],
        });
      } else if (contradictionMatch?.kind === "selection" && left.kind === "selection" && right.kind === "selection") {
        candidates.push({
          id: createEvidenceCandidateId("contradictory-claims", left.filePath, String(left.line), right.filePath, String(right.line)),
          criterionId: "contradictory-claims",
          signal: "contradictory-claim",
          kind: "requires_interpretation",
          title: "Two documentation sources choose different primary/default owners",
          summary: `Two sources assign different ${left.qualifier} selections for the same concern: ${contradictionMatch.sharedContext.join(", ")}.`,
          sources: [left.source, right.source],
        });
      } else {
        continue;
      }
      if (candidates.length >= limit) {
        return candidates;
      }
    }
  }

  return candidates;
}

function buildStaleDocumentationCandidates(
  profile: ScanProfile,
  files: readonly RepositoryFileRecord[],
  chunks: readonly RepositoryChunkRecord[],
  limit: number,
): RepositoryEvidenceCandidate[] {
  const chunksByFile = new Map<string, RepositoryChunkRecord[]>();
  for (const chunk of chunks) {
    const current = chunksByFile.get(chunk.filePath) ?? [];
    current.push(chunk);
    chunksByFile.set(chunk.filePath, current);
  }
  const materialFiles = files.filter((file) => isMaterialContradictionDocument(file, chunksByFile.get(file.path) ?? []));
  const fileByPath = new Map(materialFiles.map((file) => [file.path, file] as const));
  const contradictionClaims = collectContradictionClaims(materialFiles, chunks);
  const candidates: RepositoryEvidenceCandidate[] = [];
  const emittedCandidateIds = new Set<string>();

  for (let leftIndex = 0; leftIndex < contradictionClaims.length; leftIndex += 1) {
    const left = contradictionClaims[leftIndex];
    if (left === undefined) {
      continue;
    }
    for (let rightIndex = leftIndex + 1; rightIndex < contradictionClaims.length; rightIndex += 1) {
      const right = contradictionClaims[rightIndex];
      if (right === undefined || right.filePath === left.filePath || right.kind !== left.kind) {
        continue;
      }
      const contradictionMatch = matchContradictionClaimPair(left, right);
      if (contradictionMatch === undefined) {
        continue;
      }
      const stalePair = selectStaleDocumentationPair(profile, left.filePath, right.filePath);
      if (stalePair === undefined) {
        continue;
      }
      const staleFile = fileByPath.get(stalePair.staleFilePath);
      const authoritativeFile = fileByPath.get(stalePair.authoritativeFilePath);
      const staleChunks = chunksByFile.get(stalePair.staleFilePath) ?? [];
      const authoritativeChunks = chunksByFile.get(stalePair.authoritativeFilePath) ?? [];
      if (
        staleFile === undefined ||
        authoritativeFile === undefined ||
        !isCurrentLookingDocumentationSource(staleFile, staleChunks) ||
        !isCurrentLookingDocumentationSource(authoritativeFile, authoritativeChunks)
      ) {
        continue;
      }
      const staleClaim = left.filePath === stalePair.staleFilePath ? left : right;
      const authoritativeClaim = left.filePath === stalePair.authoritativeFilePath ? left : right;
      const candidateId = createEvidenceCandidateId("stale-documentation", stalePair.staleFilePath, stalePair.authoritativeFilePath, String(staleClaim.line));
      if (emittedCandidateIds.has(candidateId)) {
        continue;
      }
      emittedCandidateIds.add(candidateId);
      candidates.push({
        id: candidateId,
        criterionId: "stale-documentation",
        signal: "stale-documentation",
        kind: "requires_interpretation",
        title: `Lower-precedence documentation may be stale in ${stalePair.staleFilePath}`,
        summary: createStaleDocumentationSummary(contradictionMatch, stalePair.staleFilePath, stalePair.authoritativeFilePath),
        sources: [staleClaim.source, authoritativeClaim.source],
      });
      if (candidates.length >= limit) {
        return candidates;
      }
    }
  }

  return candidates;
}

function matchContradictionClaimPair(
  left:
    | {
        kind: "status";
        filePath: string;
        line: number;
        group: string;
        polarity: "positive" | "negative";
        subjectTokens: string[];
        contextTokens: string[];
        source: RepositoryEvidenceSource;
      }
    | {
        kind: "selection";
        filePath: string;
        line: number;
        qualifier: "primary" | "default" | "canonical";
        subjectTokens: string[];
        contextTokens: string[];
        source: RepositoryEvidenceSource;
      },
  right:
    | {
        kind: "status";
        filePath: string;
        line: number;
        group: string;
        polarity: "positive" | "negative";
        subjectTokens: string[];
        contextTokens: string[];
        source: RepositoryEvidenceSource;
      }
    | {
        kind: "selection";
        filePath: string;
        line: number;
        qualifier: "primary" | "default" | "canonical";
        subjectTokens: string[];
        contextTokens: string[];
        source: RepositoryEvidenceSource;
      },
):
  | { kind: "status"; sharedSubjects: string[]; sharedContext: string[] }
  | { kind: "selection"; sharedContext: string[] }
  | undefined {
  if (left.kind === "status" && right.kind === "status") {
    if (left.group !== right.group || left.polarity === right.polarity) {
      return undefined;
    }
    const sharedSubjects = intersectNormalizedTokens(left.subjectTokens, right.subjectTokens);
    const sharedContext = intersectNormalizedTokens(left.contextTokens, right.contextTokens);
    if (sharedSubjects.length === 0 || sharedContext.length === 0) {
      return undefined;
    }
    return { kind: "status", sharedSubjects, sharedContext };
  }
  if (left.kind === "selection" && right.kind === "selection") {
    if (left.qualifier !== right.qualifier) {
      return undefined;
    }
    const sharedContext = intersectNormalizedTokens(left.contextTokens, right.contextTokens);
    if (sharedContext.length < 2 || haveSameNormalizedTokens(left.subjectTokens, right.subjectTokens)) {
      return undefined;
    }
    return { kind: "selection", sharedContext };
  }
  return undefined;
}

function selectStaleDocumentationPair(
  profile: ScanProfile,
  leftFilePath: string,
  rightFilePath: string,
): { staleFilePath: string; authoritativeFilePath: string } | undefined {
  const leftPrecedence = scoreSsotPrecedence(leftFilePath, profile.ssotOrder);
  const rightPrecedence = scoreSsotPrecedence(rightFilePath, profile.ssotOrder);
  if (leftPrecedence === rightPrecedence) {
    return undefined;
  }
  if (leftPrecedence < rightPrecedence) {
    return { staleFilePath: rightFilePath, authoritativeFilePath: leftFilePath };
  }
  return { staleFilePath: leftFilePath, authoritativeFilePath: rightFilePath };
}

function scoreSsotPrecedence(filePath: string, ssotOrder: readonly string[]): number {
  for (let index = 0; index < ssotOrder.length; index += 1) {
    const pattern = ssotOrder[index];
    if (pattern === undefined || pattern === "implementation") {
      continue;
    }
    if (matchesGlob(normalizeRepositoryPath(filePath), normalizeRepositoryPath(pattern))) {
      return index;
    }
  }
  return ssotOrder.length + 1;
}

function createStaleDocumentationSummary(
  contradictionMatch: { kind: "status"; sharedSubjects: string[]; sharedContext: string[] } | { kind: "selection"; sharedContext: string[] },
  staleFilePath: string,
  authoritativeFilePath: string,
): string {
  if (contradictionMatch.kind === "status") {
    return `${staleFilePath} makes a lower-precedence status claim about ${contradictionMatch.sharedSubjects.join(", ")} that conflicts with stronger SSOT in ${authoritativeFilePath}.`;
  }
  return `${staleFilePath} makes a lower-precedence primary/default/canonical selection that conflicts with stronger SSOT in ${authoritativeFilePath} for ${contradictionMatch.sharedContext.join(", ")}.`;
}

function buildDuplicateAuthorityCandidates(
  chunks: readonly RepositoryChunkRecord[],
  limit: number,
): RepositoryEvidenceCandidate[] {
  const authorityClaims = collectAuthorityClaims(chunks);
  const candidates: RepositoryEvidenceCandidate[] = [];

  for (let leftIndex = 0; leftIndex < authorityClaims.length; leftIndex += 1) {
    const left = authorityClaims[leftIndex];
    if (left === undefined) {
      continue;
    }
    for (let rightIndex = leftIndex + 1; rightIndex < authorityClaims.length; rightIndex += 1) {
      const right = authorityClaims[rightIndex];
      if (right === undefined || right.filePath === left.filePath) {
        continue;
      }
      const sharedTokens = selectAuthoritySharedTokens(left.topicTokens, right.topicTokens);
      if (sharedTokens.length === 0) {
        continue;
      }
      candidates.push({
        id: createEvidenceCandidateId("duplicate-authority", left.filePath, String(left.line), right.filePath, String(right.line)),
        criterionId: "duplicate-authority",
        signal: "authority-claim",
        kind: "requires_interpretation",
        title: "Multiple documentation sources make authority-style claims",
        summary: `Two documentation sources contain authority-style language about the same concern: ${sharedTokens.join(", ")}.`,
        sources: [left.source, right.source],
      });
      if (candidates.length >= limit) {
        return candidates;
      }
    }
  }

  return candidates;
}

function buildMissingOwnerCandidates(
  files: readonly RepositoryFileRecord[],
  chunks: readonly RepositoryChunkRecord[],
  limit: number,
): RepositoryEvidenceCandidate[] {
  const documentationFiles = files.filter((file) => file.sourceKind === "documentation");
  const authorityFilePaths = collectOwnershipMarkerFilePaths(chunks);
  const chunksByFile = new Map<string, RepositoryChunkRecord[]>();
  for (const chunk of chunks) {
    const current = chunksByFile.get(chunk.filePath) ?? [];
    current.push(chunk);
    chunksByFile.set(chunk.filePath, current);
  }

  const candidates: RepositoryEvidenceCandidate[] = [];
  for (const file of documentationFiles) {
    if (authorityFilePaths.has(file.path)) {
      continue;
    }
    if (!isMaterialOwnershipDocument(file, chunksByFile.get(file.path) ?? [])) {
      continue;
    }
    const firstChunk = (chunksByFile.get(file.path) ?? [])[0];
    const source =
      firstChunk === undefined
        ? createFileEvidenceSource(file)
        : createChunkEvidenceSource(
            firstChunk,
            summarizeChunkSnippet(firstChunk.text),
            "No explicit owner or authority markers were detected in a material documentation source.",
          );
    candidates.push({
      id: createEvidenceCandidateId("missing-owner", file.path),
      criterionId: "missing-owner",
      signal: "missing-owner",
      kind: "requires_interpretation",
      title: `No explicit owner markers detected in ${file.path}`,
      summary:
        "This documentation source does not contain simple owner, authority, or source-of-truth markers. An agent should verify whether ownership is intentionally omitted or missing.",
      sources: [source],
    });
    if (candidates.length >= limit) {
      return candidates;
    }
  }

  return candidates;
}

function collectOwnershipMarkerFilePaths(chunks: readonly RepositoryChunkRecord[]): Set<string> {
  const filePaths = new Set<string>();
  for (const chunk of chunks) {
    if (chunk.sourceKind !== "documentation") {
      continue;
    }
    for (const line of chunk.text.split("\n")) {
      if (matchOwnershipMarkerPhrase(line) !== undefined) {
        filePaths.add(chunk.filePath);
        break;
      }
    }
  }
  return filePaths;
}

function collectAuthorityClaims(chunks: readonly RepositoryChunkRecord[]): Array<{
  filePath: string;
  line: number;
  source: RepositoryEvidenceSource;
  topicTokens: string[];
}> {
  const claims: Array<{ filePath: string; line: number; source: RepositoryEvidenceSource; topicTokens: string[] }> = [];
  for (const chunk of chunks) {
    if (chunk.sourceKind !== "documentation") {
      continue;
    }
    const lines = chunk.text.split("\n");
    let currentHeading: string | undefined;
    for (let offset = 0; offset < lines.length; offset += 1) {
      const line = lines[offset] ?? "";
      const heading = parseMarkdownHeading(line);
      if (heading !== undefined) {
        currentHeading = heading;
      }
      const phrase = matchAuthorityPhrase(line);
      if (phrase === undefined) {
        continue;
      }
      claims.push({
        filePath: chunk.filePath,
        line: chunk.startLine + offset,
        topicTokens: extractAuthorityTopicTokens(line, currentHeading),
        source: createChunkEvidenceSource(
          chunk,
          line.trim(),
          `Authority-style phrase detected: ${phrase}`,
          chunk.startLine + offset,
          chunk.startLine + offset,
        ),
      });
    }
  }
  return claims;
}

function collectContradictionClaims(
  files: readonly RepositoryFileRecord[],
  chunks: readonly RepositoryChunkRecord[],
): Array<
  | {
      kind: "status";
      filePath: string;
      line: number;
      group: string;
      polarity: "positive" | "negative";
      subjectTokens: string[];
      contextTokens: string[];
      source: RepositoryEvidenceSource;
    }
  | {
      kind: "selection";
      filePath: string;
      line: number;
      qualifier: "primary" | "default" | "canonical";
      subjectTokens: string[];
      contextTokens: string[];
      source: RepositoryEvidenceSource;
    }
> {
  const includedFilePaths = new Set(files.map((file) => file.path));
  const claims: Array<
    | {
        kind: "status";
        filePath: string;
        line: number;
        group: string;
        polarity: "positive" | "negative";
        subjectTokens: string[];
        contextTokens: string[];
        source: RepositoryEvidenceSource;
      }
    | {
        kind: "selection";
        filePath: string;
        line: number;
        qualifier: "primary" | "default" | "canonical";
        subjectTokens: string[];
        contextTokens: string[];
        source: RepositoryEvidenceSource;
      }
  > = [];
  for (const chunk of chunks) {
    if (chunk.sourceKind !== "documentation" || !includedFilePaths.has(chunk.filePath)) {
      continue;
    }
    const lines = chunk.text.split("\n");
    let currentHeading: string | undefined;
    for (let offset = 0; offset < lines.length; offset += 1) {
      const line = lines[offset] ?? "";
      const heading = parseMarkdownHeading(line);
      if (heading !== undefined) {
        currentHeading = heading;
      }
      const lineNumber = chunk.startLine + offset;
      const statusClaim = matchContradictoryStatusClaim(chunk, line, lineNumber, currentHeading);
      if (statusClaim !== undefined) {
        claims.push(statusClaim);
      }
      const selectionClaim = matchExclusiveSelectionClaim(chunk, line, lineNumber, currentHeading);
      if (selectionClaim !== undefined) {
        claims.push(selectionClaim);
      }
    }
  }
  return claims;
}

function matchContradictoryStatusClaim(
  chunk: RepositoryChunkRecord,
  line: string,
  lineNumber: number,
  currentHeading?: string,
):
  | {
      kind: "status";
      filePath: string;
      line: number;
      group: string;
      polarity: "positive" | "negative";
      subjectTokens: string[];
      contextTokens: string[];
      source: RepositoryEvidenceSource;
    }
  | undefined {
  for (const pattern of CONTRADICTION_STATUS_PATTERNS) {
    const match = line.match(pattern.pattern);
    if (match === null) {
      continue;
    }
    const subject = match.groups?.subject?.trim() ?? "";
    const context = `${currentHeading ?? ""} ${match.groups?.context?.trim() ?? ""}`.trim();
    const subjectTokens = normalizeClaimTokens(subject);
    const contextTokens = normalizeClaimTokens(context);
    if (subjectTokens.length === 0 || contextTokens.length === 0) {
      continue;
    }
    return {
      kind: "status",
      filePath: chunk.filePath,
      line: lineNumber,
      group: pattern.group,
      polarity: pattern.polarity,
      subjectTokens,
      contextTokens,
      source: createChunkEvidenceSource(
        chunk,
        line.trim(),
        `${capitalize(pattern.polarity)} ${pattern.group} phrase detected for ${subject}.`,
        lineNumber,
        lineNumber,
      ),
    };
  }
  return undefined;
}

function matchExclusiveSelectionClaim(
  chunk: RepositoryChunkRecord,
  line: string,
  lineNumber: number,
  currentHeading?: string,
):
  | {
      kind: "selection";
      filePath: string;
      line: number;
      qualifier: "primary" | "default" | "canonical";
      subjectTokens: string[];
      contextTokens: string[];
      source: RepositoryEvidenceSource;
    }
  | undefined {
  const match = line.match(
    /^(?<subject>.+?)\s+(?:is|are|remains)\s+(?:the\s+)?(?<qualifier>primary|default|canonical)\s+(?<context>.+)$/i,
  );
  if (match === null) {
    return undefined;
  }
  const qualifier = match.groups?.qualifier?.toLocaleLowerCase();
  if (qualifier !== "primary" && qualifier !== "default" && qualifier !== "canonical") {
    return undefined;
  }
  const subjectTokens = normalizeClaimTokens(match.groups?.subject ?? "");
  const contextTokens = normalizeClaimTokens(`${currentHeading ?? ""} ${match.groups?.context ?? ""}`);
  if (subjectTokens.length === 0 || contextTokens.length < 2) {
    return undefined;
  }
  return {
    kind: "selection",
    filePath: chunk.filePath,
    line: lineNumber,
    qualifier,
    subjectTokens,
    contextTokens,
    source: createChunkEvidenceSource(
      chunk,
      line.trim(),
      `${capitalize(qualifier)} selection phrase detected for ${subjectTokens.join(", ")}.`,
      lineNumber,
      lineNumber,
    ),
  };
}

function matchAuthorityPhrase(value: string): string | undefined {
  for (const pattern of AUTHORITY_CLAIM_PATTERNS) {
    const match = value.match(pattern);
    if (match !== null) {
      return match[1] ?? match[0];
    }
  }
  return undefined;
}

function matchOwnershipMarkerPhrase(value: string): string | undefined {
  const match = value.match(/\b(single source of truth|source of truth|canonical|authoritative|owned by|ownership|owner)\b/i);
  return match?.[1];
}

function resolveRepositoryLinkReference(
  sourceFilePath: string,
  rawTarget: string,
): { targetPath: string; fragment?: string } | undefined {
  if (rawTarget.length === 0 || /^[a-z][a-z0-9+.-]*:/i.test(rawTarget)) {
    return undefined;
  }
  const hashIndex = rawTarget.indexOf("#");
  const fragmentPart = hashIndex >= 0 ? rawTarget.slice(hashIndex + 1).trim() : undefined;
  const targetPart = hashIndex >= 0 ? rawTarget.slice(0, hashIndex) : rawTarget;
  const [targetWithoutQuery] = targetPart.split("?", 1);
  const trimmedTarget = targetWithoutQuery?.trim() ?? "";
  const targetPath =
    trimmedTarget.length === 0 ? sourceFilePath : resolveRepositoryLinkTargetPath(sourceFilePath, trimmedTarget);
  if (targetPath === undefined) {
    return undefined;
  }
  return {
    targetPath,
    ...(fragmentPart === undefined || fragmentPart.length === 0 ? {} : { fragment: normalizeMarkdownHeadingSlug(fragmentPart) }),
  };
}

function resolveRepositoryLinkTargetPath(sourceFilePath: string, rawTargetPath: string): string | undefined {
  const normalized =
    rawTargetPath.startsWith("/")
      ? pathPosix.normalize(rawTargetPath.slice(1))
      : pathPosix.normalize(pathPosix.join(pathPosix.dirname(sourceFilePath), rawTargetPath));
  if (normalized.length === 0 || normalized === "." || normalized === ".." || normalized.startsWith("../")) {
    return undefined;
  }
  return normalizeRepositoryPath(normalized);
}

function collectMarkdownHeadingsByFile(chunks: readonly RepositoryChunkRecord[]): Map<string, Set<string>> {
  const headingsByFile = new Map<string, Set<string>>();
  for (const chunk of chunks) {
    if (chunk.sourceKind !== "documentation") {
      continue;
    }
    const headings = headingsByFile.get(chunk.filePath) ?? new Set<string>();
    for (const line of chunk.text.split("\n")) {
      const heading = parseMarkdownHeading(line);
      if (heading !== undefined) {
        headings.add(normalizeMarkdownHeadingSlug(heading));
      }
    }
    headingsByFile.set(chunk.filePath, headings);
  }
  return headingsByFile;
}

function fileContainsHeading(headingsByFile: ReadonlyMap<string, Set<string>>, filePath: string, fragment: string): boolean {
  return headingsByFile.get(filePath)?.has(normalizeMarkdownHeadingSlug(fragment)) ?? false;
}

function parseMarkdownHeading(line: string): string | undefined {
  const match = line.match(/^\s{0,3}#{1,6}\s+(.+?)\s*#*\s*$/);
  return match?.[1]?.trim() || undefined;
}

function normalizeMarkdownHeadingSlug(value: string): string {
  return value
    .trim()
    .toLocaleLowerCase()
    .replace(/[`*_~]/g, "")
    .replace(/[^\p{L}\p{N}\s-]/gu, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-");
}

function extractAuthorityTopicTokens(line: string, heading?: string): string[] {
  return normalizeTopicTokens([heading ?? "", line].join(" "));
}

function selectAuthoritySharedTokens(left: readonly string[], right: readonly string[]): string[] {
  const sharedTokens = intersectNormalizedTokens(left, right);
  const materialSharedTokens = sharedTokens.filter((token) => !GENERIC_AUTHORITY_TOPIC_TOKENS.has(token));
  if (materialSharedTokens.length === 0) {
    return [];
  }
  if (materialSharedTokens.length === 1 && sharedTokens.length < 2) {
    return [];
  }
  return materialSharedTokens;
}

function normalizeTopicTokens(value: string): string[] {
  const tokens = value
    .toLocaleLowerCase()
    .split(/[^a-z0-9]+/i)
    .map((token) => normalizeTopicToken(token))
    .filter((token) => token.length > 1 && !IGNORED_TOPIC_TOKENS.has(token));
  return [...new Set(tokens)];
}

function normalizeClaimTokens(value: string): string[] {
  return normalizeTopicTokens(value).filter((token) => !IGNORED_CLAIM_TOKENS.has(token));
}

function normalizeTopicToken(value: string): string {
  if (/^owner(?:ship)?$/.test(value) || /^owned$/.test(value) || /^owning$/.test(value)) {
    return "owner";
  }
  if (/^docs?$/.test(value) || /^document(?:ation)?$/.test(value)) {
    return "doc";
  }
  if (/^workflows?$/.test(value)) {
    return "workflow";
  }
  if (/^architect(?:ure|ural)?$/.test(value)) {
    return "architecture";
  }
  if (/^guides?$/.test(value) || /^guidance$/.test(value)) {
    return "guide";
  }
  return value;
}

function intersectNormalizedTokens(left: readonly string[], right: readonly string[]): string[] {
  const rightTokens = new Set(right);
  return left.filter((token) => rightTokens.has(token));
}

function haveSameNormalizedTokens(left: readonly string[], right: readonly string[]): boolean {
  if (left.length !== right.length) {
    return false;
  }
  const rightTokens = new Set(right);
  return left.every((token) => rightTokens.has(token));
}

function capitalize(value: string): string {
  return value.length === 0 ? value : `${value[0]?.toLocaleUpperCase() ?? ""}${value.slice(1)}`;
}

function isMaterialOwnershipDocument(file: RepositoryFileRecord, chunks: readonly RepositoryChunkRecord[]): boolean {
  const normalizedPath = normalizeRepositoryPath(file.path).toLocaleLowerCase();
  const baseName = pathPosix.basename(normalizedPath);
  const fullText = chunks.map((chunk) => chunk.text).join("\n").toLocaleLowerCase();
  if (IGNORED_MISSING_OWNER_PATH_PATTERNS.some((pattern) => normalizedPath.includes(pattern) || baseName.includes(pattern))) {
    return false;
  }
  if (baseName === "agents.md" || normalizedPath === "readme.md") {
    return true;
  }
  if (MATERIAL_OWNER_PATH_KEYWORDS.some((keyword) => normalizedPath.includes(keyword) || baseName.includes(keyword))) {
    return true;
  }
  return MATERIAL_OWNER_TEXT_KEYWORDS.some((keyword) => fullText.includes(keyword));
}

function isMaterialContradictionDocument(file: RepositoryFileRecord, chunks: readonly RepositoryChunkRecord[]): boolean {
  const normalizedPath = normalizeRepositoryPath(file.path).toLocaleLowerCase();
  const baseName = pathPosix.basename(normalizedPath);
  const fullText = chunks.map((chunk) => chunk.text).join("\n").toLocaleLowerCase();
  if (IGNORED_CONTRADICTION_PATH_PATTERNS.some((pattern) => normalizedPath.includes(pattern) || baseName.includes(pattern))) {
    return false;
  }
  if (baseName === "agents.md" || baseName === "readme.md") {
    return true;
  }
  if (MATERIAL_CONTRADICTION_PATH_KEYWORDS.some((keyword) => normalizedPath.includes(keyword) || baseName.includes(keyword))) {
    return true;
  }
  return MATERIAL_CONTRADICTION_TEXT_KEYWORDS.some((keyword) => fullText.includes(keyword));
}

function isCurrentLookingDocumentationSource(file: RepositoryFileRecord, chunks: readonly RepositoryChunkRecord[]): boolean {
  const normalizedPath = normalizeRepositoryPath(file.path).toLocaleLowerCase();
  const fullText = chunks.map((chunk) => chunk.text).join("\n").toLocaleLowerCase();
  if (NON_CURRENT_DOCUMENT_PATH_PATTERNS.some((pattern) => normalizedPath.includes(pattern))) {
    return false;
  }
  if (NON_CURRENT_DOCUMENT_TEXT_PATTERNS.some((pattern) => fullText.includes(pattern))) {
    return false;
  }
  return true;
}

function summarizeChunkSnippet(value: string): string {
  return value.split("\n").map((line) => line.trim()).filter((line) => line.length > 0).slice(0, 2).join(" ");
}

const IGNORED_TOPIC_TOKENS = new Set([
  "a",
  "an",
  "and",
  "are",
  "as",
  "authoritative",
  "be",
  "by",
  "canonical",
  "doc",
  "file",
  "for",
  "here",
  "is",
  "it",
  "lives",
  "of",
  "on",
  "page",
  "source",
  "the",
  "this",
  "truth",
]);
const GENERIC_AUTHORITY_TOPIC_TOKENS = new Set([
  "agent",
  "agents",
  "architecture",
  "design",
  "doc",
  "guide",
  "module",
  "owner",
  "ownership",
  "policy",
  "project",
  "projection",
  "repo",
  "repository",
  "rule",
  "runtime",
  "scan",
  "spec",
  "system",
  "tool",
  "workflow",
  "workspace",
]);

const IGNORED_CLAIM_TOKENS = new Set([
  "available",
  "canonical",
  "current",
  "default",
  "deprecated",
  "implemented",
  "not",
  "part",
  "primary",
  "removed",
  "remains",
  "supported",
  "target",
  "unavailable",
]);

const IGNORED_MISSING_OWNER_PATH_PATTERNS = [
  "glossary",
  "changelog",
  "release-notes",
  "terms",
  "archive",
  "history",
  "docs/ai/",
  "docs/adr/",
  "docs/design/",
  "docs/product/",
];
const MATERIAL_OWNER_PATH_KEYWORDS = ["contract", "policy", "runbook", "playbook", "operations", "ownership", "responsibility", "schema", "api", "mcp"];
const MATERIAL_OWNER_TEXT_KEYWORDS = [
  "rollback",
  "incident",
  "operator",
  "on-call",
  "oncall",
];
const AUTHORITY_CLAIM_PATTERNS = [
  /\b(single source of truth|source of truth|canonical|authoritative)\b.*\b(?:lives here|belongs here|defined here|recorded here|maintained here)\b/i,
  /\bthis\s+(?:document|doc|page|file|guide|spec|readme|runbook|playbook|section)\b.*\b(single source of truth|source of truth|canonical|authoritative)\b/i,
  /\b(?:document|doc|page|file|guide|spec|readme|runbook|playbook|section)\b.*\b(?:is|are|remains)\s+(?:the\s+)?(single source of truth|source of truth|canonical|authoritative)\b/i,
  /\b(?:document|doc|guide|spec|readme|runbook|playbook|page|file)\b.*\bowned by\b/i,
] as const;
const IGNORED_CONTRADICTION_PATH_PATTERNS = ["glossary", "changelog", "release-notes", "terms", "archive", "history"];
const MATERIAL_CONTRADICTION_PATH_KEYWORDS = ["architecture", "design", "spec", "contract", "policy", "workflow", "runbook", "playbook", "guide", "deploy", "operations", "runtime", "storage", "transport"];
const MATERIAL_CONTRADICTION_TEXT_KEYWORDS = ["primary", "default", "supported", "deprecated", "removed", "deferred", "runtime", "backend", "interface", "target"];
const NON_CURRENT_DOCUMENT_PATH_PATTERNS = ["legacy", "deprecated", "archive", "histor", "changelog", "release-notes"];
const NON_CURRENT_DOCUMENT_TEXT_PATTERNS = [
  "legacy documentation",
  "legacy doc",
  "historical reference",
  "for historical reference",
  "archived document",
  "archived for reference",
  "superseded by",
  "this document is obsolete",
  "this document is deprecated",
];
const CONTRADICTION_STATUS_PATTERNS = [
  {
    group: "support",
    polarity: "negative" as const,
    pattern: /^(?<subject>.+?)\s+(?:is|are|remains)\s+not\s+supported\b(?<context>.*)$/i,
  },
  {
    group: "support",
    polarity: "negative" as const,
    pattern: /^(?<subject>.+?)\s+is\s+no\s+longer\s+supported\b(?<context>.*)$/i,
  },
  {
    group: "support",
    polarity: "positive" as const,
    pattern: /^(?<subject>.+?)\s+(?:is|are|remains)\s+supported\b(?<context>.*)$/i,
  },
  {
    group: "membership",
    polarity: "negative" as const,
    pattern: /^(?<subject>.+?)\s+(?:is|are|remains)\s+not\s+part\s+of\b(?<context>.*)$/i,
  },
  {
    group: "membership",
    polarity: "positive" as const,
    pattern: /^(?<subject>.+?)\s+(?:is|are|remains)\s+part\s+of\b(?<context>.*)$/i,
  },
  {
    group: "availability",
    polarity: "negative" as const,
    pattern: /^(?<subject>.+?)\s+(?:is|are|remains)\s+not\s+available\b(?<context>.*)$/i,
  },
  {
    group: "availability",
    polarity: "negative" as const,
    pattern: /^(?<subject>.+?)\s+(?:is|are|remains)\s+unavailable\b(?<context>.*)$/i,
  },
  {
    group: "availability",
    polarity: "positive" as const,
    pattern: /^(?<subject>.+?)\s+(?:is|are|remains)\s+available\b(?<context>.*)$/i,
  },
];

function createFileEvidenceSource(file: RepositoryFileRecord): RepositoryEvidenceSource {
  return {
    kind: "file",
    filePath: file.path,
    language: file.language,
    sourceKind: file.sourceKind,
    snippet: file.path,
    whySelected: "Documentation file was included in repository coverage.",
  };
}

function createChunkEvidenceSource(
  chunk: RepositoryChunkRecord,
  snippet: string,
  whySelected: string,
  startLine = chunk.startLine,
  endLine = chunk.endLine,
): RepositoryEvidenceSource {
  return {
    kind: "chunk",
    filePath: chunk.filePath,
    language: chunk.language,
    sourceKind: chunk.sourceKind,
    startLine,
    endLine,
    snippet,
    whySelected,
  };
}

function createEvidenceCandidateId(...parts: string[]): string {
  return createHash("sha256").update(parts.join("::")).digest("hex").slice(0, 24);
}

function normalizeRepositoryPath(value: string): string {
  return value.replace(/\\/g, "/");
}

function matchesAnyGlob(path: string, patterns: readonly string[]): boolean {
  return patterns.some((pattern) => matchesGlob(normalizeRepositoryPath(path), normalizeRepositoryPath(pattern)));
}

function matchesGlob(path: string, pattern: string): boolean {
  return matchGlobSegments(path.split("/"), pattern.split("/"), 0, 0);
}

function matchGlobSegments(pathSegments: readonly string[], patternSegments: readonly string[], pathIndex: number, patternIndex: number): boolean {
  if (patternIndex >= patternSegments.length) {
    return pathIndex >= pathSegments.length;
  }
  const patternSegment = patternSegments[patternIndex] ?? "";
  if (patternSegment === "**") {
    if (patternIndex === patternSegments.length - 1) {
      return true;
    }
    for (let nextPathIndex = pathIndex; nextPathIndex <= pathSegments.length; nextPathIndex += 1) {
      if (matchGlobSegments(pathSegments, patternSegments, nextPathIndex, patternIndex + 1)) {
        return true;
      }
    }
    return false;
  }
  if (pathIndex >= pathSegments.length) {
    return false;
  }
  if (!matchesGlobSegment(pathSegments[pathIndex] ?? "", patternSegment)) {
    return false;
  }
  return matchGlobSegments(pathSegments, patternSegments, pathIndex + 1, patternIndex + 1);
}

function matchesGlobSegment(value: string, pattern: string): boolean {
  return matchGlobSegmentChars(value, pattern, 0, 0);
}

function matchGlobSegmentChars(value: string, pattern: string, valueIndex: number, patternIndex: number): boolean {
  if (patternIndex >= pattern.length) {
    return valueIndex >= value.length;
  }
  const patternChar = pattern[patternIndex] ?? "";
  if (patternChar === "*") {
    for (let nextValueIndex = valueIndex; nextValueIndex <= value.length; nextValueIndex += 1) {
      if (matchGlobSegmentChars(value, pattern, nextValueIndex, patternIndex + 1)) {
        return true;
      }
    }
    return false;
  }
  if (valueIndex >= value.length) {
    return false;
  }
  if (patternChar !== "?" && patternChar !== value[valueIndex]) {
    return false;
  }
  return matchGlobSegmentChars(value, pattern, valueIndex + 1, patternIndex + 1);
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

function resolveEmbeddingModelRef(
  providers: EmbeddingProviderRegistry,
  modelRef: string,
): { provider: EmbeddingProviderRegistry[string]; providerModel: string } {
  const separatorIndex = modelRef.indexOf(":");
  if (separatorIndex < 1 || separatorIndex === modelRef.length - 1) {
    throw new RuntimeError(`Provider-backed embedding refresh requires a model ref in provider:model form: ${modelRef}`, {
      code: "EMBEDDING_MODEL_REF_INVALID",
    });
  }

  const providerId = modelRef.slice(0, separatorIndex);
  const providerModel = modelRef.slice(separatorIndex + 1);
  const provider = providers[providerId];
  if (provider === undefined) {
    throw new RuntimeError(`Embedding provider is not configured: ${providerId}`, {
      code: "EMBEDDING_PROVIDER_NOT_CONFIGURED",
      details: { providerId, modelRef },
    });
  }

  return { provider, providerModel };
}

function selectConceptNodes(
  concepts: Array<{ id: string; label: string; type: "concept"; notes?: string }>,
  conceptById: Map<string, { id: string; label: string; type: "concept"; notes?: string }>,
  requestedNodeIds: string[] | undefined,
  limit: number | undefined,
) {
  const selected = requestedNodeIds === undefined ? concepts : requestedNodeIds.map((nodeId) => findRequestedConceptNode(conceptById, nodeId));
  return limit === undefined ? selected : selected.slice(0, limit);
}

function findRequestedConceptNode(
  conceptById: Map<string, { id: string; label: string; type: "concept"; notes?: string }>,
  nodeId: string,
) {
  const node = conceptById.get(nodeId);
  if (node === undefined) {
    throw new RuntimeError(`Concept node not found for embedding refresh: ${nodeId}`, {
      code: "EMBEDDING_CONCEPT_NODE_NOT_FOUND",
    });
  }
  return node;
}

function isConceptNode(node: WorkspaceState["graph"]["nodes"][number]): node is WorkspaceState["graph"]["nodes"][number] & { type: "concept" } {
  return node.type === "concept";
}

function chunkEmbeddingInputs<T>(items: T[], maxBatchSize: number | undefined): T[][] {
  if (items.length === 0) {
    return [];
  }
  if (maxBatchSize === undefined || maxBatchSize < 1 || maxBatchSize >= items.length) {
    return [items];
  }

  const chunks: T[][] = [];
  for (let index = 0; index < items.length; index += maxBatchSize) {
    chunks.push(items.slice(index, index + maxBatchSize));
  }
  return chunks;
}

async function embedWithProvider<T>(providerId: string, modelRef: string, fn: () => Promise<T>): Promise<T> {
  try {
    return await fn();
  } catch (error) {
    if (error instanceof EmbeddingProviderError) {
      throw new RuntimeError(`Embedding provider ${providerId} failed for model ${modelRef}: ${error.message}`, {
        code: error.code,
        details: error.details,
      });
    }
    throw error;
  }
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
    `Apply every criterion: ${profile.criteria.map((criterion) => criterion.id).join(", ")}.`,
    `Declare outputs: ${profile.requiredOutputs.join(", ")}.`,
  ];
}

function readRepositoryIndexedFileText(filePath: string, chunks: readonly RepositoryChunkRecord[]): string {
  const matchingChunks = chunks
    .filter((chunk) => normalizeRepositoryPath(chunk.filePath) === filePath)
    .sort((left, right) => {
      const lineDelta = left.startLine - right.startLine;
      if (lineDelta !== 0) {
        return lineDelta;
      }
      return left.id.localeCompare(right.id);
    });
  if (matchingChunks.length === 0) {
    throw new Error(`Indexed repository file ${filePath} has no chunk text`);
  }
  return matchingChunks.map((chunk) => chunk.text).join("\n");
}

function parseScanProfileOverlayYaml(text: string, overlayPath: string): ScanProfileOverlay {
  const overlay: Partial<ScanProfileOverlay> = {};
  let activeListField:
    | "instructions"
    | "include"
    | "exclude"
    | "archivePatterns"
    | "legacyPatterns"
    | "generatedPatterns"
    | "sourceTypes"
    | "criteria"
    | "ssotOrder"
    | "requiredOutputs"
    | "boundaryMapRoots"
    | "boundaryMapContractPathMarkers"
    | "boundaryMapContractFileStems"
    | "boundaryMapIgnoredTokens"
    | "boundaryMapTestDirectoryNames"
    | "boundaryMapRoutePathMarkers"
    | "boundaryMapRouteNameSuffixes"
    | "boundaryMapApiPathMarkers"
    | "boundaryMapApiNameSuffixes"
    | undefined;

  for (const [index, rawLine] of text.split(/\r?\n/).entries()) {
    const lineNumber = index + 1;
    const line = stripYamlInlineComment(rawLine);
    if (line.trim().length === 0) {
      continue;
    }

    if (/^\s/.test(line)) {
      if (activeListField === undefined) {
        throw new Error(`Line ${lineNumber} in ${overlayPath} is indented without a list field`);
      }
      const trimmed = line.trim();
      if (!trimmed.startsWith("- ")) {
        throw new Error(`Line ${lineNumber} in ${overlayPath} must use '- value' list syntax`);
      }
      const item = parseYamlScalar(trimmed.slice(2), overlayPath, lineNumber);
      if (activeListField === "criteria") {
        const nextValue = overlay.criteria ?? [];
        nextValue.push(parseScanCriterionDefinition(item, overlayPath, lineNumber));
        overlay.criteria = nextValue;
        continue;
      }
      if (activeListField === "requiredOutputs") {
        const nextValue = overlay.requiredOutputs ?? [];
        nextValue.push(parseScanRequiredOutput(item, overlayPath, lineNumber));
        overlay.requiredOutputs = nextValue;
        continue;
      }
      const nextValue = overlay[activeListField] ?? [];
      if (!Array.isArray(nextValue)) {
        throw new Error(`Field ${activeListField} in ${overlayPath} must be a list`);
      }
      nextValue.push(item);
      overlay[activeListField] = nextValue;
      continue;
    }

    activeListField = undefined;
    const separatorIndex = line.indexOf(":");
    if (separatorIndex < 1) {
      throw new Error(`Line ${lineNumber} in ${overlayPath} must use key: value syntax`);
    }
    const key = line.slice(0, separatorIndex).trim();
    const value = line.slice(separatorIndex + 1).trim();
    if (key in overlay) {
      throw new Error(`Field ${key} is defined more than once in ${overlayPath}`);
    }
    switch (key) {
      case "formatVersion": {
        if (value.length === 0) {
          throw new Error(`Field formatVersion in ${overlayPath} must be an inline scalar`);
        }
        const parsed = Number.parseInt(parseYamlScalar(value, overlayPath, lineNumber), 10);
        if (!Number.isInteger(parsed)) {
          throw new Error(`Field formatVersion in ${overlayPath} must be an integer`);
        }
        overlay.formatVersion = parsed as ScanProfileOverlay["formatVersion"];
        break;
      }
      case "name":
        if (value.length === 0) {
          throw new Error(`Field name in ${overlayPath} must be an inline scalar`);
        }
        overlay.name = parseYamlScalar(value, overlayPath, lineNumber);
        break;
      case "description":
        if (value.length === 0) {
          throw new Error(`Field description in ${overlayPath} must be an inline scalar`);
        }
        overlay.description = parseYamlScalar(value, overlayPath, lineNumber);
        break;
      case "profileId":
        if (value.length === 0) {
          throw new Error(`Field profileId in ${overlayPath} must be an inline scalar`);
        }
        overlay.profileId = parseYamlScalar(value, overlayPath, lineNumber);
        break;
      case "instructions":
      case "include":
      case "exclude":
      case "archivePatterns":
      case "legacyPatterns":
      case "generatedPatterns":
      case "sourceTypes":
      case "criteria":
      case "ssotOrder":
      case "requiredOutputs":
      case "boundaryMapRoots":
      case "boundaryMapContractPathMarkers":
      case "boundaryMapContractFileStems":
      case "boundaryMapIgnoredTokens":
      case "boundaryMapTestDirectoryNames":
      case "boundaryMapRoutePathMarkers":
      case "boundaryMapRouteNameSuffixes":
      case "boundaryMapApiPathMarkers":
      case "boundaryMapApiNameSuffixes":
        if (value.length !== 0) {
          throw new Error(`Field ${key} in ${overlayPath} must use indented '- value' items`);
        }
        overlay[key] = [];
        activeListField = key;
        break;
      default:
        throw new Error(`Unknown overlay field ${key} in ${overlayPath}`);
    }
  }

  if (overlay.formatVersion === undefined || overlay.profileId === undefined) {
    throw new Error(`Overlay ${overlayPath} must define formatVersion and profileId`);
  }
  return overlay as ScanProfileOverlay;
}

function parseYamlScalar(value: string, overlayPath: string, lineNumber: number): string {
  const trimmed = value.trim();
  if (trimmed.length === 0) {
    throw new Error(`Line ${lineNumber} in ${overlayPath} contains an empty scalar value`);
  }
  if (
    (trimmed.startsWith('"') && trimmed.endsWith('"') && trimmed.length >= 2) ||
    (trimmed.startsWith("'") && trimmed.endsWith("'") && trimmed.length >= 2)
  ) {
    return trimmed.slice(1, -1);
  }
  return trimmed;
}

function parseScanCriterionDefinition(value: string, overlayPath: string, lineNumber: number): ScanProfile["criteria"][number] {
  const separatorIndex = value.indexOf(":");
  if (separatorIndex < 1 || separatorIndex === value.length - 1) {
    throw new Error(`Line ${lineNumber} in ${overlayPath} criteria entries must use 'criterion-id: description' syntax`);
  }
  return {
    id: value.slice(0, separatorIndex).trim(),
    description: value.slice(separatorIndex + 1).trim(),
  };
}

function parseScanRequiredOutput(value: string, overlayPath: string, lineNumber: number): ScanProfile["requiredOutputs"][number] {
  if (
    value !== "document-inventory" &&
    value !== "concept-map" &&
    value !== "findings" &&
    value !== "coverage-report" &&
    value !== "boundary-map"
  ) {
    throw new Error(`Line ${lineNumber} in ${overlayPath} uses unknown required output: ${value}`);
  }
  return value;
}

function stripYamlInlineComment(value: string): string {
  let inSingleQuote = false;
  let inDoubleQuote = false;
  for (let index = 0; index < value.length; index += 1) {
    const char = value[index] ?? "";
    if (char === "'" && !inDoubleQuote) {
      inSingleQuote = !inSingleQuote;
      continue;
    }
    if (char === '"' && !inSingleQuote) {
      inDoubleQuote = !inDoubleQuote;
      continue;
    }
    if (char === "#" && !inSingleQuote && !inDoubleQuote) {
      return value.slice(0, index).trimEnd();
    }
  }
  return value;
}

function createScanProfileOverlayInvalidError(profile: ScanProfile, overlayPath: string, error: unknown): RuntimeError {
  const message = error instanceof Error ? error.message : "Invalid scan profile overlay";
  return new RuntimeError(`Invalid scan profile overlay at ${overlayPath}: ${message}`, {
    code: "SCAN_PROFILE_OVERLAY_INVALID",
    details: {
      overlayPath,
      profileId: profile.id,
      profileVersion: profile.version,
      guidanceTool: "scan_profile_overlay_help",
    },
  });
}
