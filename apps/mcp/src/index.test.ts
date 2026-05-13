import { DatabaseSync } from "node:sqlite";
import { beforeEach, describe, expect, it } from "vitest";

import { HiveMapRuntime } from "@hivemap/runtime";
import { SqliteHiveMapStore } from "@hivemap/storage";

import { HIVEMAP_MCP_TOOL_NAMES, assertKnownMcpTool, handleMcpTool } from "./index.js";

let runtime: HiveMapRuntime;

beforeEach(() => {
  const store = new SqliteHiveMapStore(new DatabaseSync(":memory:"));
  store.initialize();
  runtime = new HiveMapRuntime({ store });
});

describe("MCP tool adapter", () => {
  it("exposes the required alpha tool names", () => {
    expect(HIVEMAP_MCP_TOOL_NAMES).toEqual([
      "project_create",
      "graph_get",
      "graph_command",
      "category_assign",
      "projection_get",
      "projection_create",
      "feedback_list",
      "proposal_create",
      "proposal_approve",
      "proposal_apply",
    ]);
  });

  it("rejects unknown tool names", () => {
    expect(() => assertKnownMcpTool("node_upsert")).toThrow("Unknown MCP tool");
  });

  it("creates a project and applies graph commands through runtime", () => {
    const createResult = handleMcpTool(runtime, "project_create", {
      workspace: {
        id: "workspace-a",
        name: "Alpha",
        createdAt: "2026-05-13T21:00:00.000Z",
      },
    });

    expect(createResult).toEqual({
      ok: true,
      tool: "project_create",
      value: {
        workspace: {
          id: "workspace-a",
          name: "Alpha",
          createdAt: "2026-05-13T21:00:00.000Z",
        },
      },
    });

    const commandResult = handleMcpTool(runtime, "graph_command", {
      workspaceId: "workspace-a",
      commands: [
        {
          id: "cmd-a",
          type: "node.create",
          payload: { node: { id: "node-a", label: "Alpha", type: "concept" } },
        },
      ],
    });

    expect(commandResult).toEqual({
      ok: true,
      tool: "graph_command",
      value: {
        graph: {
          nodes: [{ id: "node-a", label: "Alpha", type: "concept" }],
          edges: [],
        },
      },
    });
  });

  it("creates projections and assigns categories through shared contracts", () => {
    createWorkspaceWithNode();

    const projectionResult = handleMcpTool(runtime, "projection_create", {
      workspaceId: "workspace-a",
      input: {
        id: "projection-a",
        name: "Overview",
        maxNodes: 1,
      },
    });
    expect(projectionResult.ok).toBe(true);

    const assignmentResult = handleMcpTool(runtime, "category_assign", {
      workspaceId: "workspace-a",
      assignment: {
        id: "assignment-a",
        targetType: "node",
        targetId: "node-a",
        categoryId: "confirmed",
        status: "active",
        provenance: "human",
      },
    });

    expect(assignmentResult).toEqual({
      ok: true,
      tool: "category_assign",
      value: {
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
      },
    });
  });

  it("returns visible tool errors without silent fallback", () => {
    const result = handleMcpTool(runtime, "graph_get", { workspaceId: "missing" });

    expect(result).toEqual({
      ok: false,
      tool: "graph_get",
      error: {
        code: "STORAGE_ERROR",
        message: "Workspace not found: missing",
      },
    });
  });
});

function createWorkspaceWithNode(): void {
  handleMcpTool(runtime, "project_create", {
    workspace: {
      id: "workspace-a",
      name: "Alpha",
      createdAt: "2026-05-13T21:00:00.000Z",
    },
  });
  handleMcpTool(runtime, "graph_command", {
    workspaceId: "workspace-a",
    commands: [
      {
        id: "cmd-a",
        type: "node.create",
        payload: { node: { id: "node-a", label: "Alpha", type: "concept" } },
      },
    ],
  });
}
