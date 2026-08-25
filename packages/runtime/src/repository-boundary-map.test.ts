import { describe, expect, it } from "vitest";

import { createBoundaryMapBuildConfig } from "@hivemap/scans";

import { buildBoundaryMapArtifact } from "./repository-boundary-map.js";

describe("buildBoundaryMapArtifact", () => {
  it("derives a CLI entrypoint from a tool launcher file without exported symbols", () => {
    const artifact = buildBoundaryMapArtifact({
      coverage: {
        discovered: ["src/bin/uuid", "src/uuid-bin.ts", "README.md"],
        included: ["src/bin/uuid", "src/uuid-bin.ts", "README.md"],
        excluded: [],
        failed: [],
      },
      files: [
        {
          workspaceId: "workspace-a",
          indexId: "repo-index-a",
          path: "src/bin/uuid",
          language: "plaintext",
          sourceKind: "code",
          contentHash: "hash-bin-launcher",
          byteSize: 32,
        },
        {
          workspaceId: "workspace-a",
          indexId: "repo-index-a",
          path: "src/uuid-bin.ts",
          language: "typescript",
          sourceKind: "code",
          contentHash: "hash-bin-impl",
          byteSize: 256,
        },
        {
          workspaceId: "workspace-a",
          indexId: "repo-index-a",
          path: "README.md",
          language: "markdown",
          sourceKind: "documentation",
          contentHash: "hash-readme",
          byteSize: 128,
        },
      ],
      symbols: [],
      dependencies: [
        {
          workspaceId: "workspace-a",
          indexId: "repo-index-a",
          key: "dep-bin-launcher",
          filePath: "src/bin/uuid",
          language: "plaintext",
          sourceKind: "code",
          kind: "import",
          targetText: "../uuid-bin.js",
          targetFilePath: "src/uuid-bin.ts",
          startLine: 2,
          startColumn: 0,
          endLine: 2,
          endColumn: 22,
          resolutionConfidence: "high",
          producerTool: "test",
          producerVersion: "1",
        },
      ],
      revision: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
      config: createBoundaryMapBuildConfig({
        formatVersion: 1,
        profileId: "code-quality-review",
        boundaryMapRoots: ["src/bin:tool", "src:library"],
      }),
    });

    expect(artifact.boundaries).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: "tool:src-bin",
          publicEntrypoints: [
            expect.objectContaining({
              kind: "cli",
              label: "uuid",
              filePath: "src/bin/uuid",
            }),
          ],
          openQuestions: expect.not.arrayContaining(["No public entrypoint was detected from exported or public top-level symbols."]),
        }),
      ]),
    );
    expect(artifact.relations).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          fromBoundaryId: "tool:src-bin",
          toBoundaryId: "library:src",
          kind: "depends-on",
        }),
      ]),
    );
  });
});
