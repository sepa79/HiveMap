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

const MAX_MCP_HTTP_BODY_BYTES = 2 * 1024 * 1024;

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
    const parsedBody = request.method === "POST" ? await readMcpJsonBody(request, response) : undefined;
    if (request.method === "POST" && parsedBody === undefined) {
      await close();
      return;
    }
    await server.connect(transport as unknown as Parameters<typeof server.connect>[0]);
    await transport.handleRequest(request, response, parsedBody);
  } catch (error) {
    await close();
    throw error;
  }
}

async function readMcpJsonBody(request: IncomingMessage, response: ServerResponse): Promise<unknown | undefined> {
  const declaredLength = Number(request.headers["content-length"]);
  if (Number.isFinite(declaredLength) && declaredLength > MAX_MCP_HTTP_BODY_BYTES) {
    writeMcpBoundaryError(response, 413, "MCP request body exceeds the 2 MiB limit");
    return undefined;
  }

  const chunks: Buffer[] = [];
  let totalBytes = 0;
  for await (const chunk of request) {
    const bytes = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    totalBytes += bytes.byteLength;
    if (totalBytes > MAX_MCP_HTTP_BODY_BYTES) {
      writeMcpBoundaryError(response, 413, "MCP request body exceeds the 2 MiB limit");
      return undefined;
    }
    chunks.push(bytes);
  }

  try {
    return JSON.parse(Buffer.concat(chunks).toString("utf8")) as unknown;
  } catch {
    writeMcpBoundaryError(response, 400, "MCP request body must be valid JSON");
    return undefined;
  }
}

function writeMcpBoundaryError(response: ServerResponse, statusCode: number, message: string): void {
  response.writeHead(statusCode, {
    "access-control-allow-origin": "*",
    "content-type": "application/json",
  });
  response.end(JSON.stringify({ error: { code: "INVALID_MCP_HTTP_BODY", message } }));
}
