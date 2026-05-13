import { DatabaseSync } from "node:sqlite";
import { describe, expect, it } from "vitest";

import { DEFAULT_CAPTURE_POLICY } from "@hivemap/capture";
import { INITIAL_CATEGORY_CATALOG } from "@hivemap/categories";
import { createOverviewProjection } from "@hivemap/projections";

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
      name: "Alpha Workspace",
      createdAt: "2026-05-13T21:00:00.000Z",
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
  };
}

describe("SqliteHiveMapStore", () => {
  it("initializes schema version 1", () => {
    const store = new SqliteHiveMapStore(new DatabaseSync(":memory:"));
    store.initialize();

    const state = store.loadWorkspaceState;
    expect(STORAGE_SCHEMA_VERSION).toBe("1");
    expect(state).toBeTypeOf("function");

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

  it("fails when loading a missing workspace", () => {
    const store = new SqliteHiveMapStore(new DatabaseSync(":memory:"));
    store.initialize();

    expect(() => store.loadWorkspaceState("missing")).toThrow(StorageError);

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
