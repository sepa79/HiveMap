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
      "workspace_list",
      "workspace_get",
      "workspace_resolve",
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
      "scan_profile_list",
      "scan_list",
      "scan_start",
      "scan_record_coverage",
      "scan_finding_create",
      "finding_update",
      "scan_complete",
      "scan_compare",
      "workspace_export_zip",
      "workspace_import_zip",
    ]);
  });

  it("rejects unknown tool names", () => {
    expect(() => assertKnownMcpTool("node_upsert")).toThrow("Unknown MCP tool");
  });

  it("creates a project and applies graph commands through runtime", () => {
    const createResult = handleMcpTool(runtime, "project_create", {
      workspace: {
        id: "workspace-a",
        slug: "alpha",
        name: "Alpha",
        createdAt: "2026-05-13T21:00:00.000Z",
        updatedAt: "2026-05-13T21:00:00.000Z",
      },
    });

    expect(createResult).toEqual({
      ok: true,
      tool: "project_create",
      value: {
        workspace: {
          id: "workspace-a",
          slug: "alpha",
          name: "Alpha",
          createdAt: "2026-05-13T21:00:00.000Z",
          updatedAt: "2026-05-13T21:00:00.000Z",
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

  it("discovers and resolves workspaces through MCP tools", () => {
    handleMcpTool(runtime, "project_create", {
      workspace: {
        id: "workspace-a",
        slug: "caravanworld",
        name: "Caravan World",
        createdAt: "2026-05-13T21:00:00.000Z",
        updatedAt: "2026-07-17T10:00:00.000Z",
      },
    });

    expect(handleMcpTool(runtime, "workspace_list", { query: "caravan" })).toEqual({
      ok: true,
      tool: "workspace_list",
      value: {
        items: [{ id: "workspace-a", slug: "caravanworld", name: "Caravan World", updatedAt: "2026-07-17T10:00:00.000Z" }],
      },
    });

    expect(handleMcpTool(runtime, "workspace_resolve", { ref: "caravanworld" })).toEqual({
      ok: true,
      tool: "workspace_resolve",
      value: {
        workspace: { id: "workspace-a", slug: "caravanworld", name: "Caravan World", updatedAt: "2026-07-17T10:00:00.000Z" },
      },
    });
  });

  it("returns machine-readable ambiguity details for workspace resolution", () => {
    handleMcpTool(runtime, "project_create", {
      workspace: {
        id: "workspace-a",
        slug: "alpha-a",
        name: "Alpha",
        createdAt: "2026-05-13T21:00:00.000Z",
        updatedAt: "2026-05-13T21:00:00.000Z",
      },
    });
    handleMcpTool(runtime, "project_create", {
      workspace: {
        id: "workspace-b",
        slug: "alpha-b",
        name: "Alpha",
        createdAt: "2026-05-13T21:00:00.000Z",
        updatedAt: "2026-05-13T21:00:00.000Z",
      },
    });

    expect(handleMcpTool(runtime, "workspace_resolve", { ref: "Alpha" })).toEqual({
      ok: false,
      tool: "workspace_resolve",
      error: {
        code: "workspace_ambiguous",
        message: "Workspace reference is ambiguous: Alpha",
        details: {
          ref: "Alpha",
          candidates: [
            { id: "workspace-a", slug: "alpha-a", name: "Alpha", updatedAt: "2026-05-13T21:00:00.000Z" },
            { id: "workspace-b", slug: "alpha-b", name: "Alpha", updatedAt: "2026-05-13T21:00:00.000Z" },
          ],
        },
      },
    });
  });

  it("starts an instructed agent scan through MCP", () => {
    createWorkspaceWithNode();

    const result = handleMcpTool(runtime, "scan_start", {
      workspaceId: "workspace-a",
      scan: {
        id: "scan-a",
        profileId: "documentation-conflicts",
        profileVersion: 1,
        repository: { root: "/repo", branch: "main", revision: "abc123" },
        actor: { agentId: "agent-a", tool: "codex" },
        startedAt: "2026-07-17T10:00:00.000Z",
      },
    });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.run.status).toBe("in_progress");
      expect(result.value.instructions).toContainEqual(expect.stringContaining("Rediscover sources"));
    }
  });
});

function createWorkspaceWithNode(): void {
  handleMcpTool(runtime, "project_create", {
    workspace: {
      id: "workspace-a",
      slug: "alpha",
      name: "Alpha",
      createdAt: "2026-05-13T21:00:00.000Z",
      updatedAt: "2026-05-13T21:00:00.000Z",
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
