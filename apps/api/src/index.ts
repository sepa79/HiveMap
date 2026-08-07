import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";

import {
  type ApplyGraphCommandsRequest,
  type CreateProjectionRequest,
  type CreateProposalRequest,
  type CreateWorkspaceRequest,
  type RecordFeedbackRequest,
  type CompleteScanRequest,
  type CreateScanFindingRequest,
  type ExportWorkspaceRequest,
  type ImportWorkspaceRequest,
  type RecordScanCoverageRequest,
  type StartScanRequest,
  type UpdateFindingRequest,
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
    const url = parseUrl(request);
    const pathname = url.pathname;
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

    if (method === "GET" && pathname === "/workspaces") {
      writeJson(response, 200, runtime.listWorkspaces());
      return;
    }

    if (method === "POST" && pathname === "/workspace-imports") {
      const body = await readJson<ImportWorkspaceRequest>(request);
      writeJson(response, 201, runtime.importWorkspace(body));
      return;
    }

    if (method === "POST" && pathname === "/workspace-import-bundles") {
      const mode = url.searchParams.get("mode");
      if (mode !== "new" && mode !== "replace") {
        throw new ApiHttpError(400, "INVALID_IMPORT_MODE", "ZIP import requires mode=new or mode=replace");
      }
      writeJson(response, 201, runtime.importWorkspaceBundle({ bytes: await readBytes(request), mode }));
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

    if (method === "GET" && segments[2] === "scan-profiles" && segments.length === 3) {
      writeJson(response, 200, runtime.listScanProfiles({ workspaceId }));
      return;
    }

    if (method === "GET" && segments[2] === "scans" && segments.length === 3) {
      writeJson(response, 200, runtime.listScanRuns({ workspaceId }));
      return;
    }

    if (method === "POST" && segments[2] === "scans" && segments.length === 3) {
      const body = await readJson<Omit<StartScanRequest, "workspaceId">>(request);
      writeJson(response, 201, runtime.startScan({ workspaceId, scan: body.scan }));
      return;
    }

    if (method === "POST" && segments[2] === "scans" && segments[3] !== undefined && segments[4] === "coverage") {
      const body = await readJson<Pick<RecordScanCoverageRequest, "coverage">>(request);
      writeJson(response, 200, runtime.recordScanCoverage({ workspaceId, scanId: segments[3], coverage: body.coverage }));
      return;
    }

    if (method === "POST" && segments[2] === "scans" && segments[3] !== undefined && segments[4] === "findings") {
      const body = await readJson<Pick<CreateScanFindingRequest, "finding">>(request);
      writeJson(response, 201, runtime.createScanFinding({ workspaceId, scanId: segments[3], finding: body.finding }));
      return;
    }

    if (method === "POST" && segments[2] === "scans" && segments[3] !== undefined && segments[4] === "complete") {
      const body = await readJson<Omit<CompleteScanRequest, "workspaceId" | "scanId">>(request);
      writeJson(response, 200, runtime.completeScan({ workspaceId, scanId: segments[3], ...body }));
      return;
    }

    if (method === "POST" && segments[2] === "scan-comparisons" && segments.length === 3) {
      const body = await readJson<{ beforeScanId: string; afterScanId: string }>(request);
      writeJson(response, 200, runtime.compareScans({ workspaceId, ...body }));
      return;
    }

    if (method === "POST" && segments[2] === "findings" && segments[3] !== undefined && segments[4] === "update") {
      const body = await readJson<Pick<UpdateFindingRequest, "changes">>(request);
      writeJson(response, 200, runtime.updateFinding({ workspaceId, findingNodeId: segments[3], changes: body.changes }));
      return;
    }

    if (method === "POST" && segments[2] === "exports" && segments.length === 3) {
      const body = await readJson<Omit<ExportWorkspaceRequest, "workspaceId">>(request);
      writeJson(response, 201, runtime.exportWorkspace({ workspaceId, ...body }));
      return;
    }

    if (method === "POST" && segments[2] === "export-bundle" && segments.length === 3) {
      const body = await readJson<{ exportedAt: string }>(request);
      const bundle = runtime.exportWorkspaceBundle({ workspaceId, exportedAt: body.exportedAt });
      writeZip(response, bundle.bytes, `${safeFilename(workspaceId)}.hivemap.zip`);
      return;
    }

    throw new ApiHttpError(404, "ROUTE_NOT_FOUND", `Unknown route: ${method ?? "UNKNOWN"} ${pathname}`);
  } catch (error) {
    writeError(response, error);
  }
}

function parseUrl(request: IncomingMessage): URL {
  if (request.url === undefined) {
    throw new ApiHttpError(400, "MISSING_URL", "Request URL is required");
  }

  return new URL(request.url, "http://localhost");
}

async function readBytes(request: IncomingMessage): Promise<Uint8Array> {
  const chunks: Buffer[] = [];
  for await (const chunk of request) chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  const bytes = Buffer.concat(chunks);
  if (bytes.byteLength === 0) throw new ApiHttpError(400, "EMPTY_BODY", "ZIP request body is required");
  return bytes;
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

function writeZip(response: ServerResponse, bytes: Uint8Array, filename: string): void {
  response.writeHead(200, {
    "access-control-allow-origin": "*",
    "content-disposition": `attachment; filename="${filename}"`,
    "content-length": bytes.byteLength,
    "content-type": "application/zip",
  });
  response.end(Buffer.from(bytes));
}

function safeFilename(value: string): string {
  return value.replace(/[^a-zA-Z0-9._-]/g, "-");
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
    writeJson(response, 404, { error: { code: error.code, message: error.message, details: error.details } });
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
