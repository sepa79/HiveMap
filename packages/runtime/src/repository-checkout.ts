/**
 * Responsibility: Acquire and expose one bounded, non-executing Git checkout for safe indexed reads.
 * Must not: Interpret repository content, construct semantic facts, persist state, or execute repository code.
 * Contract: Implements checkout isolation and acquisition limits in docs/specs/repository-indexing.md.
 */
import { execFile } from "node:child_process";
import { lstat, mkdtemp, readFile, realpath, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { isAbsolute, join, relative, resolve } from "node:path";
import { promisify } from "node:util";

import {
  SAFE_REPOSITORY_INDEX_LIMITS,
  type RepositorySourcePolicy,
} from "./repository-index-contracts.js";
import { RepositoryIndexExecutionError } from "./repository-index-execution-error.js";
import { assertSafeGitRevision, normalizeRepositorySource } from "./repository-source.js";

const execFileAsync = promisify(execFile);

export type SafeRepositoryCheckout = {
  resolvedCommit: string;
  trackedFiles: readonly string[];
  readTrackedFile: (normalizedPath: string) => Promise<Buffer>;
};

export async function withSafeRepositoryCheckout<T>(
  options: {
    repositoryUrl: string;
    sourcePolicy: RepositorySourcePolicy;
    requestedRef: string;
  },
  consume: (checkout: SafeRepositoryCheckout) => Promise<T>,
): Promise<T> {
  const source = await normalizeRepositorySource(options.repositoryUrl, options.sourcePolicy);
  assertSafeGitRevision(options.requestedRef);
  const checkoutRoot = await mkdtemp(join(tmpdir(), "hivemap-repository-index-"));
  const checkoutDir = join(checkoutRoot, "checkout");
  try {
    await runGit(["init", "--quiet", checkoutDir]);
    await runGit(["-C", checkoutDir, "remote", "add", "origin", source]);
    await runGit(["-C", checkoutDir, "fetch", "--quiet", "--depth=1", "--no-tags", "--filter=blob:none", "origin", options.requestedRef]);
    const resolvedCommit = (await runGit(["-C", checkoutDir, "rev-parse", "FETCH_HEAD"])).trim();
    const trackedFiles = parseAndValidateRepositoryTree(
      await runGit(["-C", checkoutDir, "ls-tree", "-r", "-l", "-z", "FETCH_HEAD"]),
    );
    await runGit(["-C", checkoutDir, "checkout", "--quiet", "--detach", "FETCH_HEAD"]);

    return await consume({
      resolvedCommit,
      trackedFiles,
      readTrackedFile: (normalizedPath) => readSafeTrackedFile(checkoutDir, normalizedPath),
    });
  } finally {
    await rm(checkoutRoot, { recursive: true, force: true });
  }
}

async function runGit(args: string[]): Promise<string> {
  try {
    const { stdout } = await execFileAsync("prlimit", [
      `--fsize=${SAFE_REPOSITORY_INDEX_LIMITS.gitFileWriteBytes}`,
      `--as=${SAFE_REPOSITORY_INDEX_LIMITS.gitAddressSpaceBytes}`,
      `--cpu=${SAFE_REPOSITORY_INDEX_LIMITS.gitCpuSeconds}`,
      "--",
      "git",
      ...args,
    ], {
      env: {
        PATH: process.env.PATH,
        TMPDIR: process.env.TMPDIR,
        TEMP: process.env.TEMP,
        TMP: process.env.TMP,
        HTTPS_PROXY: process.env.HTTPS_PROXY,
        HTTP_PROXY: process.env.HTTP_PROXY,
        NO_PROXY: process.env.NO_PROXY,
        https_proxy: process.env.https_proxy,
        http_proxy: process.env.http_proxy,
        no_proxy: process.env.no_proxy,
        SSL_CERT_FILE: process.env.SSL_CERT_FILE,
        SSL_CERT_DIR: process.env.SSL_CERT_DIR,
        GIT_CONFIG_GLOBAL: "/dev/null",
        GIT_CONFIG_SYSTEM: "/dev/null",
        GIT_CONFIG_NOSYSTEM: "1",
        GIT_TERMINAL_PROMPT: "0",
        LC_ALL: "C",
      },
      maxBuffer: SAFE_REPOSITORY_INDEX_LIMITS.gitOutputBytes,
      timeout: SAFE_REPOSITORY_INDEX_LIMITS.gitTimeoutMs,
    });
    return stdout;
  } catch (error) {
    const message =
      error instanceof Error && "stderr" in error && typeof error.stderr === "string"
        ? error.stderr.trim() || error.message
        : error instanceof Error
          ? error.message
          : "Unknown git error";
    throw new RepositoryIndexExecutionError("GIT_COMMAND_FAILED", message);
  }
}

function parseAndValidateRepositoryTree(value: string): string[] {
  const paths: string[] = [];
  let totalBytes = 0;
  for (const record of value.split("\u0000")) {
    if (record.length === 0) continue;
    const separatorIndex = record.indexOf("\t");
    if (separatorIndex < 0) {
      throw new RepositoryIndexExecutionError("INVALID_REPOSITORY_TREE", "Git returned an invalid repository tree entry");
    }
    const [mode, type, , sizeText] = record.slice(0, separatorIndex).trim().split(/\s+/);
    const path = normalizeRepositoryPath(record.slice(separatorIndex + 1));
    if (mode === "120000") {
      throw new RepositoryIndexExecutionError("REPOSITORY_SYMLINK_REJECTED", `Tracked symlink is not allowed in safe mode: ${path}`);
    }
    if ((mode !== "100644" && mode !== "100755") || type !== "blob") {
      throw new RepositoryIndexExecutionError("REPOSITORY_FILE_TYPE_REJECTED", `Tracked path is not a regular file: ${path}`);
    }
    const byteSize = Number(sizeText);
    if (!Number.isSafeInteger(byteSize) || byteSize < 0) {
      throw new RepositoryIndexExecutionError("INVALID_REPOSITORY_TREE", `Git returned an invalid size for tracked file: ${path}`);
    }
    if (byteSize > SAFE_REPOSITORY_INDEX_LIMITS.maxFileBytes) {
      throw new RepositoryIndexExecutionError(
        "REPOSITORY_FILE_SIZE_LIMIT_EXCEEDED",
        `Tracked file exceeds the ${SAFE_REPOSITORY_INDEX_LIMITS.maxFileBytes}-byte safe-mode limit: ${path}`,
      );
    }
    totalBytes += byteSize;
    if (totalBytes > SAFE_REPOSITORY_INDEX_LIMITS.maxTotalBytes) {
      throw new RepositoryIndexExecutionError(
        "REPOSITORY_BYTE_LIMIT_EXCEEDED",
        `Repository tree exceeds the ${SAFE_REPOSITORY_INDEX_LIMITS.maxTotalBytes}-byte safe-mode limit`,
      );
    }
    paths.push(path);
    if (paths.length > SAFE_REPOSITORY_INDEX_LIMITS.maxFiles) {
      throw new RepositoryIndexExecutionError(
        "REPOSITORY_FILE_LIMIT_EXCEEDED",
        `Repository has more than ${SAFE_REPOSITORY_INDEX_LIMITS.maxFiles} tracked files`,
      );
    }
  }
  return paths.sort();
}

async function readSafeTrackedFile(checkoutDir: string, normalizedPath: string): Promise<Buffer> {
  const checkoutRoot = resolve(checkoutDir);
  const candidatePath = resolve(checkoutRoot, normalizedPath);
  assertContainedCheckoutPath(checkoutRoot, candidatePath, normalizedPath);

  const fileStat = await lstat(candidatePath);
  if (fileStat.isSymbolicLink()) {
    throw new RepositoryIndexExecutionError("REPOSITORY_SYMLINK_REJECTED", `Tracked symlink is not allowed in safe mode: ${normalizedPath}`);
  }
  if (!fileStat.isFile()) {
    throw new RepositoryIndexExecutionError("REPOSITORY_FILE_TYPE_REJECTED", `Tracked path is not a regular file: ${normalizedPath}`);
  }
  if (fileStat.size > SAFE_REPOSITORY_INDEX_LIMITS.maxFileBytes) {
    throw new RepositoryIndexExecutionError(
      "REPOSITORY_FILE_SIZE_LIMIT_EXCEEDED",
      `Tracked file exceeds the ${SAFE_REPOSITORY_INDEX_LIMITS.maxFileBytes}-byte safe-mode limit: ${normalizedPath}`,
    );
  }

  const canonicalPath = await realpath(candidatePath);
  assertContainedCheckoutPath(checkoutRoot, canonicalPath, normalizedPath);
  return readFile(canonicalPath);
}

function assertContainedCheckoutPath(checkoutRoot: string, candidatePath: string, normalizedPath: string): void {
  const pathFromRoot = relative(checkoutRoot, candidatePath);
  if (pathFromRoot === ".." || pathFromRoot.startsWith(`..${process.platform === "win32" ? "\\" : "/"}`) || isAbsolute(pathFromRoot)) {
    throw new RepositoryIndexExecutionError("REPOSITORY_PATH_ESCAPE", `Tracked path escapes the safe-mode checkout: ${normalizedPath}`);
  }
}

function normalizeRepositoryPath(value: string): string {
  return value.replace(/\\/g, "/");
}
