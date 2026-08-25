import { execFile } from "node:child_process";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";

import { afterEach, describe, expect, it } from "vitest";

import { createRepositoryChunks, executeSafeRepositoryIndex } from "./repository-indexing.js";

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
});
