/**
 * Responsibility: Normalize one bounded tracked file into deterministic file metadata and text chunks.
 * Must not: Read files, acquire repositories, derive cross-file syntax dependencies, or persist facts.
 * Contract: Implements safe-mode file classification and chunking in docs/specs/repository-indexing.md.
 */
import { createHash } from "node:crypto";
import { extname } from "node:path";

import type { RepositoryChunkRecord, RepositoryFileRecord } from "@hivemap/storage";

import type { RepositoryFactBudget } from "./repository-fact-budget.js";

export function createRepositoryContentFacts(options: {
  workspaceId: string;
  indexId: string;
  filePath: string;
  bytes: Buffer;
  factBudget: RepositoryFactBudget;
}): { file: RepositoryFileRecord; chunks: RepositoryChunkRecord[]; text?: string } {
  const sourceKind = classifySourceKind(options.filePath);
  const text = isProbablyTextFile(options.bytes) ? options.bytes.toString("utf8").replace(/\r\n/g, "\n") : undefined;
  const language = detectLanguage(options.filePath, sourceKind, text);
  const file: RepositoryFileRecord = {
    workspaceId: options.workspaceId,
    indexId: options.indexId,
    path: options.filePath,
    language,
    sourceKind,
    contentHash: digestBytes(options.bytes),
    byteSize: options.bytes.byteLength,
  };
  if (text === undefined) {
    return { file, chunks: [] };
  }
  return {
    file,
    chunks: createRepositoryChunks({
      workspaceId: options.workspaceId,
      indexId: options.indexId,
      filePath: options.filePath,
      language,
      sourceKind,
      text,
      factBudget: options.factBudget,
    }),
    text,
  };
}

export function createRepositoryChunks(options: {
  workspaceId: string;
  indexId: string;
  filePath: string;
  language: string;
  sourceKind: string;
  text: string;
  factBudget: RepositoryFactBudget;
}): RepositoryChunkRecord[] {
  const lines = options.text.split("\n");
  const segments: Iterable<{ startLine: number; endLine: number }> =
    options.sourceKind === "documentation" || options.language === "markdown"
      ? iterateDocumentationSegments(lines)
      : options.sourceKind === "config"
        ? [{ startLine: 1, endLine: lines.length }]
        : iterateFixedLineSegments(lines, 40);

  const chunks: RepositoryChunkRecord[] = [];
  for (const segment of segments) {
    const text = lines.slice(segment.startLine - 1, segment.endLine).join("\n");
    const chunkText = options.sourceKind === "config" ? text : text.trim();
    if (chunkText.trim().length === 0) {
      continue;
    }
    options.factBudget.consume("chunk");
    chunks.push({
      workspaceId: options.workspaceId,
      indexId: options.indexId,
      id: digestText(`${options.filePath}:${segment.startLine}:${segment.endLine}:${chunkText}`).slice(0, 24),
      filePath: options.filePath,
      language: options.language,
      sourceKind: options.sourceKind,
      startLine: segment.startLine,
      endLine: segment.endLine,
      text: chunkText,
      contentHash: digestText(chunkText),
    });
  }
  return chunks;
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

function detectLanguage(path: string, sourceKind: string, text?: string): string {
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
      if (sourceKind === "code" || sourceKind === "test") {
        const inferredScriptLanguage = inferScriptLanguage(path, text);
        if (inferredScriptLanguage !== undefined) {
          return inferredScriptLanguage;
        }
      }
      return sourceKind === "documentation" ? "text" : "plain-text";
  }
}

function inferScriptLanguage(path: string, text: string | undefined): "javascript" | "shell" | undefined {
  if (text === undefined) {
    return undefined;
  }

  const firstLine = text.split("\n", 1)[0]?.trim().toLowerCase() ?? "";
  if (firstLine.startsWith("#!")) {
    if (firstLine.includes("node") || firstLine.includes("deno") || firstLine.includes("bun")) {
      return "javascript";
    }
    if (firstLine.includes("sh") || firstLine.includes("bash") || firstLine.includes("zsh")) {
      return "shell";
    }
  }

  const normalizedPath = normalizeRepositoryPath(path).toLowerCase();
  if ((normalizedPath.includes("/bin/") || normalizedPath.includes("/cli/")) && /(?:^|\n)\s*(?:import\s|export\s|const\s+\w+\s*=\s*require\()/u.test(text)) {
    return "javascript";
  }

  return undefined;
}

function classifySourceKind(path: string): string {
  const normalized = path.toLocaleLowerCase();
  const baseName = normalized.split("/").at(-1) ?? normalized;
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
    baseName.startsWith(".") ||
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

function* iterateDocumentationSegments(lines: readonly string[]): IterableIterator<{ startLine: number; endLine: number }> {
  let currentStartLine: number | undefined;
  for (let index = 0; index < lines.length; index += 1) {
    if (!/^#{1,6}\s+/.test(lines[index] ?? "")) {
      continue;
    }
    const headingLine = index + 1;
    if (currentStartLine === undefined) {
      if (headingLine > 1) {
        yield { startLine: 1, endLine: headingLine - 1 };
      }
    } else {
      yield { startLine: currentStartLine, endLine: headingLine - 1 };
    }
    currentStartLine = headingLine;
  }

  if (currentStartLine === undefined) {
    yield* iterateFixedLineSegments(lines, 60);
    return;
  }
  yield { startLine: currentStartLine, endLine: lines.length };
}

function* iterateFixedLineSegments(
  lines: readonly string[],
  chunkSize: number,
): IterableIterator<{ startLine: number; endLine: number }> {
  for (let start = 0; start < lines.length; start += chunkSize) {
    const end = Math.min(lines.length, start + chunkSize);
    yield { startLine: start + 1, endLine: end };
  }
}

function normalizeRepositoryPath(value: string): string {
  return value.replace(/\\/g, "/");
}
