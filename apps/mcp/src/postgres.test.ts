import { randomUUID } from "node:crypto";

import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { HiveMapRuntime } from "@hivemap/runtime";
import { PostgresHiveMapStore } from "@hivemap/storage";

import { createHiveMapMcpServer } from "./sdk-server.js";

const POSTGRES_TEST_URL = process.env.HIVEMAP_TEST_POSTGRES_URL;
const describeIfPostgres = POSTGRES_TEST_URL === undefined ? describe.skip : describe;

describeIfPostgres("HiveMap MCP SDK server on Postgres", () => {
  let client: Client;
  let server: ReturnType<typeof createHiveMapMcpServer>;
  let store: PostgresHiveMapStore;

  beforeAll(async () => {
    store = PostgresHiveMapStore.open(POSTGRES_TEST_URL as string);
    await store.initialize();
  });

  beforeEach(async () => {
    server = createHiveMapMcpServer(new HiveMapRuntime({ store }));
    client = new Client({ name: "hivemap-postgres-test-client", version: "0.1.0" });
    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
    await Promise.all([server.connect(serverTransport), client.connect(clientTransport)]);
  });

  afterEach(async () => {
    await client.close();
    await server.close();
  });

  afterAll(async () => {
    await store.close();
  });

  it("preserves MCP tool semantics on a Postgres-backed runtime", async () => {
    const workspaceId = `pg-mcp-${randomUUID()}`;
    const workspace = {
      id: workspaceId,
      slug: `${workspaceId}-slug`,
      name: `Postgres MCP Workspace ${workspaceId}`,
      createdAt: "2026-08-19T21:30:00.000Z",
      updatedAt: "2026-08-19T21:31:00.000Z",
    };

    try {
      const createResult = await client.callTool({
        name: "project_create",
        arguments: { workspace },
      });
      expect(createResult.structuredContent).toEqual({
        ok: true,
        tool: "project_create",
        value: { workspace },
      });

      const listResult = await client.callTool({
        name: "workspace_list",
        arguments: { query: workspaceId, limit: 10 },
      });
      expect(listResult.structuredContent).toEqual({
        ok: true,
        tool: "workspace_list",
        value: {
          items: [{ id: workspace.id, slug: workspace.slug, name: workspace.name, updatedAt: workspace.updatedAt }],
        },
      });

      const graphResult = await client.callTool({
        name: "graph_command",
        arguments: {
          workspaceId: workspace.id,
          commands: [
            {
              id: "cmd-root",
              type: "node.create",
              payload: { node: { id: "root", label: "Root", type: "concept" } },
            },
          ],
        },
      });
      expect(graphResult.structuredContent).toEqual({
        ok: true,
        tool: "graph_command",
        value: {
          graph: {
            nodes: [{ id: "root", label: "Root", type: "concept" }],
            edges: [],
          },
        },
      });
    } finally {
      if (await store.workspaceExists(workspace.id)) {
        await store.deleteWorkspace(workspace.id);
      }
    }
  });
});
