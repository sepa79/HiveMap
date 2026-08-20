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
});
