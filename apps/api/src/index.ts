import { readFile } from "node:fs/promises";
import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import { extname, join, normalize, resolve } from "node:path";

import {
  type ApplyGraphCommandsRequest,
  type BackfillConceptEmbeddingsRequest,
  type ListSimilarConceptsRequest,
  type CreateProjectionRequest,
  type CreateProposalRequest,
  type CreateWorkspaceRequest,
  type ExecuteRepositoryIndexRequest,
  type GetRepositoryIndexRequest,
  type RecordFeedbackRequest,
  type RefreshConceptEmbeddingRequest,
  type CompleteScanRequest,
  type CreateScanFindingRequest,
  type ExportWorkspaceRequest,
  type ImportWorkspaceRequest,
  type ListRepositoryIndexesRequest,
  type RecordScanCalibrationDecisionRequest,
  type RecordScanCoverageRequest,
  type SearchRepositoryIndexRequest,
  type SuggestScanProfileOverlayRequest,
  type StartScanRequest,
  type StartRepositoryIndexRequest,
  type UpsertConceptEmbeddingRequest,
  type UpdateFindingRequest,
  type ValidateScanFindingRequest,
} from "@hivemap/api-contracts";
import { HiveMapRuntime, RuntimeError, type EmbeddingProviderRegistry, type RepositoryIndexExecutor } from "@hivemap/runtime";
import { StorageError, type HiveMapStore } from "@hivemap/storage";

export type ApiServerOptions = {
  store: HiveMapStore;
  staticRoot?: string;
  embeddingProviders?: EmbeddingProviderRegistry;
  repositoryIndexExecutor?: RepositoryIndexExecutor;
};

export type ApiRequestHandler = (request: IncomingMessage, response: ServerResponse) => void;

export function createApiServer(options: ApiServerOptions): Server {
  return createServer(createApiRequestHandler(options));
}

export function createApiRequestHandler(options: ApiServerOptions): ApiRequestHandler {
  const runtime = new HiveMapRuntime({
    store: options.store,
    ...(options.embeddingProviders === undefined ? {} : { embeddingProviders: options.embeddingProviders }),
    ...(options.repositoryIndexExecutor === undefined ? {} : { repositoryIndexExecutor: options.repositoryIndexExecutor }),
  });
  return (request, response) => {
    void handleRequest(runtime, options.staticRoot, request, response);
  };
}

async function handleRequest(
  runtime: HiveMapRuntime,
  staticRoot: string | undefined,
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
      writeJson(response, 201, await runtime.createWorkspace(body));
      return;
    }

    if (method === "GET" && pathname === "/workspaces") {
      writeJson(response, 200, await runtime.listWorkspaces());
      return;
    }

    if (method === "POST" && pathname === "/workspace-imports") {
      const body = await readJson<ImportWorkspaceRequest>(request);
      writeJson(response, 201, await runtime.importWorkspace(body));
      return;
    }

    if (method === "POST" && pathname === "/workspace-import-bundles") {
      const mode = url.searchParams.get("mode");
      if (mode !== "new" && mode !== "replace") {
        throw new ApiHttpError(400, "INVALID_IMPORT_MODE", "ZIP import requires mode=new or mode=replace");
      }
      writeJson(response, 201, await runtime.importWorkspaceBundle({ bytes: await readBytes(request), mode }));
      return;
    }

    if (method === "GET" && staticRoot !== undefined && !pathname.startsWith("/workspaces") && pathname !== "/workspace-imports" && pathname !== "/workspace-import-bundles") {
      const file = await readStaticFile(staticRoot, pathname);
      if (file !== undefined) {
        writeStatic(response, file.contentType, file.bytes);
        return;
      }
    }

    if (segments[0] !== "workspaces" || segments[1] === undefined) {
      throw new ApiHttpError(404, "ROUTE_NOT_FOUND", `Unknown route: ${method ?? "UNKNOWN"} ${pathname}`);
    }

    const workspaceId = segments[1];

    if (method === "GET" && segments.length === 2) {
      writeJson(response, 200, await runtime.getWorkspace(workspaceId));
      return;
    }

    if (method === "GET" && segments[2] === "graph" && segments.length === 3) {
      writeJson(response, 200, await runtime.getGraph({ workspaceId }));
      return;
    }

    if (method === "GET" && segments[2] === "repository-indexes" && segments.length === 3) {
      const repositoryIndexRequest: ListRepositoryIndexesRequest = { workspaceId };
      writeJson(response, 200, await runtime.listRepositoryIndexes(repositoryIndexRequest));
      return;
    }

    if (method === "POST" && segments[2] === "repository-indexes" && segments.length === 3) {
      const body = await readJson<Omit<StartRepositoryIndexRequest, "workspaceId">>(request);
      writeJson(response, 201, await runtime.startRepositoryIndex({ workspaceId, index: body.index }));
      return;
    }

    if (
      method === "POST" &&
      segments[2] === "repository-indexes" &&
      segments[3] !== undefined &&
      segments[4] === "execute" &&
      segments.length === 5
    ) {
      const executeRequest: ExecuteRepositoryIndexRequest = { workspaceId, indexId: segments[3] };
      writeJson(response, 200, await runtime.executeRepositoryIndex(executeRequest));
      return;
    }

    if (method === "GET" && segments[2] === "repository-indexes" && segments[3] !== undefined && segments.length === 4) {
      const repositoryIndexRequest: GetRepositoryIndexRequest = { workspaceId, indexId: segments[3] };
      writeJson(response, 200, await runtime.getRepositoryIndex(repositoryIndexRequest));
      return;
    }

    if (
      method === "GET" &&
      segments[2] === "repository-indexes" &&
      segments[3] !== undefined &&
      segments[4] === "search" &&
      segments.length === 5
    ) {
      const limit = parseOptionalPositiveInteger(url.searchParams.get("limit"), "limit");
      const searchRequest: SearchRepositoryIndexRequest = {
        workspaceId,
        indexId: segments[3],
        query: requireQueryParam(url, "query"),
        ...(limit === undefined ? {} : { limit }),
      };
      writeJson(response, 200, await runtime.searchRepositoryIndex(searchRequest));
      return;
    }

    if (
      method === "GET" &&
      segments[2] === "repository-indexes" &&
      segments[3] !== undefined &&
      segments[4] === "evidence-candidates" &&
      segments.length === 5
    ) {
      const limit = parseOptionalPositiveInteger(url.searchParams.get("limit"), "limit");
      writeJson(
        response,
        200,
        await runtime.listRepositoryEvidenceCandidates({
          workspaceId,
          indexId: segments[3],
          profileId: requireQueryParam(url, "profileId"),
          profileVersion: parseRequiredPositiveInteger(url.searchParams.get("profileVersion"), "profileVersion"),
          criterionId: requireQueryParam(url, "criterionId"),
          ...(limit === undefined ? {} : { limit }),
        }),
      );
      return;
    }

    if (
      method === "GET" &&
      segments[2] === "scans" &&
      segments[3] !== undefined &&
      segments[4] === "boundary-map" &&
      segments.length === 5
    ) {
      writeJson(response, 200, await runtime.buildScanBoundaryMap({ workspaceId, scanId: segments[3] }));
      return;
    }

    if (
      method === "POST" &&
      segments[2] === "concepts" &&
      segments[3] !== undefined &&
      segments[4] === "embedding" &&
      segments.length === 5
    ) {
      const body = await readJson<{ embedding: UpsertConceptEmbeddingRequest["embedding"] }>(request);
      writeJson(response, 201, await runtime.upsertConceptEmbedding({ workspaceId, nodeId: segments[3], embedding: body.embedding }));
      return;
    }

    if (
      method === "POST" &&
      segments[2] === "concepts" &&
      segments[3] !== undefined &&
      segments[4] === "embedding-refresh" &&
      segments.length === 5
    ) {
      const body = await readJson<Omit<RefreshConceptEmbeddingRequest, "workspaceId" | "nodeId">>(request);
      writeJson(response, 200, await runtime.refreshConceptEmbedding({ workspaceId, nodeId: segments[3], ...body }));
      return;
    }

    if (method === "POST" && segments[2] === "concept-embeddings" && segments[3] === "backfill" && segments.length === 4) {
      const body = await readJson<Omit<BackfillConceptEmbeddingsRequest, "workspaceId">>(request);
      writeJson(response, 200, await runtime.backfillConceptEmbeddings({ workspaceId, ...body }));
      return;
    }

    if (
      method === "GET" &&
      segments[2] === "concepts" &&
      segments[3] !== undefined &&
      segments[4] === "similar" &&
      segments.length === 5
    ) {
      const limit = parseOptionalPositiveInteger(url.searchParams.get("limit"), "limit");
      const minScore = parseOptionalNumber(url.searchParams.get("minScore"), "minScore");
      const similarityRequest: ListSimilarConceptsRequest = {
        workspaceId,
        nodeId: segments[3],
        model: requireQueryParam(url, "model"),
        ...(limit === undefined ? {} : { limit }),
        ...(minScore === undefined ? {} : { minScore }),
      };
      writeJson(response, 200, await runtime.listSimilarConcepts(similarityRequest));
      return;
    }

    if (method === "POST" && segments[2] === "commands" && segments.length === 3) {
      const body = await readJson<Omit<ApplyGraphCommandsRequest, "workspaceId">>(request);
      writeJson(response, 200, await runtime.applyGraphCommands({ workspaceId, commands: body.commands }));
      return;
    }

    if (method === "GET" && segments[2] === "categories" && segments.length === 3) {
      writeJson(response, 200, await runtime.getCategories(workspaceId));
      return;
    }

    if (method === "POST" && segments[2] === "category-assignments" && segments.length === 3) {
      const body = await readJson<{ assignment: Parameters<HiveMapRuntime["assignCategory"]>[0]["assignment"] }>(request);
      writeJson(response, 201, await runtime.assignCategory({ workspaceId, assignment: body.assignment }));
      return;
    }

    if (method === "GET" && segments[2] === "projections" && segments[3] !== undefined && segments.length === 4) {
      writeJson(response, 200, await runtime.getProjection({ workspaceId, projectionId: segments[3] }));
      return;
    }

    if (method === "POST" && segments[2] === "projections" && segments.length === 3) {
      const body = await readJson<Omit<CreateProjectionRequest, "workspaceId">>(request);
      writeJson(response, 201, await runtime.createProjection({ workspaceId, input: body.input }));
      return;
    }

    if (method === "GET" && segments[2] === "feedback" && segments.length === 3) {
      writeJson(response, 200, await runtime.listFeedback({ workspaceId }));
      return;
    }

    if (method === "POST" && segments[2] === "feedback" && segments.length === 3) {
      const body = await readJson<Omit<RecordFeedbackRequest, "workspaceId">>(request);
      writeJson(response, 201, await runtime.recordFeedback({ workspaceId, feedbackEvent: body.feedbackEvent }));
      return;
    }

    if (method === "GET" && segments[2] === "proposals" && segments.length === 3) {
      writeJson(response, 200, await runtime.listProposals({ workspaceId }));
      return;
    }

    if (method === "POST" && segments[2] === "proposals" && segments.length === 3) {
      const body = await readJson<Omit<CreateProposalRequest, "workspaceId">>(request);
      writeJson(response, 201, await runtime.createProposal({ workspaceId, proposal: body.proposal }));
      return;
    }

    if (
      method === "POST" &&
      segments[2] === "proposals" &&
      segments[3] !== undefined &&
      segments[4] === "approve" &&
      segments.length === 5
    ) {
      writeJson(response, 200, await runtime.approveProposal({ workspaceId, proposalId: segments[3] }));
      return;
    }

    if (
      method === "POST" &&
      segments[2] === "proposals" &&
      segments[3] !== undefined &&
      segments[4] === "apply" &&
      segments.length === 5
    ) {
      writeJson(response, 200, await runtime.applyProposal({ workspaceId, proposalId: segments[3] }));
      return;
    }

    if (
      method === "POST" &&
      segments[2] === "proposals" &&
      segments[3] !== undefined &&
      segments[4] === "reject" &&
      segments.length === 5
    ) {
      writeJson(response, 200, await runtime.rejectProposal({ workspaceId, proposalId: segments[3] }));
      return;
    }

    if (method === "GET" && segments[2] === "scan-profiles" && segments.length === 3) {
      writeJson(response, 200, await runtime.listScanProfiles({ workspaceId }));
      return;
    }

    if (method === "GET" && segments[2] === "scans" && segments.length === 3) {
      writeJson(response, 200, await runtime.listScanRuns({ workspaceId }));
      return;
    }

    if (method === "POST" && segments[2] === "scans" && segments.length === 3) {
      const body = await readJson<Omit<StartScanRequest, "workspaceId">>(request);
      writeJson(response, 201, await runtime.startScan({ workspaceId, scan: body.scan }));
      return;
    }

    if (
      method === "POST" &&
      segments[2] === "scans" &&
      segments[3] !== undefined &&
      segments[4] === "calibration-decision" &&
      segments.length === 5
    ) {
      const body = await readJson<Omit<RecordScanCalibrationDecisionRequest, "workspaceId" | "scanId">>(request);
      writeJson(response, 200, await runtime.recordScanCalibrationDecision({ workspaceId, scanId: segments[3], ...body }));
      return;
    }

    if (
      method === "POST" &&
      segments[2] === "scans" &&
      segments[3] !== undefined &&
      segments[4] === "overlay-suggestion" &&
      segments.length === 5
    ) {
      const body = await readJson<Pick<SuggestScanProfileOverlayRequest, "symptomId">>(request);
      writeJson(
        response,
        200,
        await runtime.suggestScanProfileOverlay({
          workspaceId,
          scanId: segments[3],
          symptomId: body.symptomId,
        }),
      );
      return;
    }

    if (
      method === "POST" &&
      segments[2] === "scans" &&
      segments[3] !== undefined &&
      segments[4] === "coverage" &&
      segments.length === 5
    ) {
      const body = await readJson<Pick<RecordScanCoverageRequest, "coverage">>(request);
      writeJson(response, 200, await runtime.recordScanCoverage({ workspaceId, scanId: segments[3], coverage: body.coverage }));
      return;
    }

    if (
      method === "POST" &&
      segments[2] === "scans" &&
      segments[3] !== undefined &&
      segments[4] === "finding-validation" &&
      segments.length === 5
    ) {
      const body = await readJson<Pick<ValidateScanFindingRequest, "criterionId" | "boundaryMap">>(request);
      writeJson(
        response,
        200,
        await runtime.validateScanFinding({
          workspaceId,
          scanId: segments[3],
          criterionId: body.criterionId,
          ...(body.boundaryMap === undefined ? {} : { boundaryMap: body.boundaryMap }),
        }),
      );
      return;
    }

    if (
      method === "POST" &&
      segments[2] === "scans" &&
      segments[3] !== undefined &&
      segments[4] === "findings" &&
      segments.length === 5
    ) {
      const body = await readJson<Pick<CreateScanFindingRequest, "finding">>(request);
      writeJson(response, 201, await runtime.createScanFinding({ workspaceId, scanId: segments[3], finding: body.finding }));
      return;
    }

    if (
      method === "POST" &&
      segments[2] === "scans" &&
      segments[3] !== undefined &&
      segments[4] === "complete" &&
      segments.length === 5
    ) {
      const body = await readJson<Omit<CompleteScanRequest, "workspaceId" | "scanId">>(request);
      writeJson(response, 200, await runtime.completeScan({ workspaceId, scanId: segments[3], ...body }));
      return;
    }

    if (method === "POST" && segments[2] === "scan-comparisons" && segments.length === 3) {
      const body = await readJson<{ beforeScanId: string; afterScanId: string }>(request);
      writeJson(response, 200, await runtime.compareScans({ workspaceId, ...body }));
      return;
    }

    if (
      method === "POST" &&
      segments[2] === "findings" &&
      segments[3] !== undefined &&
      segments[4] === "update" &&
      segments.length === 5
    ) {
      const body = await readJson<Pick<UpdateFindingRequest, "changes">>(request);
      writeJson(response, 200, await runtime.updateFinding({ workspaceId, findingNodeId: segments[3], changes: body.changes }));
      return;
    }

    if (method === "POST" && segments[2] === "exports" && segments.length === 3) {
      const body = await readJson<Omit<ExportWorkspaceRequest, "workspaceId">>(request);
      writeJson(response, 201, await runtime.exportWorkspace({ workspaceId, ...body }));
      return;
    }

    if (method === "POST" && segments[2] === "export-bundle" && segments.length === 3) {
      const body = await readJson<{ exportedAt: string }>(request);
      const bundle = await runtime.exportWorkspaceBundle({ workspaceId, exportedAt: body.exportedAt });
      writeZip(response, bundle.bytes, `${safeFilename(workspaceId)}.hivemap.zip`);
      return;
    }

    throw new ApiHttpError(404, "ROUTE_NOT_FOUND", `Unknown route: ${method ?? "UNKNOWN"} ${pathname}`);
  } catch (error) {
    writeError(response, error);
  }
}

async function readStaticFile(
  staticRoot: string,
  pathname: string,
): Promise<{ contentType: string; bytes: Uint8Array } | undefined> {
  const normalizedPath = pathname === "/" ? "/index.html" : pathname;
  const candidatePath = resolveStaticPath(staticRoot, normalizedPath);
  if (candidatePath === undefined) {
    throw new ApiHttpError(400, "INVALID_STATIC_PATH", `Unsafe static path: ${pathname}`);
  }

  const directFile = await tryReadFile(candidatePath);
  if (directFile !== undefined) {
    return { contentType: contentTypeForPath(candidatePath), bytes: directFile };
  }

  if (!hasFileExtension(normalizedPath)) {
    const indexPath = resolve(staticRoot, "index.html");
    const indexFile = await tryReadFile(indexPath);
    if (indexFile !== undefined) {
      return { contentType: "text/html; charset=utf-8", bytes: indexFile };
    }
  }

  return undefined;
}

function resolveStaticPath(staticRoot: string, pathname: string): string | undefined {
  const safePath = pathname.replace(/^\/+/, "");
  const candidate = resolve(staticRoot, normalize(safePath));
  const root = resolve(staticRoot);
  if (candidate === root || candidate.startsWith(`${root}/`)) {
    return candidate;
  }
  return undefined;
}

async function tryReadFile(path: string): Promise<Uint8Array | undefined> {
  try {
    return await readFile(path);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return undefined;
    }
    throw error;
  }
}

function hasFileExtension(path: string): boolean {
  return extname(path).length > 0;
}

function contentTypeForPath(path: string): string {
  switch (extname(path)) {
    case ".html":
      return "text/html; charset=utf-8";
    case ".js":
      return "application/javascript; charset=utf-8";
    case ".css":
      return "text/css; charset=utf-8";
    case ".json":
      return "application/json; charset=utf-8";
    case ".svg":
      return "image/svg+xml";
    case ".png":
      return "image/png";
    case ".jpg":
    case ".jpeg":
      return "image/jpeg";
    case ".ico":
      return "image/x-icon";
    default:
      return "application/octet-stream";
  }
}

function parseUrl(request: IncomingMessage): URL {
  if (request.url === undefined) {
    throw new ApiHttpError(400, "MISSING_URL", "Request URL is required");
  }

  return new URL(request.url, "http://localhost");
}

function requireQueryParam(url: URL, key: string): string {
  const value = url.searchParams.get(key);
  if (value === null || value.trim().length === 0) {
    throw new ApiHttpError(400, "MISSING_QUERY_PARAM", `Query parameter is required: ${key}`);
  }
  return value;
}

function parseOptionalPositiveInteger(value: string | null, fieldName: string): number | undefined {
  if (value === null) {
    return undefined;
  }
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 1) {
    throw new ApiHttpError(400, "INVALID_QUERY_PARAM", `${fieldName} must be a positive integer`);
  }
  return parsed;
}

function parseRequiredPositiveInteger(value: string | null, fieldName: string): number {
  if (value === null) {
    throw new ApiHttpError(400, "MISSING_QUERY_PARAM", `Query parameter is required: ${fieldName}`);
  }
  return parseOptionalPositiveInteger(value, fieldName) as number;
}

function parseOptionalNumber(value: string | null, fieldName: string): number | undefined {
  if (value === null) {
    return undefined;
  }
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    throw new ApiHttpError(400, "INVALID_QUERY_PARAM", `${fieldName} must be a finite number`);
  }
  return parsed;
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

  try {
    return JSON.parse(text) as T;
  } catch {
    throw new ApiHttpError(400, "INVALID_JSON", "Request body must be valid JSON");
  }
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

function writeStatic(response: ServerResponse, contentType: string, bytes: Uint8Array): void {
  response.writeHead(200, {
    "access-control-allow-origin": "*",
    "content-length": bytes.byteLength,
    "content-type": contentType,
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
    writeJson(response, mapRuntimeErrorStatus(error), { error: { code: error.code, message: error.message, details: error.details } });
    return;
  }

  if (error instanceof Error) {
    writeJson(response, 400, { error: { code: error.name, message: error.message } });
    return;
  }

  writeJson(response, 500, { error: { code: "UNKNOWN_ERROR", message: "Unknown API error" } });
}

function mapRuntimeErrorStatus(error: RuntimeError): number {
  switch (error.code) {
    case "NODE_NOT_FOUND":
    case "SIMILARITY_NODE_NOT_FOUND":
    case "EMBEDDING_CONCEPT_NODE_NOT_FOUND":
    case "SCAN_CRITERION_NOT_FOUND":
    case "CONCEPT_EMBEDDING_MISSING":
      return 404;
    case "REPOSITORY_INDEX_EXISTS":
    case "REPOSITORY_INDEX_ALREADY_RUNNING":
    case "REPOSITORY_INDEX_NOT_COMPLETED":
    case "SCAN_CALIBRATION_DECISION_REQUIRED":
    case "SCAN_CALIBRATION_NOT_READY":
    case "SCAN_COVERAGE_REQUIRED":
    case "SCAN_REPOSITORY_INDEX_REQUIRED":
    case "CONCEPT_EMBEDDING_STALE":
      return 409;
    case "REPOSITORY_INDEX_MODE_UNAVAILABLE":
    case "EMBEDDING_MODEL_REF_INVALID":
    case "OLLAMA_BASE_URL_INVALID":
    case "OLLAMA_MODEL_INVALID":
    case "OLLAMA_INPUTS_EMPTY":
    case "SCAN_PROFILE_OVERLAY_INVALID":
    case "UNSUPPORTED_EMBEDDING_NODE_TYPE":
    case "UNSUPPORTED_SIMILARITY_NODE_TYPE":
      return 400;
    default:
      return 500;
  }
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
