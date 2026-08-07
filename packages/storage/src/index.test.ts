import { DatabaseSync } from "node:sqlite";
import { describe, expect, it } from "vitest";

import { DEFAULT_CAPTURE_POLICY } from "@hivemap/capture";
import { INITIAL_CATEGORY_CATALOG } from "@hivemap/categories";
import { createOverviewProjection } from "@hivemap/projections";
import { INITIAL_SCAN_PROFILES } from "@hivemap/scans";

import { STORAGE_SCHEMA_VERSION, SqliteHiveMapStore, StorageError, type WorkspaceState } from "./index.js";
import type { SemanticGraph } from "@hivemap/graph-core";

const graph: SemanticGraph = {
  nodes: [
    { id: "node-a", label: "Alpha", type: "concept" },
    { id: "node-b", label: "Beta", type: "decision", metadata: { owner: "agent" } },
  ],
  edges: [{ id: "edge-a", from: "node-a", to: "node-b", relation: "supports" }],
};

function createState(): WorkspaceState {
  const projection = createOverviewProjection(graph, {
    id: "projection-a",
    name: "Overview",
    maxNodes: 2,
  });

  return {
    workspace: {
      id: "workspace-a",
      slug: "alpha-workspace",
      name: "Alpha Workspace",
      createdAt: "2026-05-13T21:00:00.000Z",
      updatedAt: "2026-05-13T21:00:00.000Z",
    },
    graphId: "graph-a",
    graph: {
      nodes: [...graph.nodes],
      edges: [...graph.edges],
    },
    categoryCatalog: INITIAL_CATEGORY_CATALOG,
    categoryAssignments: [
      {
        id: "assignment-a",
        targetType: "node",
        targetId: "node-a",
        categoryId: "confirmed",
        status: "active",
        provenance: "human",
      },
      {
        id: "assignment-b",
        targetType: "projection",
        targetId: "projection-a",
        categoryId: "inferred",
        status: "active",
        provenance: "agent",
      },
    ],
    capturePolicy: DEFAULT_CAPTURE_POLICY,
    feedbackEvents: [
      {
        id: "feedback-a",
        createdAt: "2026-05-13T21:01:00.000Z",
        type: "node_marked",
        payload: { nodeId: "node-a", mark: "important" },
        projectionId: "projection-a",
      },
    ],
    proposals: [
      {
        id: "proposal-a",
        createdAt: "2026-05-13T21:02:00.000Z",
        sourceFeedbackIds: ["feedback-a"],
        graphCommands: [
          {
            id: "cmd-a",
            type: "node.update",
            payload: {
              id: "node-a",
              changes: { notes: "Marked important by the human." },
            },
          },
        ],
        explanation: "Preserve important feedback as notes.",
        status: "pending",
      },
    ],
    projections: [projection],
    snapshots: [
      {
        id: "snapshot-a",
        createdAt: "2026-05-13T21:03:00.000Z",
        projectionId: "projection-a",
        graph: {
          nodes: [...graph.nodes],
          edges: [...graph.edges],
        },
        projection,
      },
    ],
    scanProfiles: INITIAL_SCAN_PROFILES,
    scanRuns: [],
  };
}

describe("SqliteHiveMapStore", () => {
  it("initializes schema version 2", () => {
    const store = new SqliteHiveMapStore(new DatabaseSync(":memory:"));
    store.initialize();

    const state = store.loadWorkspaceState;
    expect(STORAGE_SCHEMA_VERSION).toBe("3");
    expect(state).toBeTypeOf("function");

    store.close();
  });

  it("migrates schema version 1 and seeds scan profiles for existing workspaces", () => {
    const database = new DatabaseSync(":memory:");
    database.exec(`
      CREATE TABLE schema_metadata (key TEXT PRIMARY KEY, value TEXT NOT NULL);
      INSERT INTO schema_metadata (key, value) VALUES ('schema_version', '1');
      CREATE TABLE workspaces (id TEXT PRIMARY KEY, name TEXT NOT NULL, created_at TEXT NOT NULL);
      INSERT INTO workspaces (id, name, created_at) VALUES ('legacy', 'Legacy', '2026-05-13T21:00:00.000Z');
    `);
    const store = new SqliteHiveMapStore(database);

    store.initialize();

    expect((database.prepare("SELECT value FROM schema_metadata WHERE key = 'schema_version'").get() as { value: string }).value).toBe("3");
    expect((database.prepare("SELECT COUNT(*) AS count FROM scan_profiles WHERE workspace_id = 'legacy'").get() as { count: number }).count).toBe(2);
    expect(
      database.prepare("SELECT slug, archived, updated_at FROM workspaces WHERE id = 'legacy'").get() as {
        slug: string | null;
        archived: number;
        updated_at: string | null;
      },
    ).toEqual({ slug: null, archived: 0, updated_at: null });
    store.close();
  });

  it("persists and loads workspace state", () => {
    const store = new SqliteHiveMapStore(new DatabaseSync(":memory:"));
    store.initialize();

    const state = createState();
    store.saveWorkspaceState(state);

    expect(store.loadWorkspaceState("workspace-a")).toEqual(state);

    store.close();
  });

  it("lists workspace records without loading their graphs", () => {
    const store = new SqliteHiveMapStore(new DatabaseSync(":memory:"));
    store.initialize();
    store.saveWorkspaceState(createState());

    expect(store.listWorkspaces()).toEqual([
      {
        id: "workspace-a",
        slug: "alpha-workspace",
        name: "Alpha Workspace",
        createdAt: "2026-05-13T21:00:00.000Z",
        updatedAt: "2026-05-13T21:00:00.000Z",
      },
    ]);

    store.close();
  });

  it("returns one workspace record without loading its graph", () => {
    const store = new SqliteHiveMapStore(new DatabaseSync(":memory:"));
    store.initialize();
    store.saveWorkspaceState(createState());

    expect(store.getWorkspaceRecord("workspace-a")).toEqual({
      id: "workspace-a",
      slug: "alpha-workspace",
      name: "Alpha Workspace",
      createdAt: "2026-05-13T21:00:00.000Z",
      updatedAt: "2026-05-13T21:00:00.000Z",
    });

    store.close();
  });

  it("replaces a catalog after assignments already reference it", () => {
    const store = new SqliteHiveMapStore(new DatabaseSync(":memory:"));
    store.initialize();

    const state = createState();
    store.saveWorkspaceState(state);
    const nextState: WorkspaceState = {
      ...state,
      categoryAssignments: [
        ...state.categoryAssignments,
        {
          id: "assignment-c",
          targetType: "edge",
          targetId: "edge-a",
          categoryId: "dependency",
          status: "active",
          provenance: "agent",
        },
      ],
    };

    expect(() => store.saveWorkspaceState(nextState)).not.toThrow();
    expect(store.loadWorkspaceState("workspace-a").categoryAssignments).toEqual(nextState.categoryAssignments);

    store.close();
  });

  it("fails when loading a missing workspace", () => {
    const store = new SqliteHiveMapStore(new DatabaseSync(":memory:"));
    store.initialize();

    expect(() => store.loadWorkspaceState("missing")).toThrow(StorageError);

    store.close();
  });

  it("reports workspace existence and deletes explicitly", () => {
    const store = new SqliteHiveMapStore(new DatabaseSync(":memory:"));
    store.initialize();
    store.saveWorkspaceState(createState());

    expect(store.workspaceExists("workspace-a")).toBe(true);
    store.deleteWorkspace("workspace-a");
    expect(store.workspaceExists("workspace-a")).toBe(false);
    expect(() => store.deleteWorkspace("workspace-a")).toThrow(StorageError);

    store.close();
  });

  it("atomically replaces a workspace even when its graph id changes", () => {
    const store = new SqliteHiveMapStore(new DatabaseSync(":memory:"));
    store.initialize();
    const state = createState();
    store.saveWorkspaceState(state);
    const replacement: WorkspaceState = {
      ...state,
      workspace: { ...state.workspace, name: "Replacement" },
      graphId: "replacement-graph",
    };

    store.replaceWorkspaceState(replacement);

    expect(store.loadWorkspaceState("workspace-a")).toEqual(replacement);
    store.close();
  });

  it("rejects invalid workspace state before writing", () => {
    const store = new SqliteHiveMapStore(new DatabaseSync(":memory:"));
    store.initialize();
    const state = createState();

    expect(() =>
      store.saveWorkspaceState({
        ...state,
        categoryAssignments: [
          {
            id: "assignment-a",
            targetType: "node",
            targetId: "missing",
            categoryId: "confirmed",
            status: "active",
            provenance: "human",
          },
        ],
      }),
    ).toThrow();

    expect(() => store.loadWorkspaceState("workspace-a")).toThrow(StorageError);

    store.close();
  });
});
