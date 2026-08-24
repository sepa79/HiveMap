import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdtemp, readFile, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { extname, join, resolve } from "node:path";
import { promisify } from "node:util";

import type {
  RepositoryChunkRecord,
  RepositoryDependencyRecord,
  RepositoryFileRecord,
  RepositoryReferenceRecord,
  RepositorySymbolRecord,
} from "@hivemap/storage";

import { createRepositoryDependencies, createRepositorySyntaxFacts } from "./repository-syntax.js";

const execFileAsync = promisify(execFile);

export type SafeRepositoryIndexResult = {
  resolvedCommit: string;
  files: RepositoryFileRecord[];
  chunks: RepositoryChunkRecord[];
  symbols?: RepositorySymbolRecord[];
  references?: RepositoryReferenceRecord[];
  dependencies?: RepositoryDependencyRecord[];
  stats: {
    fileCount: number;
    chunkCount: number;
    indexedBytes: number;
  };
};

export type RepositoryIndexExecutor = (options: {
  workspaceId: string;
  indexId: string;
  repositoryUrl: string;
  requestedRef?: string;
}) => Promise<SafeRepositoryIndexResult>;

export class RepositoryIndexExecutionError extends Error {
  readonly code: string;

  constructor(code: string, message: string) {
    super(message);
    this.name = "RepositoryIndexExecutionError";
    this.code = code;
  }
}

export const executeSafeRepositoryIndex: RepositoryIndexExecutor = async (options) => {
  
  const source = await normalizeRepositorySource(options.repositoryUrl);
  const checkoutRoot = await mkdtemp(join(tmpdir(), "hivemap-repository-index-"));
  const checkoutDir = join(checkoutRoot, "checkout");
  try {
    await runGit(["clone", "--no-checkout", source, checkoutDir]);
    await runGit(["-C", checkoutDir, "checkout", "--detach", options.requestedRef ?? "HEAD"]);
    const resolvedCommit = (await runGit(["-C", checkoutDir, "rev-parse", "HEAD"])).trim();
    const trackedFiles = splitNullSeparated(await runGit(["-C", checkoutDir, "ls-files", "-z"])).sort();

    const files: RepositoryFileRecord[] = [];
    const chunks: RepositoryChunkRecord[] = [];
    const symbols: RepositorySymbolRecord[] = [];
    const references: RepositoryReferenceRecord[] = [];
    const dependencies: RepositoryDependencyRecord[] = [];
    let indexedBytes = 0;

    for (const relativePath of trackedFiles) {
      const normalizedPath = normalizeRepositoryPath(relativePath);
      const absolutePath = join(checkoutDir, normalizedPath);
      const bytes = await readFile(absolutePath);
      const byteSize = bytes.byteLength;
      indexedBytes += byteSize;
      const sourceKind = classifySourceKind(normalizedPath);
      const language = detectLanguage(normalizedPath, sourceKind);
      const contentHash = digestBytes(bytes);

      files.push({
        workspaceId: options.workspaceId,
        indexId: options.indexId,
        path: normalizedPath,
        language,
        sourceKind,
        contentHash,
        byteSize,
      });

      if (!isProbablyTextFile(bytes)) {
        continue;
      }

      const text = bytes.toString("utf8").replace(/\r\n/g, "\n");
      const nextChunks = createRepositoryChunks({
        workspaceId: options.workspaceId,
        indexId: options.indexId,
        filePath: normalizedPath,
        language,
        sourceKind,
        text,
      });
      chunks.push(...nextChunks);
      const facts = createRepositorySyntaxFacts({
        workspaceId: options.workspaceId,
        indexId: options.indexId,
        filePath: normalizedPath,
        language,
        sourceKind,
        text,
      });
      symbols.push(...facts.symbols);
      references.push(...facts.references);
    }

    dependencies.push(
      ...createRepositoryDependencies({
        files,
        symbols,
        references,
      }),
    );

    return {
      resolvedCommit,
      files,
      chunks,
      symbols,
      references,
      dependencies,
      stats: {
        fileCount: files.length,
        chunkCount: chunks.length,
        indexedBytes,
      },
    };
  } finally {
    await rm(checkoutRoot, { recursive: true, force: true });
  }
};

async function normalizeRepositorySource(repositoryUrl: string): Promise<string> {
  const trimmed = repositoryUrl.trim();
  if (trimmed.startsWith("file://")) {
    return new URL(trimmed).pathname;
  }
  if (trimmed.startsWith("https://") || trimmed.startsWith("ssh://") || trimmed.startsWith("git@")) {
    return trimmed;
  }
  if (trimmed.startsWith("http://")) {
    throw new RepositoryIndexExecutionError("UNSAFE_REPOSITORY_URL", `Insecure repository URL is not allowed: ${trimmed}`);
  }

  const resolvedPath = resolve(trimmed);
  const sourceStat = await stat(resolvedPath).catch(() => undefined);
  if (sourceStat === undefined || !sourceStat.isDirectory()) {
    throw new RepositoryIndexExecutionError("REPOSITORY_SOURCE_NOT_FOUND", `Repository source does not exist: ${trimmed}`);
  }
  return resolvedPath;
}

async function runGit(args: string[]): Promise<string> {
  try {
    const { stdout } = await execFileAsync("git", args, {
      env: {
        ...process.env,
        GIT_TERMINAL_PROMPT: "0",
      },
      maxBuffer: 32 * 1024 * 1024,
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

function splitNullSeparated(value: string): string[] {
  return value
    .split("\u0000")
    .map((item) => item.trim())
    .filter((item) => item.length > 0);
}

function normalizeRepositoryPath(value: string): string {
  return value.replace(/\\/g, "/");
}

function digestBytes(value: Uint8Array): string {
  return createHash("sha256").update(value).digest("hex");
}

function digestText(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

function isProbablyTextFile(bytes: Uint8Array): boolean {
  if (bytes.length === 0) {
    return true;
  }
  let suspicious = 0;
  for (const byte of bytes) {
    if (byte === 0) {
      return false;
    }
    if (byte < 9 || (byte > 13 && byte < 32)) {
      suspicious += 1;
    }
  }
  return suspicious / bytes.length < 0.05;
}

function detectLanguage(path: string, sourceKind: string): string {
  const extension = extname(path).toLocaleLowerCase();
  switch (extension) {
    case ".ts":
      return "typescript";
    case ".tsx":
      return "tsx";
    case ".js":
      return "javascript";
    case ".jsx":
      return "jsx";
    case ".java":
      return "java";
    case ".json":
      return "json";
    case ".yaml":
    case ".yml":
      return "yaml";
    case ".toml":
      return "toml";
    case ".md":
    case ".mdx":
      return "markdown";
    case ".txt":
      return "text";
    case ".rst":
      return "rst";
    case ".adoc":
      return "asciidoc";
    case ".html":
      return "html";
    case ".css":
      return "css";
    case ".sql":
      return "sql";
    case ".sh":
      return "shell";
    default:
      return sourceKind === "documentation" ? "text" : "plain-text";
  }
}

function classifySourceKind(path: string): string {
  const normalized = path.toLocaleLowerCase();
  if (
    normalized.startsWith("docs/") ||
    normalized.endsWith(".md") ||
    normalized.endsWith(".mdx") ||
    normalized.endsWith(".rst") ||
    normalized.endsWith(".adoc") ||
    normalized.endsWith(".txt")
  ) {
    return "documentation";
  }
  if (
    normalized.includes("/test/") ||
    normalized.includes("/tests/") ||
    normalized.includes(".test.") ||
    normalized.includes(".spec.")
  ) {
    return "test";
  }
  if (
    normalized.endsWith(".json") ||
    normalized.endsWith(".yaml") ||
    normalized.endsWith(".yml") ||
    normalized.endsWith(".toml") ||
    normalized.endsWith(".env") ||
    normalized.endsWith(".ini")
  ) {
    return "config";
  }
  if (
    normalized.startsWith("dist/") ||
    normalized.startsWith("build/") ||
    normalized.includes("/dist/") ||
    normalized.includes("/build/") ||
    normalized.includes("/generated/") ||
    normalized.endsWith(".min.js")
  ) {
    return "generated";
  }
  if (normalized.includes("/vendor/") || normalized.includes("/third_party/")) {
    return "vendor";
  }
  return "code";
}

export function createRepositoryChunks(options: {
  workspaceId: string;
  indexId: string;
  filePath: string;
  language: string;
  sourceKind: string;
  text: string;
}): RepositoryChunkRecord[] {
  const lines = options.text.split("\n");
  const segments =
    options.sourceKind === "documentation" || options.language === "markdown"
      ? splitDocumentationSegments(lines)
      : splitFixedLineSegments(lines, 40);

  return segments
    .map((segment) => {
      const text = lines.slice(segment.startLine - 1, segment.endLine).join("\n").trim();
      if (text.length === 0) {
        return undefined;
      }
      return {
        workspaceId: options.workspaceId,
        indexId: options.indexId,
        id: digestText(`${options.filePath}:${segment.startLine}:${segment.endLine}:${text}`).slice(0, 24),
        filePath: options.filePath,
        language: options.language,
        sourceKind: options.sourceKind,
        startLine: segment.startLine,
        endLine: segment.endLine,
        text,
        contentHash: digestText(text),
      } satisfies RepositoryChunkRecord;
    })
    .filter((chunk): chunk is RepositoryChunkRecord => chunk !== undefined);
}

function splitDocumentationSegments(lines: readonly string[]): Array<{ startLine: number; endLine: number }> {
  const headingLines: number[] = [];
  for (let index = 0; index < lines.length; index += 1) {
    if (/^#{1,6}\s+/.test(lines[index] ?? "")) {
      headingLines.push(index + 1);
    }
  }
  if (headingLines.length === 0) {
    return splitFixedLineSegments(lines, 60);
  }
  const segments: Array<{ startLine: number; endLine: number }> = [];
  const firstHeading = headingLines[0]!;
  if (firstHeading > 1) {
    segments.push({ startLine: 1, endLine: firstHeading - 1 });
  }
  for (let index = 0; index < headingLines.length; index += 1) {
    const startLine = headingLines[index]!;
    const nextHeading = headingLines[index + 1];
    const endLine = nextHeading === undefined ? lines.length : nextHeading - 1;
    if (endLine >= startLine) {
      segments.push({ startLine, endLine });
    }
  }
  return segments;
}

function splitFixedLineSegments(lines: readonly string[], chunkSize: number): Array<{ startLine: number; endLine: number }> {
  const segments: Array<{ startLine: number; endLine: number }> = [];
  for (let start = 0; start < lines.length; start += chunkSize) {
    const end = Math.min(lines.length, start + chunkSize);
    segments.push({ startLine: start + 1, endLine: end });
  }
  return segments;
}
