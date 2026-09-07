/**
 * Responsibility: Validate and normalize one repository source and requested Git revision.
 * Must not: Execute Git, create checkouts, read repository files, or build index facts.
 * Contract: Implements the source and credential boundary in docs/specs/repository-indexing.md.
 */
import { stat } from "node:fs/promises";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

import { normalizeRepositoryUrlIdentifier } from "@hivemap/api-contracts";

import { type RepositorySourcePolicy } from "./repository-index-contracts.js";
import { RepositoryIndexExecutionError } from "./repository-index-execution-error.js";

export async function normalizeRepositorySource(
  repositoryUrl: string,
  sourcePolicy: RepositorySourcePolicy,
): Promise<string> {
  let normalized: string;
  try {
    normalized = normalizeRepositoryUrlIdentifier(repositoryUrl);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Repository URL is unsafe";
    throw new RepositoryIndexExecutionError("UNSAFE_REPOSITORY_URL", message);
  }
  assertRepositorySourcePolicy(normalized, sourcePolicy);

  if (/^[a-z][a-z0-9+.-]*:\/\//i.test(normalized)) {
    const parsed = new URL(normalized);
    if (parsed.protocol === "file:") {
      const resolvedPath = resolve(parsed.pathname);
      await assertLocalRepositoryDirectory(resolvedPath, normalized);
      return pathToFileURL(resolvedPath).href;
    }
    return parsed.href;
  }
  const resolvedPath = resolve(normalized);
  await assertLocalRepositoryDirectory(resolvedPath, normalized);
  return pathToFileURL(resolvedPath).href;
}

export function assertRepositorySourcePolicy(repositoryUrl: string, sourcePolicy: RepositorySourcePolicy): void {
  const trimmed = repositoryUrl.trim();
  if (sourcePolicy === "remote-only" && isLocalRepositorySource(trimmed)) {
    throw new RepositoryIndexExecutionError(
      "LOCAL_REPOSITORY_SOURCE_NOT_ALLOWED",
      "Local repository paths are not allowed by this runtime",
    );
  }
  if (/^[a-z][a-z0-9+.-]*:\/\//i.test(trimmed)) {
    let parsed: URL;
    try {
      parsed = new URL(trimmed);
    } catch {
      throw new RepositoryIndexExecutionError("UNSAFE_REPOSITORY_URL", "Repository URL is invalid");
    }
    if (parsed.protocol === "http:") {
      throw new RepositoryIndexExecutionError("UNSAFE_REPOSITORY_URL", `Insecure repository URL is not allowed: ${trimmed}`);
    }
    if (parsed.protocol !== "https:" && parsed.protocol !== "file:") {
      throw new RepositoryIndexExecutionError("UNSAFE_REPOSITORY_URL", `Unsupported repository URL protocol: ${parsed.protocol}`);
    }
  }
}

export function assertSafeGitRevision(requestedRef: string): void {
  if (requestedRef.startsWith("-")) {
    throw new RepositoryIndexExecutionError("UNSAFE_REPOSITORY_REF", "Repository ref must not begin with '-'");
  }
}

async function assertLocalRepositoryDirectory(resolvedPath: string, displaySource: string): Promise<void> {
  const sourceStat = await stat(resolvedPath).catch(() => undefined);
  if (sourceStat === undefined || !sourceStat.isDirectory()) {
    throw new RepositoryIndexExecutionError("REPOSITORY_SOURCE_NOT_FOUND", `Repository source does not exist: ${displaySource}`);
  }
}

function isLocalRepositorySource(repositoryUrl: string): boolean {
  return /^file:\/\//i.test(repositoryUrl) || !/^[a-z][a-z0-9+.-]*:\/\//i.test(repositoryUrl);
}
