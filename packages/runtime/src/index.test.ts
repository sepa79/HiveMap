import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { beforeEach, describe, expect, it } from "vitest";

import { InMemoryHiveMapStore } from "@hivemap/storage";
import { CODE_QUALITY_PROFILE, DOCUMENTATION_CONFLICTS_PROFILE } from "@hivemap/scans";

import { type EmbeddingProvider, type RepositoryIndexExecutor, HiveMapRuntime, RepositoryIndexExecutionError } from "./index.js";

let store: InMemoryHiveMapStore;
let runtime: HiveMapRuntime;

beforeEach(async () => {
  store = new InMemoryHiveMapStore();
  await store.initialize();
  runtime = new HiveMapRuntime({
    store,
    embeddingProviders: { test: createTestEmbeddingProvider() },
    repositoryIndexExecutor: createTestRepositoryIndexExecutor(),
    now: () => "2026-08-19T23:00:00.000Z",
  });
});

describe("HiveMapRuntime", () => {
  it("creates workspaces with empty graph and delegated capture", async () => {
    const response = await runtime.createWorkspace({
      workspace: {
        id: "workspace-a",
        slug: "alpha",
        name: "Alpha",
        createdAt: "2026-05-13T21:00:00.000Z",
        updatedAt: "2026-05-13T21:00:00.000Z",
      },
    });

    expect(response.workspace.id).toBe("workspace-a");
    expect((await runtime.getWorkspace("workspace-a")).state.capturePolicy.mode).toBe("delegated");
  });

  it("lists workspaces with query, archived filtering, and limit", async () => {
    await seedWorkspaceFixture({ id: "workspace-a", slug: "caravanworld", name: "Caravan World", updatedAt: "2026-07-17T10:00:00.000Z" });
    await seedWorkspaceFixture({ id: "workspace-b", slug: "caravan-archive", name: "Caravan Archive", archived: true, updatedAt: "2026-07-16T10:00:00.000Z" });
    await seedWorkspaceFixture({ id: "workspace-c", slug: "caravan-lab", name: "Caravan Lab", updatedAt: "2026-07-18T10:00:00.000Z" });

    await expect(runtime.listWorkspaceSummaries({ query: "caravan", includeArchived: false, limit: 1 })).resolves.toEqual({
      items: [{ id: "workspace-c", slug: "caravan-lab", name: "Caravan Lab", updatedAt: "2026-07-18T10:00:00.000Z" }],
    });
  });

  it("resolves a workspace by slug to its canonical id", async () => {
    await seedWorkspaceFixture({ id: "workspace-a", slug: "caravanworld", name: "Caravan World" });

    await expect(runtime.resolveWorkspace({ ref: "caravanworld" })).resolves.toEqual({
      workspace: { id: "workspace-a", slug: "caravanworld", name: "Caravan World", updatedAt: "2026-05-13T21:00:00.000Z" },
    });
  });

  it("fails clearly when workspace resolution finds no match", async () => {
    await seedWorkspaceFixture({ id: "workspace-a", slug: "alpha", name: "Alpha" });

    await expect(runtime.resolveWorkspace({ ref: "missing" })).rejects.toThrow("Workspace not found: missing");
    try {
      await runtime.resolveWorkspace({ ref: "missing" });
      throw new Error("expected workspace_not_found");
    } catch (error) {
      expect(error).toMatchObject({ code: "workspace_not_found", details: { ref: "missing" } });
    }
  });

  it("fails clearly when workspace resolution is ambiguous by name", async () => {
    await seedWorkspaceFixture({ id: "workspace-a", slug: "alpha-a", name: "Alpha" });
    await seedWorkspaceFixture({ id: "workspace-b", slug: "alpha-b", name: "Alpha" });

    try {
      await runtime.resolveWorkspace({ ref: "Alpha" });
      throw new Error("expected workspace_ambiguous");
    } catch (error) {
      expect(error).toMatchObject({
        code: "workspace_ambiguous",
        details: {
          ref: "Alpha",
          candidates: [
            { id: "workspace-a", slug: "alpha-a", name: "Alpha", updatedAt: "2026-05-13T21:00:00.000Z" },
            { id: "workspace-b", slug: "alpha-b", name: "Alpha", updatedAt: "2026-05-13T21:00:00.000Z" },
          ],
        },
      });
    }
  });

  it("applies graph commands and creates projections over the same state", async () => {
    await seedWorkspaceFixture();
    await runtime.applyGraphCommands({
      workspaceId: "workspace-a",
      commands: [
        {
          id: "cmd-a",
          type: "node.create",
          payload: { node: { id: "node-a", label: "Alpha", type: "concept" } },
        },
      ],
    });

    const projection = await runtime.createProjection({
      workspaceId: "workspace-a",
      input: { id: "projection-a", name: "Overview", maxNodes: 1 },
    });

    expect(projection.projection.visibleNodeIds).toEqual(["node-a"]);
  });

  it("creates a project map projection through the shared runtime", async () => {
    await seedWorkspaceFixture();
    await runtime.applyGraphCommands({
      workspaceId: "workspace-a",
      commands: [
        {
          id: "cmd-a",
          type: "node.create",
          payload: { node: { id: "node-a", label: "Alpha", type: "system" } },
        },
      ],
    });

    const projection = (await runtime.createProjection({
      workspaceId: "workspace-a",
      input: {
        id: "projection-project",
        name: "Project Map",
        type: "project-map",
        rootNodeIds: ["node-a"],
        visibleNodeIds: ["node-a"],
        groups: [{ id: "group-system", label: "System", nodeIds: ["node-a"] }],
      },
    })).projection;

    expect(projection.type).toBe("project-map");
    expect(projection.groups?.[0]?.label).toBe("System");
  });

  it("records feedback without mutating graph", async () => {
    await seedWorkspaceFixture();
    await runtime.recordFeedback({
      workspaceId: "workspace-a",
      feedbackEvent: {
        id: "feedback-a",
        createdAt: "2026-05-13T21:01:00.000Z",
        type: "map_comment",
        payload: { text: "Keep this visible" },
      },
    });

    expect((await runtime.listFeedback({ workspaceId: "workspace-a" })).feedbackEvents).toHaveLength(1);
    expect((await runtime.getGraph({ workspaceId: "workspace-a" })).graph).toEqual({ nodes: [], edges: [] });
  });

  it("starts and lists safe repository index jobs", async () => {
    await seedWorkspaceFixture();

    await expect(
      runtime.startRepositoryIndex({
        workspaceId: "workspace-a",
        index: {
          id: "repo-index-a",
          repositoryUrl: "https://example.com/org/repo.git",
          requestedRef: "main",
          mode: "safe",
          requestedAt: "2026-08-20T12:00:00.000Z",
          actor: {
            agentId: "codex",
            tool: "mcp",
          },
        },
      }),
    ).resolves.toEqual({
      index: {
        id: "repo-index-a",
        workspaceId: "workspace-a",
        repositoryUrl: "https://example.com/org/repo.git",
        requestedRef: "main",
        mode: "safe",
        stage: "requested",
        requestedAt: "2026-08-20T12:00:00.000Z",
        updatedAt: "2026-08-20T12:00:00.000Z",
        actor: {
          agentId: "codex",
          tool: "mcp",
        },
      },
    });

    await expect(runtime.listRepositoryIndexes({ workspaceId: "workspace-a" })).resolves.toEqual({
      indexes: [
        {
          id: "repo-index-a",
          workspaceId: "workspace-a",
          repositoryUrl: "https://example.com/org/repo.git",
          requestedRef: "main",
          mode: "safe",
          stage: "requested",
          requestedAt: "2026-08-20T12:00:00.000Z",
          updatedAt: "2026-08-20T12:00:00.000Z",
          actor: {
            agentId: "codex",
            tool: "mcp",
          },
        },
      ],
    });
    await expect(runtime.getRepositoryIndex({ workspaceId: "workspace-a", indexId: "repo-index-a" })).resolves.toEqual({
      index: {
        id: "repo-index-a",
        workspaceId: "workspace-a",
        repositoryUrl: "https://example.com/org/repo.git",
        requestedRef: "main",
        mode: "safe",
        stage: "requested",
        requestedAt: "2026-08-20T12:00:00.000Z",
        updatedAt: "2026-08-20T12:00:00.000Z",
        actor: {
          agentId: "codex",
          tool: "mcp",
        },
      },
    });
  });

  it("rejects deep repository index mode in the current phase", async () => {
    await seedWorkspaceFixture();

    await expect(
      runtime.startRepositoryIndex({
        workspaceId: "workspace-a",
        index: {
          id: "repo-index-a",
          repositoryUrl: "https://example.com/org/repo.git",
          mode: "deep",
          requestedAt: "2026-08-20T12:00:00.000Z",
          actor: {
            agentId: "codex",
            tool: "mcp",
          },
        },
      }),
    ).rejects.toMatchObject({
      code: "REPOSITORY_INDEX_MODE_UNAVAILABLE",
      details: { mode: "deep" },
    });
  });

  it("executes a safe repository index and searches persisted chunks", async () => {
    await seedWorkspaceFixture();
    await runtime.startRepositoryIndex({
      workspaceId: "workspace-a",
      index: {
        id: "repo-index-a",
        repositoryUrl: "/fixtures/repo",
        requestedRef: "main",
        mode: "safe",
        requestedAt: "2026-08-20T12:00:00.000Z",
        actor: {
          agentId: "codex",
          tool: "mcp",
        },
      },
    });

    const executed = await runtime.executeRepositoryIndex({ workspaceId: "workspace-a", indexId: "repo-index-a" });
    expect(executed.index.stage).toBe("completed");
    expect(executed.index.resolvedCommit).toMatch(/^[0-9a-f]{40}$/);
    expect(executed.index.stats).toEqual({
      fileCount: 3,
      chunkCount: 2,
      indexedBytes: 208,
    });

    await expect(
      runtime.searchRepositoryIndex({
        workspaceId: "workspace-a",
        indexId: "repo-index-a",
        query: "single source of truth ownership",
        limit: 5,
      }),
    ).resolves.toEqual({
      indexId: "repo-index-a",
      query: "single source of truth ownership",
      hits: expect.arrayContaining([
        expect.objectContaining({
          kind: "chunk",
          filePath: "docs/architecture.md",
          sourceKind: "documentation",
          snippet: expect.stringContaining("single source of truth"),
        }),
      ]),
    });

    await expect(store.listRepositoryIndexReferences("workspace-a", "repo-index-a")).resolves.toEqual([
      expect.objectContaining({
        kind: "import",
        targetText: "./guide",
        filePath: "src/index.ts",
      }),
      expect.objectContaining({
        kind: "call",
        targetText: "describeOwnership",
        filePath: "src/index.ts",
      }),
    ]);
    await expect(store.listRepositoryIndexDependencies("workspace-a", "repo-index-a")).resolves.toEqual([
      expect.objectContaining({
        kind: "import",
        targetText: "./guide",
        filePath: "src/index.ts",
      }),
      expect.objectContaining({
        kind: "call",
        targetText: "describeOwnership",
        filePath: "src/index.ts",
      }),
    ]);
  });

  it("builds bounded repository evidence candidates for documentation scan criteria", async () => {
    await seedWorkspaceFixture();
    const evidenceRuntime = new HiveMapRuntime({
      store,
      embeddingProviders: { test: createTestEmbeddingProvider() },
      repositoryIndexExecutor: async ({ workspaceId, indexId }) => createRepositoryEvidenceIndexResult(workspaceId, indexId),
      now: () => "2026-08-19T23:00:00.000Z",
    });

    await evidenceRuntime.startRepositoryIndex({
      workspaceId: "workspace-a",
      index: {
        id: "repo-index-evidence",
        repositoryUrl: "/fixtures/repo",
        requestedRef: "main",
        mode: "safe",
        requestedAt: "2026-08-20T12:00:00.000Z",
        actor: {
          agentId: "codex",
          tool: "mcp",
        },
      },
    });
    await evidenceRuntime.executeRepositoryIndex({ workspaceId: "workspace-a", indexId: "repo-index-evidence" });

    await expect(
      evidenceRuntime.listRepositoryEvidenceCandidates({
        workspaceId: "workspace-a",
        indexId: "repo-index-evidence",
        profileId: "documentation-conflicts",
        profileVersion: 1,
        criterionId: "contradictory-claims",
      }),
    ).resolves.toEqual(expect.objectContaining({
      indexId: "repo-index-evidence",
      profileId: "documentation-conflicts",
      profileVersion: 1,
      criterionId: "contradictory-claims",
      ...expectDefaultOverlayMetadata("documentation-conflicts", ".hivemap/scan-profiles/documentation-conflicts.yaml"),
      candidates: [
        expect.objectContaining({
          signal: "contradictory-claim",
          kind: "requires_interpretation",
          summary: expect.stringContaining("sqlite"),
          sources: expect.arrayContaining([
            expect.objectContaining({ filePath: "docs/storage.md", startLine: 2 }),
            expect.objectContaining({ filePath: "docs/legacy-storage.md", startLine: 2 }),
          ]),
        }),
      ],
    }));

    await expect(
      evidenceRuntime.listRepositoryEvidenceCandidates({
        workspaceId: "workspace-a",
        indexId: "repo-index-evidence",
        profileId: "documentation-conflicts",
        profileVersion: 1,
        criterionId: "broken-references",
        limit: 2,
      }),
    ).resolves.toEqual(expect.objectContaining({
      indexId: "repo-index-evidence",
      profileId: "documentation-conflicts",
      profileVersion: 1,
      criterionId: "broken-references",
      ...expectDefaultOverlayMetadata("documentation-conflicts", ".hivemap/scan-profiles/documentation-conflicts.yaml"),
      candidates: expect.arrayContaining([
        expect.objectContaining({
          signal: "broken-reference",
          kind: "deterministic",
          summary: expect.stringContaining("missing.md"),
          sources: [
            expect.objectContaining({
              filePath: "docs/architecture.md",
              startLine: 3,
              snippet: expect.stringContaining("missing.md"),
            }),
          ],
        }),
        expect.objectContaining({
          signal: "broken-reference",
          kind: "deterministic",
          summary: expect.stringContaining("guide.md#missing-section"),
          sources: [
            expect.objectContaining({
              filePath: "docs/architecture.md",
              startLine: 4,
              snippet: expect.stringContaining("guide.md#missing-section"),
            }),
          ],
        }),
      ]),
    }));

    await expect(
      evidenceRuntime.listRepositoryEvidenceCandidates({
        workspaceId: "workspace-a",
        indexId: "repo-index-evidence",
        profileId: "documentation-conflicts",
        profileVersion: 1,
        criterionId: "duplicate-authority",
      }),
    ).resolves.toEqual(expect.objectContaining({
      indexId: "repo-index-evidence",
      profileId: "documentation-conflicts",
      profileVersion: 1,
      criterionId: "duplicate-authority",
      ...expectDefaultOverlayMetadata("documentation-conflicts", ".hivemap/scan-profiles/documentation-conflicts.yaml"),
      candidates: [
        expect.objectContaining({
          signal: "authority-claim",
          kind: "requires_interpretation",
          sources: expect.arrayContaining([
            expect.objectContaining({ filePath: "docs/architecture.md" }),
            expect.objectContaining({ filePath: "docs/guide.md" }),
          ]),
        }),
      ],
    }));

    await expect(
      evidenceRuntime.listRepositoryEvidenceCandidates({
        workspaceId: "workspace-a",
        indexId: "repo-index-evidence",
        profileId: "documentation-conflicts",
        profileVersion: 1,
        criterionId: "missing-owner",
      }),
    ).resolves.toEqual(expect.objectContaining({
      indexId: "repo-index-evidence",
      profileId: "documentation-conflicts",
      profileVersion: 1,
      criterionId: "missing-owner",
      ...expectDefaultOverlayMetadata("documentation-conflicts", ".hivemap/scan-profiles/documentation-conflicts.yaml"),
      candidates: expect.arrayContaining([
        expect.objectContaining({
          signal: "missing-owner",
          sources: [expect.objectContaining({ filePath: "docs/runbook.md" })],
        }),
      ]),
    }));
  });

  it("builds coverage-aware structural evidence candidates for duplicate responsibility", async () => {
    await seedWorkspaceFixture();
    const structuralRuntime = new HiveMapRuntime({
      store,
      embeddingProviders: { test: createTestEmbeddingProvider() },
      repositoryIndexExecutor: async ({ workspaceId, indexId }) => createRepositoryStructuralEvidenceIndexResult(workspaceId, indexId),
      now: () => "2026-08-20T18:00:00.000Z",
    });

    await structuralRuntime.startRepositoryIndex({
      workspaceId: "workspace-a",
      index: {
        id: "repo-index-structural",
        repositoryUrl: "/fixtures/repo",
        requestedRef: "main",
        mode: "safe",
        requestedAt: "2026-08-20T18:00:00.000Z",
        actor: {
          agentId: "codex",
          tool: "mcp",
        },
      },
    });
    await structuralRuntime.executeRepositoryIndex({ workspaceId: "workspace-a", indexId: "repo-index-structural" });

    await expect(
      structuralRuntime.listRepositoryEvidenceCandidates({
        workspaceId: "workspace-a",
        indexId: "repo-index-structural",
        profileId: "code-quality-review",
        profileVersion: 1,
        criterionId: "duplicate-responsibility",
      }),
    ).resolves.toEqual(expect.objectContaining({
      indexId: "repo-index-structural",
      profileId: "code-quality-review",
      profileVersion: 1,
      criterionId: "duplicate-responsibility",
      ...expectDefaultOverlayMetadata("code-quality-review", ".hivemap/scan-profiles/code-quality.yaml"),
      candidates: [
        expect.objectContaining({
          signal: "duplicate-responsibility",
          kind: "requires_interpretation",
          summary: expect.stringContaining("RuntimePolicy"),
          sources: [
            expect.objectContaining({
              filePath: "packages/runtime/src/runtime-policy/RuntimePolicy.ts",
              snippet: "class RuntimePolicy",
            }),
            expect.objectContaining({
              filePath: "packages/storage/src/runtime-policy/RuntimePolicy.ts",
              snippet: "class RuntimePolicy",
            }),
          ],
        }),
      ],
    }));
  });

  it("suppresses legacy, generated, and supporting-code paths from duplicate responsibility candidates", async () => {
    await seedWorkspaceFixture();
    const structuralRuntime = new HiveMapRuntime({
      store,
      embeddingProviders: { test: createTestEmbeddingProvider() },
      repositoryIndexExecutor: async ({ workspaceId, indexId }) =>
        createRepositoryStructuralPrecisionIndexResult(workspaceId, indexId),
      now: () => "2026-08-20T18:15:00.000Z",
    });

    await structuralRuntime.startRepositoryIndex({
      workspaceId: "workspace-a",
      index: {
        id: "repo-index-structural-precision",
        repositoryUrl: "/fixtures/repo",
        requestedRef: "main",
        mode: "safe",
        requestedAt: "2026-08-20T18:15:00.000Z",
        actor: {
          agentId: "codex",
          tool: "mcp",
        },
      },
    });
    await structuralRuntime.executeRepositoryIndex({ workspaceId: "workspace-a", indexId: "repo-index-structural-precision" });

    await expect(
      structuralRuntime.listRepositoryEvidenceCandidates({
        workspaceId: "workspace-a",
        indexId: "repo-index-structural-precision",
        profileId: "code-quality-review",
        profileVersion: 1,
        criterionId: "duplicate-responsibility",
      }),
    ).resolves.toEqual(expect.objectContaining({
      indexId: "repo-index-structural-precision",
      profileId: "code-quality-review",
      profileVersion: 1,
      criterionId: "duplicate-responsibility",
      ...expectDefaultOverlayMetadata("code-quality-review", ".hivemap/scan-profiles/code-quality.yaml"),
      candidates: [
        expect.objectContaining({
          signal: "duplicate-responsibility",
          sources: [
            expect.objectContaining({ filePath: "packages/runtime/src/runtime-policy/RuntimePolicy.ts" }),
            expect.objectContaining({ filePath: "packages/storage/src/runtime-policy/RuntimePolicy.ts" }),
          ],
        }),
      ],
    }));
  });

  it("ranks duplicate responsibility candidates higher when peer modules share topology", async () => {
    await seedWorkspaceFixture();
    const structuralRuntime = new HiveMapRuntime({
      store,
      embeddingProviders: { test: createTestEmbeddingProvider() },
      repositoryIndexExecutor: async ({ workspaceId, indexId }) => createRepositoryStructuralTopologyIndexResult(workspaceId, indexId),
      now: () => "2026-08-20T18:30:00.000Z",
    });

    await structuralRuntime.startRepositoryIndex({
      workspaceId: "workspace-a",
      index: {
        id: "repo-index-structural-topology",
        repositoryUrl: "/fixtures/repo",
        requestedRef: "main",
        mode: "safe",
        requestedAt: "2026-08-20T18:30:00.000Z",
        actor: {
          agentId: "codex",
          tool: "mcp",
        },
      },
    });
    await structuralRuntime.executeRepositoryIndex({ workspaceId: "workspace-a", indexId: "repo-index-structural-topology" });

    await expect(
      structuralRuntime.listRepositoryEvidenceCandidates({
        workspaceId: "workspace-a",
        indexId: "repo-index-structural-topology",
        profileId: "code-quality-review",
        profileVersion: 1,
        criterionId: "duplicate-responsibility",
      }),
    ).resolves.toEqual(expect.objectContaining({
      candidates: [
        expect.objectContaining({
          title: "Repeated top-level symbol: RuntimePolicy",
          summary: expect.stringContaining("share 1 dependency target"),
          sources: expect.arrayContaining([
            expect.objectContaining({
              filePath: "packages/runtime/src/runtime-policy/RuntimePolicy.ts",
              whySelected: expect.stringContaining("shares 1 dependency target"),
            }),
          ]),
        }),
        expect.objectContaining({
          title: "Repeated top-level symbol: Manager",
        }),
      ],
    }));
  });

  it("builds a candidate boundary map from current scan coverage and repository facts", async () => {
    await seedWorkspaceFixture();
    const structuralRuntime = new HiveMapRuntime({
      store,
      embeddingProviders: { test: createTestEmbeddingProvider() },
      repositoryIndexExecutor: async ({ workspaceId, indexId }) => createRepositoryStructuralTopologyIndexResult(workspaceId, indexId),
      now: () => "2026-08-20T18:45:00.000Z",
    });

    await structuralRuntime.startRepositoryIndex({
      workspaceId: "workspace-a",
      index: {
        id: "repo-index-boundary-map",
        repositoryUrl: "/fixtures/repo",
        requestedRef: "main",
        mode: "safe",
        requestedAt: "2026-08-20T18:45:00.000Z",
        actor: {
          agentId: "codex",
          tool: "mcp",
        },
      },
    });
    await structuralRuntime.executeRepositoryIndex({ workspaceId: "workspace-a", indexId: "repo-index-boundary-map" });

    await structuralRuntime.startScan({
      workspaceId: "workspace-a",
      scan: {
        id: "scan-boundary-map",
        profileId: "code-quality-review",
        profileVersion: 1,
        repositoryIndexId: "repo-index-boundary-map",
        actor: { agentId: "agent-a", tool: "codex" },
        startedAt: "2026-08-20T18:46:00.000Z",
      },
    });

    await expect(structuralRuntime.buildScanBoundaryMap({ workspaceId: "workspace-a", scanId: "scan-boundary-map" })).resolves.toEqual(
      expect.objectContaining({
        scanId: "scan-boundary-map",
        profileId: "code-quality-review",
        profileVersion: 1,
        repositoryIndexId: "repo-index-boundary-map",
        coverageSummary: expect.objectContaining({
          includedCodeFileCount: 7,
          includedTopLevelCodeSymbolCount: 4,
        }),
        boundaryMap: {
          boundaries: expect.arrayContaining([
            expect.objectContaining({
              id: "package:packages-runtime",
              kind: "package",
              ownedPaths: expect.arrayContaining([
                "packages/runtime/src/logging/Logger.ts",
                "packages/runtime/src/managers/Manager.ts",
                "packages/runtime/src/runtime-policy/RuntimePolicy.ts",
              ]),
              ownedSymbolKeys: expect.arrayContaining(["runtime-manager", "runtime-policy"]),
              publicEntrypoints: expect.arrayContaining([
                expect.objectContaining({ label: "Manager" }),
                expect.objectContaining({ label: "RuntimePolicy" }),
              ]),
              testSourceRefs: expect.arrayContaining([
                expect.objectContaining({ target: "packages/runtime/tests/RuntimePolicyHarness.ts" }),
              ]),
            }),
            expect.objectContaining({
              id: "package:packages-storage",
              kind: "package",
              ownedPaths: expect.arrayContaining([
                "packages/storage/src/managers/Manager.ts",
                "packages/storage/src/persistence/Store.ts",
                "packages/storage/src/runtime-policy/RuntimePolicy.ts",
              ]),
            }),
            expect.objectContaining({
              id: "package:packages-shared",
              kind: "package",
              ownedPaths: ["packages/shared/src/runtime-policy/PolicyShape.ts"],
            }),
            expect.objectContaining({
              id: "test-suite:packages-runtime-tests",
              kind: "test-suite",
              ownedPaths: ["packages/runtime/tests/RuntimePolicyHarness.ts"],
              ownedSymbolKeys: ["test-policy-harness"],
            }),
          ]),
          relations: expect.arrayContaining([
            expect.objectContaining({
              fromBoundaryId: "package:packages-runtime",
              toBoundaryId: "package:packages-shared",
              kind: "depends-on",
            }),
            expect.objectContaining({
              fromBoundaryId: "package:packages-storage",
              toBoundaryId: "package:packages-shared",
              kind: "depends-on",
            }),
            expect.objectContaining({
              fromBoundaryId: "test-suite:packages-runtime-tests",
              toBoundaryId: "package:packages-runtime",
              kind: "verifies",
              sourceRefs: expect.arrayContaining([
                expect.objectContaining({
                  role: "verifies",
                  source: "test",
                  target: "packages/runtime/tests/RuntimePolicyHarness.ts",
                }),
              ]),
            }),
          ]),
        },
      }),
    );
  });

  it("starts repository-backed scans in an explicit calibration phase", async () => {
    await seedWorkspaceFixture();
    await ensureCompletedRepositoryIndex("repo-index-calibration");

    await expect(
      runtime.startScan({
        workspaceId: "workspace-a",
        scan: {
          id: "scan-calibration",
          profileId: "documentation-conflicts",
          profileVersion: 1,
          repositoryIndexId: "repo-index-calibration",
          actor: { agentId: "agent-a", tool: "codex" },
          startedAt: "2026-08-20T18:46:00.000Z",
        },
      }),
    ).resolves.toEqual(
      expect.objectContaining({
        workflowPhase: "calibration",
        calibrationChecklist: expect.arrayContaining([
          "Confirm profile identity: documentation-conflicts@1.",
          expect.stringContaining("Confirm that built-in defaults are acceptable"),
        ]),
        calibrationAssessment: expect.objectContaining({
          classification: "findings-ready",
          confidence: "medium",
        }),
        instructions: expect.arrayContaining([expect.stringContaining("Calibration checkpoint: before creating findings")]),
      }),
    );
  });

  it("rejects findings-bearing completion while calibration is still ambiguous", async () => {
    await seedWorkspaceFixture();
    await ensureCompletedRepositoryIndex("repo-index-calibration-blocked");

    await runtime.startScan({
      workspaceId: "workspace-a",
      scan: {
        id: "scan-calibration-blocked",
        profileId: "code-quality-review",
        profileVersion: 1,
        repositoryIndexId: "repo-index-calibration-blocked",
        actor: { agentId: "agent-a", tool: "codex" },
        startedAt: "2026-08-20T18:47:00.000Z",
      },
    });

    await expect(
      runtime.completeScan({
        workspaceId: "workspace-a",
        scanId: "scan-calibration-blocked",
        completedAt: "2026-08-20T18:50:00.000Z",
        appliedCriteria: CODE_QUALITY_PROFILE.criteria.map((criterion) => criterion.id),
        declaredOutputs: [...CODE_QUALITY_PROFILE.requiredOutputs],
      }),
    ).rejects.toMatchObject({
      code: "SCAN_CALIBRATION_NOT_READY",
      details: expect.objectContaining({
        classification: "ambiguous-shape",
      }),
    });
  });

  it("allows explicit calibration override on findings-bearing completion and persists the reason", async () => {
    await seedWorkspaceFixture();
    await ensureCompletedRepositoryIndex("repo-index-calibration-override");

    await runtime.startScan({
      workspaceId: "workspace-a",
      scan: {
        id: "scan-calibration-override",
        profileId: "code-quality-review",
        profileVersion: 1,
        repositoryIndexId: "repo-index-calibration-override",
        actor: { agentId: "agent-a", tool: "codex" },
        startedAt: "2026-08-20T18:48:00.000Z",
      },
    });

    await expect(
      runtime.completeScan({
        workspaceId: "workspace-a",
        scanId: "scan-calibration-override",
        completedAt: "2026-08-20T18:51:00.000Z",
        appliedCriteria: CODE_QUALITY_PROFILE.criteria.map((criterion) => criterion.id),
        declaredOutputs: [...CODE_QUALITY_PROFILE.requiredOutputs],
        calibrationOverrideReason: "Freeze a provisional baseline before overlay tuning so the rerun can be compared explicitly.",
      }),
    ).resolves.toEqual({
      run: expect.objectContaining({
        id: "scan-calibration-override",
        status: "completed",
        calibrationOverrideReason: "Freeze a provisional baseline before overlay tuning so the rerun can be compared explicitly.",
      }),
    });
  });

  it("builds a boundary map with repository-local boundary heuristics from the overlay", async () => {
    await seedWorkspaceFixture();
    const overlayRuntime = new HiveMapRuntime({
      store,
      embeddingProviders: { test: createTestEmbeddingProvider() },
      repositoryIndexExecutor: async ({ workspaceId, indexId }) => createRepositoryOverlayEvidenceIndexResult(workspaceId, indexId),
      now: () => "2026-08-20T19:05:00.000Z",
    });

    await overlayRuntime.startRepositoryIndex({
      workspaceId: "workspace-a",
      index: {
        id: "repo-index-overlay-boundary-map",
        repositoryUrl: "/fixtures/repo",
        requestedRef: "main",
        mode: "safe",
        requestedAt: "2026-08-20T19:05:00.000Z",
        actor: {
          agentId: "codex",
          tool: "mcp",
        },
      },
    });
    await overlayRuntime.executeRepositoryIndex({ workspaceId: "workspace-a", indexId: "repo-index-overlay-boundary-map" });

    await overlayRuntime.startScan({
      workspaceId: "workspace-a",
      scan: {
        id: "scan-overlay-boundary-map",
        profileId: "code-quality-review",
        profileVersion: 1,
        repositoryIndexId: "repo-index-overlay-boundary-map",
        actor: { agentId: "agent-a", tool: "codex" },
        startedAt: "2026-08-20T19:06:00.000Z",
      },
    });

    const response = await overlayRuntime.buildScanBoundaryMap({ workspaceId: "workspace-a", scanId: "scan-overlay-boundary-map" });

    expect(response.coverageSummary).toEqual(expect.objectContaining({ includedCodeFileCount: 2 }));
    expect(response.calibrationAssessment).toEqual(
      expect.objectContaining({
        classification: "findings-ready",
        confidence: "high",
      }),
    );
    expect(response.boundaryMap.boundaries).toEqual([
      expect.objectContaining({
        id: "library:services-runtime",
        kind: "library",
        ownedPaths: ["services/runtime/RuntimePolicy.ts"],
        publicEntrypoints: [expect.objectContaining({ kind: "api", label: "RuntimePolicy" })],
      }),
      expect.objectContaining({
        id: "library:services-storage",
        kind: "library",
        ownedPaths: ["services/storage/RuntimePolicy.ts"],
        publicEntrypoints: [expect.objectContaining({ kind: "api", label: "RuntimePolicy" })],
      }),
    ]);
  });

  it("fails clearly when boundary-map coverage includes paths outside configured root rules", async () => {
    await seedWorkspaceFixture();
    const overlayRuntime = new HiveMapRuntime({
      store,
      embeddingProviders: { test: createTestEmbeddingProvider() },
      repositoryIndexExecutor: async ({ workspaceId, indexId }) => createRepositoryBoundaryMapUnmappedRootIndexResult(workspaceId, indexId),
      now: () => "2026-08-20T19:10:00.000Z",
    });

    await overlayRuntime.startRepositoryIndex({
      workspaceId: "workspace-a",
      index: {
        id: "repo-index-unmapped-boundary-map",
        repositoryUrl: "/fixtures/repo",
        requestedRef: "main",
        mode: "safe",
        requestedAt: "2026-08-20T19:10:00.000Z",
        actor: {
          agentId: "codex",
          tool: "mcp",
        },
      },
    });
    await overlayRuntime.executeRepositoryIndex({ workspaceId: "workspace-a", indexId: "repo-index-unmapped-boundary-map" });

    await overlayRuntime.startScan({
      workspaceId: "workspace-a",
      scan: {
        id: "scan-unmapped-boundary-map",
        profileId: "code-quality-review",
        profileVersion: 1,
        repositoryIndexId: "repo-index-unmapped-boundary-map",
        actor: { agentId: "agent-a", tool: "codex" },
        startedAt: "2026-08-20T19:11:00.000Z",
      },
    });

    await expect(
      overlayRuntime.buildScanBoundaryMap({ workspaceId: "workspace-a", scanId: "scan-unmapped-boundary-map" }),
    ).rejects.toMatchObject({
      code: "BOUNDARY_MAP_BUILD_FAILED",
      message: expect.stringContaining("boundaryMapRoots"),
    });
  });

  it("applies a repository scan profile overlay from indexed repository files", async () => {
    await seedWorkspaceFixture();
    const overlayRuntime = new HiveMapRuntime({
      store,
      embeddingProviders: { test: createTestEmbeddingProvider() },
      repositoryIndexExecutor: async ({ workspaceId, indexId }) => createRepositoryOverlayEvidenceIndexResult(workspaceId, indexId),
      now: () => "2026-08-20T19:00:00.000Z",
    });

    await overlayRuntime.startRepositoryIndex({
      workspaceId: "workspace-a",
      index: {
        id: "repo-index-overlay",
        repositoryUrl: "/fixtures/repo",
        requestedRef: "main",
        mode: "safe",
        requestedAt: "2026-08-20T19:00:00.000Z",
        actor: {
          agentId: "codex",
          tool: "mcp",
        },
      },
    });
    await overlayRuntime.executeRepositoryIndex({ workspaceId: "workspace-a", indexId: "repo-index-overlay" });

    await expect(
      overlayRuntime.listRepositoryEvidenceCandidates({
        workspaceId: "workspace-a",
        indexId: "repo-index-overlay",
        profileId: "code-quality-review",
        profileVersion: 1,
        criterionId: "duplicate-responsibility",
      }),
    ).resolves.toEqual(expect.objectContaining({
      indexId: "repo-index-overlay",
      profileId: "code-quality-review",
      profileVersion: 1,
      criterionId: "duplicate-responsibility",
      calibrationAssessment: expect.objectContaining({
        classification: "findings-ready",
        confidence: "medium",
      }),
      overlay: expect.objectContaining({
        status: "found",
        source: "repo",
        applied: true,
        overlayPath: ".hivemap/scan-profiles/code-quality.yaml",
      }),
      coverageSummary: expect.objectContaining({
        discoveredCodeFileCount: 2,
        includedCodeFileCount: 2,
        warnings: [],
      }),
      effectiveProfile: expect.objectContaining({
        name: "Services code quality review",
        description: "Repository-specific service review profile.",
        instructions: [
          "Review service boundaries before filing local findings.",
          "Treat services/** as the primary implementation surface.",
        ],
        sourceTypes: ["specification", "code", "test"],
        criteria: [
          expect.objectContaining({ id: "duplicate-responsibility" }),
          expect.objectContaining({ id: "undocumented-api" }),
        ],
        ssotOrder: ["AGENTS.md", "docs/specs/**", "services/**"],
        requiredOutputs: ["document-inventory", "findings", "boundary-map"],
        scope: expect.objectContaining({
          include: expect.arrayContaining(["services/**"]),
        }),
      }),
      candidates: [
        expect.objectContaining({
          signal: "duplicate-responsibility",
          sources: [
            expect.objectContaining({ filePath: "services/runtime/RuntimePolicy.ts" }),
            expect.objectContaining({ filePath: "services/storage/RuntimePolicy.ts" }),
          ],
        }),
      ],
    }));
  });

  it("marks empty evidence packets as missing-evidence during calibration", async () => {
    await seedWorkspaceFixture();
    await ensureCompletedRepositoryIndex("repo-index-empty-evidence");

    await expect(
      runtime.listRepositoryEvidenceCandidates({
        workspaceId: "workspace-a",
        indexId: "repo-index-empty-evidence",
        profileId: "documentation-conflicts",
        profileVersion: 1,
        criterionId: "broken-references",
      }),
    ).resolves.toEqual(
      expect.objectContaining({
        calibrationAssessment: expect.objectContaining({
          classification: "missing-evidence",
          confidence: "medium",
        }),
        candidates: [],
      }),
    );
  });

  it("fails clearly when a repository scan profile overlay is invalid", async () => {
    await seedWorkspaceFixture();
    const overlayRuntime = new HiveMapRuntime({
      store,
      embeddingProviders: { test: createTestEmbeddingProvider() },
      repositoryIndexExecutor: async ({ workspaceId, indexId }) => createRepositoryInvalidOverlayIndexResult(workspaceId, indexId),
      now: () => "2026-08-20T19:00:00.000Z",
    });

    await overlayRuntime.startRepositoryIndex({
      workspaceId: "workspace-a",
      index: {
        id: "repo-index-invalid-overlay",
        repositoryUrl: "/fixtures/repo",
        requestedRef: "main",
        mode: "safe",
        requestedAt: "2026-08-20T19:00:00.000Z",
        actor: {
          agentId: "codex",
          tool: "mcp",
        },
      },
    });
    await overlayRuntime.executeRepositoryIndex({ workspaceId: "workspace-a", indexId: "repo-index-invalid-overlay" });

    await expect(
      overlayRuntime.listRepositoryEvidenceCandidates({
        workspaceId: "workspace-a",
        indexId: "repo-index-invalid-overlay",
        profileId: "code-quality-review",
        profileVersion: 1,
        criterionId: "duplicate-responsibility",
      }),
    ).rejects.toMatchObject({
      code: "SCAN_PROFILE_OVERLAY_INVALID",
      details: {
        overlayPath: ".hivemap/scan-profiles/code-quality.yaml",
        profileId: "code-quality-review",
        profileVersion: 1,
        guidanceTool: "scan_profile_overlay_help",
      },
    });
  });

  it("suppresses unrelated authority claims and non-material docs from evidence candidates", async () => {
    await seedWorkspaceFixture();
    const precisionRuntime = new HiveMapRuntime({
      store,
      embeddingProviders: { test: createTestEmbeddingProvider() },
      repositoryIndexExecutor: async ({ workspaceId, indexId }) => createRepositoryEvidenceNoiseResult(workspaceId, indexId),
      now: () => "2026-08-19T23:00:00.000Z",
    });

    await precisionRuntime.startRepositoryIndex({
      workspaceId: "workspace-a",
      index: {
        id: "repo-index-precision",
        repositoryUrl: "/fixtures/repo",
        requestedRef: "main",
        mode: "safe",
        requestedAt: "2026-08-20T12:00:00.000Z",
        actor: {
          agentId: "codex",
          tool: "mcp",
        },
      },
    });
    await precisionRuntime.executeRepositoryIndex({ workspaceId: "workspace-a", indexId: "repo-index-precision" });

    await expect(
      precisionRuntime.listRepositoryEvidenceCandidates({
        workspaceId: "workspace-a",
        indexId: "repo-index-precision",
        profileId: "documentation-conflicts",
        profileVersion: 1,
        criterionId: "contradictory-claims",
      }),
    ).resolves.toEqual(expect.objectContaining({
      indexId: "repo-index-precision",
      profileId: "documentation-conflicts",
      profileVersion: 1,
      criterionId: "contradictory-claims",
      ...expectDefaultOverlayMetadata("documentation-conflicts", ".hivemap/scan-profiles/documentation-conflicts.yaml"),
      candidates: [],
    }));

    await expect(
      precisionRuntime.listRepositoryEvidenceCandidates({
        workspaceId: "workspace-a",
        indexId: "repo-index-precision",
        profileId: "documentation-conflicts",
        profileVersion: 1,
        criterionId: "duplicate-authority",
      }),
    ).resolves.toEqual(expect.objectContaining({
      indexId: "repo-index-precision",
      profileId: "documentation-conflicts",
      profileVersion: 1,
      criterionId: "duplicate-authority",
      ...expectDefaultOverlayMetadata("documentation-conflicts", ".hivemap/scan-profiles/documentation-conflicts.yaml"),
      candidates: [],
    }));

    await expect(
      precisionRuntime.listRepositoryEvidenceCandidates({
        workspaceId: "workspace-a",
        indexId: "repo-index-precision",
        profileId: "documentation-conflicts",
        profileVersion: 1,
        criterionId: "missing-owner",
      }),
    ).resolves.toEqual(expect.objectContaining({
      indexId: "repo-index-precision",
      profileId: "documentation-conflicts",
      profileVersion: 1,
      criterionId: "missing-owner",
      ...expectDefaultOverlayMetadata("documentation-conflicts", ".hivemap/scan-profiles/documentation-conflicts.yaml"),
      candidates: [],
    }));
  });

  it("does not treat repeated semantic-ssot invariants as duplicate document authority", async () => {
    await seedWorkspaceFixture();
    const invariantRuntime = new HiveMapRuntime({
      store,
      embeddingProviders: { test: createTestEmbeddingProvider() },
      repositoryIndexExecutor: async ({ workspaceId, indexId }) => createRepositoryEvidenceSemanticInvariantResult(workspaceId, indexId),
      now: () => "2026-08-19T23:00:00.000Z",
    });

    await invariantRuntime.startRepositoryIndex({
      workspaceId: "workspace-a",
      index: {
        id: "repo-index-semantic-invariants",
        repositoryUrl: "/fixtures/repo",
        requestedRef: "main",
        mode: "safe",
        requestedAt: "2026-08-20T12:00:00.000Z",
        actor: {
          agentId: "codex",
          tool: "mcp",
        },
      },
    });
    await invariantRuntime.executeRepositoryIndex({ workspaceId: "workspace-a", indexId: "repo-index-semantic-invariants" });

    await expect(
      invariantRuntime.listRepositoryEvidenceCandidates({
        workspaceId: "workspace-a",
        indexId: "repo-index-semantic-invariants",
        profileId: "documentation-conflicts",
        profileVersion: 1,
        criterionId: "duplicate-authority",
      }),
    ).resolves.toEqual(expect.objectContaining({
      indexId: "repo-index-semantic-invariants",
      profileId: "documentation-conflicts",
      profileVersion: 1,
      criterionId: "duplicate-authority",
      ...expectDefaultOverlayMetadata("documentation-conflicts", ".hivemap/scan-profiles/documentation-conflicts.yaml"),
      candidates: [],
    }));
  });

  it("flags lower-precedence current-looking docs as stale when stronger SSOT contradicts them", async () => {
    await seedWorkspaceFixture();
    const staleRuntime = new HiveMapRuntime({
      store,
      embeddingProviders: { test: createTestEmbeddingProvider() },
      repositoryIndexExecutor: async ({ workspaceId, indexId }) => createRepositoryEvidenceStaleResult(workspaceId, indexId),
      now: () => "2026-08-19T23:00:00.000Z",
    });

    await staleRuntime.startRepositoryIndex({
      workspaceId: "workspace-a",
      index: {
        id: "repo-index-stale",
        repositoryUrl: "/fixtures/repo",
        requestedRef: "main",
        mode: "safe",
        requestedAt: "2026-08-20T12:00:00.000Z",
        actor: {
          agentId: "codex",
          tool: "mcp",
        },
      },
    });
    await staleRuntime.executeRepositoryIndex({ workspaceId: "workspace-a", indexId: "repo-index-stale" });

    await expect(
      staleRuntime.listRepositoryEvidenceCandidates({
        workspaceId: "workspace-a",
        indexId: "repo-index-stale",
        profileId: "documentation-conflicts",
        profileVersion: 1,
        criterionId: "stale-documentation",
      }),
    ).resolves.toEqual(expect.objectContaining({
      indexId: "repo-index-stale",
      profileId: "documentation-conflicts",
      profileVersion: 1,
      criterionId: "stale-documentation",
      ...expectDefaultOverlayMetadata("documentation-conflicts", ".hivemap/scan-profiles/documentation-conflicts.yaml"),
      candidates: [
        expect.objectContaining({
          signal: "stale-documentation",
          kind: "requires_interpretation",
          summary: expect.stringContaining("README.md"),
          sources: expect.arrayContaining([
            expect.objectContaining({ filePath: "README.md", startLine: 2 }),
            expect.objectContaining({ filePath: "docs/specs/storage-format.md", startLine: 2 }),
          ]),
        }),
      ],
    }));
  });

  it("does not treat legacy higher-precedence docs as the authoritative stale baseline", async () => {
    await seedWorkspaceFixture();
    const staleRuntime = new HiveMapRuntime({
      store,
      embeddingProviders: { test: createTestEmbeddingProvider() },
      repositoryIndexExecutor: async ({ workspaceId, indexId }) => createRepositoryEvidenceLegacyAuthorityResult(workspaceId, indexId),
      now: () => "2026-08-19T23:00:00.000Z",
    });

    await staleRuntime.startRepositoryIndex({
      workspaceId: "workspace-a",
      index: {
        id: "repo-index-legacy-authority",
        repositoryUrl: "/fixtures/repo",
        requestedRef: "main",
        mode: "safe",
        requestedAt: "2026-08-20T12:00:00.000Z",
        actor: {
          agentId: "codex",
          tool: "mcp",
        },
      },
    });
    await staleRuntime.executeRepositoryIndex({ workspaceId: "workspace-a", indexId: "repo-index-legacy-authority" });

    await expect(
      staleRuntime.listRepositoryEvidenceCandidates({
        workspaceId: "workspace-a",
        indexId: "repo-index-legacy-authority",
        profileId: "documentation-conflicts",
        profileVersion: 1,
        criterionId: "stale-documentation",
      }),
    ).resolves.toEqual(expect.objectContaining({
      indexId: "repo-index-legacy-authority",
      profileId: "documentation-conflicts",
      profileVersion: 1,
      criterionId: "stale-documentation",
      ...expectDefaultOverlayMetadata("documentation-conflicts", ".hivemap/scan-profiles/documentation-conflicts.yaml"),
      candidates: [],
    }));
  });

  it("does not flag valid unicode markdown heading links as broken references", async () => {
    await seedWorkspaceFixture();
    const unicodeRuntime = new HiveMapRuntime({
      store,
      embeddingProviders: { test: createTestEmbeddingProvider() },
      repositoryIndexExecutor: async ({ workspaceId, indexId }) => createRepositoryEvidenceUnicodeHeadingResult(workspaceId, indexId),
      now: () => "2026-08-19T23:00:00.000Z",
    });

    await unicodeRuntime.startRepositoryIndex({
      workspaceId: "workspace-a",
      index: {
        id: "repo-index-unicode-heading",
        repositoryUrl: "/fixtures/repo",
        requestedRef: "main",
        mode: "safe",
        requestedAt: "2026-08-20T12:00:00.000Z",
        actor: {
          agentId: "codex",
          tool: "mcp",
        },
      },
    });
    await unicodeRuntime.executeRepositoryIndex({ workspaceId: "workspace-a", indexId: "repo-index-unicode-heading" });

    await expect(
      unicodeRuntime.listRepositoryEvidenceCandidates({
        workspaceId: "workspace-a",
        indexId: "repo-index-unicode-heading",
        profileId: "documentation-conflicts",
        profileVersion: 1,
        criterionId: "broken-references",
      }),
    ).resolves.toEqual(expect.objectContaining({
      indexId: "repo-index-unicode-heading",
      profileId: "documentation-conflicts",
      profileVersion: 1,
      criterionId: "broken-references",
      ...expectDefaultOverlayMetadata("documentation-conflicts", ".hivemap/scan-profiles/documentation-conflicts.yaml"),
      candidates: [],
    }));
  });

  it("does not flag repository links that point to files outside scan coverage", async () => {
    await seedWorkspaceFixture();
    const rootLinkRuntime = new HiveMapRuntime({
      store,
      embeddingProviders: { test: createTestEmbeddingProvider() },
      repositoryIndexExecutor: async ({ workspaceId, indexId }) => createRepositoryEvidenceRootLinkResult(workspaceId, indexId),
      now: () => "2026-08-19T23:00:00.000Z",
    });

    await rootLinkRuntime.startRepositoryIndex({
      workspaceId: "workspace-a",
      index: {
        id: "repo-index-root-link",
        repositoryUrl: "/fixtures/repo",
        requestedRef: "main",
        mode: "safe",
        requestedAt: "2026-08-20T12:00:00.000Z",
        actor: {
          agentId: "codex",
          tool: "mcp",
        },
      },
    });
    await rootLinkRuntime.executeRepositoryIndex({ workspaceId: "workspace-a", indexId: "repo-index-root-link" });

    await expect(
      rootLinkRuntime.listRepositoryEvidenceCandidates({
        workspaceId: "workspace-a",
        indexId: "repo-index-root-link",
        profileId: "documentation-conflicts",
        profileVersion: 1,
        criterionId: "broken-references",
      }),
    ).resolves.toEqual(expect.objectContaining({
      indexId: "repo-index-root-link",
      profileId: "documentation-conflicts",
      profileVersion: 1,
      criterionId: "broken-references",
      ...expectDefaultOverlayMetadata("documentation-conflicts", ".hivemap/scan-profiles/documentation-conflicts.yaml"),
      candidates: [],
    }));
  });

  it("does not treat nested readmes and broad design docs as missing-owner candidates by default", async () => {
    await seedWorkspaceFixture();
    const ownershipRuntime = new HiveMapRuntime({
      store,
      embeddingProviders: { test: createTestEmbeddingProvider() },
      repositoryIndexExecutor: async ({ workspaceId, indexId }) => createRepositoryEvidenceOwnershipScopeResult(workspaceId, indexId),
      now: () => "2026-08-19T23:00:00.000Z",
    });

    await ownershipRuntime.startRepositoryIndex({
      workspaceId: "workspace-a",
      index: {
        id: "repo-index-ownership-scope",
        repositoryUrl: "/fixtures/repo",
        requestedRef: "main",
        mode: "safe",
        requestedAt: "2026-08-20T12:00:00.000Z",
        actor: {
          agentId: "codex",
          tool: "mcp",
        },
      },
    });
    await ownershipRuntime.executeRepositoryIndex({ workspaceId: "workspace-a", indexId: "repo-index-ownership-scope" });

    await expect(
      ownershipRuntime.listRepositoryEvidenceCandidates({
        workspaceId: "workspace-a",
        indexId: "repo-index-ownership-scope",
        profileId: "documentation-conflicts",
        profileVersion: 1,
        criterionId: "missing-owner",
      }),
    ).resolves.toEqual(expect.objectContaining({
      indexId: "repo-index-ownership-scope",
      profileId: "documentation-conflicts",
      profileVersion: 1,
      criterionId: "missing-owner",
      ...expectDefaultOverlayMetadata("documentation-conflicts", ".hivemap/scan-profiles/documentation-conflicts.yaml"),
      candidates: [],
    }));
  });

  it("re-runs completed and failed repository indexes by clearing old terminal state and replacing old contents", async () => {
    await seedWorkspaceFixture();
    const rerunRuntime = new HiveMapRuntime({
      store,
      embeddingProviders: { test: createTestEmbeddingProvider() },
      repositoryIndexExecutor: createSequenceRepositoryIndexExecutor([
        createRepositoryIndexResult("1111111111111111111111111111111111111111", "Original ownership evidence."),
        new RepositoryIndexExecutionError("GIT_COMMAND_FAILED", "checkout failed"),
        createRepositoryIndexResult("2222222222222222222222222222222222222222", "Replacement ownership evidence."),
      ]),
      now: () => "2026-08-19T23:00:00.000Z",
    });

    await rerunRuntime.startRepositoryIndex({
      workspaceId: "workspace-a",
      index: {
        id: "repo-index-a",
        repositoryUrl: "/fixtures/repo",
        requestedRef: "main",
        mode: "safe",
        requestedAt: "2026-08-20T12:00:00.000Z",
        actor: {
          agentId: "codex",
          tool: "mcp",
        },
      },
    });

    await expect(rerunRuntime.executeRepositoryIndex({ workspaceId: "workspace-a", indexId: "repo-index-a" })).resolves.toMatchObject({
      index: {
        stage: "completed",
        resolvedCommit: "1111111111111111111111111111111111111111",
      },
    });
    await expect(
      rerunRuntime.searchRepositoryIndex({
        workspaceId: "workspace-a",
        indexId: "repo-index-a",
        query: "Original",
      }),
    ).resolves.toEqual({
      indexId: "repo-index-a",
      query: "Original",
      hits: [expect.objectContaining({ snippet: expect.stringContaining("Original ownership evidence") })],
    });

    await expect(rerunRuntime.executeRepositoryIndex({ workspaceId: "workspace-a", indexId: "repo-index-a" })).rejects.toMatchObject({
      code: "GIT_COMMAND_FAILED",
    });
    await expect(rerunRuntime.getRepositoryIndex({ workspaceId: "workspace-a", indexId: "repo-index-a" })).resolves.toMatchObject({
      index: {
        stage: "failed",
        failure: {
          code: "GIT_COMMAND_FAILED",
          message: "checkout failed",
        },
      },
    });

    await expect(rerunRuntime.executeRepositoryIndex({ workspaceId: "workspace-a", indexId: "repo-index-a" })).resolves.toMatchObject({
      index: {
        stage: "completed",
        resolvedCommit: "2222222222222222222222222222222222222222",
      },
    });
    await expect(
      rerunRuntime.searchRepositoryIndex({
        workspaceId: "workspace-a",
        indexId: "repo-index-a",
        query: "Replacement",
      }),
    ).resolves.toEqual({
      indexId: "repo-index-a",
      query: "Replacement",
      hits: [expect.objectContaining({ snippet: expect.stringContaining("Replacement ownership evidence") })],
    });
    await expect(
      rerunRuntime.searchRepositoryIndex({
        workspaceId: "workspace-a",
        indexId: "repo-index-a",
        query: "Original",
      }),
    ).resolves.toEqual({
      indexId: "repo-index-a",
      query: "Original",
      hits: [],
    });
  });

  it("stores concept embeddings and lists similar concepts without mutating graph semantics", async () => {
    await seedWorkspaceFixture();
    await runtime.applyGraphCommands({
      workspaceId: "workspace-a",
      commands: [
        {
          id: "cmd-a",
          type: "node.create",
          payload: { node: { id: "node-a", label: "Alpha", notes: "roadmap planning", type: "concept" } },
        },
        {
          id: "cmd-b",
          type: "node.create",
          payload: { node: { id: "node-b", label: "Beta", notes: "roadmap execution", type: "concept" } },
        },
      ],
    });

    const graphBefore = await runtime.getGraph({ workspaceId: "workspace-a" });
    await runtime.upsertConceptEmbedding({
      workspaceId: "workspace-a",
      nodeId: "node-a",
      embedding: {
        model: "nomic-embed-text",
        values: [1, 0],
        updatedAt: "2026-08-19T22:40:00.000Z",
      },
    });
    await runtime.upsertConceptEmbedding({
      workspaceId: "workspace-a",
      nodeId: "node-b",
      embedding: {
        model: "nomic-embed-text",
        values: [0.8, 0.2],
        updatedAt: "2026-08-19T22:40:00.000Z",
      },
    });

    await expect(
      runtime.listSimilarConcepts({
        workspaceId: "workspace-a",
        nodeId: "node-a",
        model: "nomic-embed-text",
        limit: 1,
      }),
    ).resolves.toEqual({
      sourceNodeId: "node-a",
      model: "nomic-embed-text",
      matches: [
        {
          nodeId: "node-b",
          label: "Beta",
          score: expect.any(Number),
          updatedAt: "2026-08-19T22:40:00.000Z",
        },
      ],
    });
    await expect(runtime.getGraph({ workspaceId: "workspace-a" })).resolves.toEqual(graphBefore);
  });

  it("refreshes and backfills concept embeddings through a configured provider without mutating graph semantics", async () => {
    await seedWorkspaceFixture();
    await runtime.applyGraphCommands({
      workspaceId: "workspace-a",
      commands: [
        {
          id: "cmd-a",
          type: "node.create",
          payload: { node: { id: "node-a", label: "Alpha", notes: "roadmap planning", type: "concept" } },
        },
        {
          id: "cmd-b",
          type: "node.create",
          payload: { node: { id: "node-b", label: "Beta", notes: "roadmap execution", type: "concept" } },
        },
        {
          id: "cmd-c",
          type: "node.create",
          payload: { node: { id: "node-c", label: "Gamma", notes: "kitchen inventory", type: "concept" } },
        },
      ],
    });

    const graphBefore = await runtime.getGraph({ workspaceId: "workspace-a" });

    await expect(
      runtime.refreshConceptEmbedding({
        workspaceId: "workspace-a",
        nodeId: "node-a",
        model: "test:nomic-embed-text",
      }),
    ).resolves.toEqual({
      embedding: {
        workspaceId: "workspace-a",
        nodeId: "node-a",
        model: "test:nomic-embed-text",
        dimensions: 2,
        contentDigest: expect.any(String),
        updatedAt: "2026-08-19T23:00:00.000Z",
      },
      provider: "test",
      status: "refreshed",
    });

    await expect(
      runtime.backfillConceptEmbeddings({
        workspaceId: "workspace-a",
        model: "test:nomic-embed-text",
      }),
    ).resolves.toEqual({
      workspaceId: "workspace-a",
      model: "test:nomic-embed-text",
      provider: "test",
      summary: {
        totalConcepts: 3,
        selectedConcepts: 3,
        refreshed: 2,
        unchanged: 1,
      },
      results: [
        {
          nodeId: "node-a",
          label: "Alpha",
          status: "unchanged",
          dimensions: 2,
          contentDigest: expect.any(String),
          updatedAt: "2026-08-19T23:00:00.000Z",
        },
        {
          nodeId: "node-b",
          label: "Beta",
          status: "refreshed",
          dimensions: 2,
          contentDigest: expect.any(String),
          updatedAt: "2026-08-19T23:00:00.000Z",
        },
        {
          nodeId: "node-c",
          label: "Gamma",
          status: "refreshed",
          dimensions: 2,
          contentDigest: expect.any(String),
          updatedAt: "2026-08-19T23:00:00.000Z",
        },
      ],
    });

    await expect(
      runtime.listSimilarConcepts({
        workspaceId: "workspace-a",
        nodeId: "node-a",
        model: "test:nomic-embed-text",
        limit: 2,
        minScore: 0,
      }),
    ).resolves.toEqual({
      sourceNodeId: "node-a",
      model: "test:nomic-embed-text",
      matches: [
        {
          nodeId: "node-b",
          label: "Beta",
          score: expect.any(Number),
          updatedAt: "2026-08-19T23:00:00.000Z",
        },
        {
          nodeId: "node-c",
          label: "Gamma",
          score: expect.any(Number),
          updatedAt: "2026-08-19T23:00:00.000Z",
        },
      ],
    });

    await expect(runtime.getGraph({ workspaceId: "workspace-a" })).resolves.toEqual(graphBefore);
  });

  it("approves and applies proposals explicitly", async () => {
    await seedWorkspaceFixture();
    await runtime.createProposal({
      workspaceId: "workspace-a",
      proposal: {
        id: "proposal-a",
        createdAt: "2026-05-13T21:02:00.000Z",
        sourceFeedbackIds: [],
        graphCommands: [
          {
            id: "cmd-a",
            type: "node.create",
            payload: { node: { id: "node-a", label: "Alpha", type: "concept" } },
          },
        ],
        explanation: "Capture Alpha.",
        status: "pending",
      },
    });

    expect((await runtime.approveProposal({ workspaceId: "workspace-a", proposalId: "proposal-a" })).proposal.status).toBe(
      "approved",
    );
    expect((await runtime.applyProposal({ workspaceId: "workspace-a", proposalId: "proposal-a" })).proposal.status).toBe(
      "applied",
    );
    expect((await runtime.getGraph({ workspaceId: "workspace-a" })).graph.nodes).toHaveLength(1);
  });

  it("runs two agent scans and compares resolved findings as evidence", async () => {
    await seedWorkspaceFixture();
    await ensureCompletedRepositoryIndex("repo-index-scan");
    await runtime.applyGraphCommands({
      workspaceId: "workspace-a",
      commands: [{ id: "concept-a", type: "node.create", payload: { node: { id: "concept-a", label: "Ownership", type: "concept" } } }],
    });
    await startDocumentationScan("scan-before", "repo-index-scan");
    await runtime.recordScanCoverage({
      workspaceId: "workspace-a",
      scanId: "scan-before",
      coverage: { discovered: ["docs/a.md", "docs/b.md"], included: ["docs/a.md", "docs/b.md"], excluded: [], failed: [] },
    });
    await runtime.createScanFinding({
      workspaceId: "workspace-a",
      scanId: "scan-before",
      finding: {
        id: "finding-before",
        label: "Conflicting ownership",
        notes: "Two documents claim ownership of the same concern.",
        fingerprint: "ownership-conflict",
        kind: "conflict",
        severity: "high",
        confidence: "high",
        criterionIds: ["contradictory-claims"],
        sources: [
          { sourceRef: { role: "defines", source: "repo-doc", target: "docs/a.md", revision: "a" }, claim: "A owns it." },
          { sourceRef: { role: "defines", source: "repo-doc", target: "docs/b.md", revision: "b" }, claim: "B owns it." },
        ],
        affectedNodeIds: ["concept-a"],
        expectedOwner: "docs/a.md",
      },
    });
    await completeDocumentationScan("scan-before");

    await startDocumentationScan("scan-after", "repo-index-scan");
    await runtime.recordScanCoverage({
      workspaceId: "workspace-a",
      scanId: "scan-after",
      coverage: { discovered: ["docs/a.md", "docs/b.md"], included: ["docs/a.md", "docs/b.md"], excluded: [], failed: [] },
    });
    await completeDocumentationScan("scan-after");

    const comparison = (await runtime.compareScans({ workspaceId: "workspace-a", beforeScanId: "scan-before", afterScanId: "scan-after" })).comparison;
    expect(comparison.verdict).toBe("pass");
    expect(comparison.items).toEqual([expect.objectContaining({ fingerprint: "ownership-conflict", status: "resolved" })]);

    const directory = mkdtempSync(join(tmpdir(), "hivemap-verification-"));
    try {
      const exported = await runtime.exportWorkspace({
        workspaceId: "workspace-a",
        targetPath: join(directory, "verification.hivemap.zip"),
        exportedAt: "2026-07-17T10:10:00.000Z",
      });
      expect(exported.manifest.files.map((file) => file.path)).toContain("comparisons/scan-before--scan-after.json");
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  });

  it("exports and imports a complete workspace ZIP without semantic drift", async () => {
    await seedWorkspaceFixture();
    const directory = mkdtempSync(join(tmpdir(), "hivemap-runtime-"));
    const bundlePath = join(directory, "workspace.hivemap.zip");
    try {
      await runtime.exportWorkspace({ workspaceId: "workspace-a", targetPath: bundlePath, exportedAt: "2026-07-17T11:00:00.000Z" });
      const importedStore = new InMemoryHiveMapStore();
      await importedStore.initialize();
      const importedRuntime = new HiveMapRuntime({ store: importedStore });

      await importedRuntime.importWorkspace({ sourcePath: bundlePath, mode: "new" });

      await expect(importedRuntime.getWorkspace("workspace-a")).resolves.toEqual(await runtime.getWorkspace("workspace-a"));
      await expect(importedRuntime.importWorkspace({ sourcePath: bundlePath, mode: "new" })).rejects.toThrow("already exists");
      await importedStore.close();
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  });

  it("does not bypass non-delegated capture when an agent creates a finding", async () => {
    await seedWorkspaceFixture();
    await ensureCompletedRepositoryIndex("repo-index-scan");
    const state = await store.loadWorkspaceState("workspace-a");
    await store.saveWorkspaceState({ ...state, capturePolicy: { id: "capture-policy-default", mode: "proposed" } });
    await startDocumentationScan("scan-proposed", "repo-index-scan");

    await expect(
      runtime.createScanFinding({
        workspaceId: "workspace-a",
        scanId: "scan-proposed",
        finding: {
          id: "finding-a",
          label: "Stale document",
          notes: "A current document is stale.",
          fingerprint: "stale-document",
          kind: "stale",
          severity: "normal",
          confidence: "medium",
          criterionIds: ["stale-documentation"],
          sources: [{ sourceRef: { role: "defines", source: "repo-doc", target: "docs/a.md" }, claim: "The claim is stale." }],
          affectedNodeIds: [],
        },
      }),
    ).rejects.toThrow("requires delegated capture");
  });

  it("returns scan profile overlay help for repository-local scan customization", async () => {
    await seedWorkspaceFixture();

    await expect(
      runtime.getScanProfileOverlayHelp({
        workspaceId: "workspace-a",
        profileId: "code-quality-review",
        profileVersion: 1,
      }),
    ).resolves.toEqual(expect.objectContaining({
      profileId: "code-quality-review",
      profileVersion: 1,
      overlayPath: ".hivemap/scan-profiles/code-quality.yaml",
      guidanceTool: "scan_profile_overlay_help",
      baseScope: expect.objectContaining({
        include: expect.arrayContaining(["src/**", "apps/**", "packages/**"]),
      }),
    }));
  });
});

async function seedWorkspaceFixture(
  workspace: Partial<{
    id: string;
    slug: string;
    name: string;
    archived: boolean;
    createdAt: string;
    updatedAt: string;
  }> = {},
): Promise<void> {
  // Tests seed their own isolated in-memory workspace records; no external DB state is used.
  await runtime.createWorkspace({
    workspace: {
      id: workspace.id ?? "workspace-a",
      ...(workspace.slug === undefined ? {} : { slug: workspace.slug }),
      name: workspace.name ?? "Alpha",
      ...(workspace.archived === undefined ? {} : { archived: workspace.archived }),
      createdAt: workspace.createdAt ?? "2026-05-13T21:00:00.000Z",
      updatedAt: workspace.updatedAt ?? "2026-05-13T21:00:00.000Z",
    },
  });
}

async function startDocumentationScan(id: string, repositoryIndexId: string): Promise<void> {
  await runtime.startScan({
    workspaceId: "workspace-a",
    scan: {
      id,
      profileId: DOCUMENTATION_CONFLICTS_PROFILE.id,
      profileVersion: DOCUMENTATION_CONFLICTS_PROFILE.version,
      repositoryIndexId,
      actor: { agentId: "agent-a", tool: "codex" },
      startedAt: "2026-07-17T10:00:00.000Z",
    },
  });
}

async function ensureCompletedRepositoryIndex(indexId: string): Promise<void> {
  await runtime.startRepositoryIndex({
    workspaceId: "workspace-a",
    index: {
      id: indexId,
      repositoryUrl: "/fixtures/repo",
      requestedRef: "main",
      mode: "safe",
      requestedAt: "2026-08-20T12:00:00.000Z",
      actor: {
        agentId: "codex",
        tool: "mcp",
      },
    },
  });
  await runtime.executeRepositoryIndex({ workspaceId: "workspace-a", indexId });
}

async function completeDocumentationScan(id: string): Promise<void> {
  await runtime.completeScan({
    workspaceId: "workspace-a",
    scanId: id,
    completedAt: "2026-07-17T10:05:00.000Z",
    appliedCriteria: DOCUMENTATION_CONFLICTS_PROFILE.criteria.map((criterion) => criterion.id),
    declaredOutputs: [...DOCUMENTATION_CONFLICTS_PROFILE.requiredOutputs],
  });
}

function createTestEmbeddingProvider(): EmbeddingProvider {
  return {
    id: "test",
    maxBatchSize: 2,
    async embed(request) {
      return request.inputs.map((input) => {
        if (input.includes("Alpha")) {
          return [1, 0];
        }
        if (input.includes("Beta")) {
          return [0.9, 0.1];
        }
        return [0, 1];
      });
    },
  };
}

function createTestRepositoryIndexExecutor(): RepositoryIndexExecutor {
  return async ({ workspaceId, indexId }) => createRepositoryIndexResult(
    "0123456789abcdef0123456789abcdef01234567",
    "The system keeps a single source of truth for ownership and concept evidence.",
    workspaceId,
    indexId,
  );
}

function createSequenceRepositoryIndexExecutor(sequence: Array<ReturnType<typeof createRepositoryIndexResult> | Error>): RepositoryIndexExecutor {
  let callIndex = 0;
  return async ({ workspaceId, indexId }) => {
    const next = sequence[callIndex];
    callIndex += 1;
    if (next === undefined) {
      throw new Error("Repository index executor sequence exhausted");
    }
    if (next instanceof Error) {
      throw next;
    }
    return {
      ...next,
      files: next.files.map((file) => ({ ...file, workspaceId, indexId })),
      chunks: next.chunks.map((chunk) => ({ ...chunk, workspaceId, indexId })),
      ...(next.symbols === undefined ? {} : { symbols: next.symbols.map((symbol) => ({ ...symbol, workspaceId, indexId })) }),
      ...(next.references === undefined ? {} : { references: next.references.map((reference) => ({ ...reference, workspaceId, indexId })) }),
      ...(next.dependencies === undefined
        ? {}
        : { dependencies: next.dependencies.map((dependency) => ({ ...dependency, workspaceId, indexId })) }),
    };
  };
}

function expectDefaultOverlayMetadata(profileId: string, overlayPath: string) {
  return {
    baseProfile: expect.objectContaining({ id: profileId, version: 1 }),
    effectiveProfile: expect.objectContaining({ id: profileId, version: 1 }),
    overlay: expect.objectContaining({
      status: "missing",
      source: "defaults",
      applied: false,
      overlayPath,
      guidanceTool: "scan_profile_overlay_help",
    }),
    coverageSummary: expect.objectContaining({
      warnings: expect.any(Array),
    }),
  };
}

function createRepositoryIndexResult(
  resolvedCommit: string,
  documentationText: string,
  workspaceId = "workspace-a",
  indexId = "repo-index-a",
): Awaited<ReturnType<RepositoryIndexExecutor>> {
  return {
    resolvedCommit,
    files: [
      {
        workspaceId,
        indexId,
        path: "docs/architecture.md",
        language: "markdown",
        sourceKind: "documentation",
        contentHash: "hash-doc",
        byteSize: 96,
      },
      {
        workspaceId,
        indexId,
        path: "src/index.ts",
        language: "typescript",
        sourceKind: "code",
        contentHash: "hash-src",
        byteSize: 82,
      },
      {
        workspaceId,
        indexId,
        path: "package.json",
        language: "json",
        sourceKind: "config",
        contentHash: "hash-package",
        byteSize: 30,
      },
    ],
    chunks: [
      {
        workspaceId,
        indexId,
        id: "chunk-doc",
        filePath: "docs/architecture.md",
        language: "markdown",
        sourceKind: "documentation",
        startLine: 1,
        endLine: 3,
        text: documentationText,
        contentHash: "chunk-hash-doc",
      },
      {
        workspaceId,
        indexId,
        id: "chunk-src",
        filePath: "src/index.ts",
        language: "typescript",
        sourceKind: "code",
        startLine: 1,
        endLine: 3,
        text: "export function describeOwnership() { return 'ownership is tracked in one place'; }",
        contentHash: "chunk-hash-src",
      },
    ],
    references: [
      {
        workspaceId,
        indexId,
        key: "ref-src-import",
        filePath: "src/index.ts",
        language: "typescript",
        sourceKind: "code",
        kind: "import",
        targetText: "./guide",
        startLine: 1,
        startColumn: 20,
        endLine: 1,
        endColumn: 29,
        resolutionConfidence: "low",
        producerTool: "tree-sitter",
        producerVersion: "test",
      },
      {
        workspaceId,
        indexId,
        key: "ref-src-call",
        filePath: "src/index.ts",
        language: "typescript",
        sourceKind: "code",
        kind: "call",
        targetText: "describeOwnership",
        startLine: 2,
        startColumn: 0,
        endLine: 2,
        endColumn: 17,
        resolutionConfidence: "low",
        producerTool: "tree-sitter",
        producerVersion: "test",
      },
    ],
    dependencies: [
      {
        workspaceId,
        indexId,
        key: "dep-src-import",
        filePath: "src/index.ts",
        language: "typescript",
        sourceKind: "code",
        kind: "import",
        targetText: "./guide",
        startLine: 1,
        startColumn: 20,
        endLine: 1,
        endColumn: 29,
        resolutionConfidence: "low",
        producerTool: "tree-sitter",
        producerVersion: "test",
      },
      {
        workspaceId,
        indexId,
        key: "dep-src-call",
        filePath: "src/index.ts",
        language: "typescript",
        sourceKind: "code",
        kind: "call",
        targetText: "describeOwnership",
        startLine: 2,
        startColumn: 0,
        endLine: 2,
        endColumn: 17,
        resolutionConfidence: "low",
        producerTool: "tree-sitter",
        producerVersion: "test",
      },
    ],
    stats: {
      fileCount: 3,
      chunkCount: 2,
      indexedBytes: 208,
    },
  };
}

function createRepositoryEvidenceIndexResult(
  workspaceId = "workspace-a",
  indexId = "repo-index-a",
): Awaited<ReturnType<RepositoryIndexExecutor>> {
  return {
    resolvedCommit: "fedcba9876543210fedcba9876543210fedcba98",
    files: [
      {
        workspaceId,
        indexId,
        path: "docs/architecture.md",
        language: "markdown",
        sourceKind: "documentation",
        contentHash: "hash-arch",
        byteSize: 160,
      },
      {
        workspaceId,
        indexId,
        path: "docs/guide.md",
        language: "markdown",
        sourceKind: "documentation",
        contentHash: "hash-guide",
        byteSize: 140,
      },
      {
        workspaceId,
        indexId,
        path: "docs/storage.md",
        language: "markdown",
        sourceKind: "documentation",
        contentHash: "hash-storage",
        byteSize: 118,
      },
      {
        workspaceId,
        indexId,
        path: "docs/legacy-storage.md",
        language: "markdown",
        sourceKind: "documentation",
        contentHash: "hash-legacy-storage",
        byteSize: 120,
      },
      {
        workspaceId,
        indexId,
        path: "docs/glossary.md",
        language: "markdown",
        sourceKind: "documentation",
        contentHash: "hash-glossary",
        byteSize: 80,
      },
      {
        workspaceId,
        indexId,
        path: "docs/runbook.md",
        language: "markdown",
        sourceKind: "documentation",
        contentHash: "hash-runbook",
        byteSize: 120,
      },
      {
        workspaceId,
        indexId,
        path: "src/index.ts",
        language: "typescript",
        sourceKind: "code",
        contentHash: "hash-src",
        byteSize: 82,
      },
    ],
    chunks: [
      {
        workspaceId,
        indexId,
        id: "chunk-arch",
        filePath: "docs/architecture.md",
        language: "markdown",
        sourceKind: "documentation",
        startLine: 1,
        endLine: 4,
        text: "# Architecture\nThis document is the single source of truth for runtime storage ownership.\nSee [Missing Guide](missing.md).\nSee [Guide section](guide.md#missing-section).",
        contentHash: "chunk-hash-arch",
      },
      {
        workspaceId,
        indexId,
        id: "chunk-guide",
        filePath: "docs/guide.md",
        language: "markdown",
        sourceKind: "documentation",
        startLine: 1,
        endLine: 3,
        text: "# Guide\nCanonical runtime storage owner guidance lives here.\n## Existing Section",
        contentHash: "chunk-hash-guide",
      },
      {
        workspaceId,
        indexId,
        id: "chunk-storage",
        filePath: "docs/storage.md",
        language: "markdown",
        sourceKind: "documentation",
        startLine: 1,
        endLine: 2,
        text: "# Runtime Storage\nSQLite is no longer supported as a runtime backend.",
        contentHash: "chunk-hash-storage",
      },
      {
        workspaceId,
        indexId,
        id: "chunk-legacy-storage",
        filePath: "docs/legacy-storage.md",
        language: "markdown",
        sourceKind: "documentation",
        startLine: 1,
        endLine: 2,
        text: "# Runtime Storage\nSQLite remains supported as a runtime backend.",
        contentHash: "chunk-hash-legacy-storage",
      },
      {
        workspaceId,
        indexId,
        id: "chunk-glossary",
        filePath: "docs/glossary.md",
        language: "markdown",
        sourceKind: "documentation",
        startLine: 1,
        endLine: 2,
        text: "# Glossary\nShared project terms and definitions.",
        contentHash: "chunk-hash-glossary",
      },
      {
        workspaceId,
        indexId,
        id: "chunk-runbook",
        filePath: "docs/runbook.md",
        language: "markdown",
        sourceKind: "documentation",
        startLine: 1,
        endLine: 2,
        text: "# Runtime Runbook\nRestart the service if the healthcheck fails.",
        contentHash: "chunk-hash-runbook",
      },
      {
        workspaceId,
        indexId,
        id: "chunk-src",
        filePath: "src/index.ts",
        language: "typescript",
        sourceKind: "code",
        startLine: 1,
        endLine: 3,
        text: "export function describeOwnership() { return 'ownership is tracked in one place'; }",
        contentHash: "chunk-hash-src",
      },
    ],
    stats: {
      fileCount: 7,
      chunkCount: 7,
      indexedBytes: 820,
    },
  };
}

function createRepositoryOverlayEvidenceIndexResult(
  workspaceId = "workspace-a",
  indexId = "repo-index-a",
): Awaited<ReturnType<RepositoryIndexExecutor>> {
  return {
    resolvedCommit: "4444444444444444444444444444444444444444",
    files: [
      {
        workspaceId,
        indexId,
        path: ".hivemap/scan-profiles/code-quality.yaml",
        language: "yaml",
        sourceKind: "config",
        contentHash: "hash-overlay",
        byteSize: 120,
      },
      {
        workspaceId,
        indexId,
        path: "services/runtime/RuntimePolicy.ts",
        language: "typescript",
        sourceKind: "code",
        contentHash: "hash-service-runtime",
        byteSize: 120,
      },
      {
        workspaceId,
        indexId,
        path: "services/storage/RuntimePolicy.ts",
        language: "typescript",
        sourceKind: "code",
        contentHash: "hash-service-storage",
        byteSize: 120,
      },
    ],
    chunks: [
      {
        workspaceId,
        indexId,
        id: "chunk-overlay",
        filePath: ".hivemap/scan-profiles/code-quality.yaml",
        language: "yaml",
        sourceKind: "config",
        startLine: 1,
        endLine: 26,
        text:
          "formatVersion: 1\nprofileId: code-quality-review\nname: Services code quality review\ndescription: Repository-specific service review profile.\ninstructions:\n  - Review service boundaries before filing local findings.\n  - Treat services/** as the primary implementation surface.\ninclude:\n  - services/**\nlegacyPatterns:\n  - legacy/**\nsourceTypes:\n  - specification\n  - code\n  - test\ncriteria:\n  - duplicate-responsibility: Multiple services own the same runtime policy behavior.\n  - undocumented-api: A public service behavior lacks an owning contract.\nssotOrder:\n  - AGENTS.md\n  - docs/specs/**\n  - services/**\nrequiredOutputs:\n  - document-inventory\n  - findings\n  - boundary-map\nboundaryMapRoots:\n  - services:library\nboundaryMapIgnoredTokens:\n  - docs\n  - tests\nboundaryMapApiNameSuffixes:\n  - policy",
        contentHash: "chunk-hash-overlay",
      },
      {
        workspaceId,
        indexId,
        id: "chunk-service-runtime",
        filePath: "services/runtime/RuntimePolicy.ts",
        language: "typescript",
        sourceKind: "code",
        startLine: 1,
        endLine: 3,
        text: "export class RuntimePolicy {\n  describe() { return 'runtime'; }\n}",
        contentHash: "chunk-hash-service-runtime",
      },
      {
        workspaceId,
        indexId,
        id: "chunk-service-storage",
        filePath: "services/storage/RuntimePolicy.ts",
        language: "typescript",
        sourceKind: "code",
        startLine: 1,
        endLine: 3,
        text: "export class RuntimePolicy {\n  describe() { return 'storage'; }\n}",
        contentHash: "chunk-hash-service-storage",
      },
    ],
    symbols: [
      {
        workspaceId,
        indexId,
        key: "services/runtime/RuntimePolicy.ts::RuntimePolicy",
        filePath: "services/runtime/RuntimePolicy.ts",
        language: "typescript",
        name: "RuntimePolicy",
        qualifiedName: "RuntimePolicy",
        kind: "class",
        startLine: 1,
        startColumn: 1,
        endLine: 3,
        endColumn: 1,
        isExported: true,
        isPublic: true,
        producerTool: "tree-sitter",
        producerVersion: "test",
      },
      {
        workspaceId,
        indexId,
        key: "services/storage/RuntimePolicy.ts::RuntimePolicy",
        filePath: "services/storage/RuntimePolicy.ts",
        language: "typescript",
        name: "RuntimePolicy",
        qualifiedName: "RuntimePolicy",
        kind: "class",
        startLine: 1,
        startColumn: 1,
        endLine: 3,
        endColumn: 1,
        isExported: true,
        isPublic: true,
        producerTool: "tree-sitter",
        producerVersion: "test",
      },
    ],
    stats: {
      fileCount: 3,
      chunkCount: 3,
      indexedBytes: 360,
    },
  };
}

function createRepositoryInvalidOverlayIndexResult(
  workspaceId = "workspace-a",
  indexId = "repo-index-a",
): Awaited<ReturnType<RepositoryIndexExecutor>> {
  const result = createRepositoryOverlayEvidenceIndexResult(workspaceId, indexId);
  return {
    ...result,
    chunks: result.chunks.map((chunk) =>
      chunk.filePath === ".hivemap/scan-profiles/code-quality.yaml"
        ? {
            ...chunk,
            text: "formatVersion: 2\nprofileId: code-quality-review\ninclude:\n  - services/**",
          }
        : chunk,
    ),
  };
}

function createRepositoryBoundaryMapUnmappedRootIndexResult(
  workspaceId = "workspace-a",
  indexId = "repo-index-a",
): Awaited<ReturnType<RepositoryIndexExecutor>> {
  return {
    resolvedCommit: "5555555555555555555555555555555555555555",
    files: [
      {
        workspaceId,
        indexId,
        path: ".hivemap/scan-profiles/code-quality.yaml",
        language: "yaml",
        sourceKind: "config",
        contentHash: "hash-overlay-unmapped",
        byteSize: 176,
      },
      {
        workspaceId,
        indexId,
        path: "misc/runtime/RuntimePolicy.ts",
        language: "typescript",
        sourceKind: "code",
        contentHash: "hash-misc-runtime",
        byteSize: 120,
      },
    ],
    chunks: [
      {
        workspaceId,
        indexId,
        id: "chunk-overlay-unmapped",
        filePath: ".hivemap/scan-profiles/code-quality.yaml",
        language: "yaml",
        sourceKind: "config",
        startLine: 1,
        endLine: 7,
        text: "formatVersion: 1\nprofileId: code-quality-review\ninclude:\n  - misc/**\nboundaryMapRoots:\n  - services:service\n  - packages:package",
        contentHash: "chunk-hash-overlay-unmapped",
      },
      {
        workspaceId,
        indexId,
        id: "chunk-misc-runtime",
        filePath: "misc/runtime/RuntimePolicy.ts",
        language: "typescript",
        sourceKind: "code",
        startLine: 1,
        endLine: 3,
        text: "export class RuntimePolicy {\n  describe() { return 'misc'; }\n}",
        contentHash: "chunk-hash-misc-runtime",
      },
    ],
    symbols: [
      {
        workspaceId,
        indexId,
        key: "misc/runtime/RuntimePolicy.ts::RuntimePolicy",
        filePath: "misc/runtime/RuntimePolicy.ts",
        language: "typescript",
        name: "RuntimePolicy",
        qualifiedName: "RuntimePolicy",
        kind: "class",
        startLine: 1,
        startColumn: 1,
        endLine: 3,
        endColumn: 1,
        isExported: true,
        isPublic: true,
        producerTool: "tree-sitter",
        producerVersion: "test",
      },
    ],
    stats: {
      fileCount: 2,
      chunkCount: 2,
      indexedBytes: 296,
    },
  };
}

function createRepositoryEvidenceNoiseResult(
  workspaceId = "workspace-a",
  indexId = "repo-index-a",
): Awaited<ReturnType<RepositoryIndexExecutor>> {
  return {
    resolvedCommit: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
    files: [
      {
        workspaceId,
        indexId,
        path: "docs/architecture.md",
        language: "markdown",
        sourceKind: "documentation",
        contentHash: "noise-arch",
        byteSize: 120,
      },
      {
        workspaceId,
        indexId,
        path: "docs/deployment.md",
        language: "markdown",
        sourceKind: "documentation",
        contentHash: "noise-deploy",
        byteSize: 120,
      },
      {
        workspaceId,
        indexId,
        path: "docs/glossary.md",
        language: "markdown",
        sourceKind: "documentation",
        contentHash: "noise-glossary",
        byteSize: 80,
      },
    ],
    chunks: [
      {
        workspaceId,
        indexId,
        id: "noise-chunk-arch",
        filePath: "docs/architecture.md",
        language: "markdown",
        sourceKind: "documentation",
        startLine: 1,
        endLine: 2,
        text: "# Architecture\nThis document is the canonical source for module ownership.",
        contentHash: "noise-chunk-arch",
      },
      {
        workspaceId,
        indexId,
        id: "noise-chunk-deploy",
        filePath: "docs/deployment.md",
        language: "markdown",
        sourceKind: "documentation",
        startLine: 1,
        endLine: 2,
        text: "# Deployment\nCanonical deployment steps live here.",
        contentHash: "noise-chunk-deploy",
      },
      {
        workspaceId,
        indexId,
        id: "noise-chunk-glossary",
        filePath: "docs/glossary.md",
        language: "markdown",
        sourceKind: "documentation",
        startLine: 1,
        endLine: 2,
        text: "# Glossary\nShared terms and acronyms.",
        contentHash: "noise-chunk-glossary",
      },
    ],
    stats: {
      fileCount: 3,
      chunkCount: 3,
      indexedBytes: 320,
    },
  };
}

function createRepositoryStructuralEvidenceIndexResult(
  workspaceId = "workspace-a",
  indexId = "repo-index-a",
): Awaited<ReturnType<RepositoryIndexExecutor>> {
  return {
    resolvedCommit: "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
    files: [
      {
        workspaceId,
        indexId,
        path: "packages/runtime/src/runtime-policy/RuntimePolicy.ts",
        language: "typescript",
        sourceKind: "code",
        contentHash: "struct-runtime-policy",
        byteSize: 120,
      },
      {
        workspaceId,
        indexId,
        path: "packages/storage/src/runtime-policy/RuntimePolicy.ts",
        language: "typescript",
        sourceKind: "code",
        contentHash: "struct-storage-policy",
        byteSize: 128,
      },
      {
        workspaceId,
        indexId,
        path: "packages/runtime/tests/RuntimePolicyHarness.ts",
        language: "typescript",
        sourceKind: "test",
        contentHash: "struct-test-policy",
        byteSize: 84,
      },
      {
        workspaceId,
        indexId,
        path: "docs/specs/runtime-policy.md",
        language: "markdown",
        sourceKind: "documentation",
        contentHash: "struct-doc-policy",
        byteSize: 96,
      },
    ],
    chunks: [
      {
        workspaceId,
        indexId,
        id: "struct-doc-policy",
        filePath: "docs/specs/runtime-policy.md",
        language: "markdown",
        sourceKind: "documentation",
        startLine: 1,
        endLine: 2,
        text: "# Runtime Policy\nContract for runtime ownership boundaries.",
        contentHash: "struct-doc-policy-chunk",
      },
    ],
    symbols: [
      {
        workspaceId,
        indexId,
        key: "runtime-policy",
        filePath: "packages/runtime/src/runtime-policy/RuntimePolicy.ts",
        language: "typescript",
        name: "RuntimePolicy",
        qualifiedName: "RuntimePolicy",
        kind: "class",
        startLine: 1,
        startColumn: 0,
        endLine: 8,
        endColumn: 1,
        isExported: true,
        isPublic: false,
        producerTool: "test",
        producerVersion: "1",
      },
      {
        workspaceId,
        indexId,
        key: "storage-policy",
        filePath: "packages/storage/src/runtime-policy/RuntimePolicy.ts",
        language: "typescript",
        name: "RuntimePolicy",
        qualifiedName: "RuntimePolicy",
        kind: "class",
        startLine: 1,
        startColumn: 0,
        endLine: 10,
        endColumn: 1,
        isExported: true,
        isPublic: false,
        producerTool: "test",
        producerVersion: "1",
      },
      {
        workspaceId,
        indexId,
        key: "test-policy-harness",
        filePath: "packages/runtime/tests/RuntimePolicyHarness.ts",
        language: "typescript",
        name: "RuntimePolicy",
        qualifiedName: "RuntimePolicy",
        kind: "class",
        startLine: 1,
        startColumn: 0,
        endLine: 6,
        endColumn: 1,
        isExported: true,
        isPublic: false,
        producerTool: "test",
        producerVersion: "1",
      },
    ],
    stats: {
      fileCount: 4,
      chunkCount: 1,
      indexedBytes: 428,
    },
  };
}

function createRepositoryStructuralPrecisionIndexResult(
  workspaceId = "workspace-a",
  indexId = "repo-index-a",
): Awaited<ReturnType<RepositoryIndexExecutor>> {
  const result = createRepositoryStructuralEvidenceIndexResult(workspaceId, indexId);
  return {
    ...result,
    files: [
      ...result.files,
      {
        workspaceId,
        indexId,
        path: "legacy/runtime-policy/RuntimePolicy.ts",
        language: "typescript",
        sourceKind: "code",
        contentHash: "struct-legacy-policy",
        byteSize: 96,
      },
      {
        workspaceId,
        indexId,
        path: "generated/runtime-policy/RuntimePolicy.generated.ts",
        language: "typescript",
        sourceKind: "code",
        contentHash: "struct-generated-policy",
        byteSize: 96,
      },
      {
        workspaceId,
        indexId,
        path: "packages/runtime/__fixtures__/RuntimePolicy.ts",
        language: "typescript",
        sourceKind: "code",
        contentHash: "struct-fixture-policy",
        byteSize: 96,
      },
    ],
    symbols: [
      ...(result.symbols ?? []),
      {
        workspaceId,
        indexId,
        key: "legacy-policy",
        filePath: "legacy/runtime-policy/RuntimePolicy.ts",
        language: "typescript",
        name: "RuntimePolicy",
        qualifiedName: "RuntimePolicy",
        kind: "class",
        startLine: 1,
        startColumn: 0,
        endLine: 5,
        endColumn: 1,
        isExported: true,
        isPublic: false,
        producerTool: "test",
        producerVersion: "1",
      },
      {
        workspaceId,
        indexId,
        key: "generated-policy",
        filePath: "generated/runtime-policy/RuntimePolicy.generated.ts",
        language: "typescript",
        name: "RuntimePolicy",
        qualifiedName: "RuntimePolicy",
        kind: "class",
        startLine: 1,
        startColumn: 0,
        endLine: 5,
        endColumn: 1,
        isExported: true,
        isPublic: false,
        producerTool: "test",
        producerVersion: "1",
      },
      {
        workspaceId,
        indexId,
        key: "fixture-policy",
        filePath: "packages/runtime/__fixtures__/RuntimePolicy.ts",
        language: "typescript",
        name: "RuntimePolicy",
        qualifiedName: "RuntimePolicy",
        kind: "class",
        startLine: 1,
        startColumn: 0,
        endLine: 5,
        endColumn: 1,
        isExported: true,
        isPublic: false,
        producerTool: "test",
        producerVersion: "1",
      },
    ],
    stats: {
      fileCount: 7,
      chunkCount: result.stats.chunkCount,
      indexedBytes: result.stats.indexedBytes + 288,
    },
  };
}

function createRepositoryStructuralTopologyIndexResult(
  workspaceId = "workspace-a",
  indexId = "repo-index-a",
): Awaited<ReturnType<RepositoryIndexExecutor>> {
  const result = createRepositoryStructuralEvidenceIndexResult(workspaceId, indexId);
  return {
    ...result,
    files: [
      ...result.files,
      {
        workspaceId,
        indexId,
        path: "packages/runtime/src/managers/Manager.ts",
        language: "typescript",
        sourceKind: "code",
        contentHash: "manager-runtime",
        byteSize: 96,
      },
      {
        workspaceId,
        indexId,
        path: "packages/storage/src/managers/Manager.ts",
        language: "typescript",
        sourceKind: "code",
        contentHash: "manager-storage",
        byteSize: 96,
      },
      {
        workspaceId,
        indexId,
        path: "packages/shared/src/runtime-policy/PolicyShape.ts",
        language: "typescript",
        sourceKind: "code",
        contentHash: "policy-shape",
        byteSize: 72,
      },
      {
        workspaceId,
        indexId,
        path: "packages/runtime/src/logging/Logger.ts",
        language: "typescript",
        sourceKind: "code",
        contentHash: "logger-file",
        byteSize: 72,
      },
      {
        workspaceId,
        indexId,
        path: "packages/storage/src/persistence/Store.ts",
        language: "typescript",
        sourceKind: "code",
        contentHash: "store-file",
        byteSize: 72,
      },
    ],
    symbols: [
      ...(result.symbols ?? []),
      {
        workspaceId,
        indexId,
        key: "runtime-manager",
        filePath: "packages/runtime/src/managers/Manager.ts",
        language: "typescript",
        name: "Manager",
        qualifiedName: "Manager",
        kind: "class",
        startLine: 1,
        startColumn: 0,
        endLine: 6,
        endColumn: 1,
        isExported: true,
        isPublic: false,
        producerTool: "test",
        producerVersion: "1",
      },
      {
        workspaceId,
        indexId,
        key: "storage-manager",
        filePath: "packages/storage/src/managers/Manager.ts",
        language: "typescript",
        name: "Manager",
        qualifiedName: "Manager",
        kind: "class",
        startLine: 1,
        startColumn: 0,
        endLine: 6,
        endColumn: 1,
        isExported: true,
        isPublic: false,
        producerTool: "test",
        producerVersion: "1",
      },
    ],
    dependencies: [
      {
        workspaceId,
        indexId,
        key: "runtime-policy-dep",
        filePath: "packages/runtime/src/runtime-policy/RuntimePolicy.ts",
        language: "typescript",
        sourceKind: "code",
        kind: "import",
        targetText: "../shared/runtime-policy/PolicyShape",
        targetFilePath: "packages/shared/src/runtime-policy/PolicyShape.ts",
        startLine: 1,
        startColumn: 0,
        endLine: 1,
        endColumn: 42,
        resolutionConfidence: "high",
        producerTool: "test",
        producerVersion: "1",
      },
      {
        workspaceId,
        indexId,
        key: "storage-policy-dep",
        filePath: "packages/storage/src/runtime-policy/RuntimePolicy.ts",
        language: "typescript",
        sourceKind: "code",
        kind: "import",
        targetText: "../../shared/runtime-policy/PolicyShape",
        targetFilePath: "packages/shared/src/runtime-policy/PolicyShape.ts",
        startLine: 1,
        startColumn: 0,
        endLine: 1,
        endColumn: 45,
        resolutionConfidence: "high",
        producerTool: "test",
        producerVersion: "1",
      },
      {
        workspaceId,
        indexId,
        key: "runtime-manager-dep",
        filePath: "packages/runtime/src/managers/Manager.ts",
        language: "typescript",
        sourceKind: "code",
        kind: "import",
        targetText: "../logging/Logger",
        targetFilePath: "packages/runtime/src/logging/Logger.ts",
        startLine: 1,
        startColumn: 0,
        endLine: 1,
        endColumn: 30,
        resolutionConfidence: "high",
        producerTool: "test",
        producerVersion: "1",
      },
      {
        workspaceId,
        indexId,
        key: "storage-manager-dep",
        filePath: "packages/storage/src/managers/Manager.ts",
        language: "typescript",
        sourceKind: "code",
        kind: "import",
        targetText: "../persistence/Store",
        targetFilePath: "packages/storage/src/persistence/Store.ts",
        startLine: 1,
        startColumn: 0,
        endLine: 1,
        endColumn: 33,
        resolutionConfidence: "high",
        producerTool: "test",
        producerVersion: "1",
      },
      {
        workspaceId,
        indexId,
        key: "runtime-test-dep",
        filePath: "packages/runtime/tests/RuntimePolicyHarness.ts",
        language: "typescript",
        sourceKind: "test",
        kind: "import",
        targetText: "../src/runtime-policy/RuntimePolicy",
        targetFilePath: "packages/runtime/src/runtime-policy/RuntimePolicy.ts",
        startLine: 1,
        startColumn: 0,
        endLine: 1,
        endColumn: 40,
        resolutionConfidence: "high",
        producerTool: "test",
        producerVersion: "1",
      },
    ],
    stats: {
      fileCount: 9,
      chunkCount: 1,
      indexedBytes: 736,
    },
  };
}

function createRepositoryEvidenceStaleResult(
  workspaceId = "workspace-a",
  indexId = "repo-index-a",
): Awaited<ReturnType<RepositoryIndexExecutor>> {
  return {
    resolvedCommit: "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
    files: [
      {
        workspaceId,
        indexId,
        path: "README.md",
        language: "markdown",
        sourceKind: "documentation",
        contentHash: "stale-readme",
        byteSize: 120,
      },
      {
        workspaceId,
        indexId,
        path: "docs/specs/storage-format.md",
        language: "markdown",
        sourceKind: "documentation",
        contentHash: "stale-spec",
        byteSize: 130,
      },
      {
        workspaceId,
        indexId,
        path: "docs/legacy-storage.md",
        language: "markdown",
        sourceKind: "documentation",
        contentHash: "stale-legacy",
        byteSize: 118,
      },
    ],
    chunks: [
      {
        workspaceId,
        indexId,
        id: "stale-chunk-readme",
        filePath: "README.md",
        language: "markdown",
        sourceKind: "documentation",
        startLine: 1,
        endLine: 2,
        text: "# HiveMap\nDeprecated runtime note: SQLite remains supported as a runtime backend.",
        contentHash: "stale-chunk-readme",
      },
      {
        workspaceId,
        indexId,
        id: "stale-chunk-spec",
        filePath: "docs/specs/storage-format.md",
        language: "markdown",
        sourceKind: "documentation",
        startLine: 1,
        endLine: 2,
        text: "# Storage Format\nSQLite is no longer supported as a runtime backend.",
        contentHash: "stale-chunk-spec",
      },
      {
        workspaceId,
        indexId,
        id: "stale-chunk-legacy",
        filePath: "docs/legacy-storage.md",
        language: "markdown",
        sourceKind: "documentation",
        startLine: 1,
        endLine: 2,
        text: "# Legacy Storage\nSQLite remains supported as a runtime backend.",
        contentHash: "stale-chunk-legacy",
      },
    ],
    stats: {
      fileCount: 3,
      chunkCount: 3,
      indexedBytes: 368,
    },
  };
}

function createRepositoryEvidenceLegacyAuthorityResult(
  workspaceId = "workspace-a",
  indexId = "repo-index-a",
): Awaited<ReturnType<RepositoryIndexExecutor>> {
  return {
    resolvedCommit: "cccccccccccccccccccccccccccccccccccccccc",
    files: [
      {
        workspaceId,
        indexId,
        path: "README.md",
        language: "markdown",
        sourceKind: "documentation",
        contentHash: "legacy-authority-readme",
        byteSize: 120,
      },
      {
        workspaceId,
        indexId,
        path: "docs/specs/legacy-storage-format.md",
        language: "markdown",
        sourceKind: "documentation",
        contentHash: "legacy-authority-spec",
        byteSize: 132,
      },
    ],
    chunks: [
      {
        workspaceId,
        indexId,
        id: "legacy-authority-readme",
        filePath: "README.md",
        language: "markdown",
        sourceKind: "documentation",
        startLine: 1,
        endLine: 2,
        text: "# HiveMap\nSQLite remains supported as a runtime backend.",
        contentHash: "legacy-authority-readme",
      },
      {
        workspaceId,
        indexId,
        id: "legacy-authority-spec",
        filePath: "docs/specs/legacy-storage-format.md",
        language: "markdown",
        sourceKind: "documentation",
        startLine: 1,
        endLine: 3,
        text: "# Legacy Storage Format\nThis document is deprecated.\nSQLite is no longer supported as a runtime backend.",
        contentHash: "legacy-authority-spec",
      },
    ],
    stats: {
      fileCount: 2,
      chunkCount: 2,
      indexedBytes: 252,
    },
  };
}

function createRepositoryEvidenceUnicodeHeadingResult(
  workspaceId = "workspace-a",
  indexId = "repo-index-a",
): Awaited<ReturnType<RepositoryIndexExecutor>> {
  return {
    resolvedCommit: "dddddddddddddddddddddddddddddddddddddddd",
    files: [
      {
        workspaceId,
        indexId,
        path: "docs/overview.md",
        language: "markdown",
        sourceKind: "documentation",
        contentHash: "unicode-overview",
        byteSize: 140,
      },
      {
        workspaceId,
        indexId,
        path: "docs/guide.md",
        language: "markdown",
        sourceKind: "documentation",
        contentHash: "unicode-guide",
        byteSize: 150,
      },
    ],
    chunks: [
      {
        workspaceId,
        indexId,
        id: "unicode-overview",
        filePath: "docs/overview.md",
        language: "markdown",
        sourceKind: "documentation",
        startLine: 1,
        endLine: 2,
        text: "# Overview\nSee [Unicode Section](guide.md#zażółć-gęślą-jaźń).",
        contentHash: "unicode-overview",
      },
      {
        workspaceId,
        indexId,
        id: "unicode-guide",
        filePath: "docs/guide.md",
        language: "markdown",
        sourceKind: "documentation",
        startLine: 1,
        endLine: 2,
        text: "# Guide\n## Zażółć gęślą jaźń",
        contentHash: "unicode-guide",
      },
    ],
    stats: {
      fileCount: 2,
      chunkCount: 2,
      indexedBytes: 290,
    },
  };
}

function createRepositoryEvidenceRootLinkResult(
  workspaceId = "workspace-a",
  indexId = "repo-index-a",
): Awaited<ReturnType<RepositoryIndexExecutor>> {
  return {
    resolvedCommit: "eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee",
    files: [
      {
        workspaceId,
        indexId,
        path: "README.md",
        language: "markdown",
        sourceKind: "documentation",
        contentHash: "root-link-readme",
        byteSize: 120,
      },
      {
        workspaceId,
        indexId,
        path: "LICENSE",
        language: "text",
        sourceKind: "other",
        contentHash: "root-link-license",
        byteSize: 64,
      },
    ],
    chunks: [
      {
        workspaceId,
        indexId,
        id: "root-link-readme",
        filePath: "README.md",
        language: "markdown",
        sourceKind: "documentation",
        startLine: 1,
        endLine: 2,
        text: "# HiveMap\nSee [License](LICENSE).",
        contentHash: "root-link-readme",
      },
    ],
    stats: {
      fileCount: 2,
      chunkCount: 1,
      indexedBytes: 184,
    },
  };
}

function createRepositoryEvidenceOwnershipScopeResult(
  workspaceId = "workspace-a",
  indexId = "repo-index-a",
): Awaited<ReturnType<RepositoryIndexExecutor>> {
  return {
    resolvedCommit: "ffffffffffffffffffffffffffffffffffffffff",
    files: [
      {
        workspaceId,
        indexId,
        path: "packages/runtime/README.md",
        language: "markdown",
        sourceKind: "documentation",
        contentHash: "ownership-scope-readme",
        byteSize: 120,
      },
      {
        workspaceId,
        indexId,
        path: "docs/design/runtime-overview.md",
        language: "markdown",
        sourceKind: "documentation",
        contentHash: "ownership-scope-design",
        byteSize: 140,
      },
    ],
    chunks: [
      {
        workspaceId,
        indexId,
        id: "ownership-scope-readme",
        filePath: "packages/runtime/README.md",
        language: "markdown",
        sourceKind: "documentation",
        startLine: 1,
        endLine: 2,
        text: "# Runtime Package\nPackage notes and local development tips.",
        contentHash: "ownership-scope-readme",
      },
      {
        workspaceId,
        indexId,
        id: "ownership-scope-design",
        filePath: "docs/design/runtime-overview.md",
        language: "markdown",
        sourceKind: "documentation",
        startLine: 1,
        endLine: 2,
        text: "# Runtime Overview\nThe runtime should stay small and explicit.",
        contentHash: "ownership-scope-design",
      },
    ],
    stats: {
      fileCount: 2,
      chunkCount: 2,
      indexedBytes: 260,
    },
  };
}

function createRepositoryEvidenceSemanticInvariantResult(
  workspaceId = "workspace-a",
  indexId = "repo-index-a",
): Awaited<ReturnType<RepositoryIndexExecutor>> {
  return {
    resolvedCommit: "9999999999999999999999999999999999999999",
    files: [
      {
        workspaceId,
        indexId,
        path: "AGENTS.md",
        language: "markdown",
        sourceKind: "documentation",
        contentHash: "semantic-invariant-agents",
        byteSize: 120,
      },
      {
        workspaceId,
        indexId,
        path: "README.md",
        language: "markdown",
        sourceKind: "documentation",
        contentHash: "semantic-invariant-readme",
        byteSize: 120,
      },
    ],
    chunks: [
      {
        workspaceId,
        indexId,
        id: "semantic-invariant-agents",
        filePath: "AGENTS.md",
        language: "markdown",
        sourceKind: "documentation",
        startLine: 1,
        endLine: 2,
        text: "# Rules\nThe semantic graph is the source of truth.",
        contentHash: "semantic-invariant-agents",
      },
      {
        workspaceId,
        indexId,
        id: "semantic-invariant-readme",
        filePath: "README.md",
        language: "markdown",
        sourceKind: "documentation",
        startLine: 1,
        endLine: 2,
        text: "# Overview\nSemantic graph data is the source of truth; UI maps are projections.",
        contentHash: "semantic-invariant-readme",
      },
    ],
    stats: {
      fileCount: 2,
      chunkCount: 2,
      indexedBytes: 240,
    },
  };
}
