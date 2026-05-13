import { DatabaseSync } from "node:sqlite";
import { AddressInfo } from "node:net";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { SqliteHiveMapStore } from "@hivemap/storage";

import { createApiServer } from "./index.js";

let store: SqliteHiveMapStore;
let server: ReturnType<typeof createApiServer>;
let baseUrl: string;

beforeEach(async () => {
  store = new SqliteHiveMapStore(new DatabaseSync(":memory:"));
  store.initialize();
  server = createApiServer({ store });
  await new Promise<void>((resolve) => {
    server.listen(0, "127.0.0.1", resolve);
  });
  const address = server.address() as AddressInfo;
  baseUrl = `http://127.0.0.1:${address.port}`;
});

afterEach(async () => {
  await new Promise<void>((resolve, reject) => {
    server.close((error) => (error === undefined ? resolve() : reject(error)));
  });
  store.close();
});

describe("api server", () => {
  it("creates a workspace and returns its empty graph", async () => {
    const createResponse = await postJson("/workspaces", {
      workspace: {
        id: "workspace-a",
        name: "Alpha",
        createdAt: "2026-05-13T21:00:00.000Z",
      },
    });

    expect(createResponse.status).toBe(201);
    expect(await createResponse.json()).toEqual({
      workspace: {
        id: "workspace-a",
        name: "Alpha",
        createdAt: "2026-05-13T21:00:00.000Z",
      },
    });

    const graphResponse = await fetch(`${baseUrl}/workspaces/workspace-a/graph`);
    expect(graphResponse.status).toBe(200);
    expect(await graphResponse.json()).toEqual({ graph: { nodes: [], edges: [] } });
  });

  it("applies graph commands through graph-core", async () => {
    await createWorkspace();

    const response = await postJson("/workspaces/workspace-a/commands", {
      commands: [
        {
          id: "cmd-a",
          type: "node.create",
          payload: { node: { id: "node-a", label: "Alpha", type: "concept" } },
        },
      ],
    });

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      graph: {
        nodes: [{ id: "node-a", label: "Alpha", type: "concept" }],
        edges: [],
      },
    });
  });

  it("records feedback without mutating the graph", async () => {
    await createWorkspace();

    const response = await postJson("/workspaces/workspace-a/feedback", {
      feedbackEvent: {
        id: "feedback-a",
        createdAt: "2026-05-13T21:01:00.000Z",
        type: "map_comment",
        payload: { text: "Group this" },
      },
    });

    expect(response.status).toBe(201);
    expect(await response.json()).toEqual({
      feedbackEvents: [
        {
          id: "feedback-a",
          createdAt: "2026-05-13T21:01:00.000Z",
          type: "map_comment",
          payload: { text: "Group this" },
        },
      ],
    });

    const graphResponse = await fetch(`${baseUrl}/workspaces/workspace-a/graph`);
    expect(await graphResponse.json()).toEqual({ graph: { nodes: [], edges: [] } });
  });

  it("creates projections over existing graph ids", async () => {
    await createWorkspaceWithNode();

    const response = await postJson("/workspaces/workspace-a/projections", {
      input: {
        id: "projection-a",
        name: "Overview",
        maxNodes: 1,
      },
    });

    expect(response.status).toBe(201);
    expect(await response.json()).toEqual({
      projection: {
        id: "projection-a",
        name: "Overview",
        type: "overview",
        rootNodeIds: [],
        visibleNodeIds: ["node-a"],
        visibleEdgeIds: [],
      },
    });
  });

  it("assigns categories through the category contract", async () => {
    await createWorkspaceWithNode();

    const response = await postJson("/workspaces/workspace-a/category-assignments", {
      assignment: {
        id: "assignment-a",
        targetType: "node",
        targetId: "node-a",
        categoryId: "confirmed",
        status: "active",
        provenance: "human",
      },
    });

    expect(response.status).toBe(201);
    expect(await response.json()).toEqual({
      assignments: [
        {
          id: "assignment-a",
          targetType: "node",
          targetId: "node-a",
          categoryId: "confirmed",
          status: "active",
          provenance: "human",
        },
      ],
    });
  });

  it("fails clearly for invalid graph commands", async () => {
    await createWorkspace();

    const response = await postJson("/workspaces/workspace-a/commands", {
      commands: [
        {
          id: "cmd-a",
          type: "edge.create",
          payload: { edge: { id: "edge-a", from: "missing", to: "also-missing", relation: "supports" } },
        },
      ],
    });

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({
      error: {
        code: "GraphValidationError",
        message: "Edge edge-a references missing source node: missing",
      },
    });
  });

  it("approves and applies proposals through separate endpoints", async () => {
    await createWorkspace();

    const proposalResponse = await postJson("/workspaces/workspace-a/proposals", {
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
    expect(proposalResponse.status).toBe(201);

    const approveResponse = await postJson("/workspaces/workspace-a/proposals/proposal-a/approve", {});
    expect(approveResponse.status).toBe(200);
    expect(await approveResponse.json()).toEqual({
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
        status: "approved",
      },
    });

    const applyResponse = await postJson("/workspaces/workspace-a/proposals/proposal-a/apply", {});
    expect(applyResponse.status).toBe(200);
    expect((await applyResponse.json()) as unknown).toMatchObject({
      graph: {
        nodes: [{ id: "node-a", label: "Alpha", type: "concept" }],
        edges: [],
      },
      proposal: {
        id: "proposal-a",
        status: "applied",
      },
    });
  });

  it("creates and lists snapshots from a projection", async () => {
    await createWorkspaceWithNode();
    const projectionResponse = await postJson("/workspaces/workspace-a/projections", {
      input: {
        id: "projection-a",
        name: "Overview",
        maxNodes: 1,
      },
    });
    expect(projectionResponse.status).toBe(201);

    const snapshotResponse = await postJson("/workspaces/workspace-a/snapshots", {
      snapshot: {
        id: "snapshot-a",
        createdAt: "2026-05-13T21:05:00.000Z",
        projectionId: "projection-a",
      },
    });
    expect(snapshotResponse.status).toBe(201);
    expect((await snapshotResponse.json()) as unknown).toMatchObject({
      snapshot: {
        id: "snapshot-a",
        projectionId: "projection-a",
        graph: {
          nodes: [{ id: "node-a", label: "Alpha", type: "concept" }],
        },
      },
    });

    const listResponse = await fetch(`${baseUrl}/workspaces/workspace-a/snapshots`);
    expect(listResponse.status).toBe(200);
    expect(((await listResponse.json()) as { snapshots: unknown[] }).snapshots).toHaveLength(1);
  });
});

async function createWorkspace(): Promise<void> {
  const response = await postJson("/workspaces", {
    workspace: {
      id: "workspace-a",
      name: "Alpha",
      createdAt: "2026-05-13T21:00:00.000Z",
    },
  });
  expect(response.status).toBe(201);
}

async function createWorkspaceWithNode(): Promise<void> {
  await createWorkspace();
  const response = await postJson("/workspaces/workspace-a/commands", {
    commands: [
      {
        id: "cmd-a",
        type: "node.create",
        payload: { node: { id: "node-a", label: "Alpha", type: "concept" } },
      },
    ],
  });
  expect(response.status).toBe(200);
}

async function postJson(pathname: string, body: unknown): Promise<Response> {
  return fetch(`${baseUrl}${pathname}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}
