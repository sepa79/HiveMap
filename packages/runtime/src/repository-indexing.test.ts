import { describe, expect, it } from "vitest";

import { createRepositoryChunks } from "./repository-indexing.js";

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
});
