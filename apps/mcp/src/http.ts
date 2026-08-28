/**
 * Responsibility: Adapt one stateless Streamable HTTP request to a HiveMap MCP server.
 * Must not: Implement MCP tools, own runtime state, or authenticate HTTP callers.
 * Contract: Creates and closes request-scoped MCP transport/server wiring over the supplied runtime.
 */
import type { IncomingMessage, ServerResponse } from "node:http";

import type { HiveMapRuntime } from "@hivemap/runtime";
import {
  StreamableHTTPServerTransport,
  type StreamableHTTPServerTransportOptions,
} from "@modelcontextprotocol/sdk/server/streamableHttp.js";

import { createHiveMapMcpServer } from "./sdk-server.js";

export async function handleHiveMapMcpHttpRequest(
  runtime: HiveMapRuntime,
  request: IncomingMessage,
  response: ServerResponse,
): Promise<void> {
  const server = createHiveMapMcpServer(runtime);
  const statelessOptions = { sessionIdGenerator: undefined } as unknown as StreamableHTTPServerTransportOptions;
  const transport = new StreamableHTTPServerTransport(statelessOptions);
  let closed = false;

  const close = async (): Promise<void> => {
    if (closed) {
      return;
    }
    closed = true;
    await transport.close();
    await server.close();
  };

  response.once("close", () => {
    void close();
  });

  try {
    await server.connect(transport as unknown as Parameters<typeof server.connect>[0]);
    await transport.handleRequest(request, response);
  } catch (error) {
    await close();
    throw error;
  }
}
