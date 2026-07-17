import { DatabaseSync } from "node:sqlite";

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
import { STORAGE_SCHEMA_VERSION } from "./schema.js";

export {
  BundleValidationError,
  HIVEMAP_BUNDLE_FORMAT_VERSION,
  createWorkspaceBundle,
  parseWorkspaceBundle,
  readWorkspaceBundle,
  stableJson,
  writeWorkspaceBundle,
  type BundleManifest,
  type WorkspaceBundle,
} from "./bundle.js";
export { STORAGE_SCHEMA_VERSION } from "./schema.js";

export type WorkspaceRecord = {
  id: string;
  name: string;
  createdAt: string;
};

export type SnapshotRecord = {
  id: string;
  createdAt: string;
  projectionId?: string;
  graph: SemanticGraph;
  projection: Projection;
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
  snapshots: SnapshotRecord[];
  scanProfiles: ScanProfile[];
  scanRuns: ScanRun[];
};

export class StorageError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "StorageError";
  }
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

export class SqliteHiveMapStore {
  private readonly db: DatabaseSync;

  constructor(db: DatabaseSync) {
    this.db = db;
  }

  static open(path: string): SqliteHiveMapStore {
    assertNonEmpty("path", path);
    return new SqliteHiveMapStore(new DatabaseSync(path));
  }

  initialize(): void {
    this.db.exec(SCHEMA_SQL);

    const schemaVersion = this.getSchemaVersion();
    if (schemaVersion === undefined) {
      this.db.prepare("INSERT INTO schema_metadata (key, value) VALUES ('schema_version', ?)").run(STORAGE_SCHEMA_VERSION);
      return;
    }

    if (schemaVersion === "1") {
      this.db.exec(SCAN_SCHEMA_SQL);
      const workspaceRows = this.db.prepare("SELECT id FROM workspaces ORDER BY id").all() as Array<{ id: string }>;
      const insertProfile = this.db.prepare(
        "INSERT INTO scan_profiles (workspace_id, id, version, profile_json) VALUES (?, ?, ?, ?)",
      );
      for (const workspace of workspaceRows) {
        for (const profile of INITIAL_SCAN_PROFILES) {
          insertProfile.run(workspace.id, profile.id, profile.version, JSON.stringify(profile));
        }
      }
      this.db.prepare("UPDATE schema_metadata SET value = ? WHERE key = 'schema_version'").run(STORAGE_SCHEMA_VERSION);
      return;
    }

    if (schemaVersion !== STORAGE_SCHEMA_VERSION) {
      throw new StorageError(`Unsupported storage schema version: ${schemaVersion}`);
    }
  }

  close(): void {
    this.db.close();
  }

  listWorkspaces(): WorkspaceRecord[] {
    return (this.db.prepare("SELECT id, name, created_at FROM workspaces ORDER BY name, id").all() as Array<{
      id: string;
      name: string;
      created_at: string;
    }>).map((row) => ({ id: row.id, name: row.name, createdAt: row.created_at }));
  }

  workspaceExists(workspaceId: string): boolean {
    assertNonEmpty("workspaceId", workspaceId);
    return this.db.prepare("SELECT 1 AS found FROM workspaces WHERE id = ?").get(workspaceId) !== undefined;
  }

  deleteWorkspace(workspaceId: string): void {
    assertNonEmpty("workspaceId", workspaceId);
    const result = this.db.prepare("DELETE FROM workspaces WHERE id = ?").run(workspaceId);
    if (result.changes !== 1) {
      throw new StorageError(`Workspace not found: ${workspaceId}`);
    }
  }

  saveWorkspaceState(state: WorkspaceState): void {
    validateWorkspaceState(state);

    this.db.exec("BEGIN");
    try {
      this.writeWorkspaceState(state);
      this.db.exec("COMMIT");
    } catch (error) {
      this.db.exec("ROLLBACK");
      throw error;
    }
  }

  replaceWorkspaceState(state: WorkspaceState): void {
    validateWorkspaceState(state);
    this.db.exec("BEGIN");
    try {
      const result = this.db.prepare("DELETE FROM workspaces WHERE id = ?").run(state.workspace.id);
      if (result.changes !== 1) throw new StorageError(`Workspace not found for replacement: ${state.workspace.id}`);
      this.writeWorkspaceState(state);
      this.db.exec("COMMIT");
    } catch (error) {
      this.db.exec("ROLLBACK");
      throw error;
    }
  }

  loadWorkspaceState(workspaceId: string): WorkspaceState {
    assertNonEmpty("workspaceId", workspaceId);

    const workspace = this.loadWorkspaceRecord(workspaceId);
    const graphId = this.loadGraphId(workspaceId);
    const graph = this.loadGraph(graphId);
    const categoryCatalog = this.loadCategoryCatalog(workspaceId);
    const projections = this.loadProjections(workspaceId, graph);
    const state: WorkspaceState = {
      workspace,
      graphId,
      graph,
      categoryCatalog,
      categoryAssignments: this.loadCategoryAssignments(workspaceId),
      capturePolicy: this.loadCapturePolicy(workspaceId),
      feedbackEvents: this.loadFeedbackEvents(workspaceId),
      proposals: this.loadProposals(workspaceId),
      projections,
      snapshots: this.loadSnapshots(workspaceId),
      scanProfiles: this.loadScanProfiles(workspaceId),
      scanRuns: this.loadScanRuns(workspaceId),
    };

    validateWorkspaceState(state);
    return state;
  }

  private getSchemaVersion(): string | undefined {
    const row = this.db
      .prepare("SELECT value FROM schema_metadata WHERE key = 'schema_version'")
      .get() as { value: string } | undefined;
    return row?.value;
  }

  private writeWorkspaceState(state: WorkspaceState): void {
    this.saveWorkspaceRecord(state.workspace);
    this.replaceGraph(state.graphId, state.workspace.id, state.graph);
    this.deleteCategoryAssignments(state.workspace.id);
    this.replaceCategoryCatalog(state.workspace.id, state.categoryCatalog);
    this.insertCategoryAssignments(state.workspace.id, state.categoryAssignments);
    this.replaceCapturePolicy(state.workspace.id, state.capturePolicy);
    this.replaceFeedbackEvents(state.workspace.id, state.feedbackEvents);
    this.replaceProposals(state.workspace.id, state.proposals);
    this.replaceProjections(state.workspace.id, state.projections);
    this.replaceSnapshots(state.workspace.id, state.snapshots);
    this.replaceScanProfiles(state.workspace.id, state.scanProfiles);
    this.replaceScanRuns(state.workspace.id, state.scanRuns);
  }

  private saveWorkspaceRecord(workspace: WorkspaceRecord): void {
    this.db
      .prepare(
        "INSERT INTO workspaces (id, name, created_at) VALUES (?, ?, ?) " +
          "ON CONFLICT(id) DO UPDATE SET name = excluded.name, created_at = excluded.created_at",
      )
      .run(workspace.id, workspace.name, workspace.createdAt);
  }

  private loadWorkspaceRecord(workspaceId: string): WorkspaceRecord {
    const row = this.db
      .prepare("SELECT id, name, created_at FROM workspaces WHERE id = ?")
      .get(workspaceId) as { id: string; name: string; created_at: string } | undefined;

    if (row === undefined) {
      throw new StorageError(`Workspace not found: ${workspaceId}`);
    }

    return { id: row.id, name: row.name, createdAt: row.created_at };
  }

  private replaceGraph(graphId: string, workspaceId: string, graph: SemanticGraph): void {
    this.db.prepare("DELETE FROM graphs WHERE id = ?").run(graphId);
    this.db.prepare("INSERT INTO graphs (id, workspace_id) VALUES (?, ?)").run(graphId, workspaceId);

    const insertNode = this.db.prepare(
      "INSERT INTO nodes (graph_id, id, label, type, notes, metadata_json) VALUES (?, ?, ?, ?, ?, ?)",
    );
    for (const node of graph.nodes) {
      insertNode.run(graphId, node.id, node.label, node.type, node.notes ?? null, stringifyNullable(node.metadata));
    }

    const insertEdge = this.db.prepare(
      "INSERT INTO edges (graph_id, id, from_id, to_id, relation, label, notes, metadata_json) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
    );
    for (const edge of graph.edges) {
      insertEdge.run(
        graphId,
        edge.id,
        edge.from,
        edge.to,
        edge.relation,
        edge.label ?? null,
        edge.notes ?? null,
        stringifyNullable(edge.metadata),
      );
    }
  }

  private loadGraphId(workspaceId: string): string {
    const row = this.db.prepare("SELECT id FROM graphs WHERE workspace_id = ?").get(workspaceId) as
      | { id: string }
      | undefined;

    if (row === undefined) {
      throw new StorageError(`Graph not found for workspace: ${workspaceId}`);
    }

    return row.id;
  }

  private loadGraph(graphId: string): SemanticGraph {
    const nodeRows = this.db
      .prepare("SELECT id, label, type, notes, metadata_json FROM nodes WHERE graph_id = ? ORDER BY rowid")
      .all(graphId) as NodeRow[];
    const edgeRows = this.db
      .prepare("SELECT id, from_id, to_id, relation, label, notes, metadata_json FROM edges WHERE graph_id = ? ORDER BY rowid")
      .all(graphId) as EdgeRow[];

    const graph: SemanticGraph = {
      nodes: nodeRows.map(rowToNode),
      edges: edgeRows.map(rowToEdge),
    };
    validateGraph(graph);
    return graph;
  }

  private replaceCategoryCatalog(workspaceId: string, catalog: CategoryCatalog): void {
    this.db.prepare("DELETE FROM categories WHERE workspace_id = ?").run(workspaceId);
    const insert = this.db.prepare(
      "INSERT INTO categories (workspace_id, id, label, description, source) VALUES (?, ?, ?, ?, ?)",
    );
    for (const category of catalog.categories) {
      insert.run(workspaceId, category.id, category.label, category.description, category.source);
    }
  }

  private loadCategoryCatalog(workspaceId: string): CategoryCatalog {
    const categories = this.db
      .prepare("SELECT id, label, description, source FROM categories WHERE workspace_id = ? ORDER BY rowid")
      .all(workspaceId) as CategoryCatalog["categories"];
    const catalog = { categories };
    validateCategoryCatalog(catalog);
    return catalog;
  }

  private deleteCategoryAssignments(workspaceId: string): void {
    this.db.prepare("DELETE FROM category_assignments WHERE workspace_id = ?").run(workspaceId);
  }

  private insertCategoryAssignments(workspaceId: string, assignments: readonly CategoryAssignment[]): void {
    const insert = this.db.prepare(
      "INSERT INTO category_assignments (workspace_id, id, target_type, target_id, category_id, status, provenance, notes) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
    );
    for (const assignment of assignments) {
      insert.run(
        workspaceId,
        assignment.id,
        assignment.targetType,
        assignment.targetId,
        assignment.categoryId,
        assignment.status,
        assignment.provenance,
        assignment.notes ?? null,
      );
    }
  }

  private loadCategoryAssignments(workspaceId: string): CategoryAssignment[] {
    const rows = this.db
      .prepare(
        "SELECT id, target_type AS targetType, target_id AS targetId, category_id AS categoryId, status, provenance, notes FROM category_assignments WHERE workspace_id = ? ORDER BY rowid",
      )
      .all(workspaceId) as Array<Omit<CategoryAssignment, "notes"> & { notes: NullableString }>;

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

  private replaceCapturePolicy(workspaceId: string, policy: CapturePolicy): void {
    this.db.prepare("DELETE FROM capture_policies WHERE workspace_id = ?").run(workspaceId);
    this.db
      .prepare("INSERT INTO capture_policies (workspace_id, id, mode, rules_json) VALUES (?, ?, ?, ?)")
      .run(workspaceId, policy.id, policy.mode, stringifyNullable(policy.rules));
  }

  private loadCapturePolicy(workspaceId: string): CapturePolicy {
    const row = this.db.prepare("SELECT id, mode, rules_json FROM capture_policies WHERE workspace_id = ?").get(workspaceId) as
      | { id: string; mode: CapturePolicy["mode"]; rules_json: NullableString }
      | undefined;

    if (row === undefined) {
      throw new StorageError(`Capture policy not found for workspace: ${workspaceId}`);
    }

    const policy: CapturePolicy = { id: row.id, mode: row.mode };
    if (row.rules_json !== null) {
      policy.rules = parseJson<string[]>(row.rules_json);
    }
    validateCapturePolicy(policy);
    return policy;
  }

  private replaceFeedbackEvents(workspaceId: string, events: readonly FeedbackEvent[]): void {
    this.db.prepare("DELETE FROM feedback_events WHERE workspace_id = ?").run(workspaceId);
    const insert = this.db.prepare(
      "INSERT INTO feedback_events (workspace_id, id, created_at, type, payload_json, projection_id) VALUES (?, ?, ?, ?, ?, ?)",
    );
    for (const event of events) {
      insert.run(workspaceId, event.id, event.createdAt, event.type, JSON.stringify(event.payload), event.projectionId ?? null);
    }
  }

  private loadFeedbackEvents(workspaceId: string): FeedbackEvent[] {
    const rows = this.db
      .prepare("SELECT id, created_at, type, payload_json, projection_id FROM feedback_events WHERE workspace_id = ? ORDER BY rowid")
      .all(workspaceId) as Array<{
      id: string;
      created_at: string;
      type: FeedbackEvent["type"];
      payload_json: string;
      projection_id: NullableString;
    }>;

    return rows.map((row) => {
      const event: FeedbackEvent = {
        id: row.id,
        createdAt: row.created_at,
        type: row.type,
        payload: parseJson<Record<string, unknown>>(row.payload_json),
      };
      if (row.projection_id !== null) {
        event.projectionId = row.projection_id;
      }
      return event;
    });
  }

  private replaceProposals(workspaceId: string, proposals: readonly GraphProposal[]): void {
    this.db.prepare("DELETE FROM proposals WHERE workspace_id = ?").run(workspaceId);
    const insert = this.db.prepare(
      "INSERT INTO proposals (workspace_id, id, created_at, source_feedback_ids_json, graph_commands_json, explanation, risk_category_impact, status) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
    );
    for (const proposal of proposals) {
      insert.run(
        workspaceId,
        proposal.id,
        proposal.createdAt,
        JSON.stringify(proposal.sourceFeedbackIds),
        JSON.stringify(proposal.graphCommands),
        proposal.explanation,
        proposal.riskCategoryImpact ?? null,
        proposal.status,
      );
    }
  }

  private loadProposals(workspaceId: string): GraphProposal[] {
    const rows = this.db
      .prepare(
        "SELECT id, created_at, source_feedback_ids_json, graph_commands_json, explanation, risk_category_impact, status FROM proposals WHERE workspace_id = ? ORDER BY rowid",
      )
      .all(workspaceId) as Array<{
      id: string;
      created_at: string;
      source_feedback_ids_json: string;
      graph_commands_json: string;
      explanation: string;
      risk_category_impact: NullableString;
      status: GraphProposal["status"];
    }>;

    return rows.map((row) => {
      const proposal: GraphProposal = {
        id: row.id,
        createdAt: row.created_at,
        sourceFeedbackIds: parseJson<string[]>(row.source_feedback_ids_json),
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

  private replaceProjections(workspaceId: string, projections: readonly Projection[]): void {
    this.db.prepare("DELETE FROM projections WHERE workspace_id = ?").run(workspaceId);
    const insert = this.db.prepare(
      "INSERT INTO projections (workspace_id, id, name, type, root_node_ids_json, visible_node_ids_json, visible_edge_ids_json, groups_json, layout_json) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
    );
    for (const projection of projections) {
      insert.run(
        workspaceId,
        projection.id,
        projection.name,
        projection.type,
        JSON.stringify(projection.rootNodeIds),
        JSON.stringify(projection.visibleNodeIds),
        JSON.stringify(projection.visibleEdgeIds),
        stringifyNullable(projection.groups),
        stringifyNullable(projection.layout),
      );
    }
  }

  private loadProjections(workspaceId: string, graph: SemanticGraph): Projection[] {
    const rows = this.db
      .prepare(
        "SELECT id, name, type, root_node_ids_json, visible_node_ids_json, visible_edge_ids_json, groups_json, layout_json FROM projections WHERE workspace_id = ? ORDER BY rowid",
      )
      .all(workspaceId) as Array<{
      id: string;
      name: string;
      type: Projection["type"];
      root_node_ids_json: string;
      visible_node_ids_json: string;
      visible_edge_ids_json: string;
      groups_json: NullableString;
      layout_json: NullableString;
    }>;

    return rows.map((row) => {
      const projection: Projection = {
        id: row.id,
        name: row.name,
        type: row.type,
        rootNodeIds: parseJson<string[]>(row.root_node_ids_json),
        visibleNodeIds: parseJson<string[]>(row.visible_node_ids_json),
        visibleEdgeIds: parseJson<string[]>(row.visible_edge_ids_json),
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

  private replaceSnapshots(workspaceId: string, snapshots: readonly SnapshotRecord[]): void {
    this.db.prepare("DELETE FROM snapshots WHERE workspace_id = ?").run(workspaceId);
    const insert = this.db.prepare(
      "INSERT INTO snapshots (workspace_id, id, created_at, projection_id, graph_json, projection_json) VALUES (?, ?, ?, ?, ?, ?)",
    );
    for (const snapshot of snapshots) {
      insert.run(
        workspaceId,
        snapshot.id,
        snapshot.createdAt,
        snapshot.projectionId ?? null,
        JSON.stringify(snapshot.graph),
        JSON.stringify(snapshot.projection),
      );
    }
  }

  private loadSnapshots(workspaceId: string): SnapshotRecord[] {
    const rows = this.db
      .prepare("SELECT id, created_at, projection_id, graph_json, projection_json FROM snapshots WHERE workspace_id = ? ORDER BY rowid")
      .all(workspaceId) as Array<{
      id: string;
      created_at: string;
      projection_id: NullableString;
      graph_json: string;
      projection_json: string;
    }>;

    return rows.map((row) => {
      const snapshot: SnapshotRecord = {
        id: row.id,
        createdAt: row.created_at,
        graph: parseJson<SemanticGraph>(row.graph_json),
        projection: parseJson<Projection>(row.projection_json),
      };
      if (row.projection_id !== null) {
        snapshot.projectionId = row.projection_id;
      }
      validateGraph(snapshot.graph);
      validateProjection(snapshot.projection, snapshot.graph);
      return snapshot;
    });
  }

  private replaceScanProfiles(workspaceId: string, profiles: readonly ScanProfile[]): void {
    this.db.prepare("DELETE FROM scan_profiles WHERE workspace_id = ?").run(workspaceId);
    const insert = this.db.prepare(
      "INSERT INTO scan_profiles (workspace_id, id, version, profile_json) VALUES (?, ?, ?, ?)",
    );
    for (const profile of profiles) {
      insert.run(workspaceId, profile.id, profile.version, JSON.stringify(profile));
    }
  }

  private loadScanProfiles(workspaceId: string): ScanProfile[] {
    const rows = this.db
      .prepare("SELECT profile_json FROM scan_profiles WHERE workspace_id = ? ORDER BY rowid")
      .all(workspaceId) as Array<{ profile_json: string }>;
    return rows.map((row) => parseJson<ScanProfile>(row.profile_json));
  }

  private replaceScanRuns(workspaceId: string, runs: readonly ScanRun[]): void {
    this.db.prepare("DELETE FROM scan_runs WHERE workspace_id = ?").run(workspaceId);
    const insert = this.db.prepare("INSERT INTO scan_runs (workspace_id, id, run_json) VALUES (?, ?, ?)");
    for (const run of runs) {
      insert.run(workspaceId, run.id, JSON.stringify(run));
    }
  }

  private loadScanRuns(workspaceId: string): ScanRun[] {
    const rows = this.db
      .prepare("SELECT run_json FROM scan_runs WHERE workspace_id = ? ORDER BY rowid")
      .all(workspaceId) as Array<{ run_json: string }>;
    return rows.map((row) => parseJson<ScanRun>(row.run_json));
  }
}

export function validateWorkspaceState(state: WorkspaceState): void {
  assertNonEmpty("workspace.id", state.workspace.id);
  assertNonEmpty("workspace.name", state.workspace.name);
  assertNonEmpty("workspace.createdAt", state.workspace.createdAt);
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

function stringifyNullable(value: unknown): string | null {
  return value === undefined ? null : JSON.stringify(value);
}

function parseJson<T>(value: string): T {
  return JSON.parse(value) as T;
}

function assertNonEmpty(fieldName: string, value: string): void {
  if (value.trim().length === 0) {
    throw new StorageError(`${fieldName} must be non-empty`);
  }
}

const SCHEMA_SQL = `
PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS schema_metadata (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS workspaces (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS graphs (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS nodes (
  graph_id TEXT NOT NULL REFERENCES graphs(id) ON DELETE CASCADE,
  id TEXT NOT NULL,
  label TEXT NOT NULL,
  type TEXT NOT NULL,
  notes TEXT,
  metadata_json TEXT,
  PRIMARY KEY (graph_id, id)
);

CREATE TABLE IF NOT EXISTS edges (
  graph_id TEXT NOT NULL REFERENCES graphs(id) ON DELETE CASCADE,
  id TEXT NOT NULL,
  from_id TEXT NOT NULL,
  to_id TEXT NOT NULL,
  relation TEXT NOT NULL,
  label TEXT,
  notes TEXT,
  metadata_json TEXT,
  PRIMARY KEY (graph_id, id),
  FOREIGN KEY (graph_id, from_id) REFERENCES nodes(graph_id, id) ON DELETE RESTRICT,
  FOREIGN KEY (graph_id, to_id) REFERENCES nodes(graph_id, id) ON DELETE RESTRICT
);

CREATE TABLE IF NOT EXISTS categories (
  workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  id TEXT NOT NULL,
  label TEXT NOT NULL,
  description TEXT NOT NULL,
  source TEXT NOT NULL,
  PRIMARY KEY (workspace_id, id)
);

CREATE TABLE IF NOT EXISTS category_assignments (
  workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  id TEXT NOT NULL,
  target_type TEXT NOT NULL,
  target_id TEXT NOT NULL,
  category_id TEXT NOT NULL,
  status TEXT NOT NULL,
  provenance TEXT NOT NULL,
  notes TEXT,
  PRIMARY KEY (workspace_id, id),
  FOREIGN KEY (workspace_id, category_id) REFERENCES categories(workspace_id, id) ON DELETE RESTRICT
);

CREATE TABLE IF NOT EXISTS capture_policies (
  workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  id TEXT NOT NULL,
  mode TEXT NOT NULL,
  rules_json TEXT,
  PRIMARY KEY (workspace_id, id)
);

CREATE TABLE IF NOT EXISTS feedback_events (
  workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  id TEXT NOT NULL,
  created_at TEXT NOT NULL,
  type TEXT NOT NULL,
  payload_json TEXT NOT NULL,
  projection_id TEXT,
  PRIMARY KEY (workspace_id, id)
);

CREATE TABLE IF NOT EXISTS proposals (
  workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  id TEXT NOT NULL,
  created_at TEXT NOT NULL,
  source_feedback_ids_json TEXT NOT NULL,
  graph_commands_json TEXT NOT NULL,
  explanation TEXT NOT NULL,
  risk_category_impact TEXT,
  status TEXT NOT NULL,
  PRIMARY KEY (workspace_id, id)
);

CREATE TABLE IF NOT EXISTS projections (
  workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  id TEXT NOT NULL,
  name TEXT NOT NULL,
  type TEXT NOT NULL,
  root_node_ids_json TEXT NOT NULL,
  visible_node_ids_json TEXT NOT NULL,
  visible_edge_ids_json TEXT NOT NULL,
  groups_json TEXT,
  layout_json TEXT,
  PRIMARY KEY (workspace_id, id)
);

CREATE TABLE IF NOT EXISTS snapshots (
  workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  id TEXT NOT NULL,
  created_at TEXT NOT NULL,
  projection_id TEXT,
  graph_json TEXT NOT NULL,
  projection_json TEXT NOT NULL,
  PRIMARY KEY (workspace_id, id)
);

CREATE TABLE IF NOT EXISTS scan_profiles (
  workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  id TEXT NOT NULL,
  version INTEGER NOT NULL,
  profile_json TEXT NOT NULL,
  PRIMARY KEY (workspace_id, id, version)
);

CREATE TABLE IF NOT EXISTS scan_runs (
  workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  id TEXT NOT NULL,
  run_json TEXT NOT NULL,
  PRIMARY KEY (workspace_id, id)
);
`;

const SCAN_SCHEMA_SQL = `
CREATE TABLE IF NOT EXISTS scan_profiles (
  workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  id TEXT NOT NULL,
  version INTEGER NOT NULL,
  profile_json TEXT NOT NULL,
  PRIMARY KEY (workspace_id, id, version)
);

CREATE TABLE IF NOT EXISTS scan_runs (
  workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  id TEXT NOT NULL,
  run_json TEXT NOT NULL,
  PRIMARY KEY (workspace_id, id)
);
`;
