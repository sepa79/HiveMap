import { Pool, type PoolClient, type PoolConfig } from "pg";

import {
  validateGraphProposal,
  validateCapturePolicy,
  validateFeedbackEvents,
  type CapturePolicy,
  type FeedbackEvent,
  type GraphProposal,
} from "@hivemap/capture";
import {
  validateCategoryAssignments,
  validateCategoryCatalog,
  type CategoryAssignment,
  type CategoryAssignmentTargetIndex,
  type CategoryCatalog,
} from "@hivemap/categories";
import { validateGraph, type GraphEdge, type GraphNode, type SemanticGraph } from "@hivemap/graph-core";
import { validateProjection, type Projection } from "@hivemap/projections";
import { INITIAL_SCAN_PROFILES, validateScanState, type ScanProfile, type ScanRun } from "@hivemap/scans";
import { POSTGRES_STORAGE_SCHEMA_VERSION, STORAGE_SCHEMA_VERSION } from "./schema.js";

export {
  BundleValidationError,
  HIVEMAP_BUNDLE_FORMAT_VERSION,
  HIVEMAP_LOGICAL_STATE_VERSION,
  createWorkspaceBundle,
  parseWorkspaceBundle,
  readWorkspaceBundle,
  stableJson,
  writeWorkspaceBundle,
  type BundleManifest,
  type WorkspaceBundle,
} from "./bundle.js";
export { POSTGRES_STORAGE_SCHEMA_VERSION, STORAGE_SCHEMA_VERSION } from "./schema.js";

export type WorkspaceRecord = {
  id: string;
  slug?: string;
  name: string;
  archived?: boolean;
  createdAt: string;
  updatedAt?: string;
};

export type WorkspaceState = {
  workspace: WorkspaceRecord;
  graphId: string;
  graph: SemanticGraph;
  categoryCatalog: CategoryCatalog;
  categoryAssignments: CategoryAssignment[];
  capturePolicy: CapturePolicy;
  feedbackEvents: FeedbackEvent[];
  proposals: GraphProposal[];
  projections: Projection[];
  scanProfiles: ScanProfile[];
  scanRuns: ScanRun[];
};

export type ConceptEmbeddingRecord = {
  workspaceId: string;
  nodeId: string;
  model: string;
  contentDigest: string;
  embedding: number[];
  createdAt: string;
  updatedAt: string;
};

export type SimilarConceptMatchRecord = {
  nodeId: string;
  score: number;
  contentDigest: string;
  updatedAt: string;
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
  actor: {
    agentId: string;
    tool: string;
  };
  failure?: {
    code: string;
    message: string;
  };
  stats?: {
    fileCount: number;
    chunkCount: number;
    indexedBytes: number;
  };
};

export type RepositoryFileRecord = {
  workspaceId: string;
  indexId: string;
  path: string;
  language: string;
  sourceKind: string;
  contentHash: string;
  byteSize: number;
};

export type RepositoryChunkRecord = {
  workspaceId: string;
  indexId: string;
  id: string;
  filePath: string;
  language: string;
  sourceKind: string;
  startLine: number;
  endLine: number;
  text: string;
  contentHash: string;
};

export type RepositorySymbolRecord = {
  workspaceId: string;
  indexId: string;
  key: string;
  filePath: string;
  language: string;
  name: string;
  qualifiedName: string;
  kind: string;
  parentSymbolKey?: string;
  startLine: number;
  startColumn: number;
  endLine: number;
  endColumn: number;
  isExported: boolean;
  isPublic: boolean;
  producerTool: string;
  producerVersion: string;
};

export type RepositorySearchMatchRecord = {
  kind: "file" | "chunk";
  filePath: string;
  language: string;
  sourceKind: string;
  score: number;
  snippet: string;
  startLine?: number;
  endLine?: number;
};

export class StorageError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "StorageError";
  }
}

export interface HiveMapStore {
  initialize(): Promise<void>;
  close(): Promise<void>;
  listWorkspaces(): Promise<WorkspaceRecord[]>;
  getWorkspaceRecord(workspaceId: string): Promise<WorkspaceRecord>;
  workspaceExists(workspaceId: string): Promise<boolean>;
  deleteWorkspace(workspaceId: string): Promise<void>;
  saveWorkspaceState(state: WorkspaceState): Promise<void>;
  replaceWorkspaceState(state: WorkspaceState): Promise<void>;
  loadWorkspaceState(workspaceId: string): Promise<WorkspaceState>;
  upsertConceptEmbedding(record: ConceptEmbeddingRecord): Promise<void>;
  getConceptEmbedding(workspaceId: string, nodeId: string, model: string): Promise<ConceptEmbeddingRecord | undefined>;
  listSimilarConceptEmbeddings(
    workspaceId: string,
    nodeId: string,
    model: string,
    limit: number,
  ): Promise<SimilarConceptMatchRecord[]>;
  listRepositoryIndexes(workspaceId: string): Promise<RepositoryIndexRecord[]>;
  getRepositoryIndex(workspaceId: string, indexId: string): Promise<RepositoryIndexRecord>;
  upsertRepositoryIndex(record: RepositoryIndexRecord): Promise<void>;
  listRepositoryIndexFiles(workspaceId: string, indexId: string): Promise<RepositoryFileRecord[]>;
  listRepositoryIndexChunks(workspaceId: string, indexId: string): Promise<RepositoryChunkRecord[]>;
  listRepositoryIndexSymbols(workspaceId: string, indexId: string): Promise<RepositorySymbolRecord[]>;
  replaceRepositoryIndexContents(
    workspaceId: string,
    indexId: string,
    files: RepositoryFileRecord[],
    chunks: RepositoryChunkRecord[],
    symbols?: RepositorySymbolRecord[],
  ): Promise<void>;
  searchRepositoryIndex(workspaceId: string, indexId: string, query: string, limit: number): Promise<RepositorySearchMatchRecord[]>;
}

export type HiveMapStoreRuntimeConfig = { backend: "postgres"; connectionString: string };

export function openHiveMapStore(config: HiveMapStoreRuntimeConfig): HiveMapStore {
  return PostgresHiveMapStore.open(config.connectionString);
}

type NullableString = string | null;

type NodeRow = {
  id: string;
  label: string;
  type: GraphNode["type"];
  notes: NullableString;
  metadata_json: NullableString;
};

type EdgeRow = {
  id: string;
  from_id: string;
  to_id: string;
  relation: string;
  label: NullableString;
  notes: NullableString;
  metadata_json: NullableString;
};

type CategoryAssignmentRow = Omit<CategoryAssignment, "notes"> & { notes: NullableString };

type ConceptEmbeddingRow = {
  workspace_id: string;
  node_id: string;
  model: string;
  content_digest: string;
  embedding_text: string;
  created_at: string;
  updated_at: string;
};

type RepositoryIndexRow = {
  workspace_id: string;
  id: string;
  repository_url: string;
  requested_ref: NullableString;
  resolved_commit: NullableString;
  mode: RepositoryIndexMode;
  stage: RepositoryIndexStage;
  requested_at: string;
  updated_at: string;
  completed_at: NullableString;
  actor_agent_id: string;
  actor_tool: string;
  failure_code: NullableString;
  failure_message: NullableString;
  stats_file_count: number | null;
  stats_chunk_count: number | null;
  stats_indexed_bytes: number | null;
};

type RepositoryFileRow = {
  workspace_id: string;
  index_id: string;
  path: string;
  language: string;
  source_kind: string;
  content_hash: string;
  byte_size: string | number;
};

type RepositoryChunkRow = {
  workspace_id: string;
  index_id: string;
  id: string;
  file_path: string;
  language: string;
  source_kind: string;
  start_line: number;
  end_line: number;
  text: string;
  content_hash: string;
};

type RepositorySymbolRow = {
  workspace_id: string;
  index_id: string;
  key: string;
  file_path: string;
  language: string;
  name: string;
  qualified_name: string;
  kind: string;
  parent_symbol_key: NullableString;
  start_line: number;
  start_column: number;
  end_line: number;
  end_column: number;
  is_exported: boolean;
  is_public: boolean;
  producer_tool: string;
  producer_version: string;
};

export class InMemoryHiveMapStore implements HiveMapStore {
  private readonly workspaces = new Map<string, WorkspaceState>();
  private readonly conceptEmbeddings = new Map<string, ConceptEmbeddingRecord>();
  private readonly repositoryIndexes = new Map<string, RepositoryIndexRecord>();
  private readonly repositoryFiles = new Map<string, RepositoryFileRecord[]>();
  private readonly repositoryChunks = new Map<string, RepositoryChunkRecord[]>();
  private readonly repositorySymbols = new Map<string, RepositorySymbolRecord[]>();

  async initialize(): Promise<void> {}

  async close(): Promise<void> {}

  async listWorkspaces(): Promise<WorkspaceRecord[]> {
    return [...this.workspaces.values()]
      .map((state) => cloneWorkspaceRecord(state.workspace))
      .sort(compareWorkspaceRecords);
  }

  async getWorkspaceRecord(workspaceId: string): Promise<WorkspaceRecord> {
    assertNonEmpty("workspaceId", workspaceId);
    const state = this.workspaces.get(workspaceId);
    if (state === undefined) {
      throw new StorageError(`Workspace not found: ${workspaceId}`);
    }
    return cloneWorkspaceRecord(state.workspace);
  }

  async workspaceExists(workspaceId: string): Promise<boolean> {
    assertNonEmpty("workspaceId", workspaceId);
    return this.workspaces.has(workspaceId);
  }

  async deleteWorkspace(workspaceId: string): Promise<void> {
    assertNonEmpty("workspaceId", workspaceId);
    if (!this.workspaces.delete(workspaceId)) {
      throw new StorageError(`Workspace not found: ${workspaceId}`);
    }
    this.deleteRepositoryIndexData(workspaceId);
  }

  async saveWorkspaceState(state: WorkspaceState): Promise<void> {
    validateWorkspaceState(state);
    this.workspaces.set(state.workspace.id, cloneWorkspaceState(state));
    this.pruneConceptEmbeddings(state);
  }

  async replaceWorkspaceState(state: WorkspaceState): Promise<void> {
    validateWorkspaceState(state);
    if (!this.workspaces.has(state.workspace.id)) {
      throw new StorageError(`Workspace not found for replacement: ${state.workspace.id}`);
    }
    this.deleteRepositoryIndexData(state.workspace.id);
    this.workspaces.set(state.workspace.id, cloneWorkspaceState(state));
    this.pruneConceptEmbeddings(state);
  }

  async loadWorkspaceState(workspaceId: string): Promise<WorkspaceState> {
    assertNonEmpty("workspaceId", workspaceId);
    const state = this.workspaces.get(workspaceId);
    if (state === undefined) {
      throw new StorageError(`Workspace not found: ${workspaceId}`);
    }
    return cloneWorkspaceState(state);
  }

  async upsertConceptEmbedding(record: ConceptEmbeddingRecord): Promise<void> {
    validateConceptEmbeddingRecord(record);
    this.conceptEmbeddings.set(conceptEmbeddingKey(record.workspaceId, record.nodeId, record.model), cloneConceptEmbeddingRecord(record));
  }

  async getConceptEmbedding(workspaceId: string, nodeId: string, model: string): Promise<ConceptEmbeddingRecord | undefined> {
    assertNonEmpty("workspaceId", workspaceId);
    assertNonEmpty("nodeId", nodeId);
    assertNonEmpty("model", model);
    const record = this.conceptEmbeddings.get(conceptEmbeddingKey(workspaceId, nodeId, model));
    return record === undefined ? undefined : cloneConceptEmbeddingRecord(record);
  }

  async listSimilarConceptEmbeddings(
    workspaceId: string,
    nodeId: string,
    model: string,
    limit: number,
  ): Promise<SimilarConceptMatchRecord[]> {
    assertNonEmpty("workspaceId", workspaceId);
    assertNonEmpty("nodeId", nodeId);
    assertNonEmpty("model", model);
    if (!Number.isInteger(limit) || limit < 1) {
      throw new StorageError("limit must be a positive integer");
    }

    const source = this.conceptEmbeddings.get(conceptEmbeddingKey(workspaceId, nodeId, model));
    if (source === undefined) {
      return [];
    }

    return [...this.conceptEmbeddings.values()]
      .filter((candidate) => candidate.workspaceId === workspaceId && candidate.model === model && candidate.nodeId !== nodeId)
      .map((candidate) => ({
        nodeId: candidate.nodeId,
        score: cosineSimilarity(source.embedding, candidate.embedding),
        contentDigest: candidate.contentDigest,
        updatedAt: candidate.updatedAt,
      }))
      .sort((left, right) => right.score - left.score || left.nodeId.localeCompare(right.nodeId))
      .slice(0, limit)
      .map((match) => ({ ...match }));
  }

  async listRepositoryIndexes(workspaceId: string): Promise<RepositoryIndexRecord[]> {
    assertNonEmpty("workspaceId", workspaceId);
    return [...this.repositoryIndexes.values()]
      .filter((record) => record.workspaceId === workspaceId)
      .sort(compareRepositoryIndexRecords)
      .map((record) => cloneRepositoryIndexRecord(record));
  }

  async getRepositoryIndex(workspaceId: string, indexId: string): Promise<RepositoryIndexRecord> {
    assertNonEmpty("workspaceId", workspaceId);
    assertNonEmpty("indexId", indexId);
    const record = this.repositoryIndexes.get(repositoryIndexKey(workspaceId, indexId));
    if (record === undefined) {
      throw new StorageError(`Repository index not found: ${workspaceId}/${indexId}`);
    }
    return cloneRepositoryIndexRecord(record);
  }

  async upsertRepositoryIndex(record: RepositoryIndexRecord): Promise<void> {
    validateRepositoryIndexRecord(record);
    if (!this.workspaces.has(record.workspaceId)) {
      throw new StorageError(`Workspace not found: ${record.workspaceId}`);
    }
    this.repositoryIndexes.set(repositoryIndexKey(record.workspaceId, record.id), cloneRepositoryIndexRecord(record));
  }

  async listRepositoryIndexFiles(workspaceId: string, indexId: string): Promise<RepositoryFileRecord[]> {
    assertNonEmpty("workspaceId", workspaceId);
    assertNonEmpty("indexId", indexId);
    const key = repositoryIndexKey(workspaceId, indexId);
    if (!this.repositoryIndexes.has(key)) {
      throw new StorageError(`Repository index not found: ${workspaceId}/${indexId}`);
    }
    return structuredClone(this.repositoryFiles.get(key) ?? []);
  }

  async listRepositoryIndexChunks(workspaceId: string, indexId: string): Promise<RepositoryChunkRecord[]> {
    assertNonEmpty("workspaceId", workspaceId);
    assertNonEmpty("indexId", indexId);
    const key = repositoryIndexKey(workspaceId, indexId);
    if (!this.repositoryIndexes.has(key)) {
      throw new StorageError(`Repository index not found: ${workspaceId}/${indexId}`);
    }
    return structuredClone(this.repositoryChunks.get(key) ?? []);
  }

  async listRepositoryIndexSymbols(workspaceId: string, indexId: string): Promise<RepositorySymbolRecord[]> {
    assertNonEmpty("workspaceId", workspaceId);
    assertNonEmpty("indexId", indexId);
    const key = repositoryIndexKey(workspaceId, indexId);
    if (!this.repositoryIndexes.has(key)) {
      throw new StorageError(`Repository index not found: ${workspaceId}/${indexId}`);
    }
    return structuredClone(this.repositorySymbols.get(key) ?? []);
  }

  async replaceRepositoryIndexContents(
    workspaceId: string,
    indexId: string,
    files: RepositoryFileRecord[],
    chunks: RepositoryChunkRecord[],
    symbols: RepositorySymbolRecord[] = [],
  ): Promise<void> {
    assertNonEmpty("workspaceId", workspaceId);
    assertNonEmpty("indexId", indexId);
    if (!this.workspaces.has(workspaceId)) {
      throw new StorageError(`Workspace not found: ${workspaceId}`);
    }
    const key = repositoryIndexKey(workspaceId, indexId);
    if (!this.repositoryIndexes.has(key)) {
      throw new StorageError(`Repository index not found: ${workspaceId}/${indexId}`);
    }
    for (const file of files) {
      validateRepositoryFileRecord(file);
      assertRepositoryIndexContentOwnership("repository file", workspaceId, indexId, file.workspaceId, file.indexId);
    }
    for (const chunk of chunks) {
      validateRepositoryChunkRecord(chunk);
      assertRepositoryIndexContentOwnership("repository chunk", workspaceId, indexId, chunk.workspaceId, chunk.indexId);
    }
    for (const symbol of symbols) {
      validateRepositorySymbolRecord(symbol);
      assertRepositoryIndexContentOwnership("repository symbol", workspaceId, indexId, symbol.workspaceId, symbol.indexId);
    }
    this.repositoryFiles.set(key, structuredClone(files));
    this.repositoryChunks.set(key, structuredClone(chunks));
    this.repositorySymbols.set(key, structuredClone(symbols));
  }

  async searchRepositoryIndex(workspaceId: string, indexId: string, query: string, limit: number): Promise<RepositorySearchMatchRecord[]> {
    assertNonEmpty("workspaceId", workspaceId);
    assertNonEmpty("indexId", indexId);
    assertNonEmpty("query", query);
    if (!Number.isInteger(limit) || limit < 1) {
      throw new StorageError("limit must be a positive integer");
    }
    const key = repositoryIndexKey(workspaceId, indexId);
    if (!this.repositoryIndexes.has(key)) {
      throw new StorageError(`Repository index not found: ${workspaceId}/${indexId}`);
    }

    const normalizedTerms = tokenizeSearchQuery(query);
    const fileMatches = (this.repositoryFiles.get(key) ?? [])
      .map((file) => {
        const haystack = `${file.path}\n${file.language}\n${file.sourceKind}`.toLocaleLowerCase();
        const score = scoreTextMatch(haystack, normalizedTerms);
        if (score === 0) {
          return undefined;
        }
        return {
          kind: "file" as const,
          filePath: file.path,
          language: file.language,
          sourceKind: file.sourceKind,
          score,
          snippet: file.path,
        };
      })
      .filter(isDefined);

    const chunkMatches = (this.repositoryChunks.get(key) ?? [])
      .map((chunk) => {
        const haystack = `${chunk.filePath}\n${chunk.text}`.toLocaleLowerCase();
        const score = scoreTextMatch(haystack, normalizedTerms);
        if (score === 0) {
          return undefined;
        }
        return {
          kind: "chunk" as const,
          filePath: chunk.filePath,
          language: chunk.language,
          sourceKind: chunk.sourceKind,
          score,
          snippet: trimSnippet(chunk.text, normalizedTerms),
          startLine: chunk.startLine,
          endLine: chunk.endLine,
        };
      })
      .filter(isDefined);

    return [...chunkMatches, ...fileMatches]
      .sort((left, right) => right.score - left.score || left.filePath.localeCompare(right.filePath))
      .slice(0, limit)
      .map((match) => ({ ...match }));
  }

  private pruneConceptEmbeddings(state: WorkspaceState): void {
    const validNodeIds = new Set(state.graph.nodes.filter((node) => node.type === "concept").map((node) => node.id));
    for (const [key, record] of this.conceptEmbeddings.entries()) {
      if (record.workspaceId === state.workspace.id && !validNodeIds.has(record.nodeId)) {
        this.conceptEmbeddings.delete(key);
      }
    }
  }

  private deleteRepositoryIndexData(workspaceId: string): void {
    for (const key of [...this.repositoryIndexes.keys()]) {
      if (key.startsWith(`${workspaceId}\u0000`)) {
        this.repositoryIndexes.delete(key);
        this.repositoryFiles.delete(key);
        this.repositoryChunks.delete(key);
        this.repositorySymbols.delete(key);
      }
    }
  }
}

export class PostgresHiveMapStore implements HiveMapStore {
  private readonly pool: Pool;

  constructor(pool: Pool) {
    this.pool = pool;
  }

  static open(connectionString: string): PostgresHiveMapStore {
    assertNonEmpty("connectionString", connectionString);
    return new PostgresHiveMapStore(new Pool({ connectionString }));
  }

  static fromConfig(config: PoolConfig): PostgresHiveMapStore {
    return new PostgresHiveMapStore(new Pool(config));
  }

  async initialize(): Promise<void> {
    await this.withClient(async (client) => {
      await client.query(POSTGRES_SCHEMA_SQL);
      const result = await client.query<{ value: string }>("SELECT value FROM schema_metadata WHERE key = 'schema_version'");
      if (result.rowCount === 0) {
        await client.query("INSERT INTO schema_metadata (key, value) VALUES ('schema_version', $1)", [
          POSTGRES_STORAGE_SCHEMA_VERSION,
        ]);
        return;
      }

      let schemaVersion = result.rows[0]?.value;
      if (schemaVersion === "5") {
        await client.query(POSTGRES_V5_TO_V6_SQL);
        schemaVersion = "6";
      }

      if (schemaVersion === "6") {
        await client.query(POSTGRES_V6_TO_V7_SQL);
        schemaVersion = "7";
      }

      if (schemaVersion === "7") {
        await client.query(POSTGRES_V7_TO_V8_SQL);
        schemaVersion = "8";
      }

      if (schemaVersion === "8") {
        await client.query(POSTGRES_V8_TO_V9_SQL);
        schemaVersion = "9";
      }

      if (schemaVersion === "9") {
        await client.query(POSTGRES_V9_TO_V10_SQL);
        schemaVersion = "10";
      }

      if (schemaVersion !== POSTGRES_STORAGE_SCHEMA_VERSION) {
        throw new StorageError(`Unsupported Postgres storage schema version: ${schemaVersion}`);
      }

      const updateResult = await client.query("UPDATE schema_metadata SET value = $1 WHERE key = 'schema_version'", [
        POSTGRES_STORAGE_SCHEMA_VERSION,
      ]);
      if (updateResult.rowCount !== 1) {
        throw new StorageError("Failed to update Postgres storage schema version");
      }
    });
  }

  async close(): Promise<void> {
    await this.pool.end();
  }

  async listWorkspaces(): Promise<WorkspaceRecord[]> {
    const result = await this.pool.query<{
      id: string;
      slug: NullableString;
      name: string;
      archived: boolean;
      created_at: string;
      updated_at: NullableString;
    }>("SELECT id, slug, name, archived, created_at::text AS created_at, updated_at::text AS updated_at FROM workspaces ORDER BY name, id");
    return result.rows.map((row) => normalizeWorkspaceRecordTimestamps(rowToWorkspaceRecord(row)));
  }

  async getWorkspaceRecord(workspaceId: string): Promise<WorkspaceRecord> {
    assertNonEmpty("workspaceId", workspaceId);
    return this.withClient((client) => this.loadWorkspaceRecord(client, workspaceId));
  }

  async workspaceExists(workspaceId: string): Promise<boolean> {
    assertNonEmpty("workspaceId", workspaceId);
    const result = await this.pool.query("SELECT 1 AS found FROM workspaces WHERE id = $1", [workspaceId]);
    return result.rowCount === 1;
  }

  async deleteWorkspace(workspaceId: string): Promise<void> {
    assertNonEmpty("workspaceId", workspaceId);
    const result = await this.pool.query("DELETE FROM workspaces WHERE id = $1", [workspaceId]);
    if (result.rowCount !== 1) {
      throw new StorageError(`Workspace not found: ${workspaceId}`);
    }
  }

  async saveWorkspaceState(state: WorkspaceState): Promise<void> {
    validateWorkspaceState(state);
    await this.withTransaction(async (client) => {
      await this.upsertWorkspaceRecord(client, state.workspace);
      await client.query("SELECT id FROM workspaces WHERE id = $1 FOR UPDATE", [state.workspace.id]);
      await this.clearWorkspaceState(client, state.workspace.id);
      await this.insertWorkspaceState(client, state);
      await this.bumpRevision(client, state.workspace.id);
    });
  }

  async replaceWorkspaceState(state: WorkspaceState): Promise<void> {
    validateWorkspaceState(state);
    await this.withTransaction(async (client) => {
      const locked = await client.query("SELECT id FROM workspaces WHERE id = $1 FOR UPDATE", [state.workspace.id]);
      if (locked.rowCount !== 1) {
        throw new StorageError(`Workspace not found for replacement: ${state.workspace.id}`);
      }
      await client.query("DELETE FROM workspaces WHERE id = $1", [state.workspace.id]);
      await this.insertWorkspaceRecord(client, state.workspace);
      await this.insertWorkspaceState(client, state);
      await this.bumpRevision(client, state.workspace.id);
    });
  }

  async loadWorkspaceState(workspaceId: string): Promise<WorkspaceState> {
    assertNonEmpty("workspaceId", workspaceId);
    return this.withClient(async (client) => {
      const workspace = await this.loadWorkspaceRecord(client, workspaceId);
      const graphId = await this.loadGraphId(client, workspaceId);
      const graph = await this.loadGraph(client, graphId);
      const categoryCatalog = await this.loadCategoryCatalog(client, workspaceId);
      const projections = await this.loadProjections(client, workspaceId, graph);
      const state: WorkspaceState = {
        workspace,
        graphId,
        graph,
        categoryCatalog,
        categoryAssignments: await this.loadCategoryAssignments(client, workspaceId),
        capturePolicy: await this.loadCapturePolicy(client, workspaceId),
        feedbackEvents: await this.loadFeedbackEvents(client, workspaceId),
        proposals: await this.loadProposals(client, workspaceId),
        projections,
        scanProfiles: await this.loadScanProfiles(client, workspaceId),
        scanRuns: await this.loadScanRuns(client, workspaceId),
      };
      validateWorkspaceState(state);
      return state;
    });
  }

  private async withClient<T>(operation: (client: PoolClient) => Promise<T>): Promise<T> {
    const client = await this.pool.connect();
    try {
      return await operation(client);
    } finally {
      client.release();
    }
  }

  private async withTransaction<T>(operation: (client: PoolClient) => Promise<T>): Promise<T> {
    return this.withClient(async (client) => {
      await client.query("BEGIN");
      try {
        const result = await operation(client);
        await client.query("COMMIT");
        return result;
      } catch (error) {
        await client.query("ROLLBACK");
        throw error;
      }
    });
  }

  private async insertWorkspaceRecord(client: PoolClient, workspace: WorkspaceRecord): Promise<void> {
    await client.query(
      "INSERT INTO workspaces (id, slug, name, archived, created_at, updated_at) VALUES ($1, $2, $3, $4, $5, $6)",
      [
        workspace.id,
        workspace.slug ?? null,
        workspace.name,
        workspace.archived === true,
        workspace.createdAt,
        workspace.updatedAt ?? null,
      ],
    );
  }

  private async upsertWorkspaceRecord(client: PoolClient, workspace: WorkspaceRecord): Promise<void> {
    await client.query(
      "INSERT INTO workspaces (id, slug, name, archived, created_at, updated_at) VALUES ($1, $2, $3, $4, $5, $6) " +
        "ON CONFLICT (id) DO UPDATE SET slug = excluded.slug, name = excluded.name, archived = excluded.archived, created_at = excluded.created_at, updated_at = excluded.updated_at",
      [
        workspace.id,
        workspace.slug ?? null,
        workspace.name,
        workspace.archived === true,
        workspace.createdAt,
        workspace.updatedAt ?? null,
      ],
    );
  }

  private async clearWorkspaceState(client: PoolClient, workspaceId: string): Promise<void> {
    await client.query("DELETE FROM feedback_events WHERE workspace_id = $1", [workspaceId]);
    await client.query("DELETE FROM category_assignments WHERE workspace_id = $1", [workspaceId]);
    await client.query("DELETE FROM scan_runs WHERE workspace_id = $1", [workspaceId]);
    await client.query("DELETE FROM scan_profiles WHERE workspace_id = $1", [workspaceId]);
    await client.query("DELETE FROM projections WHERE workspace_id = $1", [workspaceId]);
    await client.query("DELETE FROM proposals WHERE workspace_id = $1", [workspaceId]);
    await client.query("DELETE FROM capture_policies WHERE workspace_id = $1", [workspaceId]);
    await client.query("DELETE FROM categories WHERE workspace_id = $1", [workspaceId]);
    await client.query("DELETE FROM graphs WHERE workspace_id = $1", [workspaceId]);
  }

  private async insertWorkspaceState(client: PoolClient, state: WorkspaceState): Promise<void> {
    await this.replaceGraph(client, state.graphId, state.workspace.id, state.graph);
    await this.pruneConceptEmbeddings(client, state.workspace.id, state.graph);
    await this.replaceCategoryCatalog(client, state.workspace.id, state.categoryCatalog);
    await this.insertCategoryAssignments(client, state.workspace.id, state.categoryAssignments);
    await this.replaceCapturePolicy(client, state.workspace.id, state.capturePolicy);
    await this.replaceProposals(client, state.workspace.id, state.proposals);
    await this.replaceProjections(client, state.workspace.id, state.projections);
    await this.replaceFeedbackEvents(client, state.workspace.id, state.feedbackEvents);
    await this.replaceScanProfiles(client, state.workspace.id, state.scanProfiles);
    await this.replaceScanRuns(client, state.workspace.id, state.scanRuns);
  }

  private async bumpRevision(client: PoolClient, workspaceId: string): Promise<void> {
    await client.query("UPDATE workspaces SET revision = revision + 1 WHERE id = $1", [workspaceId]);
  }

  async upsertConceptEmbedding(record: ConceptEmbeddingRecord): Promise<void> {
    validateConceptEmbeddingRecord(record);
    await this.pool.query(
      "INSERT INTO node_embeddings (workspace_id, node_id, model, content_digest, embedding, created_at, updated_at) VALUES ($1, $2, $3, $4, $5::vector, $6, $7) " +
        "ON CONFLICT (workspace_id, node_id, model) DO UPDATE SET content_digest = excluded.content_digest, embedding = excluded.embedding, updated_at = excluded.updated_at",
      [
        record.workspaceId,
        record.nodeId,
        record.model,
        record.contentDigest,
        serializeVector(record.embedding),
        record.createdAt,
        record.updatedAt,
      ],
    );
  }

  async getConceptEmbedding(workspaceId: string, nodeId: string, model: string): Promise<ConceptEmbeddingRecord | undefined> {
    assertNonEmpty("workspaceId", workspaceId);
    assertNonEmpty("nodeId", nodeId);
    assertNonEmpty("model", model);
    const result = await this.pool.query<ConceptEmbeddingRow>(
      "SELECT workspace_id, node_id, model, content_digest, embedding::text AS embedding_text, created_at::text AS created_at, updated_at::text AS updated_at " +
        "FROM node_embeddings WHERE workspace_id = $1 AND node_id = $2 AND model = $3",
      [workspaceId, nodeId, model],
    );
    const row = result.rows[0];
    return row === undefined ? undefined : rowToConceptEmbeddingRecord(row);
  }

  async listRepositoryIndexes(workspaceId: string): Promise<RepositoryIndexRecord[]> {
    assertNonEmpty("workspaceId", workspaceId);
    const result = await this.pool.query<RepositoryIndexRow>(
      "SELECT workspace_id, id, repository_url, requested_ref, resolved_commit, mode, stage, requested_at::text AS requested_at, updated_at::text AS updated_at, completed_at::text AS completed_at, actor_agent_id, actor_tool, failure_code, failure_message, stats_file_count, stats_chunk_count, stats_indexed_bytes " +
        "FROM repository_indexes WHERE workspace_id = $1 ORDER BY requested_at DESC, id ASC",
      [workspaceId],
    );
    return result.rows.map((row) => rowToRepositoryIndexRecord(row));
  }

  async getRepositoryIndex(workspaceId: string, indexId: string): Promise<RepositoryIndexRecord> {
    assertNonEmpty("workspaceId", workspaceId);
    assertNonEmpty("indexId", indexId);
    const result = await this.pool.query<RepositoryIndexRow>(
      "SELECT workspace_id, id, repository_url, requested_ref, resolved_commit, mode, stage, requested_at::text AS requested_at, updated_at::text AS updated_at, completed_at::text AS completed_at, actor_agent_id, actor_tool, failure_code, failure_message, stats_file_count, stats_chunk_count, stats_indexed_bytes " +
        "FROM repository_indexes WHERE workspace_id = $1 AND id = $2",
      [workspaceId, indexId],
    );
    const row = result.rows[0];
    if (row === undefined) {
      throw new StorageError(`Repository index not found: ${workspaceId}/${indexId}`);
    }
    return rowToRepositoryIndexRecord(row);
  }

  async upsertRepositoryIndex(record: RepositoryIndexRecord): Promise<void> {
    validateRepositoryIndexRecord(record);
    await this.pool.query(
      "INSERT INTO repository_indexes (workspace_id, id, repository_url, requested_ref, resolved_commit, mode, stage, requested_at, updated_at, completed_at, actor_agent_id, actor_tool, failure_code, failure_message, stats_file_count, stats_chunk_count, stats_indexed_bytes) " +
        "VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17) " +
        "ON CONFLICT (workspace_id, id) DO UPDATE SET repository_url = excluded.repository_url, requested_ref = excluded.requested_ref, resolved_commit = excluded.resolved_commit, mode = excluded.mode, stage = excluded.stage, requested_at = excluded.requested_at, updated_at = excluded.updated_at, completed_at = excluded.completed_at, actor_agent_id = excluded.actor_agent_id, actor_tool = excluded.actor_tool, failure_code = excluded.failure_code, failure_message = excluded.failure_message, stats_file_count = excluded.stats_file_count, stats_chunk_count = excluded.stats_chunk_count, stats_indexed_bytes = excluded.stats_indexed_bytes",
      [
        record.workspaceId,
        record.id,
        record.repositoryUrl,
        record.requestedRef ?? null,
        record.resolvedCommit ?? null,
        record.mode,
        record.stage,
        record.requestedAt,
        record.updatedAt,
        record.completedAt ?? null,
        record.actor.agentId,
        record.actor.tool,
        record.failure?.code ?? null,
        record.failure?.message ?? null,
        record.stats?.fileCount ?? null,
        record.stats?.chunkCount ?? null,
        record.stats?.indexedBytes ?? null,
      ],
    );
  }

  async listRepositoryIndexFiles(workspaceId: string, indexId: string): Promise<RepositoryFileRecord[]> {
    assertNonEmpty("workspaceId", workspaceId);
    assertNonEmpty("indexId", indexId);
    const result = await this.pool.query<RepositoryFileRow>(
      "SELECT workspace_id, index_id, path, language, source_kind, content_hash, byte_size FROM repository_files WHERE workspace_id = $1 AND index_id = $2 ORDER BY ordinal",
      [workspaceId, indexId],
    );
    return result.rows.map((row) => rowToRepositoryFileRecord(row));
  }

  async listRepositoryIndexChunks(workspaceId: string, indexId: string): Promise<RepositoryChunkRecord[]> {
    assertNonEmpty("workspaceId", workspaceId);
    assertNonEmpty("indexId", indexId);
    const result = await this.pool.query<RepositoryChunkRow>(
      "SELECT workspace_id, index_id, id, file_path, language, source_kind, start_line, end_line, text, content_hash FROM repository_chunks WHERE workspace_id = $1 AND index_id = $2 ORDER BY ordinal",
      [workspaceId, indexId],
    );
    return result.rows.map((row) => rowToRepositoryChunkRecord(row));
  }

  async listRepositoryIndexSymbols(workspaceId: string, indexId: string): Promise<RepositorySymbolRecord[]> {
    assertNonEmpty("workspaceId", workspaceId);
    assertNonEmpty("indexId", indexId);
    const result = await this.pool.query<RepositorySymbolRow>(
      "SELECT workspace_id, index_id, key, file_path, language, name, qualified_name, kind, parent_symbol_key, start_line, start_column, end_line, end_column, is_exported, is_public, producer_tool, producer_version " +
        "FROM repository_symbols WHERE workspace_id = $1 AND index_id = $2 ORDER BY ordinal",
      [workspaceId, indexId],
    );
    return result.rows.map((row) => rowToRepositorySymbolRecord(row));
  }

  async replaceRepositoryIndexContents(
    workspaceId: string,
    indexId: string,
    files: RepositoryFileRecord[],
    chunks: RepositoryChunkRecord[],
    symbols: RepositorySymbolRecord[] = [],
  ): Promise<void> {
    assertNonEmpty("workspaceId", workspaceId);
    assertNonEmpty("indexId", indexId);
    for (const file of files) {
      validateRepositoryFileRecord(file);
      assertRepositoryIndexContentOwnership("repository file", workspaceId, indexId, file.workspaceId, file.indexId);
    }
    for (const chunk of chunks) {
      validateRepositoryChunkRecord(chunk);
      assertRepositoryIndexContentOwnership("repository chunk", workspaceId, indexId, chunk.workspaceId, chunk.indexId);
    }
    for (const symbol of symbols) {
      validateRepositorySymbolRecord(symbol);
      assertRepositoryIndexContentOwnership("repository symbol", workspaceId, indexId, symbol.workspaceId, symbol.indexId);
    }
    await this.withTransaction(async (client) => {
      const existing = await client.query("SELECT 1 FROM repository_indexes WHERE workspace_id = $1 AND id = $2 FOR UPDATE", [workspaceId, indexId]);
      if (existing.rowCount !== 1) {
        throw new StorageError(`Repository index not found: ${workspaceId}/${indexId}`);
      }
      await client.query("DELETE FROM repository_symbols WHERE workspace_id = $1 AND index_id = $2", [workspaceId, indexId]);
      await client.query("DELETE FROM repository_chunks WHERE workspace_id = $1 AND index_id = $2", [workspaceId, indexId]);
      await client.query("DELETE FROM repository_files WHERE workspace_id = $1 AND index_id = $2", [workspaceId, indexId]);

      let ordinal = 0;
      for (const file of files) {
        await client.query(
          "INSERT INTO repository_files (workspace_id, index_id, path, ordinal, language, source_kind, content_hash, byte_size) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)",
          [file.workspaceId, file.indexId, file.path, ordinal, file.language, file.sourceKind, file.contentHash, file.byteSize],
        );
        ordinal += 1;
      }

      ordinal = 0;
      for (const chunk of chunks) {
        await client.query(
          "INSERT INTO repository_chunks (workspace_id, index_id, id, ordinal, file_path, language, source_kind, start_line, end_line, text, content_hash) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)",
          [
            chunk.workspaceId,
            chunk.indexId,
            chunk.id,
            ordinal,
            chunk.filePath,
            chunk.language,
            chunk.sourceKind,
            chunk.startLine,
            chunk.endLine,
            chunk.text,
            chunk.contentHash,
          ],
        );
        ordinal += 1;
      }

      ordinal = 0;
      for (const symbol of symbols) {
        await client.query(
          "INSERT INTO repository_symbols (workspace_id, index_id, key, ordinal, file_path, language, name, qualified_name, kind, parent_symbol_key, start_line, start_column, end_line, end_column, is_exported, is_public, producer_tool, producer_version) " +
            "VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18)",
          [
            symbol.workspaceId,
            symbol.indexId,
            symbol.key,
            ordinal,
            symbol.filePath,
            symbol.language,
            symbol.name,
            symbol.qualifiedName,
            symbol.kind,
            symbol.parentSymbolKey ?? null,
            symbol.startLine,
            symbol.startColumn,
            symbol.endLine,
            symbol.endColumn,
            symbol.isExported,
            symbol.isPublic,
            symbol.producerTool,
            symbol.producerVersion,
          ],
        );
        ordinal += 1;
      }
    });
  }

  async searchRepositoryIndex(workspaceId: string, indexId: string, query: string, limit: number): Promise<RepositorySearchMatchRecord[]> {
    assertNonEmpty("workspaceId", workspaceId);
    assertNonEmpty("indexId", indexId);
    assertNonEmpty("query", query);
    if (!Number.isInteger(limit) || limit < 1) {
      throw new StorageError("limit must be a positive integer");
    }

    const result = await this.pool.query<{
      kind: "file" | "chunk";
      file_path: string;
      language: string;
      source_kind: string;
      score: number;
      snippet: string;
      start_line: number | null;
      end_line: number | null;
    }>(
      "WITH search_query AS (SELECT websearch_to_tsquery('simple', $3) AS q) " +
        "SELECT kind, file_path, language, source_kind, score, snippet, start_line, end_line FROM (" +
        "SELECT 'chunk'::text AS kind, c.file_path, c.language, c.source_kind, " +
        "  (ts_rank_cd(to_tsvector('simple', c.text), sq.q) + CASE WHEN c.file_path ILIKE '%' || $3 || '%' THEN 0.25 ELSE 0 END) AS score, " +
        "  left(c.text, 280) AS snippet, c.start_line, c.end_line " +
        "FROM repository_chunks c CROSS JOIN search_query sq " +
        "WHERE c.workspace_id = $1 AND c.index_id = $2 AND (to_tsvector('simple', c.text) @@ sq.q OR c.file_path ILIKE '%' || $3 || '%') " +
        "UNION ALL " +
        "SELECT 'file'::text AS kind, f.path AS file_path, f.language, f.source_kind, " +
        "  CASE WHEN f.path ILIKE '%' || $3 || '%' THEN 0.5 ELSE 0.1 END AS score, " +
        "  f.path AS snippet, NULL::integer AS start_line, NULL::integer AS end_line " +
        "FROM repository_files f CROSS JOIN search_query sq " +
        "WHERE f.workspace_id = $1 AND f.index_id = $2 AND (f.path ILIKE '%' || $3 || '%' OR to_tsvector('simple', f.path) @@ sq.q) " +
        ") hits ORDER BY score DESC, file_path ASC, start_line ASC NULLS LAST LIMIT $4",
      [workspaceId, indexId, query, limit],
    );

    return result.rows.map((row) => ({
      kind: row.kind,
      filePath: row.file_path,
      language: row.language,
      sourceKind: row.source_kind,
      score: row.score,
      snippet: row.snippet,
      ...(row.start_line === null ? {} : { startLine: row.start_line }),
      ...(row.end_line === null ? {} : { endLine: row.end_line }),
    }));
  }

  async listSimilarConceptEmbeddings(
    workspaceId: string,
    nodeId: string,
    model: string,
    limit: number,
  ): Promise<SimilarConceptMatchRecord[]> {
    assertNonEmpty("workspaceId", workspaceId);
    assertNonEmpty("nodeId", nodeId);
    assertNonEmpty("model", model);
    if (!Number.isInteger(limit) || limit < 1) {
      throw new StorageError("limit must be a positive integer");
    }

    const result = await this.pool.query<{
      node_id: string;
      score: number;
      content_digest: string;
      updated_at: string;
    }>(
      "SELECT candidate.node_id, 1 - (source.embedding <=> candidate.embedding) AS score, candidate.content_digest, candidate.updated_at::text AS updated_at " +
        "FROM node_embeddings AS source " +
        "JOIN node_embeddings AS candidate ON candidate.workspace_id = source.workspace_id AND candidate.model = source.model AND candidate.node_id <> source.node_id " +
        "WHERE source.workspace_id = $1 AND source.node_id = $2 AND source.model = $3 AND vector_dims(candidate.embedding) = vector_dims(source.embedding) " +
        "ORDER BY source.embedding <=> candidate.embedding ASC, candidate.node_id ASC LIMIT $4",
      [workspaceId, nodeId, model, limit],
    );

    return result.rows.map((row) => ({
      nodeId: row.node_id,
      score: Number(row.score),
      contentDigest: row.content_digest,
      updatedAt: normalizeTimestampText(row.updated_at),
    }));
  }

  private async loadWorkspaceRecord(client: PoolClient, workspaceId: string): Promise<WorkspaceRecord> {
    const result = await client.query<{
      id: string;
      slug: NullableString;
      name: string;
      archived: boolean;
      created_at: string;
      updated_at: NullableString;
    }>("SELECT id, slug, name, archived, created_at::text AS created_at, updated_at::text AS updated_at FROM workspaces WHERE id = $1", [workspaceId]);
    const row = result.rows[0];
    if (row === undefined) {
      throw new StorageError(`Workspace not found: ${workspaceId}`);
    }
    return normalizeWorkspaceRecordTimestamps(rowToWorkspaceRecord(row));
  }

  private async loadGraphId(client: PoolClient, workspaceId: string): Promise<string> {
    const result = await client.query<{ id: string }>("SELECT id FROM graphs WHERE workspace_id = $1", [workspaceId]);
    const row = result.rows[0];
    if (row === undefined) {
      throw new StorageError(`Graph not found for workspace: ${workspaceId}`);
    }
    return row.id;
  }

  private async replaceGraph(
    client: PoolClient,
    graphId: string,
    workspaceId: string,
    graph: SemanticGraph,
  ): Promise<void> {
    await client.query("DELETE FROM graphs WHERE workspace_id = $1", [workspaceId]);
    await client.query("INSERT INTO graphs (workspace_id, id) VALUES ($1, $2)", [workspaceId, graphId]);

    for (const [ordinal, node] of graph.nodes.entries()) {
      await client.query(
        "INSERT INTO nodes (graph_id, id, ordinal, label, type, notes, metadata) VALUES ($1, $2, $3, $4, $5, $6, $7)",
        [graphId, node.id, ordinal, node.label, node.type, node.notes ?? null, stringifyNullable(node.metadata)],
      );
    }

    for (const [ordinal, edge] of graph.edges.entries()) {
      await client.query(
        "INSERT INTO edges (graph_id, id, ordinal, from_id, to_id, relation, label, notes, metadata) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)",
        [
          graphId,
          edge.id,
          ordinal,
          edge.from,
          edge.to,
          edge.relation,
          edge.label ?? null,
          edge.notes ?? null,
          stringifyNullable(edge.metadata),
        ],
      );
    }
  }

  private async loadGraph(client: PoolClient, graphId: string): Promise<SemanticGraph> {
    const nodeRows = (
      await client.query<NodeRow>(
        "SELECT id, label, type, notes, metadata::text AS metadata_json FROM nodes WHERE graph_id = $1 ORDER BY ordinal",
        [graphId],
      )
    ).rows;
    const edgeRows = (
      await client.query<EdgeRow>(
        "SELECT id, from_id, to_id, relation, label, notes, metadata::text AS metadata_json FROM edges WHERE graph_id = $1 ORDER BY ordinal",
        [graphId],
      )
    ).rows;

    const graph: SemanticGraph = {
      nodes: nodeRows.map(rowToNode),
      edges: edgeRows.map(rowToEdge),
    };
    validateGraph(graph);
    return graph;
  }

  private async pruneConceptEmbeddings(client: PoolClient, workspaceId: string, graph: SemanticGraph): Promise<void> {
    const conceptNodeIds = graph.nodes.filter((node) => node.type === "concept").map((node) => node.id);
    if (conceptNodeIds.length === 0) {
      await client.query("DELETE FROM node_embeddings WHERE workspace_id = $1", [workspaceId]);
      return;
    }
    await client.query(
      "DELETE FROM node_embeddings WHERE workspace_id = $1 AND NOT (node_id = ANY($2::text[]))",
      [workspaceId, conceptNodeIds],
    );
  }

  private async replaceCategoryCatalog(client: PoolClient, workspaceId: string, catalog: CategoryCatalog): Promise<void> {
    for (const [ordinal, category] of catalog.categories.entries()) {
      await client.query(
        "INSERT INTO categories (workspace_id, id, ordinal, label, description, source) VALUES ($1, $2, $3, $4, $5, $6)",
        [workspaceId, category.id, ordinal, category.label, category.description, category.source],
      );
    }
  }

  private async loadCategoryCatalog(client: PoolClient, workspaceId: string): Promise<CategoryCatalog> {
    const categories = (
      await client.query<CategoryCatalog["categories"][number]>(
        "SELECT id, label, description, source FROM categories WHERE workspace_id = $1 ORDER BY ordinal",
        [workspaceId],
      )
    ).rows;
    const catalog = { categories };
    validateCategoryCatalog(catalog);
    return catalog;
  }

  private async insertCategoryAssignments(
    client: PoolClient,
    workspaceId: string,
    assignments: readonly CategoryAssignment[],
  ): Promise<void> {
    for (const [ordinal, assignment] of assignments.entries()) {
      await client.query(
        "INSERT INTO category_assignments (workspace_id, id, ordinal, target_type, target_id, category_id, status, provenance, notes) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)",
        [
          workspaceId,
          assignment.id,
          ordinal,
          assignment.targetType,
          assignment.targetId,
          assignment.categoryId,
          assignment.status,
          assignment.provenance,
          assignment.notes ?? null,
        ],
      );
    }
  }

  private async loadCategoryAssignments(client: PoolClient, workspaceId: string): Promise<CategoryAssignment[]> {
    const rows = (
      await client.query<CategoryAssignmentRow>(
        "SELECT id, target_type AS \"targetType\", target_id AS \"targetId\", category_id AS \"categoryId\", status, provenance, notes FROM category_assignments WHERE workspace_id = $1 ORDER BY ordinal",
        [workspaceId],
      )
    ).rows;

    return rows.map((row) => {
      const assignment: CategoryAssignment = {
        id: row.id,
        targetType: row.targetType,
        targetId: row.targetId,
        categoryId: row.categoryId,
        status: row.status,
        provenance: row.provenance,
      };
      if (row.notes !== null) {
        assignment.notes = row.notes;
      }
      return assignment;
    });
  }

  private async replaceCapturePolicy(client: PoolClient, workspaceId: string, policy: CapturePolicy): Promise<void> {
    await client.query("INSERT INTO capture_policies (workspace_id, id, mode, rules) VALUES ($1, $2, $3, $4)", [
      workspaceId,
      policy.id,
      policy.mode,
      policy.rules ?? null,
    ]);
  }

  private async loadCapturePolicy(client: PoolClient, workspaceId: string): Promise<CapturePolicy> {
    const result = await client.query<{ id: string; mode: CapturePolicy["mode"]; rules: string[] | null }>(
      "SELECT id, mode, rules FROM capture_policies WHERE workspace_id = $1",
      [workspaceId],
    );
    const row = result.rows[0];
    if (row === undefined) {
      throw new StorageError(`Capture policy not found for workspace: ${workspaceId}`);
    }
    const policy: CapturePolicy = { id: row.id, mode: row.mode };
    if (row.rules !== null) {
      policy.rules = row.rules;
    }
    validateCapturePolicy(policy);
    return policy;
  }

  private async replaceFeedbackEvents(
    client: PoolClient,
    workspaceId: string,
    events: readonly FeedbackEvent[],
  ): Promise<void> {
    for (const [ordinal, event] of events.entries()) {
      await client.query(
        "INSERT INTO feedback_events (workspace_id, id, ordinal, created_at, type, payload, projection_id) VALUES ($1, $2, $3, $4, $5, $6, $7)",
        [workspaceId, event.id, ordinal, event.createdAt, event.type, JSON.stringify(event.payload), event.projectionId ?? null],
      );
    }
  }

  private async loadFeedbackEvents(client: PoolClient, workspaceId: string): Promise<FeedbackEvent[]> {
    const rows = (
      await client.query<{
        id: string;
        created_at: string;
        type: FeedbackEvent["type"];
        payload_json: string;
        projection_id: NullableString;
      }>(
        "SELECT id, created_at::text AS created_at, type, payload::text AS payload_json, projection_id FROM feedback_events WHERE workspace_id = $1 ORDER BY ordinal",
        [workspaceId],
      )
    ).rows;

    return rows.map((row) => {
      const event: FeedbackEvent = {
        id: row.id,
        createdAt: normalizeTimestampText(row.created_at),
        type: row.type,
        payload: parseJson<Record<string, unknown>>(row.payload_json),
      };
      if (row.projection_id !== null) {
        event.projectionId = row.projection_id;
      }
      return event;
    });
  }

  private async replaceProposals(client: PoolClient, workspaceId: string, proposals: readonly GraphProposal[]): Promise<void> {
    for (const [ordinal, proposal] of proposals.entries()) {
      await client.query(
        "INSERT INTO proposals (workspace_id, id, ordinal, created_at, source_feedback_ids, graph_commands, explanation, risk_category_impact, status) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)",
        [
          workspaceId,
          proposal.id,
          ordinal,
          proposal.createdAt,
          proposal.sourceFeedbackIds,
          JSON.stringify(proposal.graphCommands),
          proposal.explanation,
          proposal.riskCategoryImpact ?? null,
          proposal.status,
        ],
      );
    }
  }

  private async loadProposals(client: PoolClient, workspaceId: string): Promise<GraphProposal[]> {
    const rows = (
      await client.query<{
        id: string;
        created_at: string;
        source_feedback_ids: string[];
        graph_commands_json: string;
        explanation: string;
        risk_category_impact: NullableString;
        status: GraphProposal["status"];
      }>(
        "SELECT id, created_at::text AS created_at, source_feedback_ids, graph_commands::text AS graph_commands_json, explanation, risk_category_impact, status FROM proposals WHERE workspace_id = $1 ORDER BY ordinal",
        [workspaceId],
      )
    ).rows;

    return rows.map((row) => {
      const proposal: GraphProposal = {
        id: row.id,
        createdAt: normalizeTimestampText(row.created_at),
        sourceFeedbackIds: row.source_feedback_ids,
        graphCommands: parseJson<GraphProposal["graphCommands"]>(row.graph_commands_json),
        explanation: row.explanation,
        status: row.status,
      };
      if (row.risk_category_impact !== null) {
        proposal.riskCategoryImpact = row.risk_category_impact;
      }
      return proposal;
    });
  }

  private async replaceProjections(client: PoolClient, workspaceId: string, projections: readonly Projection[]): Promise<void> {
    for (const [ordinal, projection] of projections.entries()) {
      await client.query(
        "INSERT INTO projections (workspace_id, id, ordinal, name, type, root_node_ids, visible_node_ids, visible_edge_ids, groups, layout) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)",
        [
          workspaceId,
          projection.id,
          ordinal,
          projection.name,
          projection.type,
          projection.rootNodeIds,
          projection.visibleNodeIds,
          projection.visibleEdgeIds,
          stringifyNullable(projection.groups),
          stringifyNullable(projection.layout),
        ],
      );
    }
  }

  private async loadProjections(client: PoolClient, workspaceId: string, graph: SemanticGraph): Promise<Projection[]> {
    const rows = (
      await client.query<{
        id: string;
        name: string;
        type: Projection["type"];
        root_node_ids: string[];
        visible_node_ids: string[];
        visible_edge_ids: string[];
        groups_json: NullableString;
        layout_json: NullableString;
      }>(
        "SELECT id, name, type, root_node_ids, visible_node_ids, visible_edge_ids, groups::text AS groups_json, layout::text AS layout_json FROM projections WHERE workspace_id = $1 ORDER BY ordinal",
        [workspaceId],
      )
    ).rows;

    return rows.map((row) => {
      const projection: Projection = {
        id: row.id,
        name: row.name,
        type: row.type,
        rootNodeIds: row.root_node_ids,
        visibleNodeIds: row.visible_node_ids,
        visibleEdgeIds: row.visible_edge_ids,
      };
      if (row.groups_json !== null) {
        projection.groups = parseJson<NonNullable<Projection["groups"]>>(row.groups_json);
      }
      if (row.layout_json !== null) {
        projection.layout = parseJson<Record<string, unknown>>(row.layout_json);
      }
      validateProjection(projection, graph);
      return projection;
    });
  }

  private async replaceScanProfiles(client: PoolClient, workspaceId: string, profiles: readonly ScanProfile[]): Promise<void> {
    for (const [ordinal, profile] of profiles.entries()) {
      await client.query(
        "INSERT INTO scan_profiles (workspace_id, id, version, ordinal, name, description, instructions, scope_include, scope_exclude, source_types, criteria, ssot_order, required_outputs) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)",
        [
          workspaceId,
          profile.id,
          profile.version,
          ordinal,
          profile.name,
          profile.description,
          profile.instructions,
          profile.scope.include,
          profile.scope.exclude,
          profile.sourceTypes,
          JSON.stringify(profile.criteria),
          profile.ssotOrder,
          profile.requiredOutputs,
        ],
      );
    }
  }

  private async loadScanProfiles(client: PoolClient, workspaceId: string): Promise<ScanProfile[]> {
    const rows = (
      await client.query<{
        id: string;
        version: number;
        name: string;
        description: string;
        instructions: string[];
        scope_include: string[];
        scope_exclude: string[];
        source_types: string[];
        criteria_json: string;
        ssot_order: string[];
        required_outputs: ScanProfile["requiredOutputs"];
      }>(
        "SELECT id, version, name, description, instructions, scope_include, scope_exclude, source_types, criteria::text AS criteria_json, ssot_order, required_outputs::text[] AS required_outputs FROM scan_profiles WHERE workspace_id = $1 ORDER BY ordinal",
        [workspaceId],
      )
    ).rows;
    return rows.map((row) => ({
      id: row.id,
      version: row.version,
      name: row.name,
      description: row.description,
      instructions: row.instructions,
      scope: {
        include: row.scope_include,
        exclude: row.scope_exclude,
      },
      sourceTypes: row.source_types,
      criteria: parseJson<ScanProfile["criteria"]>(row.criteria_json),
      ssotOrder: row.ssot_order,
      requiredOutputs: row.required_outputs,
    }));
  }

  private async replaceScanRuns(client: PoolClient, workspaceId: string, runs: readonly ScanRun[]): Promise<void> {
    for (const [ordinal, run] of runs.entries()) {
      await client.query(
        "INSERT INTO scan_runs (workspace_id, id, ordinal, profile_id, profile_version, status, repository_index_id, repository_root, repository_url, repository_branch, repository_revision, repository_worktree_digest, actor_agent_id, actor_tool, started_at, coverage, applied_criteria, declared_outputs, finding_node_ids, completed_at, graph_digest, finding_evidence) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22)",
        [
          workspaceId,
          run.id,
          ordinal,
          run.profileId,
          run.profileVersion,
          run.status,
          run.repository.repositoryIndexId ?? null,
          run.repository.root,
          run.repository.repositoryUrl ?? null,
          run.repository.branch,
          run.repository.revision,
          run.repository.worktreeDigest ?? null,
          run.actor.agentId,
          run.actor.tool,
          run.startedAt,
          stringifyNullable(run.coverage),
          run.appliedCriteria,
          run.declaredOutputs,
          run.findingNodeIds,
          run.status === "completed" ? run.completedAt : null,
          run.status === "completed" ? run.graphDigest : null,
          run.status === "completed" ? JSON.stringify(run.findingEvidence) : null,
        ],
      );
    }
  }

  private async loadScanRuns(client: PoolClient, workspaceId: string): Promise<ScanRun[]> {
    const rows = (
      await client.query<{
        id: string;
        profile_id: string;
        profile_version: number;
        status: ScanRun["status"];
        repository_index_id: NullableString;
        repository_root: string;
        repository_url: NullableString;
        repository_branch: string;
        repository_revision: string;
        repository_worktree_digest: NullableString;
        actor_agent_id: string;
        actor_tool: string;
        started_at: string;
        coverage_json: NullableString;
        applied_criteria: string[];
        declared_outputs: ScanProfile["requiredOutputs"];
        finding_node_ids: string[];
        completed_at: NullableString;
        graph_digest: NullableString;
        finding_evidence_json: NullableString;
      }>(
        "SELECT id, profile_id, profile_version, status, repository_index_id, repository_root, repository_url, repository_branch, repository_revision, repository_worktree_digest, actor_agent_id, actor_tool, started_at::text AS started_at, coverage::text AS coverage_json, applied_criteria, declared_outputs::text[] AS declared_outputs, finding_node_ids, completed_at::text AS completed_at, graph_digest, finding_evidence::text AS finding_evidence_json FROM scan_runs WHERE workspace_id = $1 ORDER BY ordinal",
        [workspaceId],
      )
    ).rows;

    return rows.map((row) => {
      const base = {
        id: row.id,
        profileId: row.profile_id,
        profileVersion: row.profile_version,
        repository: {
          root: row.repository_root,
          branch: row.repository_branch,
          revision: row.repository_revision,
          ...(row.repository_index_id === null ? {} : { repositoryIndexId: row.repository_index_id }),
          ...(row.repository_url === null ? {} : { repositoryUrl: row.repository_url }),
          ...(row.repository_worktree_digest === null ? {} : { worktreeDigest: row.repository_worktree_digest }),
        },
        actor: {
          agentId: row.actor_agent_id,
          tool: row.actor_tool,
        },
        startedAt: normalizeTimestampText(row.started_at),
        appliedCriteria: row.applied_criteria,
        declaredOutputs: row.declared_outputs,
        findingNodeIds: row.finding_node_ids,
        ...(row.coverage_json === null ? {} : { coverage: parseJson<NonNullable<ScanRun["coverage"]>>(row.coverage_json) }),
      };

      if (row.status === "completed") {
        if (row.completed_at === null || row.graph_digest === null || row.finding_evidence_json === null || row.coverage_json === null) {
          throw new StorageError(`Completed scan row is missing required fields: ${row.id}`);
        }
        return {
          ...base,
          status: "completed",
          coverage: parseJson<NonNullable<ScanRun["coverage"]>>(row.coverage_json),
          completedAt: normalizeTimestampText(row.completed_at),
          graphDigest: row.graph_digest,
          findingEvidence: parseJson<NonNullable<Extract<ScanRun, { status: "completed" }>["findingEvidence"]>>(
            row.finding_evidence_json,
          ),
        };
      }

      return {
        ...base,
        status: "in_progress",
      };
    });
  }
}

export function validateWorkspaceState(state: WorkspaceState): void {
  validateWorkspaceRecord(state.workspace);
  assertNonEmpty("graphId", state.graphId);
  validateGraph(state.graph);
  validateCategoryCatalog(state.categoryCatalog);
  validateCategoryAssignments(state.categoryAssignments, state.categoryCatalog, createTargetIndex(state.graph, state.projections));
  validateCapturePolicy(state.capturePolicy);
  validateFeedbackEvents(state.feedbackEvents);
  for (const proposal of state.proposals) {
    validateGraphProposal(proposal);
  }
  for (const projection of state.projections) {
    validateProjection(projection, state.graph);
  }
  validateScanState(state.scanProfiles, state.scanRuns, state.graph);
}

function createTargetIndex(graph: SemanticGraph, projections: readonly Projection[]): CategoryAssignmentTargetIndex {
  return {
    nodeIds: graph.nodes.map((node) => node.id),
    edgeIds: graph.edges.map((edge) => edge.id),
    projectionIds: projections.map((projection) => projection.id),
  };
}

function rowToNode(row: NodeRow): GraphNode {
  const node: GraphNode = {
    id: row.id,
    label: row.label,
    type: row.type,
  };
  if (row.notes !== null) {
    node.notes = row.notes;
  }
  if (row.metadata_json !== null) {
    node.metadata = parseJson<Record<string, unknown>>(row.metadata_json);
  }
  return node;
}

function rowToEdge(row: EdgeRow): GraphEdge {
  const edge: GraphEdge = {
    id: row.id,
    from: row.from_id,
    to: row.to_id,
    relation: row.relation,
  };
  if (row.label !== null) {
    edge.label = row.label;
  }
  if (row.notes !== null) {
    edge.notes = row.notes;
  }
  if (row.metadata_json !== null) {
    edge.metadata = parseJson<Record<string, unknown>>(row.metadata_json);
  }
  return edge;
}

function rowToConceptEmbeddingRecord(row: ConceptEmbeddingRow): ConceptEmbeddingRecord {
  return {
    workspaceId: row.workspace_id,
    nodeId: row.node_id,
    model: row.model,
    contentDigest: row.content_digest,
    embedding: parseVector(row.embedding_text),
    createdAt: normalizeTimestampText(row.created_at),
    updatedAt: normalizeTimestampText(row.updated_at),
  };
}

function rowToRepositoryIndexRecord(row: RepositoryIndexRow): RepositoryIndexRecord {
  const record: RepositoryIndexRecord = {
    id: row.id,
    workspaceId: row.workspace_id,
    repositoryUrl: row.repository_url,
    mode: row.mode,
    stage: row.stage,
    requestedAt: normalizeTimestampText(row.requested_at),
    updatedAt: normalizeTimestampText(row.updated_at),
    actor: {
      agentId: row.actor_agent_id,
      tool: row.actor_tool,
    },
  };

  if (row.requested_ref !== null) {
    record.requestedRef = row.requested_ref;
  }
  if (row.resolved_commit !== null) {
    record.resolvedCommit = row.resolved_commit;
  }
  if (row.completed_at !== null) {
    record.completedAt = normalizeTimestampText(row.completed_at);
  }
  if (row.failure_code !== null && row.failure_message !== null) {
    record.failure = {
      code: row.failure_code,
      message: row.failure_message,
    };
  }
  if (row.stats_file_count !== null && row.stats_chunk_count !== null && row.stats_indexed_bytes !== null) {
    record.stats = {
      fileCount: row.stats_file_count,
      chunkCount: row.stats_chunk_count,
      indexedBytes: Number(row.stats_indexed_bytes),
    };
  }

  return record;
}

function rowToRepositoryFileRecord(row: RepositoryFileRow): RepositoryFileRecord {
  return {
    workspaceId: row.workspace_id,
    indexId: row.index_id,
    path: row.path,
    language: row.language,
    sourceKind: row.source_kind,
    contentHash: row.content_hash,
    byteSize: Number(row.byte_size),
  };
}

function rowToRepositoryChunkRecord(row: RepositoryChunkRow): RepositoryChunkRecord {
  return {
    workspaceId: row.workspace_id,
    indexId: row.index_id,
    id: row.id,
    filePath: row.file_path,
    language: row.language,
    sourceKind: row.source_kind,
    startLine: row.start_line,
    endLine: row.end_line,
    text: row.text,
    contentHash: row.content_hash,
  };
}

function rowToRepositorySymbolRecord(row: RepositorySymbolRow): RepositorySymbolRecord {
  return {
    workspaceId: row.workspace_id,
    indexId: row.index_id,
    key: row.key,
    filePath: row.file_path,
    language: row.language,
    name: row.name,
    qualifiedName: row.qualified_name,
    kind: row.kind,
    ...(row.parent_symbol_key === null ? {} : { parentSymbolKey: row.parent_symbol_key }),
    startLine: row.start_line,
    startColumn: row.start_column,
    endLine: row.end_line,
    endColumn: row.end_column,
    isExported: row.is_exported,
    isPublic: row.is_public,
    producerTool: row.producer_tool,
    producerVersion: row.producer_version,
  };
}

function stringifyNullable(value: unknown): string | null {
  return value === undefined ? null : JSON.stringify(value);
}

function serializeVector(values: readonly number[]): string {
  if (values.length === 0) {
    throw new StorageError("embedding must contain at least one value");
  }
  for (const value of values) {
    if (!Number.isFinite(value)) {
      throw new StorageError("embedding values must be finite numbers");
    }
  }
  return `[${values.join(",")}]`;
}

function parseVector(value: string): number[] {
  if (!value.startsWith("[") || !value.endsWith("]")) {
    throw new StorageError(`Invalid vector text from storage: ${value}`);
  }
  const inner = value.slice(1, -1).trim();
  if (inner.length === 0) {
    return [];
  }
  return inner.split(",").map((part) => {
    const parsed = Number(part.trim());
    if (!Number.isFinite(parsed)) {
      throw new StorageError(`Invalid vector value from storage: ${part}`);
    }
    return parsed;
  });
}

function rowToWorkspaceRecord(row: {
  id: string;
  slug: NullableString;
  name: string;
  archived: number | boolean;
  created_at: string;
  updated_at: NullableString;
}): WorkspaceRecord {
  const workspace: WorkspaceRecord = {
    id: row.id,
    name: row.name,
    createdAt: row.created_at,
  };

  if (row.slug !== null) {
    workspace.slug = row.slug;
  }

  if (row.archived !== 0 && row.archived !== false) {
    workspace.archived = true;
  }

  if (row.updated_at !== null) {
    workspace.updatedAt = row.updated_at;
  }

  return workspace;
}

function normalizeWorkspaceRecordTimestamps(workspace: WorkspaceRecord): WorkspaceRecord {
  const normalized: WorkspaceRecord = {
    ...workspace,
    createdAt: normalizeTimestampText(workspace.createdAt),
  };

  if (workspace.updatedAt !== undefined) {
    normalized.updatedAt = normalizeTimestampText(workspace.updatedAt);
  }

  return normalized;
}

function normalizeTimestampText(value: string): string {
  const timestamp = Date.parse(value);
  if (Number.isNaN(timestamp)) {
    throw new StorageError(`Invalid timestamp from storage: ${value}`);
  }
  return new Date(timestamp).toISOString();
}

function parseJson<T>(value: string): T {
  return JSON.parse(value) as T;
}

function cloneWorkspaceState(state: WorkspaceState): WorkspaceState {
  return structuredClone(state);
}

function cloneWorkspaceRecord(workspace: WorkspaceRecord): WorkspaceRecord {
  return structuredClone(workspace);
}

function cloneConceptEmbeddingRecord(record: ConceptEmbeddingRecord): ConceptEmbeddingRecord {
  return structuredClone(record);
}

function cloneRepositoryIndexRecord(record: RepositoryIndexRecord): RepositoryIndexRecord {
  return structuredClone(record);
}

function compareWorkspaceRecords(left: WorkspaceRecord, right: WorkspaceRecord): number {
  const byName = left.name.localeCompare(right.name);
  return byName !== 0 ? byName : left.id.localeCompare(right.id);
}

function compareRepositoryIndexRecords(left: RepositoryIndexRecord, right: RepositoryIndexRecord): number {
  const leftRequested = Date.parse(left.requestedAt);
  const rightRequested = Date.parse(right.requestedAt);
  if (leftRequested !== rightRequested) {
    return rightRequested - leftRequested;
  }
  return left.id.localeCompare(right.id);
}

function assertNonEmpty(fieldName: string, value: string): void {
  if (value.trim().length === 0) {
    throw new StorageError(`${fieldName} must be non-empty`);
  }
}

function validateConceptEmbeddingRecord(record: ConceptEmbeddingRecord): void {
  assertNonEmpty("workspaceId", record.workspaceId);
  assertNonEmpty("nodeId", record.nodeId);
  assertNonEmpty("model", record.model);
  assertNonEmpty("contentDigest", record.contentDigest);
  assertNonEmpty("createdAt", record.createdAt);
  assertNonEmpty("updatedAt", record.updatedAt);
  normalizeTimestampText(record.createdAt);
  normalizeTimestampText(record.updatedAt);
  serializeVector(record.embedding);
}

function validateRepositoryIndexRecord(record: RepositoryIndexRecord): void {
  assertNonEmpty("workspaceId", record.workspaceId);
  assertNonEmpty("id", record.id);
  assertNonEmpty("repositoryUrl", record.repositoryUrl);
  if (record.requestedRef !== undefined) {
    assertNonEmpty("requestedRef", record.requestedRef);
  }
  if (record.resolvedCommit !== undefined) {
    assertNonEmpty("resolvedCommit", record.resolvedCommit);
  }
  if (record.mode !== "safe" && record.mode !== "deep") {
    throw new StorageError(`Unsupported repository index mode: ${record.mode}`);
  }
  if (!REPOSITORY_INDEX_STAGES.has(record.stage)) {
    throw new StorageError(`Unsupported repository index stage: ${record.stage}`);
  }
  assertNonEmpty("requestedAt", record.requestedAt);
  assertNonEmpty("updatedAt", record.updatedAt);
  normalizeTimestampText(record.requestedAt);
  normalizeTimestampText(record.updatedAt);
  assertNonEmpty("actor.agentId", record.actor.agentId);
  assertNonEmpty("actor.tool", record.actor.tool);

  const isTerminalStage = record.stage === "completed" || record.stage === "failed" || record.stage === "cancelled";
  if (record.completedAt !== undefined) {
    normalizeTimestampText(record.completedAt);
  }
  if (isTerminalStage !== (record.completedAt !== undefined)) {
    throw new StorageError("repository index terminal stages must match completedAt presence");
  }

  if (record.stage === "failed") {
    if (record.failure === undefined) {
      throw new StorageError("repository index failed stage requires failure details");
    }
    assertNonEmpty("failure.code", record.failure.code);
    assertNonEmpty("failure.message", record.failure.message);
  } else if (record.failure !== undefined) {
    throw new StorageError("repository index failure details are only valid for failed stage");
  }

  if (record.stats !== undefined) {
    if (!Number.isInteger(record.stats.fileCount) || record.stats.fileCount < 0) {
      throw new StorageError("repository index stats.fileCount must be a non-negative integer");
    }
    if (!Number.isInteger(record.stats.chunkCount) || record.stats.chunkCount < 0) {
      throw new StorageError("repository index stats.chunkCount must be a non-negative integer");
    }
    if (!Number.isInteger(record.stats.indexedBytes) || record.stats.indexedBytes < 0) {
      throw new StorageError("repository index stats.indexedBytes must be a non-negative integer");
    }
  }
}

function validateRepositoryFileRecord(record: RepositoryFileRecord): void {
  assertNonEmpty("workspaceId", record.workspaceId);
  assertNonEmpty("indexId", record.indexId);
  assertNonEmpty("path", record.path);
  assertNonEmpty("language", record.language);
  assertNonEmpty("sourceKind", record.sourceKind);
  assertNonEmpty("contentHash", record.contentHash);
  if (!Number.isInteger(record.byteSize) || record.byteSize < 0) {
    throw new StorageError("byteSize must be a non-negative integer");
  }
}

function validateRepositoryChunkRecord(record: RepositoryChunkRecord): void {
  assertNonEmpty("workspaceId", record.workspaceId);
  assertNonEmpty("indexId", record.indexId);
  assertNonEmpty("id", record.id);
  assertNonEmpty("filePath", record.filePath);
  assertNonEmpty("language", record.language);
  assertNonEmpty("sourceKind", record.sourceKind);
  assertNonEmpty("text", record.text);
  assertNonEmpty("contentHash", record.contentHash);
  if (!Number.isInteger(record.startLine) || record.startLine < 1) {
    throw new StorageError("startLine must be a positive integer");
  }
  if (!Number.isInteger(record.endLine) || record.endLine < record.startLine) {
    throw new StorageError("endLine must be greater than or equal to startLine");
  }
}

function validateRepositorySymbolRecord(record: RepositorySymbolRecord): void {
  assertNonEmpty("workspaceId", record.workspaceId);
  assertNonEmpty("indexId", record.indexId);
  assertNonEmpty("key", record.key);
  assertNonEmpty("filePath", record.filePath);
  assertNonEmpty("language", record.language);
  assertNonEmpty("name", record.name);
  assertNonEmpty("qualifiedName", record.qualifiedName);
  assertNonEmpty("kind", record.kind);
  assertNonEmpty("producerTool", record.producerTool);
  assertNonEmpty("producerVersion", record.producerVersion);
  if (record.parentSymbolKey !== undefined) {
    assertNonEmpty("parentSymbolKey", record.parentSymbolKey);
  }
  if (!Number.isInteger(record.startLine) || record.startLine < 1) {
    throw new StorageError("repository symbol startLine must be a positive integer");
  }
  if (!Number.isInteger(record.startColumn) || record.startColumn < 0) {
    throw new StorageError("repository symbol startColumn must be a non-negative integer");
  }
  if (!Number.isInteger(record.endLine) || record.endLine < record.startLine) {
    throw new StorageError("repository symbol endLine must be greater than or equal to startLine");
  }
  if (!Number.isInteger(record.endColumn) || record.endColumn < 0) {
    throw new StorageError("repository symbol endColumn must be a non-negative integer");
  }
}

function conceptEmbeddingKey(workspaceId: string, nodeId: string, model: string): string {
  return `${workspaceId}\u0000${nodeId}\u0000${model}`;
}

function repositoryIndexKey(workspaceId: string, indexId: string): string {
  return `${workspaceId}\u0000${indexId}`;
}

function assertRepositoryIndexContentOwnership(
  recordKind: string,
  workspaceId: string,
  indexId: string,
  recordWorkspaceId: string,
  recordIndexId: string,
): void {
  if (recordWorkspaceId !== workspaceId || recordIndexId !== indexId) {
    throw new StorageError(`${recordKind} ownership must match replaceRepositoryIndexContents target`);
  }
}

function cosineSimilarity(left: readonly number[], right: readonly number[]): number {
  if (left.length !== right.length) {
    throw new StorageError("embedding vectors must have matching dimensions");
  }
  let dot = 0;
  let leftNorm = 0;
  let rightNorm = 0;
  for (let index = 0; index < left.length; index += 1) {
    const leftValue = left[index]!;
    const rightValue = right[index]!;
    dot += leftValue * rightValue;
    leftNorm += leftValue * leftValue;
    rightNorm += rightValue * rightValue;
  }
  if (leftNorm === 0 || rightNorm === 0) {
    throw new StorageError("embedding vectors must not be zero-norm");
  }
  return dot / Math.sqrt(leftNorm * rightNorm);
}

function validateWorkspaceRecord(workspace: WorkspaceRecord): void {
  assertNonEmpty("workspace.id", workspace.id);
  assertNonEmpty("workspace.name", workspace.name);
  assertNonEmpty("workspace.createdAt", workspace.createdAt);

  if (workspace.slug !== undefined) {
    assertNonEmpty("workspace.slug", workspace.slug);
  }

  if (workspace.updatedAt !== undefined) {
    assertNonEmpty("workspace.updatedAt", workspace.updatedAt);
  }
}

const REPOSITORY_INDEX_STAGES = new Set<RepositoryIndexStage>([
  "requested",
  "resolving_ref",
  "checking_out",
  "discovering",
  "indexing_syntax",
  "running_rules",
  "embedding_changed_chunks",
  "normalizing",
  "completed",
  "failed",
  "cancelled",
]);

function tokenizeSearchQuery(query: string): string[] {
  return query
    .toLocaleLowerCase()
    .split(/\s+/)
    .map((part) => part.trim())
    .filter((part) => part.length > 0);
}

function scoreTextMatch(haystack: string, terms: readonly string[]): number {
  let score = 0;
  for (const term of terms) {
    let fromIndex = 0;
    while (true) {
      const matchIndex = haystack.indexOf(term, fromIndex);
      if (matchIndex === -1) {
        break;
      }
      score += 1;
      fromIndex = matchIndex + term.length;
    }
  }
  return score;
}

function trimSnippet(text: string, terms: readonly string[]): string {
  const normalized = text.toLocaleLowerCase();
  const firstTerm = terms.find((term) => normalized.includes(term));
  if (firstTerm === undefined) {
    return text.slice(0, 280);
  }
  const index = normalized.indexOf(firstTerm);
  const start = Math.max(0, index - 80);
  return text.slice(start, start + 280);
}

function isDefined<T>(value: T | undefined): value is T {
  return value !== undefined;
}

const POSTGRES_SCHEMA_SQL = `
CREATE EXTENSION IF NOT EXISTS vector;

DO $$
BEGIN
  CREATE TYPE graph_node_type AS ENUM ('concept', 'decision', 'risk', 'question', 'evidence', 'component', 'system', 'role', 'pattern', 'finding');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END
$$;

DO $$
BEGIN
  CREATE TYPE category_definition_source AS ENUM ('system', 'project');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END
$$;

DO $$
BEGIN
  CREATE TYPE category_target_type AS ENUM ('node', 'edge', 'projection');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END
$$;

DO $$
BEGIN
  CREATE TYPE category_assignment_status AS ENUM ('active', 'superseded');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END
$$;

DO $$
BEGIN
  CREATE TYPE category_provenance AS ENUM ('human', 'agent', 'system');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END
$$;

DO $$
BEGIN
  CREATE TYPE capture_policy_mode AS ENUM ('approved', 'delegated', 'proposed', 'custom');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END
$$;

DO $$
BEGIN
  CREATE TYPE feedback_event_type AS ENUM ('node_moved', 'node_marked', 'edge_marked', 'map_comment', 'group_requested', 'dive_in_requested', 'proposal_requested');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END
$$;

DO $$
BEGIN
  CREATE TYPE graph_proposal_status AS ENUM ('pending', 'approved', 'rejected', 'applied', 'superseded');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END
$$;

DO $$
BEGIN
  CREATE TYPE projection_type AS ENUM ('conversation-map', 'project-map', 'overview', 'dive-in');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END
$$;

DO $$
BEGIN
  CREATE TYPE scan_required_output AS ENUM ('document-inventory', 'concept-map', 'findings', 'coverage-report');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END
$$;

DO $$
BEGIN
  CREATE TYPE scan_run_status AS ENUM ('in_progress', 'completed');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END
$$;

DO $$
BEGIN
  CREATE TYPE repository_index_mode AS ENUM ('safe', 'deep');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END
$$;

DO $$
BEGIN
  CREATE TYPE repository_index_stage AS ENUM ('requested', 'resolving_ref', 'checking_out', 'discovering', 'indexing_syntax', 'running_rules', 'embedding_changed_chunks', 'normalizing', 'completed', 'failed', 'cancelled');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END
$$;

CREATE TABLE IF NOT EXISTS schema_metadata (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS workspaces (
  id TEXT PRIMARY KEY,
  slug TEXT UNIQUE,
  name TEXT NOT NULL,
  archived BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL,
  updated_at TIMESTAMPTZ,
  revision BIGINT NOT NULL DEFAULT 0,
  CHECK (btrim(id) <> ''),
  CHECK (slug IS NULL OR btrim(slug) <> ''),
  CHECK (btrim(name) <> ''),
  CHECK (revision >= 0)
);

CREATE TABLE IF NOT EXISTS graphs (
  workspace_id TEXT PRIMARY KEY REFERENCES workspaces(id) ON DELETE CASCADE,
  id TEXT NOT NULL UNIQUE,
  CHECK (btrim(id) <> '')
);

CREATE TABLE IF NOT EXISTS nodes (
  graph_id TEXT NOT NULL REFERENCES graphs(id) ON DELETE CASCADE,
  id TEXT NOT NULL,
  ordinal INTEGER NOT NULL,
  label TEXT NOT NULL,
  type graph_node_type NOT NULL,
  notes TEXT,
  metadata JSONB,
  PRIMARY KEY (graph_id, id),
  UNIQUE (graph_id, ordinal),
  CHECK (ordinal >= 0),
  CHECK (btrim(id) <> ''),
  CHECK (btrim(label) <> ''),
  CHECK (metadata IS NULL OR jsonb_typeof(metadata) = 'object')
);

CREATE TABLE IF NOT EXISTS node_embeddings (
  workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  node_id TEXT NOT NULL,
  model TEXT NOT NULL,
  content_digest TEXT NOT NULL,
  embedding vector NOT NULL,
  created_at TIMESTAMPTZ NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL,
  PRIMARY KEY (workspace_id, node_id, model),
  CHECK (btrim(node_id) <> ''),
  CHECK (btrim(model) <> ''),
  CHECK (btrim(content_digest) <> ''),
  CHECK (vector_dims(embedding) > 0)
);

CREATE TABLE IF NOT EXISTS edges (
  graph_id TEXT NOT NULL REFERENCES graphs(id) ON DELETE CASCADE,
  id TEXT NOT NULL,
  ordinal INTEGER NOT NULL,
  from_id TEXT NOT NULL,
  to_id TEXT NOT NULL,
  relation TEXT NOT NULL,
  label TEXT,
  notes TEXT,
  metadata JSONB,
  PRIMARY KEY (graph_id, id),
  UNIQUE (graph_id, ordinal),
  FOREIGN KEY (graph_id, from_id) REFERENCES nodes(graph_id, id) ON DELETE RESTRICT,
  FOREIGN KEY (graph_id, to_id) REFERENCES nodes(graph_id, id) ON DELETE RESTRICT,
  CHECK (ordinal >= 0),
  CHECK (btrim(id) <> ''),
  CHECK (btrim(from_id) <> ''),
  CHECK (btrim(to_id) <> ''),
  CHECK (btrim(relation) <> ''),
  CHECK (metadata IS NULL OR jsonb_typeof(metadata) = 'object')
);

CREATE TABLE IF NOT EXISTS categories (
  workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  id TEXT NOT NULL,
  ordinal INTEGER NOT NULL,
  label TEXT NOT NULL,
  description TEXT NOT NULL,
  source category_definition_source NOT NULL,
  PRIMARY KEY (workspace_id, id),
  UNIQUE (workspace_id, ordinal),
  CHECK (ordinal >= 0),
  CHECK (btrim(id) <> ''),
  CHECK (btrim(label) <> ''),
  CHECK (btrim(description) <> '')
);

CREATE TABLE IF NOT EXISTS category_assignments (
  workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  id TEXT NOT NULL,
  ordinal INTEGER NOT NULL,
  target_type category_target_type NOT NULL,
  target_id TEXT NOT NULL,
  category_id TEXT NOT NULL,
  status category_assignment_status NOT NULL,
  provenance category_provenance NOT NULL,
  notes TEXT,
  PRIMARY KEY (workspace_id, id),
  UNIQUE (workspace_id, ordinal),
  FOREIGN KEY (workspace_id, category_id) REFERENCES categories(workspace_id, id) ON DELETE RESTRICT,
  CHECK (ordinal >= 0),
  CHECK (btrim(id) <> ''),
  CHECK (btrim(target_id) <> ''),
  CHECK (btrim(category_id) <> '')
);

CREATE TABLE IF NOT EXISTS capture_policies (
  workspace_id TEXT PRIMARY KEY REFERENCES workspaces(id) ON DELETE CASCADE,
  id TEXT NOT NULL,
  mode capture_policy_mode NOT NULL,
  rules TEXT[],
  CHECK (btrim(id) <> ''),
  CHECK (mode <> 'custom' OR (rules IS NOT NULL AND cardinality(rules) > 0))
);

CREATE TABLE IF NOT EXISTS proposals (
  workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  id TEXT NOT NULL,
  ordinal INTEGER NOT NULL,
  created_at TIMESTAMPTZ NOT NULL,
  source_feedback_ids TEXT[] NOT NULL,
  graph_commands JSONB NOT NULL,
  explanation TEXT NOT NULL,
  risk_category_impact TEXT,
  status graph_proposal_status NOT NULL,
  PRIMARY KEY (workspace_id, id),
  UNIQUE (workspace_id, ordinal),
  CHECK (ordinal >= 0),
  CHECK (btrim(id) <> ''),
  CHECK (jsonb_typeof(graph_commands) = 'array'),
  CHECK (jsonb_array_length(graph_commands) > 0),
  CHECK (btrim(explanation) <> '')
);

CREATE TABLE IF NOT EXISTS projections (
  workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  id TEXT NOT NULL,
  ordinal INTEGER NOT NULL,
  name TEXT NOT NULL,
  type projection_type NOT NULL,
  root_node_ids TEXT[] NOT NULL,
  visible_node_ids TEXT[] NOT NULL,
  visible_edge_ids TEXT[] NOT NULL,
  groups JSONB,
  layout JSONB,
  PRIMARY KEY (workspace_id, id),
  UNIQUE (workspace_id, ordinal),
  CHECK (ordinal >= 0),
  CHECK (btrim(id) <> ''),
  CHECK (btrim(name) <> ''),
  CHECK (groups IS NULL OR jsonb_typeof(groups) = 'array'),
  CHECK (layout IS NULL OR jsonb_typeof(layout) = 'object')
);

CREATE TABLE IF NOT EXISTS feedback_events (
  workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  id TEXT NOT NULL,
  ordinal INTEGER NOT NULL,
  created_at TIMESTAMPTZ NOT NULL,
  type feedback_event_type NOT NULL,
  payload JSONB NOT NULL,
  projection_id TEXT,
  PRIMARY KEY (workspace_id, id),
  UNIQUE (workspace_id, ordinal),
  FOREIGN KEY (workspace_id, projection_id) REFERENCES projections(workspace_id, id) ON DELETE SET NULL,
  CHECK (ordinal >= 0),
  CHECK (btrim(id) <> ''),
  CHECK (jsonb_typeof(payload) = 'object')
);

CREATE TABLE IF NOT EXISTS scan_profiles (
  workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  id TEXT NOT NULL,
  version INTEGER NOT NULL,
  ordinal INTEGER NOT NULL,
  name TEXT NOT NULL,
  description TEXT NOT NULL,
  instructions TEXT[] NOT NULL,
  scope_include TEXT[] NOT NULL,
  scope_exclude TEXT[] NOT NULL,
  source_types TEXT[] NOT NULL,
  criteria JSONB NOT NULL,
  ssot_order TEXT[] NOT NULL,
  required_outputs scan_required_output[] NOT NULL,
  PRIMARY KEY (workspace_id, id, version),
  UNIQUE (workspace_id, ordinal),
  CHECK (ordinal >= 0),
  CHECK (btrim(id) <> ''),
  CHECK (version > 0),
  CHECK (btrim(name) <> ''),
  CHECK (btrim(description) <> ''),
  CHECK (cardinality(instructions) > 0),
  CHECK (cardinality(scope_include) > 0),
  CHECK (cardinality(source_types) > 0),
  CHECK (cardinality(required_outputs) > 0),
  CHECK (jsonb_typeof(criteria) = 'array')
);

CREATE TABLE IF NOT EXISTS repository_indexes (
  workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  id TEXT NOT NULL,
  repository_url TEXT NOT NULL,
  requested_ref TEXT,
  resolved_commit TEXT,
  mode repository_index_mode NOT NULL,
  stage repository_index_stage NOT NULL,
  requested_at TIMESTAMPTZ NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL,
  completed_at TIMESTAMPTZ,
  actor_agent_id TEXT NOT NULL,
  actor_tool TEXT NOT NULL,
  failure_code TEXT,
  failure_message TEXT,
  stats_file_count INTEGER,
  stats_chunk_count INTEGER,
  stats_indexed_bytes BIGINT,
  PRIMARY KEY (workspace_id, id),
  CHECK (btrim(id) <> ''),
  CHECK (btrim(repository_url) <> ''),
  CHECK (requested_ref IS NULL OR btrim(requested_ref) <> ''),
  CHECK (resolved_commit IS NULL OR btrim(resolved_commit) <> ''),
  CHECK (btrim(actor_agent_id) <> ''),
  CHECK (btrim(actor_tool) <> ''),
  CHECK ((failure_code IS NULL) = (failure_message IS NULL)),
  CHECK ((stats_file_count IS NULL) = (stats_chunk_count IS NULL)),
  CHECK ((stats_file_count IS NULL) = (stats_indexed_bytes IS NULL)),
  CHECK (stats_file_count IS NULL OR stats_file_count >= 0),
  CHECK (stats_chunk_count IS NULL OR stats_chunk_count >= 0),
  CHECK (stats_indexed_bytes IS NULL OR stats_indexed_bytes >= 0),
  CHECK (
    (
      stage IN ('requested', 'resolving_ref', 'checking_out', 'discovering', 'indexing_syntax', 'running_rules', 'embedding_changed_chunks', 'normalizing')
      AND completed_at IS NULL
      AND failure_code IS NULL
    )
    OR
    (stage = 'completed' AND completed_at IS NOT NULL AND failure_code IS NULL)
    OR
    (stage = 'cancelled' AND completed_at IS NOT NULL AND failure_code IS NULL)
    OR
    (stage = 'failed' AND completed_at IS NOT NULL AND failure_code IS NOT NULL)
  )
);

CREATE TABLE IF NOT EXISTS scan_runs (
  workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  id TEXT NOT NULL,
  ordinal INTEGER NOT NULL,
  profile_id TEXT NOT NULL,
  profile_version INTEGER NOT NULL,
  status scan_run_status NOT NULL,
  repository_index_id TEXT,
  repository_root TEXT NOT NULL,
  repository_url TEXT,
  repository_branch TEXT NOT NULL,
  repository_revision TEXT NOT NULL,
  repository_worktree_digest TEXT,
  actor_agent_id TEXT NOT NULL,
  actor_tool TEXT NOT NULL,
  started_at TIMESTAMPTZ NOT NULL,
  coverage JSONB,
  applied_criteria TEXT[] NOT NULL,
  declared_outputs scan_required_output[] NOT NULL,
  finding_node_ids TEXT[] NOT NULL,
  completed_at TIMESTAMPTZ,
  graph_digest TEXT,
  finding_evidence JSONB,
  PRIMARY KEY (workspace_id, id),
  UNIQUE (workspace_id, ordinal),
  FOREIGN KEY (workspace_id, profile_id, profile_version) REFERENCES scan_profiles(workspace_id, id, version) ON DELETE RESTRICT,
  FOREIGN KEY (workspace_id, repository_index_id) REFERENCES repository_indexes(workspace_id, id) ON DELETE RESTRICT,
  CHECK (ordinal >= 0),
  CHECK (btrim(id) <> ''),
  CHECK (btrim(profile_id) <> ''),
  CHECK (repository_index_id IS NULL OR btrim(repository_index_id) <> ''),
  CHECK (profile_version > 0),
  CHECK (btrim(repository_root) <> ''),
  CHECK (btrim(repository_branch) <> ''),
  CHECK (btrim(repository_revision) <> ''),
  CHECK (btrim(actor_agent_id) <> ''),
  CHECK (btrim(actor_tool) <> ''),
  CHECK (coverage IS NULL OR jsonb_typeof(coverage) = 'object'),
  CHECK (finding_evidence IS NULL OR jsonb_typeof(finding_evidence) = 'array'),
  CHECK (
    (status = 'in_progress' AND completed_at IS NULL AND graph_digest IS NULL AND finding_evidence IS NULL)
    OR
    (status = 'completed' AND completed_at IS NOT NULL AND graph_digest IS NOT NULL AND coverage IS NOT NULL AND finding_evidence IS NOT NULL)
  )
);

CREATE TABLE IF NOT EXISTS repository_files (
  workspace_id TEXT NOT NULL,
  index_id TEXT NOT NULL,
  path TEXT NOT NULL,
  ordinal INTEGER NOT NULL,
  language TEXT NOT NULL,
  source_kind TEXT NOT NULL,
  content_hash TEXT NOT NULL,
  byte_size BIGINT NOT NULL,
  PRIMARY KEY (workspace_id, index_id, path),
  UNIQUE (workspace_id, index_id, ordinal),
  FOREIGN KEY (workspace_id, index_id) REFERENCES repository_indexes(workspace_id, id) ON DELETE CASCADE,
  CHECK (ordinal >= 0),
  CHECK (btrim(path) <> ''),
  CHECK (btrim(language) <> ''),
  CHECK (btrim(source_kind) <> ''),
  CHECK (btrim(content_hash) <> ''),
  CHECK (byte_size >= 0)
);

CREATE TABLE IF NOT EXISTS repository_chunks (
  workspace_id TEXT NOT NULL,
  index_id TEXT NOT NULL,
  id TEXT NOT NULL,
  ordinal INTEGER NOT NULL,
  file_path TEXT NOT NULL,
  language TEXT NOT NULL,
  source_kind TEXT NOT NULL,
  start_line INTEGER NOT NULL,
  end_line INTEGER NOT NULL,
  text TEXT NOT NULL,
  content_hash TEXT NOT NULL,
  PRIMARY KEY (workspace_id, index_id, id),
  UNIQUE (workspace_id, index_id, ordinal),
  FOREIGN KEY (workspace_id, index_id) REFERENCES repository_indexes(workspace_id, id) ON DELETE CASCADE,
  FOREIGN KEY (workspace_id, index_id, file_path) REFERENCES repository_files(workspace_id, index_id, path) ON DELETE CASCADE,
  CHECK (ordinal >= 0),
  CHECK (btrim(id) <> ''),
  CHECK (btrim(file_path) <> ''),
  CHECK (btrim(language) <> ''),
  CHECK (btrim(source_kind) <> ''),
  CHECK (start_line > 0),
  CHECK (end_line >= start_line),
  CHECK (btrim(text) <> ''),
  CHECK (btrim(content_hash) <> '')
);

CREATE TABLE IF NOT EXISTS repository_symbols (
  workspace_id TEXT NOT NULL,
  index_id TEXT NOT NULL,
  key TEXT NOT NULL,
  ordinal INTEGER NOT NULL,
  file_path TEXT NOT NULL,
  language TEXT NOT NULL,
  name TEXT NOT NULL,
  qualified_name TEXT NOT NULL,
  kind TEXT NOT NULL,
  parent_symbol_key TEXT,
  start_line INTEGER NOT NULL,
  start_column INTEGER NOT NULL,
  end_line INTEGER NOT NULL,
  end_column INTEGER NOT NULL,
  is_exported BOOLEAN NOT NULL,
  is_public BOOLEAN NOT NULL,
  producer_tool TEXT NOT NULL,
  producer_version TEXT NOT NULL,
  PRIMARY KEY (workspace_id, index_id, key),
  UNIQUE (workspace_id, index_id, ordinal),
  FOREIGN KEY (workspace_id, index_id) REFERENCES repository_indexes(workspace_id, id) ON DELETE CASCADE,
  FOREIGN KEY (workspace_id, index_id, file_path) REFERENCES repository_files(workspace_id, index_id, path) ON DELETE CASCADE,
  CHECK (ordinal >= 0),
  CHECK (btrim(key) <> ''),
  CHECK (btrim(file_path) <> ''),
  CHECK (btrim(language) <> ''),
  CHECK (btrim(name) <> ''),
  CHECK (btrim(qualified_name) <> ''),
  CHECK (btrim(kind) <> ''),
  CHECK (parent_symbol_key IS NULL OR btrim(parent_symbol_key) <> ''),
  CHECK (start_line > 0),
  CHECK (start_column >= 0),
  CHECK (end_line >= start_line),
  CHECK (end_column >= 0),
  CHECK (btrim(producer_tool) <> ''),
  CHECK (btrim(producer_version) <> '')
);

CREATE INDEX IF NOT EXISTS workspaces_name_lookup_idx ON workspaces (lower(name));
CREATE INDEX IF NOT EXISTS workspaces_slug_lookup_idx ON workspaces (lower(slug));
CREATE INDEX IF NOT EXISTS nodes_graph_type_idx ON nodes (graph_id, type, id);
CREATE INDEX IF NOT EXISTS node_embeddings_workspace_model_node_idx ON node_embeddings (workspace_id, model, node_id);
CREATE INDEX IF NOT EXISTS node_embeddings_workspace_model_updated_idx ON node_embeddings (workspace_id, model, updated_at DESC);
CREATE INDEX IF NOT EXISTS edges_graph_from_idx ON edges (graph_id, from_id);
CREATE INDEX IF NOT EXISTS edges_graph_to_idx ON edges (graph_id, to_id);
CREATE INDEX IF NOT EXISTS categories_workspace_source_idx ON categories (workspace_id, source, id);
CREATE INDEX IF NOT EXISTS category_assignments_workspace_target_idx ON category_assignments (workspace_id, target_type, target_id);
CREATE INDEX IF NOT EXISTS feedback_events_workspace_created_idx ON feedback_events (workspace_id, created_at, id);
CREATE INDEX IF NOT EXISTS proposals_workspace_status_created_idx ON proposals (workspace_id, status, created_at DESC);
CREATE INDEX IF NOT EXISTS projections_workspace_type_idx ON projections (workspace_id, type, id);
CREATE INDEX IF NOT EXISTS scan_profiles_workspace_ref_idx ON scan_profiles (workspace_id, id, version DESC);
CREATE INDEX IF NOT EXISTS scan_runs_workspace_status_started_idx ON scan_runs (workspace_id, status, started_at DESC);
CREATE INDEX IF NOT EXISTS scan_runs_workspace_profile_idx ON scan_runs (workspace_id, profile_id, profile_version, started_at DESC);
CREATE INDEX IF NOT EXISTS repository_indexes_workspace_stage_updated_idx ON repository_indexes (workspace_id, stage, updated_at DESC);
CREATE INDEX IF NOT EXISTS repository_indexes_workspace_repo_commit_idx ON repository_indexes (workspace_id, repository_url, resolved_commit);
CREATE INDEX IF NOT EXISTS repository_files_workspace_index_path_idx ON repository_files (workspace_id, index_id, path);
CREATE INDEX IF NOT EXISTS repository_chunks_workspace_index_file_idx ON repository_chunks (workspace_id, index_id, file_path, ordinal);
CREATE INDEX IF NOT EXISTS repository_chunks_text_search_idx ON repository_chunks USING GIN (to_tsvector('simple', text));
CREATE INDEX IF NOT EXISTS repository_symbols_workspace_index_file_idx ON repository_symbols (workspace_id, index_id, file_path, ordinal);
CREATE INDEX IF NOT EXISTS repository_symbols_workspace_index_name_idx ON repository_symbols (workspace_id, index_id, qualified_name);
CREATE INDEX IF NOT EXISTS nodes_finding_origin_scan_idx ON nodes ((metadata->'finding'->>'originScanId')) WHERE type = 'finding';
CREATE INDEX IF NOT EXISTS nodes_finding_fingerprint_idx ON nodes ((metadata->'finding'->>'fingerprint')) WHERE type = 'finding';
CREATE INDEX IF NOT EXISTS nodes_metadata_gin_idx ON nodes USING GIN (metadata);
CREATE INDEX IF NOT EXISTS edges_metadata_gin_idx ON edges USING GIN (metadata);
`;

const POSTGRES_V5_TO_V6_SQL = `
CREATE TABLE IF NOT EXISTS node_embeddings (
  workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  node_id TEXT NOT NULL,
  model TEXT NOT NULL,
  content_digest TEXT NOT NULL,
  embedding vector NOT NULL,
  created_at TIMESTAMPTZ NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL,
  PRIMARY KEY (workspace_id, node_id, model),
  CHECK (btrim(node_id) <> ''),
  CHECK (btrim(model) <> ''),
  CHECK (btrim(content_digest) <> ''),
  CHECK (vector_dims(embedding) > 0)
);

CREATE INDEX IF NOT EXISTS node_embeddings_workspace_model_node_idx ON node_embeddings (workspace_id, model, node_id);
CREATE INDEX IF NOT EXISTS node_embeddings_workspace_model_updated_idx ON node_embeddings (workspace_id, model, updated_at DESC);
`;

const POSTGRES_V6_TO_V7_SQL = `
DO $$
BEGIN
  CREATE TYPE repository_index_mode AS ENUM ('safe', 'deep');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END
$$;

DO $$
BEGIN
  CREATE TYPE repository_index_stage AS ENUM ('requested', 'resolving_ref', 'checking_out', 'discovering', 'indexing_syntax', 'running_rules', 'embedding_changed_chunks', 'normalizing', 'completed', 'failed', 'cancelled');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END
$$;

CREATE TABLE IF NOT EXISTS repository_indexes (
  workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  id TEXT NOT NULL,
  repository_url TEXT NOT NULL,
  requested_ref TEXT,
  resolved_commit TEXT,
  mode repository_index_mode NOT NULL,
  stage repository_index_stage NOT NULL,
  requested_at TIMESTAMPTZ NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL,
  completed_at TIMESTAMPTZ,
  actor_agent_id TEXT NOT NULL,
  actor_tool TEXT NOT NULL,
  failure_code TEXT,
  failure_message TEXT,
  PRIMARY KEY (workspace_id, id),
  CHECK (btrim(id) <> ''),
  CHECK (btrim(repository_url) <> ''),
  CHECK (requested_ref IS NULL OR btrim(requested_ref) <> ''),
  CHECK (resolved_commit IS NULL OR btrim(resolved_commit) <> ''),
  CHECK (btrim(actor_agent_id) <> ''),
  CHECK (btrim(actor_tool) <> ''),
  CHECK ((failure_code IS NULL) = (failure_message IS NULL)),
  CHECK (
    (
      stage IN ('requested', 'resolving_ref', 'checking_out', 'discovering', 'indexing_syntax', 'running_rules', 'embedding_changed_chunks', 'normalizing')
      AND completed_at IS NULL
      AND failure_code IS NULL
    )
    OR
    (stage = 'completed' AND completed_at IS NOT NULL AND failure_code IS NULL)
    OR
    (stage = 'cancelled' AND completed_at IS NOT NULL AND failure_code IS NULL)
    OR
    (stage = 'failed' AND completed_at IS NOT NULL AND failure_code IS NOT NULL)
  )
);

CREATE INDEX IF NOT EXISTS repository_indexes_workspace_stage_updated_idx ON repository_indexes (workspace_id, stage, updated_at DESC);
CREATE INDEX IF NOT EXISTS repository_indexes_workspace_repo_commit_idx ON repository_indexes (workspace_id, repository_url, resolved_commit);
`;

const POSTGRES_V7_TO_V8_SQL = `
ALTER TABLE repository_indexes
  ADD COLUMN IF NOT EXISTS stats_file_count INTEGER,
  ADD COLUMN IF NOT EXISTS stats_chunk_count INTEGER,
  ADD COLUMN IF NOT EXISTS stats_indexed_bytes BIGINT;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'repository_indexes_stats_pairing_chunk_chk'
      AND conrelid = 'repository_indexes'::regclass
  ) THEN
    ALTER TABLE repository_indexes
      ADD CONSTRAINT repository_indexes_stats_pairing_chunk_chk
      CHECK ((stats_file_count IS NULL) = (stats_chunk_count IS NULL));
  END IF;
END
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'repository_indexes_stats_pairing_bytes_chk'
      AND conrelid = 'repository_indexes'::regclass
  ) THEN
    ALTER TABLE repository_indexes
      ADD CONSTRAINT repository_indexes_stats_pairing_bytes_chk
      CHECK ((stats_file_count IS NULL) = (stats_indexed_bytes IS NULL));
  END IF;
END
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'repository_indexes_stats_non_negative_chk'
      AND conrelid = 'repository_indexes'::regclass
  ) THEN
    ALTER TABLE repository_indexes
      ADD CONSTRAINT repository_indexes_stats_non_negative_chk
      CHECK (
        (stats_file_count IS NULL OR stats_file_count >= 0)
        AND (stats_chunk_count IS NULL OR stats_chunk_count >= 0)
        AND (stats_indexed_bytes IS NULL OR stats_indexed_bytes >= 0)
      );
  END IF;
END
$$;

CREATE TABLE IF NOT EXISTS repository_files (
  workspace_id TEXT NOT NULL,
  index_id TEXT NOT NULL,
  path TEXT NOT NULL,
  ordinal INTEGER NOT NULL,
  language TEXT NOT NULL,
  source_kind TEXT NOT NULL,
  content_hash TEXT NOT NULL,
  byte_size BIGINT NOT NULL,
  PRIMARY KEY (workspace_id, index_id, path),
  UNIQUE (workspace_id, index_id, ordinal),
  FOREIGN KEY (workspace_id, index_id) REFERENCES repository_indexes(workspace_id, id) ON DELETE CASCADE,
  CHECK (ordinal >= 0),
  CHECK (btrim(path) <> ''),
  CHECK (btrim(language) <> ''),
  CHECK (btrim(source_kind) <> ''),
  CHECK (btrim(content_hash) <> ''),
  CHECK (byte_size >= 0)
);

CREATE TABLE IF NOT EXISTS repository_chunks (
  workspace_id TEXT NOT NULL,
  index_id TEXT NOT NULL,
  id TEXT NOT NULL,
  ordinal INTEGER NOT NULL,
  file_path TEXT NOT NULL,
  language TEXT NOT NULL,
  source_kind TEXT NOT NULL,
  start_line INTEGER NOT NULL,
  end_line INTEGER NOT NULL,
  text TEXT NOT NULL,
  content_hash TEXT NOT NULL,
  PRIMARY KEY (workspace_id, index_id, id),
  UNIQUE (workspace_id, index_id, ordinal),
  FOREIGN KEY (workspace_id, index_id) REFERENCES repository_indexes(workspace_id, id) ON DELETE CASCADE,
  FOREIGN KEY (workspace_id, index_id, file_path) REFERENCES repository_files(workspace_id, index_id, path) ON DELETE CASCADE,
  CHECK (ordinal >= 0),
  CHECK (btrim(id) <> ''),
  CHECK (btrim(file_path) <> ''),
  CHECK (btrim(language) <> ''),
  CHECK (btrim(source_kind) <> ''),
  CHECK (start_line > 0),
  CHECK (end_line >= start_line),
  CHECK (btrim(text) <> ''),
  CHECK (btrim(content_hash) <> '')
);

CREATE INDEX IF NOT EXISTS repository_files_workspace_index_path_idx ON repository_files (workspace_id, index_id, path);
CREATE INDEX IF NOT EXISTS repository_chunks_workspace_index_file_idx ON repository_chunks (workspace_id, index_id, file_path, ordinal);
CREATE INDEX IF NOT EXISTS repository_chunks_text_search_idx ON repository_chunks USING GIN (to_tsvector('simple', text));
CREATE INDEX IF NOT EXISTS repository_symbols_workspace_index_file_idx ON repository_symbols (workspace_id, index_id, file_path, ordinal);
CREATE INDEX IF NOT EXISTS repository_symbols_workspace_index_name_idx ON repository_symbols (workspace_id, index_id, qualified_name);
`;

const POSTGRES_V8_TO_V9_SQL = `
ALTER TABLE scan_runs
  ADD COLUMN IF NOT EXISTS repository_index_id TEXT;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'scan_runs_repository_index_fk'
      AND conrelid = 'scan_runs'::regclass
  ) THEN
    ALTER TABLE scan_runs
      ADD CONSTRAINT scan_runs_repository_index_fk
      FOREIGN KEY (workspace_id, repository_index_id) REFERENCES repository_indexes(workspace_id, id) ON DELETE RESTRICT;
  END IF;
END
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'scan_runs_repository_index_id_non_empty_chk'
      AND conrelid = 'scan_runs'::regclass
  ) THEN
    ALTER TABLE scan_runs
      ADD CONSTRAINT scan_runs_repository_index_id_non_empty_chk
      CHECK (repository_index_id IS NULL OR btrim(repository_index_id) <> '');
  END IF;
END
$$;

CREATE INDEX IF NOT EXISTS scan_runs_workspace_repository_index_idx ON scan_runs (workspace_id, repository_index_id, started_at DESC);
`;

const POSTGRES_V9_TO_V10_SQL = `
CREATE TABLE IF NOT EXISTS repository_symbols (
  workspace_id TEXT NOT NULL,
  index_id TEXT NOT NULL,
  key TEXT NOT NULL,
  ordinal INTEGER NOT NULL,
  file_path TEXT NOT NULL,
  language TEXT NOT NULL,
  name TEXT NOT NULL,
  qualified_name TEXT NOT NULL,
  kind TEXT NOT NULL,
  parent_symbol_key TEXT,
  start_line INTEGER NOT NULL,
  start_column INTEGER NOT NULL,
  end_line INTEGER NOT NULL,
  end_column INTEGER NOT NULL,
  is_exported BOOLEAN NOT NULL,
  is_public BOOLEAN NOT NULL,
  producer_tool TEXT NOT NULL,
  producer_version TEXT NOT NULL,
  PRIMARY KEY (workspace_id, index_id, key),
  UNIQUE (workspace_id, index_id, ordinal),
  FOREIGN KEY (workspace_id, index_id) REFERENCES repository_indexes(workspace_id, id) ON DELETE CASCADE,
  FOREIGN KEY (workspace_id, index_id, file_path) REFERENCES repository_files(workspace_id, index_id, path) ON DELETE CASCADE,
  CHECK (ordinal >= 0),
  CHECK (btrim(key) <> ''),
  CHECK (btrim(file_path) <> ''),
  CHECK (btrim(language) <> ''),
  CHECK (btrim(name) <> ''),
  CHECK (btrim(qualified_name) <> ''),
  CHECK (btrim(kind) <> ''),
  CHECK (parent_symbol_key IS NULL OR btrim(parent_symbol_key) <> ''),
  CHECK (start_line > 0),
  CHECK (start_column >= 0),
  CHECK (end_line >= start_line),
  CHECK (end_column >= 0),
  CHECK (btrim(producer_tool) <> ''),
  CHECK (btrim(producer_version) <> '')
);

CREATE INDEX IF NOT EXISTS repository_symbols_workspace_index_file_idx ON repository_symbols (workspace_id, index_id, file_path, ordinal);
CREATE INDEX IF NOT EXISTS repository_symbols_workspace_index_name_idx ON repository_symbols (workspace_id, index_id, qualified_name);
`;
