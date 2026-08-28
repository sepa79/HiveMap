import { createServer, type Server } from "node:http";

import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { HiveMapRuntime } from "@hivemap/runtime";
import { InMemoryHiveMapStore } from "@hivemap/storage";

import { handleHiveMapMcpHttpRequest } from "./http.js";

let client: Client;
let httpServer: Server;
let store: InMemoryHiveMapStore;

beforeEach(async () => {
  store = new InMemoryHiveMapStore();
  await store.initialize();
  const runtime = new HiveMapRuntime({ store });
  httpServer = createServer((request, response) => {
    void handleHiveMapMcpHttpRequest(runtime, request, response);
  });
  await new Promise<void>((resolve) => httpServer.listen(0, "127.0.0.1", resolve));
  const address = httpServer.address();
  if (address === null || typeof address === "string") {
    throw new Error("Expected an allocated TCP port for the MCP test server");
  }
  client = new Client({ name: "hivemap-http-test-client", version: "0.1.0" });
  const transport = new StreamableHTTPClientTransport(new URL(`http://127.0.0.1:${address.port}/mcp`));
  await client.connect(transport as unknown as Parameters<typeof client.connect>[0]);
});

afterEach(async () => {
  await client.close();
  await new Promise<void>((resolve, reject) => {
    httpServer.close((error) => error === undefined ? resolve() : reject(error));
  });
  await store.close();
});

describe("HiveMap Streamable HTTP MCP transport", () => {
  it("serves the existing MCP tools without an HTTP session", async () => {
    const tools = await client.listTools();

    expect(tools.tools.map((tool) => tool.name)).toContain("workspace_list");
    expect(tools.tools.map((tool) => tool.name)).toContain("scan_start");
  });
});
