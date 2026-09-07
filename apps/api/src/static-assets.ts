/**
 * Responsibility: Resolve and read public built-web assets beneath one configured root.
 * Must not: Route API calls, authorize requests, or interpret application state.
 * Contract: Returns safe in-root files or an SPA entry fallback; rejects path traversal.
 */
import { readFile } from "node:fs/promises";
import { extname, normalize, resolve } from "node:path";

import { ApiHttpError } from "./http-boundary.js";

export function isPublicUiRequest(method: string | undefined, pathname: string): boolean {
  return method === "GET" && (pathname === "/" || pathname === "/index.html" || pathname.startsWith("/assets/"));
}

export async function readStaticFile(
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
  if (extname(normalizedPath).length === 0) {
    const indexFile = await tryReadFile(resolve(staticRoot, "index.html"));
    if (indexFile !== undefined) return { contentType: "text/html; charset=utf-8", bytes: indexFile };
  }
  return undefined;
}

function resolveStaticPath(staticRoot: string, pathname: string): string | undefined {
  const candidate = resolve(staticRoot, normalize(pathname.replace(/^\/+/, "")));
  const root = resolve(staticRoot);
  return candidate === root || candidate.startsWith(`${root}/`) ? candidate : undefined;
}

async function tryReadFile(path: string): Promise<Uint8Array | undefined> {
  try {
    return await readFile(path);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return undefined;
    throw error;
  }
}

function contentTypeForPath(path: string): string {
  switch (extname(path)) {
    case ".html": return "text/html; charset=utf-8";
    case ".js": return "application/javascript; charset=utf-8";
    case ".css": return "text/css; charset=utf-8";
    case ".json": return "application/json; charset=utf-8";
    case ".svg": return "image/svg+xml";
    case ".png": return "image/png";
    case ".jpg":
    case ".jpeg": return "image/jpeg";
    case ".ico": return "image/x-icon";
    default: return "application/octet-stream";
  }
}
