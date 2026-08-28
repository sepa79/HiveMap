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

export async function readBytes(request: IncomingMessage): Promise<Uint8Array> {
  const chunks: Buffer[] = [];
  for await (const chunk of request) chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  const bytes = Buffer.concat(chunks);
  if (bytes.byteLength === 0) throw new ApiHttpError(400, "EMPTY_BODY", "ZIP request body is required");
  return bytes;
}

export async function readJson<T>(request: IncomingMessage): Promise<T> {
  const chunks: Buffer[] = [];
  for await (const chunk of request) chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
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

export function writeJson(response: ServerResponse, statusCode: number, body: unknown): void {
  response.writeHead(statusCode, { ...CORS_HEADERS, "content-type": "application/json" });
  response.end(JSON.stringify(body));
}

export function writeEmpty(response: ServerResponse, statusCode: number): void {
  response.writeHead(statusCode, CORS_HEADERS);
  response.end();
}

export function writeZip(response: ServerResponse, bytes: Uint8Array, filename: string): void {
  response.writeHead(200, {
    "access-control-allow-origin": "*",
    "content-disposition": `attachment; filename="${filename}"`,
    "content-length": bytes.byteLength,
    "content-type": "application/zip",
  });
  response.end(Buffer.from(bytes));
}

export function writeStatic(response: ServerResponse, contentType: string, bytes: Uint8Array): void {
  response.writeHead(200, {
    "access-control-allow-origin": "*",
    "content-length": bytes.byteLength,
    "content-type": contentType,
  });
  response.end(Buffer.from(bytes));
}

export function safeFilename(value: string): string {
  return value.replace(/[^a-zA-Z0-9._-]/g, "-");
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
    case "REPOSITORY_INDEX_MODE_UNAVAILABLE":
    case "SCAN_PROFILE_OVERLAY_INVALID":
    case "UNSUPPORTED_EMBEDDING_NODE_TYPE":
    case "UNSUPPORTED_SIMILARITY_NODE_TYPE":
      return 400;
    default:
      return 500;
  }
}
