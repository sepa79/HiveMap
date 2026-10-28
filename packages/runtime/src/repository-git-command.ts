/**
 * Responsibility: Execute repository Git commands with canonical process limits and failure diagnostics.
 * Must not: Select repository sources, inspect tracked content, or persist index state.
 * Contract: Git acquisition limits and failures in docs/specs/repository-indexing.md.
 */
import { execFile, type ExecFileException } from "node:child_process";
import { promisify } from "node:util";

import { SAFE_REPOSITORY_INDEX_LIMITS } from "./repository-index-contracts.js";
import { RepositoryIndexExecutionError } from "./repository-index-execution-error.js";

type RepositoryGitCommand = "init" | "remote" | "fetch" | "rev-parse" | "ls-tree" | "checkout";

const execFileAsync = promisify(execFile);

export async function runRepositoryGit(cwd: string, command: RepositoryGitCommand, args: readonly string[]): Promise<string> {
  try {
    const { stdout } = await execFileAsync("prlimit", [
      `--fsize=${SAFE_REPOSITORY_INDEX_LIMITS.gitFileWriteBytes}`,
      `--as=${SAFE_REPOSITORY_INDEX_LIMITS.gitAddressSpaceBytes}`,
      `--cpu=${SAFE_REPOSITORY_INDEX_LIMITS.gitCpuSeconds}`,
      "--",
      "git",
      command,
      ...args,
    ], {
      cwd,
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
    const failure = error as ExecFileException;
    const diagnostics = [`wallLimitMs=${SAFE_REPOSITORY_INDEX_LIMITS.gitTimeoutMs}`];
    if (failure.code !== undefined) diagnostics.push(`code=${failure.code}`);
    if (failure.signal !== undefined) diagnostics.push(`signal=${failure.signal}`);
    if (failure.killed !== undefined) diagnostics.push(`killed=${failure.killed}`);
    throw new RepositoryIndexExecutionError(
      "GIT_COMMAND_FAILED",
      `Git ${command} failed (${diagnostics.join(", ")}): ${failure.message}`,
    );
  }
}
