import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";

import {
  type ApplyGraphCommandsRequest,
  type CreateProjectionRequest,
  type CreateProposalRequest,
  type CreateWorkspaceRequest,
  type RecordFeedbackRequest,
} from "@hivemap/api-contracts";
import { HiveMapRuntime, RuntimeError } from "@hivemap/runtime";
import { SqliteHiveMapStore, StorageError } from "@hivemap/storage";

export type ApiServerOptions = {
  store: SqliteHiveMapStore;
};

export function createApiServer(options: ApiServerOptions): Server {
  const runtime = new HiveMapRuntime({ store: options.store });
  return createServer((request, response) => {
    void handleRequest(runtime, request, response);
  });
}

async function handleRequest(
  runtime: HiveMapRuntime,
  request: IncomingMessage,
  response: ServerResponse,
): Promise<void> {
  try {
    const method = request.method;
    const pathname = parsePathname(request);
    const segments = pathname.split("/").filter(Boolean);

    if (method === "OPTIONS") {
      writeEmpty(response, 204);
      return;
    }

    if (method === "POST" && pathname === "/workspaces") {
      const body = await readJson<CreateWorkspaceRequest>(request);
      writeJson(response, 201, runtime.createWorkspace(body));
      return;
    }

    if (segments[0] !== "workspaces" || segments[1] === undefined) {
      throw new ApiHttpError(404, "ROUTE_NOT_FOUND", `Unknown route: ${method ?? "UNKNOWN"} ${pathname}`);
    }

    const workspaceId = segments[1];

    if (method === "GET" && segments.length === 2) {
      writeJson(response, 200, runtime.getWorkspace(workspaceId));
      return;
    }

    if (method === "GET" && segments[2] === "graph" && segments.length === 3) {
      writeJson(response, 200, runtime.getGraph({ workspaceId }));
      return;
    }

    if (method === "POST" && segments[2] === "commands" && segments.length === 3) {
      const body = await readJson<Omit<ApplyGraphCommandsRequest, "workspaceId">>(request);
      writeJson(response, 200, runtime.applyGraphCommands({ workspaceId, commands: body.commands }));
      return;
    }

    if (method === "GET" && segments[2] === "categories" && segments.length === 3) {
      writeJson(response, 200, runtime.getCategories(workspaceId));
      return;
    }

    if (method === "POST" && segments[2] === "category-assignments" && segments.length === 3) {
      const body = await readJson<{ assignment: Parameters<HiveMapRuntime["assignCategory"]>[0]["assignment"] }>(request);
      writeJson(response, 201, runtime.assignCategory({ workspaceId, assignment: body.assignment }));
      return;
    }

    if (method === "GET" && segments[2] === "projections" && segments[3] !== undefined && segments.length === 4) {
      writeJson(response, 200, runtime.getProjection({ workspaceId, projectionId: segments[3] }));
      return;
    }

    if (method === "POST" && segments[2] === "projections" && segments.length === 3) {
      const body = await readJson<Omit<CreateProjectionRequest, "workspaceId">>(request);
      writeJson(response, 201, runtime.createProjection({ workspaceId, input: body.input }));
      return;
    }

    if (method === "GET" && segments[2] === "feedback" && segments.length === 3) {
      writeJson(response, 200, runtime.listFeedback({ workspaceId }));
      return;
    }

    if (method === "POST" && segments[2] === "feedback" && segments.length === 3) {
      const body = await readJson<Omit<RecordFeedbackRequest, "workspaceId">>(request);
      writeJson(response, 201, runtime.recordFeedback({ workspaceId, feedbackEvent: body.feedbackEvent }));
      return;
    }

    if (method === "GET" && segments[2] === "proposals" && segments.length === 3) {
      writeJson(response, 200, runtime.listProposals({ workspaceId }));
      return;
    }

    if (method === "POST" && segments[2] === "proposals" && segments.length === 3) {
      const body = await readJson<Omit<CreateProposalRequest, "workspaceId">>(request);
      writeJson(response, 201, runtime.createProposal({ workspaceId, proposal: body.proposal }));
      return;
    }

    if (method === "POST" && segments[2] === "proposals" && segments[3] !== undefined && segments[4] === "approve") {
      writeJson(response, 200, runtime.approveProposal({ workspaceId, proposalId: segments[3] }));
      return;
    }

    if (method === "POST" && segments[2] === "proposals" && segments[3] !== undefined && segments[4] === "apply") {
      writeJson(response, 200, runtime.applyProposal({ workspaceId, proposalId: segments[3] }));
      return;
    }

    if (method === "POST" && segments[2] === "proposals" && segments[3] !== undefined && segments[4] === "reject") {
      writeJson(response, 200, runtime.rejectProposal({ workspaceId, proposalId: segments[3] }));
      return;
    }

    if (method === "GET" && segments[2] === "snapshots" && segments.length === 3) {
      writeJson(response, 200, runtime.listSnapshots({ workspaceId }));
      return;
    }

    if (method === "POST" && segments[2] === "snapshots" && segments.length === 3) {
      const body = await readJson<{ snapshot: { id: string; createdAt: string; projectionId: string } }>(request);
      writeJson(response, 201, runtime.createSnapshot({ workspaceId, snapshot: body.snapshot }));
      return;
    }

    throw new ApiHttpError(404, "ROUTE_NOT_FOUND", `Unknown route: ${method ?? "UNKNOWN"} ${pathname}`);
  } catch (error) {
    writeError(response, error);
  }
}

function parsePathname(request: IncomingMessage): string {
  if (request.url === undefined) {
    throw new ApiHttpError(400, "MISSING_URL", "Request URL is required");
  }

  return new URL(request.url, "http://localhost").pathname;
}

async function readJson<T>(request: IncomingMessage): Promise<T> {
  const chunks: Buffer[] = [];

  for await (const chunk of request) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }

  const text = Buffer.concat(chunks).toString("utf8");
  if (text.trim().length === 0) {
    throw new ApiHttpError(400, "EMPTY_BODY", "JSON request body is required");
  }

  return JSON.parse(text) as T;
}

function writeJson(response: ServerResponse, statusCode: number, body: unknown): void {
  response.writeHead(statusCode, {
    "access-control-allow-headers": "content-type",
    "access-control-allow-methods": "GET,POST,OPTIONS",
    "access-control-allow-origin": "*",
    "content-type": "application/json",
  });
  response.end(JSON.stringify(body));
}

function writeEmpty(response: ServerResponse, statusCode: number): void {
  response.writeHead(statusCode, {
    "access-control-allow-headers": "content-type",
    "access-control-allow-methods": "GET,POST,OPTIONS",
    "access-control-allow-origin": "*",
  });
  response.end();
}

function writeError(response: ServerResponse, error: unknown): void {
  if (error instanceof ApiHttpError) {
    writeJson(response, error.statusCode, { error: { code: error.code, message: error.message } });
    return;
  }

  if (error instanceof StorageError) {
    writeJson(response, 404, { error: { code: "STORAGE_ERROR", message: error.message } });
    return;
  }

  if (error instanceof RuntimeError) {
    writeJson(response, 404, { error: { code: "RUNTIME_ERROR", message: error.message } });
    return;
  }

  if (error instanceof Error) {
    writeJson(response, 400, { error: { code: error.name, message: error.message } });
    return;
  }

  writeJson(response, 500, { error: { code: "UNKNOWN_ERROR", message: "Unknown API error" } });
}

class ApiHttpError extends Error {
  readonly statusCode: number;
  readonly code: string;

  constructor(statusCode: number, code: string, message: string) {
    super(message);
    this.name = "ApiHttpError";
    this.statusCode = statusCode;
    this.code = code;
  }
}
