import { execFile } from "node:child_process";
import { mkdtemp, mkdir, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";

import { afterEach, describe, expect, it } from "vitest";

import {
  createRepositoryChunks,
  executeSafeRepositoryIndex,
  SAFE_REPOSITORY_INDEX_LIMITS,
} from "./repository-indexing.js";
import { RepositoryFactBudget } from "./repository-fact-budget.js";

const execFileAsync = promisify(execFile);
const temporaryPaths: string[] = [];

afterEach(async () => {
  await Promise.all(temporaryPaths.splice(0).map((path) => rm(path, { recursive: true, force: true })));
});

describe("createRepositoryChunks", () => {
  it("preserves documentation text before the first heading", () => {
    const chunks = createRepositoryChunks({
      workspaceId: "workspace-a",
      indexId: "repo-index-a",
      filePath: "docs/guide.md",
      language: "markdown",
      sourceKind: "documentation",
      text: "Intro paragraph.\nStill intro.\n\n# Heading\nBody text.",
      factBudget: new RepositoryFactBudget(),
    });

    expect(chunks).toEqual([
      expect.objectContaining({
        filePath: "docs/guide.md",
        startLine: 1,
        endLine: 3,
        text: "Intro paragraph.\nStill intro.",
      }),
      expect.objectContaining({
        filePath: "docs/guide.md",
        startLine: 4,
        endLine: 5,
        text: "# Heading\nBody text.",
      }),
    ]);
  });

  it("keeps config text in one chunk so indentation survives reconstruction", () => {
    const text = [
      "formatVersion: 1",
      "profileId: code-quality-review",
      "instructions:",
      "  - Review the public API first.",
      "criteria:",
      "  - boundary-violation: Ownership is blurred across modules.",
      "requiredOutputs:",
      "  - document-inventory",
      "  - findings",
      "boundaryMapRoots:",
      "  - src:library",
      "boundaryMapTestDirectoryNames:",
      "  - test",
      "  - tests",
      "boundaryMapApiNameSuffixes:",
      "  - cli",
      ...Array.from({ length: 30 }, (_, index) => `extraLine${index}: value-${index}`),
    ].join("\n");

    const chunks = createRepositoryChunks({
      workspaceId: "workspace-a",
      indexId: "repo-index-a",
      filePath: ".hivemap/scan-profiles/code-quality.yaml",
      language: "yaml",
      sourceKind: "config",
      text,
      factBudget: new RepositoryFactBudget(),
    });

    expect(chunks).toHaveLength(1);
    expect(chunks[0]).toEqual(
      expect.objectContaining({
        filePath: ".hivemap/scan-profiles/code-quality.yaml",
        startLine: 1,
        endLine: 46,
        text,
      }),
    );
  });

  it("stops documentation chunk construction at the incremental fact budget", () => {
    const factBudget = new RepositoryFactBudget({ maxFacts: 2, maxChunks: 2 });

    expect(() =>
      createRepositoryChunks({
        workspaceId: "workspace-a",
        indexId: "repo-index-a",
        filePath: "docs/heading-heavy.md",
        language: "markdown",
        sourceKind: "documentation",
        text: "# One\n# Two\n# Three\n",
        factBudget,
      }),
    ).toThrowError(expect.objectContaining({ code: "REPOSITORY_CHUNK_LIMIT_EXCEEDED" }));
  });

  it("indexes extensionless node launchers as javascript and resolves their imports", async () => {
    const repositoryRoot = await mkdtemp(join(tmpdir(), "hivemap-index-launcher-"));
    temporaryPaths.push(repositoryRoot);

    await mkdir(join(repositoryRoot, "src", "bin"), { recursive: true });
    await writeFile(join(repositoryRoot, "src", "bin", "uuid"), "#!/usr/bin/env node\nimport '../uuid-bin.js';\n");
    await writeFile(join(repositoryRoot, "src", "uuid-bin.ts"), "export function runCli() { return 'ok'; }\n");

    await execFileAsync("git", ["init"], { cwd: repositoryRoot });
    await execFileAsync("git", ["config", "user.email", "codex@example.com"], { cwd: repositoryRoot });
    await execFileAsync("git", ["config", "user.name", "Codex"], { cwd: repositoryRoot });
    await execFileAsync("git", ["add", "."], { cwd: repositoryRoot });
    await execFileAsync("git", ["commit", "-m", "fixture"], { cwd: repositoryRoot });

    const result = await executeSafeRepositoryIndex({
      workspaceId: "workspace-a",
      indexId: "repo-index-a",
      repositoryUrl: repositoryRoot,
      sourcePolicy: "local-allowed",
      requestedRef: "HEAD",
    });

    expect(result.files).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          path: "src/bin/uuid",
          language: "javascript",
          sourceKind: "code",
        }),
      ]),
    );
    expect(result.references ?? []).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          filePath: "src/bin/uuid",
          kind: "import",
          targetText: "../uuid-bin.js",
        }),
      ]),
    );
    expect(result.dependencies ?? []).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          filePath: "src/bin/uuid",
          kind: "import",
          targetText: "../uuid-bin.js",
          targetFilePath: "src/uuid-bin.ts",
          resolutionConfidence: "high",
        }),
      ]),
    );
  });

  it("rejects tracked symlinks instead of reading outside the checkout", async () => {
    const repositoryRoot = await mkdtemp(join(tmpdir(), "hivemap-index-symlink-repo-"));
    const outsideRoot = await mkdtemp(join(tmpdir(), "hivemap-index-symlink-outside-"));
    temporaryPaths.push(repositoryRoot, outsideRoot);
    const outsideFile = join(outsideRoot, "runtime-secret.txt");
    await writeFile(outsideFile, "review-secret-marker\n");
    await symlink(outsideFile, join(repositoryRoot, "tracked-link.txt"));
    await commitFixture(repositoryRoot);

    await expect(
      executeSafeRepositoryIndex({
        workspaceId: "workspace-a",
        indexId: "repo-index-a",
        repositoryUrl: repositoryRoot,
        sourcePolicy: "local-allowed",
        requestedRef: "HEAD",
      }),
    ).rejects.toMatchObject({ code: "REPOSITORY_SYMLINK_REJECTED" });
  });

  it("rejects oversized tracked files before reading them", async () => {
    const repositoryRoot = await mkdtemp(join(tmpdir(), "hivemap-index-large-file-"));
    temporaryPaths.push(repositoryRoot);
    await writeFile(join(repositoryRoot, "oversized.txt"), Buffer.alloc(SAFE_REPOSITORY_INDEX_LIMITS.maxFileBytes + 1, 65));
    await commitFixture(repositoryRoot);

    await expect(
      executeSafeRepositoryIndex({
        workspaceId: "workspace-a",
        indexId: "repo-index-a",
        repositoryUrl: repositoryRoot,
        sourcePolicy: "local-allowed",
        requestedRef: "HEAD",
      }),
    ).rejects.toMatchObject({ code: "REPOSITORY_FILE_SIZE_LIMIT_EXCEEDED" });
  });

  it("rejects credential-bearing repository URLs before clone", async () => {
    await expect(
      executeSafeRepositoryIndex({
        workspaceId: "workspace-a",
        indexId: "repo-index-a",
        repositoryUrl: "https://operator:secret@example.com/org/repo.git",
      }),
    ).rejects.toMatchObject({ code: "UNSAFE_REPOSITORY_URL" });
  });

  it("rejects repository URL query parameters before clone", async () => {
    await expect(
      executeSafeRepositoryIndex({
        workspaceId: "workspace-a",
        indexId: "repo-index-a",
        repositoryUrl: "https://example.com/org/repo.git?access_token=secret",
      }),
    ).rejects.toMatchObject({ code: "UNSAFE_REPOSITORY_URL" });
  });

  it.each([
    "ssh://git@example.com/org/repo.git",
    "git@example.com:org/repo.git",
  ])("rejects unsupported SSH repository source %s before clone", async (repositoryUrl) => {
    await expect(
      executeSafeRepositoryIndex({
        workspaceId: "workspace-a",
        indexId: "repo-index-a",
        repositoryUrl,
      }),
    ).rejects.toMatchObject({ code: "UNSAFE_REPOSITORY_URL" });
  });

  it("rejects local repository sources unless the caller explicitly enables local operation", async () => {
    const repositoryRoot = await mkdtemp(join(tmpdir(), "hivemap-index-local-policy-"));
    temporaryPaths.push(repositoryRoot);
    await writeFile(join(repositoryRoot, "README.md"), "# Local fixture\n");
    await commitFixture(repositoryRoot);

    await expect(
      executeSafeRepositoryIndex({
        workspaceId: "workspace-a",
        indexId: "repo-index-a",
        repositoryUrl: repositoryRoot,
        requestedRef: "HEAD",
      }),
    ).rejects.toMatchObject({ code: "LOCAL_REPOSITORY_SOURCE_NOT_ALLOWED" });
  });

  it("rejects option-shaped Git refs before invoking fetch", async () => {
    await expect(
      executeSafeRepositoryIndex({
        workspaceId: "workspace-a",
        indexId: "repo-index-a",
        repositoryUrl: "https://example.com/org/repo.git",
        requestedRef: "--upload-pack=malicious",
      }),
    ).rejects.toMatchObject({ code: "UNSAFE_REPOSITORY_REF" });
  });
});

async function commitFixture(repositoryRoot: string): Promise<void> {
  await execFileAsync("git", ["init"], { cwd: repositoryRoot });
  await execFileAsync("git", ["config", "user.email", "codex@example.com"], { cwd: repositoryRoot });
  await execFileAsync("git", ["config", "user.name", "Codex"], { cwd: repositoryRoot });
  await execFileAsync("git", ["add", "."], { cwd: repositoryRoot });
  await execFileAsync("git", ["commit", "-m", "fixture"], { cwd: repositoryRoot });
}
