import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { beforeEach, describe, expect, it } from "vitest";

import { InMemoryHiveMapStore } from "@hivemap/storage";
import { DOCUMENTATION_CONFLICTS_PROFILE } from "@hivemap/scans";

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
    ).resolves.toEqual({
      indexId: "repo-index-evidence",
      profileId: "documentation-conflicts",
      profileVersion: 1,
      criterionId: "contradictory-claims",
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
    });

    await expect(
      evidenceRuntime.listRepositoryEvidenceCandidates({
        workspaceId: "workspace-a",
        indexId: "repo-index-evidence",
        profileId: "documentation-conflicts",
        profileVersion: 1,
        criterionId: "broken-references",
        limit: 2,
      }),
    ).resolves.toEqual({
      indexId: "repo-index-evidence",
      profileId: "documentation-conflicts",
      profileVersion: 1,
      criterionId: "broken-references",
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
    });

    await expect(
      evidenceRuntime.listRepositoryEvidenceCandidates({
        workspaceId: "workspace-a",
        indexId: "repo-index-evidence",
        profileId: "documentation-conflicts",
        profileVersion: 1,
        criterionId: "duplicate-authority",
      }),
    ).resolves.toEqual({
      indexId: "repo-index-evidence",
      profileId: "documentation-conflicts",
      profileVersion: 1,
      criterionId: "duplicate-authority",
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
    });

    await expect(
      evidenceRuntime.listRepositoryEvidenceCandidates({
        workspaceId: "workspace-a",
        indexId: "repo-index-evidence",
        profileId: "documentation-conflicts",
        profileVersion: 1,
        criterionId: "missing-owner",
      }),
    ).resolves.toEqual({
      indexId: "repo-index-evidence",
      profileId: "documentation-conflicts",
      profileVersion: 1,
      criterionId: "missing-owner",
      candidates: expect.arrayContaining([
        expect.objectContaining({
          signal: "missing-owner",
          sources: [expect.objectContaining({ filePath: "docs/runbook.md" })],
        }),
      ]),
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
    ).resolves.toEqual({
      indexId: "repo-index-precision",
      profileId: "documentation-conflicts",
      profileVersion: 1,
      criterionId: "contradictory-claims",
      candidates: [],
    });

    await expect(
      precisionRuntime.listRepositoryEvidenceCandidates({
        workspaceId: "workspace-a",
        indexId: "repo-index-precision",
        profileId: "documentation-conflicts",
        profileVersion: 1,
        criterionId: "duplicate-authority",
      }),
    ).resolves.toEqual({
      indexId: "repo-index-precision",
      profileId: "documentation-conflicts",
      profileVersion: 1,
      criterionId: "duplicate-authority",
      candidates: [],
    });

    await expect(
      precisionRuntime.listRepositoryEvidenceCandidates({
        workspaceId: "workspace-a",
        indexId: "repo-index-precision",
        profileId: "documentation-conflicts",
        profileVersion: 1,
        criterionId: "missing-owner",
      }),
    ).resolves.toEqual({
      indexId: "repo-index-precision",
      profileId: "documentation-conflicts",
      profileVersion: 1,
      criterionId: "missing-owner",
      candidates: [],
    });
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
    ).resolves.toEqual({
      indexId: "repo-index-stale",
      profileId: "documentation-conflicts",
      profileVersion: 1,
      criterionId: "stale-documentation",
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
    });
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
    ).resolves.toEqual({
      indexId: "repo-index-legacy-authority",
      profileId: "documentation-conflicts",
      profileVersion: 1,
      criterionId: "stale-documentation",
      candidates: [],
    });
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
    ).resolves.toEqual({
      indexId: "repo-index-unicode-heading",
      profileId: "documentation-conflicts",
      profileVersion: 1,
      criterionId: "broken-references",
      candidates: [],
    });
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
    };
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
        text: "# Architecture\nThis document is the single source of truth for ownership.\nSee [Missing Guide](missing.md).\nSee [Guide section](guide.md#missing-section).",
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
        text: "# Guide\nCanonical workflow owner guidance lives here.\n## Existing Section",
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
