import { DatabaseSync } from "node:sqlite";
import { beforeEach, describe, expect, it } from "vitest";

import { SqliteHiveMapStore } from "@hivemap/storage";

import { HiveMapRuntime } from "./index.js";

let store: SqliteHiveMapStore;
let runtime: HiveMapRuntime;

beforeEach(() => {
  store = new SqliteHiveMapStore(new DatabaseSync(":memory:"));
  store.initialize();
  runtime = new HiveMapRuntime({ store });
});

describe("HiveMapRuntime", () => {
  it("creates workspaces with empty graph and delegated capture", () => {
    const response = runtime.createWorkspace({
      workspace: {
        id: "workspace-a",
        name: "Alpha",
        createdAt: "2026-05-13T21:00:00.000Z",
      },
    });

    expect(response.workspace.id).toBe("workspace-a");
    expect(runtime.getWorkspace("workspace-a").state.capturePolicy.mode).toBe("delegated");
  });

  it("applies graph commands and creates projections over the same state", () => {
    createWorkspace();
    runtime.applyGraphCommands({
      workspaceId: "workspace-a",
      commands: [
        {
          id: "cmd-a",
          type: "node.create",
          payload: { node: { id: "node-a", label: "Alpha", type: "concept" } },
        },
      ],
    });

    const projection = runtime.createProjection({
      workspaceId: "workspace-a",
      input: { id: "projection-a", name: "Overview", maxNodes: 1 },
    });

    expect(projection.projection.visibleNodeIds).toEqual(["node-a"]);
  });

  it("records feedback without mutating graph", () => {
    createWorkspace();
    runtime.recordFeedback({
      workspaceId: "workspace-a",
      feedbackEvent: {
        id: "feedback-a",
        createdAt: "2026-05-13T21:01:00.000Z",
        type: "map_comment",
        payload: { text: "Keep this visible" },
      },
    });

    expect(runtime.listFeedback({ workspaceId: "workspace-a" }).feedbackEvents).toHaveLength(1);
    expect(runtime.getGraph({ workspaceId: "workspace-a" }).graph).toEqual({ nodes: [], edges: [] });
  });

  it("approves and applies proposals explicitly", () => {
    createWorkspace();
    runtime.createProposal({
      workspaceId: "workspace-a",
      proposal: {
        id: "proposal-a",
        createdAt: "2026-05-13T21:02:00.000Z",
        sourceFeedbackIds: [],
        graphCommands: [
          {
            id: "cmd-a",
            type: "node.create",
            payload: { node: { id: "node-a", label: "Alpha", type: "concept" } },
          },
        ],
        explanation: "Capture Alpha.",
        status: "pending",
      },
    });

    expect(runtime.approveProposal({ workspaceId: "workspace-a", proposalId: "proposal-a" }).proposal.status).toBe(
      "approved",
    );
    expect(runtime.applyProposal({ workspaceId: "workspace-a", proposalId: "proposal-a" }).proposal.status).toBe(
      "applied",
    );
    expect(runtime.getGraph({ workspaceId: "workspace-a" }).graph.nodes).toHaveLength(1);
  });

  it("creates immutable snapshots from current graph and projection", () => {
    createWorkspace();
    runtime.applyGraphCommands({
      workspaceId: "workspace-a",
      commands: [
        {
          id: "cmd-a",
          type: "node.create",
          payload: { node: { id: "node-a", label: "Alpha", type: "concept" } },
        },
      ],
    });
    const projection = runtime.createProjection({
      workspaceId: "workspace-a",
      input: { id: "projection-a", name: "Overview", maxNodes: 1 },
    }).projection;

    const snapshot = runtime.createSnapshot({
      workspaceId: "workspace-a",
      snapshot: {
        id: "snapshot-a",
        createdAt: "2026-05-13T21:05:00.000Z",
        projectionId: projection.id,
      },
    }).snapshot;

    expect(snapshot.graph.nodes).toHaveLength(1);
    expect(snapshot.projection.visibleNodeIds).toEqual(["node-a"]);
    expect(runtime.listSnapshots({ workspaceId: "workspace-a" }).snapshots).toEqual([snapshot]);
  });
});

function createWorkspace(): void {
  runtime.createWorkspace({
    workspace: {
      id: "workspace-a",
      name: "Alpha",
      createdAt: "2026-05-13T21:00:00.000Z",
    },
  });
}
