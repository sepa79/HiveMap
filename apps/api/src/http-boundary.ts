/**
 * Responsibility: Parse HTTP boundary values and serialize API responses/errors.
 * Must not: Route requests, read static assets, authenticate callers, or invoke runtime commands.
 * Contract: Invalid transport input becomes an explicit ApiHttpError and responses use shared CORS headers.
 */
import type { IncomingMessage, ServerResponse } from "node:http";

import { RuntimeError } from "@hivemap/runtime";
import { StorageError } from "@hivemap/storage";

const CORS_HEADERS = {
  "access-control-allow-headers": "authorization, content-type, last-event-id, mcp-protocol-version, mcp-session-id",
  "access-control-allow-methods": "DELETE,GET,POST,OPTIONS",
  "access-control-allow-origin": "*",
  "access-control-expose-headers": "mcp-session-id",
};

const MAX_JSON_REQUEST_BYTES = 2 * 1024 * 1024;

export class ApiHttpError extends Error {
  constructor(
    readonly statusCode: number,
    readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = "ApiHttpError";
  }
}

export function parseUrl(request: IncomingMessage): URL {
  if (request.url === undefined) {
    throw new ApiHttpError(400, "MISSING_URL", "Request URL is required");
  }
  return new URL(request.url, "http://localhost");
}

export function requireQueryParam(url: URL, key: string): string {
  const value = url.searchParams.get(key);
  if (value === null || value.trim().length === 0) {
    throw new ApiHttpError(400, "MISSING_QUERY_PARAM", `Query parameter is required: ${key}`);
  }
  return value;
}

export function parseOptionalPositiveInteger(value: string | null, fieldName: string): number | undefined {
  if (value === null) return undefined;
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 1) {
    throw new ApiHttpError(400, "INVALID_QUERY_PARAM", `${fieldName} must be a positive integer`);
  }
  return parsed;
}

export function parseRequiredPositiveInteger(value: string | null, fieldName: string): number {
  if (value === null) {
    throw new ApiHttpError(400, "MISSING_QUERY_PARAM", `Query parameter is required: ${fieldName}`);
  }
  return parseOptionalPositiveInteger(value, fieldName) as number;
}

export function parseOptionalNumber(value: string | null, fieldName: string): number | undefined {
  if (value === null) return undefined;
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    throw new ApiHttpError(400, "INVALID_QUERY_PARAM", `${fieldName} must be a finite number`);
  }
  return parsed;
}

export async function readJson<T>(request: IncomingMessage): Promise<T> {
  const text = (await readBoundedBody(request, MAX_JSON_REQUEST_BYTES, "JSON")).toString("utf8");
  if (text.trim().length === 0) {
    throw new ApiHttpError(400, "EMPTY_BODY", "JSON request body is required");
  }
  try {
    return JSON.parse(text) as T;
  } catch {
    throw new ApiHttpError(400, "INVALID_JSON", "Request body must be valid JSON");
  }
}

async function readBoundedBody(request: IncomingMessage, maxBytes: number, label: string): Promise<Buffer> {
  const declaredLength = Number(request.headers["content-length"]);
  if (Number.isFinite(declaredLength) && declaredLength > maxBytes) {
    throw new ApiHttpError(413, "PAYLOAD_TOO_LARGE", `${label} request body exceeds the ${formatMiB(maxBytes)} MiB limit`);
  }

  const chunks: Buffer[] = [];
  let totalBytes = 0;
  for await (const chunk of request) {
    const bytes = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    totalBytes += bytes.byteLength;
    if (totalBytes > maxBytes) {
      throw new ApiHttpError(413, "PAYLOAD_TOO_LARGE", `${label} request body exceeds the ${formatMiB(maxBytes)} MiB limit`);
    }
    chunks.push(bytes);
  }
  return Buffer.concat(chunks, totalBytes);
}

function formatMiB(bytes: number): number {
  return bytes / (1024 * 1024);
}

export function writeJson(response: ServerResponse, statusCode: number, body: unknown): void {
  response.writeHead(statusCode, { ...CORS_HEADERS, "content-type": "application/json" });
  response.end(JSON.stringify(body));
}

export function writeEmpty(response: ServerResponse, statusCode: number): void {
  response.writeHead(statusCode, CORS_HEADERS);
  response.end();
}

export function writeStatic(response: ServerResponse, contentType: string, bytes: Uint8Array): void {
  response.writeHead(200, {
    "access-control-allow-origin": "*",
    "content-length": bytes.byteLength,
    "content-type": contentType,
  });
  response.end(Buffer.from(bytes));
}

export function writeError(response: ServerResponse, error: unknown): void {
  if (error instanceof ApiHttpError) {
    writeJson(response, error.statusCode, { error: { code: error.code, message: error.message } });
    return;
  }
  if (error instanceof StorageError) {
    writeJson(response, 404, { error: { code: "STORAGE_ERROR", message: error.message } });
    return;
  }
  if (error instanceof RuntimeError) {
    writeJson(response, mapRuntimeErrorStatus(error), {
      error: { code: error.code, message: error.message, details: error.details },
    });
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
    case "SCAN_NOT_FOUND":
      return 404;
    case "REPOSITORY_INDEX_MODE_UNAVAILABLE":
    case "LOCAL_REPOSITORY_SOURCE_NOT_ALLOWED":
    case "UNSAFE_REPOSITORY_URL":
    case "UNSAFE_REPOSITORY_REF":
    case "SCAN_PROFILE_OVERLAY_INVALID":
    case "FINDING_LIFECYCLE_COMMAND_FORBIDDEN":
    case "UNSUPPORTED_EMBEDDING_NODE_TYPE":
    case "UNSUPPORTED_SIMILARITY_NODE_TYPE":
      return 400;
    default:
      return 500;
  }
}
