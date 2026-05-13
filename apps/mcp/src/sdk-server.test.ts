import { DatabaseSync } from "node:sqlite";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { HiveMapRuntime } from "@hivemap/runtime";
import { SqliteHiveMapStore } from "@hivemap/storage";

import { createHiveMapMcpServer } from "./sdk-server.js";

let client: Client;
let server: ReturnType<typeof createHiveMapMcpServer>;
let store: SqliteHiveMapStore;

beforeEach(async () => {
  store = new SqliteHiveMapStore(new DatabaseSync(":memory:"));
  store.initialize();
  server = createHiveMapMcpServer(new HiveMapRuntime({ store }));
  client = new Client({ name: "hivemap-test-client", version: "0.0.0" });
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  await Promise.all([server.connect(serverTransport), client.connect(clientTransport)]);
});

afterEach(async () => {
  await client.close();
  await server.close();
  store.close();
});

describe("HiveMap MCP SDK server", () => {
  it("lists HiveMap tools through MCP", async () => {
    const result = await client.listTools();

    expect(result.tools.map((tool) => tool.name)).toEqual([
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

  it("calls HiveMap tools through MCP transport", async () => {
    const createResult = await client.callTool({
      name: "project_create",
      arguments: {
        workspace: {
          id: "workspace-a",
          name: "Alpha",
          createdAt: "2026-05-13T21:00:00.000Z",
        },
      },
    });

    expect(createResult.structuredContent).toEqual({
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

    const graphResult = await client.callTool({
      name: "graph_command",
      arguments: {
        workspaceId: "workspace-a",
        commands: [
          {
            id: "cmd-a",
            type: "node.create",
            payload: { node: { id: "node-a", label: "Alpha", type: "concept" } },
          },
        ],
      },
    });

    expect(graphResult.structuredContent).toEqual({
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
});
