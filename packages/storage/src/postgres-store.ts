/**
 * Responsibility: Persist and hydrate HiveMap state through the explicit Postgres adapter.
 * Must not: Own runtime semantics, transport behavior, in-memory test state, or hidden recovery.
 * Contract: Executes ordered schema migrations transactionally and preserves validated store contracts.
 */
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
import { parseScanProfileRecipe, toScanProfileRecipe } from "./scan-profile-recipe.js";
import { POSTGRES_STORAGE_SCHEMA_VERSION, STORAGE_SCHEMA_VERSION } from "./schema.js";
import type {
  ConceptEmbeddingRecord,
  HiveMapStore,
  HiveMapStoreRuntimeConfig,
  RepositoryChunkRecord,
  RepositoryDependencyRecord,
  RepositoryFileRecord,
  RepositoryIndexMode,
  RepositoryIndexRecord,
  RepositoryIndexStage,
  RepositoryReferenceRecord,
  RepositorySearchMatchRecord,
  RepositorySymbolRecord,
  SimilarConceptMatchRecord,
  WorkspaceRecord,
  WorkspaceState,
} from "./contracts.js";
import { StorageError } from "./storage-error.js";
import {
  POSTGRES_SCHEMA_SQL,
  POSTGRES_V5_TO_V6_SQL,
  POSTGRES_V6_TO_V7_SQL,
  POSTGRES_V7_TO_V8_SQL,
  POSTGRES_V8_TO_V9_SQL,
  POSTGRES_V9_TO_V10_SQL,
  POSTGRES_V10_TO_V11_SQL,
  POSTGRES_V11_TO_V12_SQL,
  POSTGRES_V12_TO_V13_SQL,
  POSTGRES_V13_TO_V14_SQL,
  POSTGRES_V14_TO_V15_SQL,
  POSTGRES_V15_TO_V16_PREPARE_SQL,
  POSTGRES_V15_TO_V16_FINALIZE_SQL,
} from "./postgres-schema-sql.js";
import {
  assertNonEmpty,
  assertRepositoryIndexContentOwnership,
  cloneConceptEmbeddingRecord,
  cloneRepositoryIndexRecord,
  cloneWorkspaceRecord,
  cloneWorkspaceState,
  compareRepositoryIndexRecords,
  compareWorkspaceRecords,
  conceptEmbeddingKey,
  cosineSimilarity,
  createTargetIndex,
  isDefined,
  normalizeTimestampText,
  repositoryIndexKey,
  scoreTextMatch,
  serializeVector,
  tokenizeSearchQuery,
  trimSnippet,
  validateConceptEmbeddingRecord,
  validateRepositoryChunkRecord,
  validateRepositoryDependencyRecord,
  validateRepositoryFileRecord,
  validateRepositoryIndexRecord,
  validateRepositoryReferenceRecord,
  validateRepositorySymbolRecord,
  validateWorkspaceRecord,
  validateWorkspaceState,
} from "./store-support.js";




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

type RepositoryReferenceRow = {
  workspace_id: string;
  index_id: string;
  key: string;
  file_path: string;
  language: string;
  source_kind: string;
  kind: string;
  target_text: string;
  resolved_symbol_key: NullableString;
  start_line: number;
  start_column: number;
  end_line: number;
  end_column: number;
  resolution_confidence: string;
  producer_tool: string;
  producer_version: string;
};

type RepositoryDependencyRow = {
  workspace_id: string;
  index_id: string;
  key: string;
  file_path: string;
  language: string;
  source_kind: string;
  kind: string;
  target_text: string;
  target_file_path: NullableString;
  target_symbol_key: NullableString;
  start_line: number;
  start_column: number;
  end_line: number;
  end_column: number;
  resolution_confidence: string;
  producer_tool: string;
  producer_version: string;
};

export class PostgresHiveMapStore implements HiveMapStore {
  private readonly pool: Pool;
  private idlePoolError: Error | undefined;

  constructor(pool: Pool) {
    this.pool = pool;
    this.pool.on("error", (error) => {
      this.idlePoolError = error;
    });
  }

  static open(connectionString: string): PostgresHiveMapStore {
    assertNonEmpty("connectionString", connectionString);
    return new PostgresHiveMapStore(new Pool({ connectionString }));
  }

  static fromConfig(config: PoolConfig): PostgresHiveMapStore {
    return new PostgresHiveMapStore(new Pool(config));
  }

  async initialize(): Promise<void> {
    await this.withTransaction(async (client) => {
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

      if (schemaVersion === "10") {
        await client.query(POSTGRES_V10_TO_V11_SQL);
        schemaVersion = "11";
      }

      if (schemaVersion === "11") {
        await client.query(POSTGRES_V11_TO_V12_SQL);
        schemaVersion = "12";
      }

      if (schemaVersion === "12") {
        await client.query(POSTGRES_V12_TO_V13_SQL);
        schemaVersion = "13";
      }

      if (schemaVersion === "13") {
        await client.query(POSTGRES_V13_TO_V14_SQL);
        schemaVersion = "14";
      }

      if (schemaVersion === "14") {
        await client.query(POSTGRES_V14_TO_V15_SQL);
        schemaVersion = "15";
      }

      if (schemaVersion === "15") {
        await client.query(POSTGRES_V15_TO_V16_PREPARE_SQL);
        await this.backfillBuiltInScanProfileRecipes(client);
        await client.query(POSTGRES_V15_TO_V16_FINALIZE_SQL);
        schemaVersion = "16";
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

  async checkConnection(): Promise<void> {
    if (this.idlePoolError !== undefined) {
      const error = this.idlePoolError;
      this.idlePoolError = undefined;
      throw error;
    }
    await this.pool.query("SELECT 1");
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

  private async backfillBuiltInScanProfileRecipes(client: PoolClient): Promise<void> {
    for (const profile of INITIAL_SCAN_PROFILES) {
      await client.query(
        `UPDATE scan_profiles
         SET profile_recipe = $1::jsonb
         WHERE profile_recipe IS NULL
           AND id = $2
           AND version = $3
           AND name = $4
           AND description = $5
           AND overlay_stem IS NOT DISTINCT FROM $6
           AND instructions = $7::text[]
           AND scope_include = $8::text[]
           AND scope_exclude = $9::text[]
           AND source_types = $10::text[]
           AND criteria = $11::jsonb
           AND ssot_order = $12::text[]
           AND required_outputs::text[] = $13::text[]`,
        [
          JSON.stringify(toScanProfileRecipe(profile)),
          profile.id,
          profile.version,
          profile.name,
          profile.description,
          profile.overlayStem ?? null,
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

  async listRepositoryIndexReferences(workspaceId: string, indexId: string): Promise<RepositoryReferenceRecord[]> {
    assertNonEmpty("workspaceId", workspaceId);
    assertNonEmpty("indexId", indexId);
    const result = await this.pool.query<RepositoryReferenceRow>(
      "SELECT workspace_id, index_id, key, file_path, language, source_kind, kind, target_text, resolved_symbol_key, start_line, start_column, end_line, end_column, resolution_confidence, producer_tool, producer_version " +
        "FROM repository_references WHERE workspace_id = $1 AND index_id = $2 ORDER BY ordinal",
      [workspaceId, indexId],
    );
    return result.rows.map((row) => rowToRepositoryReferenceRecord(row));
  }

  async listRepositoryIndexDependencies(workspaceId: string, indexId: string): Promise<RepositoryDependencyRecord[]> {
    assertNonEmpty("workspaceId", workspaceId);
    assertNonEmpty("indexId", indexId);
    const result = await this.pool.query<RepositoryDependencyRow>(
      "SELECT workspace_id, index_id, key, file_path, language, source_kind, kind, target_text, target_file_path, target_symbol_key, start_line, start_column, end_line, end_column, resolution_confidence, producer_tool, producer_version " +
        "FROM repository_dependencies WHERE workspace_id = $1 AND index_id = $2 ORDER BY ordinal",
      [workspaceId, indexId],
    );
    return result.rows.map((row) => rowToRepositoryDependencyRecord(row));
  }

  async replaceRepositoryIndexContents(
    workspaceId: string,
    indexId: string,
    files: RepositoryFileRecord[],
    chunks: RepositoryChunkRecord[],
    symbols: RepositorySymbolRecord[] = [],
    references: RepositoryReferenceRecord[] = [],
    dependencies: RepositoryDependencyRecord[] = [],
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
    for (const reference of references) {
      validateRepositoryReferenceRecord(reference);
      assertRepositoryIndexContentOwnership("repository reference", workspaceId, indexId, reference.workspaceId, reference.indexId);
    }
    for (const dependency of dependencies) {
      validateRepositoryDependencyRecord(dependency);
      assertRepositoryIndexContentOwnership("repository dependency", workspaceId, indexId, dependency.workspaceId, dependency.indexId);
    }
    await this.withTransaction(async (client) => {
      const existing = await client.query("SELECT 1 FROM repository_indexes WHERE workspace_id = $1 AND id = $2 FOR UPDATE", [workspaceId, indexId]);
      if (existing.rowCount !== 1) {
        throw new StorageError(`Repository index not found: ${workspaceId}/${indexId}`);
      }
      await client.query("DELETE FROM repository_dependencies WHERE workspace_id = $1 AND index_id = $2", [workspaceId, indexId]);
      await client.query("DELETE FROM repository_references WHERE workspace_id = $1 AND index_id = $2", [workspaceId, indexId]);
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

      ordinal = 0;
      for (const reference of references) {
        await client.query(
          "INSERT INTO repository_references (workspace_id, index_id, key, ordinal, file_path, language, source_kind, kind, target_text, resolved_symbol_key, start_line, start_column, end_line, end_column, resolution_confidence, producer_tool, producer_version) " +
            "VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17)",
          [
            reference.workspaceId,
            reference.indexId,
            reference.key,
            ordinal,
            reference.filePath,
            reference.language,
            reference.sourceKind,
            reference.kind,
            reference.targetText,
            reference.resolvedSymbolKey ?? null,
            reference.startLine,
            reference.startColumn,
            reference.endLine,
            reference.endColumn,
            reference.resolutionConfidence,
            reference.producerTool,
            reference.producerVersion,
          ],
        );
        ordinal += 1;
      }

      ordinal = 0;
      for (const dependency of dependencies) {
        await client.query(
          "INSERT INTO repository_dependencies (workspace_id, index_id, key, ordinal, file_path, language, source_kind, kind, target_text, target_file_path, target_symbol_key, start_line, start_column, end_line, end_column, resolution_confidence, producer_tool, producer_version) " +
            "VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18)",
          [
            dependency.workspaceId,
            dependency.indexId,
            dependency.key,
            ordinal,
            dependency.filePath,
            dependency.language,
            dependency.sourceKind,
            dependency.kind,
            dependency.targetText,
            dependency.targetFilePath ?? null,
            dependency.targetSymbolKey ?? null,
            dependency.startLine,
            dependency.startColumn,
            dependency.endLine,
            dependency.endColumn,
            dependency.resolutionConfidence,
            dependency.producerTool,
            dependency.producerVersion,
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
        "INSERT INTO scan_profiles (workspace_id, id, version, ordinal, name, description, overlay_stem, instructions, scope_include, scope_exclude, source_types, criteria, profile_recipe, ssot_order, required_outputs) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)",
        [
          workspaceId,
          profile.id,
          profile.version,
          ordinal,
          profile.name,
          profile.description,
          profile.overlayStem ?? null,
          profile.instructions,
          profile.scope.include,
          profile.scope.exclude,
          profile.sourceTypes,
          JSON.stringify(profile.criteria),
          JSON.stringify(toScanProfileRecipe(profile)),
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
        overlay_stem: NullableString;
        instructions: string[];
        scope_include: string[];
        scope_exclude: string[];
        source_types: string[];
        criteria_json: string;
        profile_recipe_json: string;
        ssot_order: string[];
        required_outputs: ScanProfile["requiredOutputs"];
      }>(
        "SELECT id, version, name, description, overlay_stem, instructions, scope_include, scope_exclude, source_types, criteria::text AS criteria_json, profile_recipe::text AS profile_recipe_json, ssot_order, required_outputs::text[] AS required_outputs FROM scan_profiles WHERE workspace_id = $1 ORDER BY ordinal",
        [workspaceId],
      )
    ).rows;
    return rows.map((row) => ({
      id: row.id,
      version: row.version,
      name: row.name,
      description: row.description,
      ...(row.overlay_stem === null ? {} : { overlayStem: row.overlay_stem }),
      instructions: row.instructions,
      scope: {
        include: row.scope_include,
        exclude: row.scope_exclude,
      },
      sourceTypes: row.source_types,
      criteria: parseJson<ScanProfile["criteria"]>(row.criteria_json),
      ...parseScanProfileRecipe(row.profile_recipe_json),
      ssotOrder: row.ssot_order,
      requiredOutputs: row.required_outputs,
    }));
  }

  private async replaceScanRuns(client: PoolClient, workspaceId: string, runs: readonly ScanRun[]): Promise<void> {
    for (const [ordinal, run] of runs.entries()) {
      await client.query(
        "INSERT INTO scan_runs (workspace_id, id, ordinal, profile_id, profile_version, effective_profile, status, repository_index_id, repository_root, repository_url, repository_branch, repository_revision, repository_worktree_digest, actor_agent_id, actor_tool, started_at, coverage, applied_criteria, declared_outputs, finding_node_ids, calibration_decisions, completed_at, graph_digest, finding_evidence, boundary_map, calibration_override_reason) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22, $23, $24, $25, $26)",
        [
          workspaceId,
          run.id,
          ordinal,
          run.profileId,
          run.profileVersion,
          run.effectiveProfile === undefined ? null : JSON.stringify(run.effectiveProfile),
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
          JSON.stringify(run.calibrationDecisions),
          run.status === "completed" ? run.completedAt : null,
          run.status === "completed" ? run.graphDigest : null,
          run.status === "completed" ? JSON.stringify(run.findingEvidence) : null,
          run.status === "completed" && run.boundaryMap !== undefined ? JSON.stringify(run.boundaryMap) : null,
          run.status === "completed" ? run.calibrationOverrideReason ?? null : null,
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
        effective_profile_json: NullableString;
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
        calibration_decisions_json: string;
        completed_at: NullableString;
        graph_digest: NullableString;
        finding_evidence_json: NullableString;
        boundary_map_json: NullableString;
        calibration_override_reason: NullableString;
      }>(
        "SELECT id, profile_id, profile_version, effective_profile::text AS effective_profile_json, status, repository_index_id, repository_root, repository_url, repository_branch, repository_revision, repository_worktree_digest, actor_agent_id, actor_tool, started_at::text AS started_at, coverage::text AS coverage_json, applied_criteria, declared_outputs::text[] AS declared_outputs, finding_node_ids, calibration_decisions::text AS calibration_decisions_json, completed_at::text AS completed_at, graph_digest, finding_evidence::text AS finding_evidence_json, boundary_map::text AS boundary_map_json, calibration_override_reason FROM scan_runs WHERE workspace_id = $1 ORDER BY ordinal",
        [workspaceId],
      )
    ).rows;

    return rows.map((row) => {
      const base = {
        id: row.id,
        profileId: row.profile_id,
        profileVersion: row.profile_version,
        ...(row.effective_profile_json === null
          ? {}
          : { effectiveProfile: parseJson<NonNullable<ScanRun["effectiveProfile"]>>(row.effective_profile_json) }),
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
        calibrationDecisions: parseJson<ScanRun["calibrationDecisions"]>(row.calibration_decisions_json),
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
          ...(row.boundary_map_json === null
            ? {}
            : {
                boundaryMap: parseJson<NonNullable<Extract<ScanRun, { status: "completed" }>["boundaryMap"]>>(row.boundary_map_json),
              }),
          ...(row.calibration_override_reason === null ? {} : { calibrationOverrideReason: row.calibration_override_reason }),
        };
      }

      return {
        ...base,
        status: "in_progress",
      };
    });
  }
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

  validateRepositoryIndexRecord(record);
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

function rowToRepositoryReferenceRecord(row: RepositoryReferenceRow): RepositoryReferenceRecord {
  return {
    workspaceId: row.workspace_id,
    indexId: row.index_id,
    key: row.key,
    filePath: row.file_path,
    language: row.language,
    sourceKind: row.source_kind,
    kind: row.kind,
    targetText: row.target_text,
    ...(row.resolved_symbol_key === null ? {} : { resolvedSymbolKey: row.resolved_symbol_key }),
    startLine: row.start_line,
    startColumn: row.start_column,
    endLine: row.end_line,
    endColumn: row.end_column,
    resolutionConfidence: row.resolution_confidence,
    producerTool: row.producer_tool,
    producerVersion: row.producer_version,
  };
}

function rowToRepositoryDependencyRecord(row: RepositoryDependencyRow): RepositoryDependencyRecord {
  return {
    workspaceId: row.workspace_id,
    indexId: row.index_id,
    key: row.key,
    filePath: row.file_path,
    language: row.language,
    sourceKind: row.source_kind,
    kind: row.kind,
    targetText: row.target_text,
    ...(row.target_file_path === null ? {} : { targetFilePath: row.target_file_path }),
    ...(row.target_symbol_key === null ? {} : { targetSymbolKey: row.target_symbol_key }),
    startLine: row.start_line,
    startColumn: row.start_column,
    endLine: row.end_line,
    endColumn: row.end_column,
    resolutionConfidence: row.resolution_confidence,
    producerTool: row.producer_tool,
    producerVersion: row.producer_version,
  };
}

function stringifyNullable(value: unknown): string | null {
  return value === undefined ? null : JSON.stringify(value);
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

function parseJson<T>(value: string): T {
  return JSON.parse(value) as T;
}
