import { beforeEach, describe, expect, it } from "vitest";

import { type EmbeddingProvider, type RepositoryIndexExecutor, HiveMapRuntime } from "@hivemap/runtime";
import { InMemoryHiveMapStore } from "@hivemap/storage";

import { HIVEMAP_MCP_TOOL_NAMES, assertKnownMcpTool, handleMcpTool } from "./index.js";

let runtime: HiveMapRuntime;

beforeEach(async () => {
  const store = new InMemoryHiveMapStore();
  await store.initialize();
  runtime = new HiveMapRuntime({
    store,
    embeddingProviders: { test: createTestEmbeddingProvider() },
    repositoryIndexExecutor: createTestRepositoryIndexExecutor(),
  });
});

describe("MCP tool adapter", () => {
  it("exposes the required alpha tool names", () => {
    expect(HIVEMAP_MCP_TOOL_NAMES).toEqual([
      "workspace_list",
      "workspace_get",
      "workspace_resolve",
      "project_create",
      "graph_get",
      "repository_index_list",
      "repository_index_get",
      "repository_index_start",
      "repository_index_execute",
      "repository_search",
      "repository_evidence_candidates",
      "scan_boundary_map_build",
      "scan_profile_overlay_help",
      "concept_embedding_upsert",
      "concept_embedding_refresh",
      "concept_embedding_backfill",
      "concept_similar_list",
      "graph_command",
      "category_assign",
      "projection_get",
      "projection_create",
      "feedback_list",
      "proposal_create",
      "proposal_approve",
      "proposal_apply",
      "scan_profile_list",
      "scan_list",
      "scan_start",
      "scan_record_coverage",
      "scan_calibration_decide",
      "scan_finding_create",
      "finding_update",
      "scan_complete",
      "scan_compare",
      "workspace_export_zip",
      "workspace_import_zip",
    ]);
  });

  it("rejects unknown tool names", () => {
    expect(() => assertKnownMcpTool("node_upsert")).toThrow("Unknown MCP tool");
  });

  it("creates a project and applies graph commands through runtime", async () => {
    const createResult = await handleMcpTool(runtime, "project_create", {
      workspace: {
        id: "workspace-a",
        slug: "alpha",
        name: "Alpha",
        createdAt: "2026-05-13T21:00:00.000Z",
        updatedAt: "2026-05-13T21:00:00.000Z",
      },
    });

    expect(createResult).toEqual({
      ok: true,
      tool: "project_create",
      value: {
        workspace: {
          id: "workspace-a",
          slug: "alpha",
          name: "Alpha",
          createdAt: "2026-05-13T21:00:00.000Z",
          updatedAt: "2026-05-13T21:00:00.000Z",
        },
      },
    });

    const commandResult = await handleMcpTool(runtime, "graph_command", {
      workspaceId: "workspace-a",
      commands: [
        {
          id: "cmd-a",
          type: "node.create",
          payload: { node: { id: "node-a", label: "Alpha", type: "concept" } },
        },
      ],
    });

    expect(commandResult).toEqual({
      ok: true,
      tool: "graph_command",
      value: {
        graph: {
          nodes: [{ id: "node-a", label: "Alpha", type: "concept" }],
          edges: [],
        },
      },
    });
  });

  it("starts repository index jobs through shared runtime", async () => {
    const createResult = await handleMcpTool(runtime, "project_create", {
      workspace: {
        id: "workspace-a",
        name: "Alpha",
        createdAt: "2026-05-13T21:00:00.000Z",
      },
    });
    expect(createResult.ok).toBe(true);

    await expect(
      handleMcpTool(runtime, "repository_index_start", {
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
      ok: true,
      tool: "repository_index_start",
      value: {
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
      },
    });
  });

  it("executes and searches repository indexes through MCP handlers", async () => {
    await handleMcpTool(runtime, "project_create", {
      workspace: {
        id: "workspace-a",
        name: "Alpha",
        createdAt: "2026-05-13T21:00:00.000Z",
      },
    });
    await handleMcpTool(runtime, "repository_index_start", {
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

    await expect(
      handleMcpTool(runtime, "repository_index_execute", {
        workspaceId: "workspace-a",
        indexId: "repo-index-a",
      }),
    ).resolves.toEqual({
      ok: true,
      tool: "repository_index_execute",
      value: {
        index: expect.objectContaining({
          id: "repo-index-a",
          stage: "completed",
          resolvedCommit: expect.stringMatching(/^[0-9a-f]{40}$/),
        }),
      },
    });

    await expect(
      handleMcpTool(runtime, "repository_search", {
        workspaceId: "workspace-a",
        indexId: "repo-index-a",
        query: "single source truth",
        limit: 5,
      }),
    ).resolves.toEqual({
      ok: true,
      tool: "repository_search",
      value: {
        indexId: "repo-index-a",
        query: "single source truth",
        hits: expect.arrayContaining([
          expect.objectContaining({
            kind: "chunk",
            filePath: "docs/architecture.md",
          }),
        ]),
      },
    });
  });

  it("creates projections and assigns categories through shared contracts", async () => {
    await createWorkspaceWithNode();

    const projectionResult = await handleMcpTool(runtime, "projection_create", {
      workspaceId: "workspace-a",
      input: {
        id: "projection-a",
        name: "Overview",
        maxNodes: 1,
      },
    });
    expect(projectionResult.ok).toBe(true);

    const assignmentResult = await handleMcpTool(runtime, "category_assign", {
      workspaceId: "workspace-a",
      assignment: {
        id: "assignment-a",
        targetType: "node",
        targetId: "node-a",
        categoryId: "confirmed",
        status: "active",
        provenance: "human",
      },
    });

    expect(assignmentResult).toEqual({
      ok: true,
      tool: "category_assign",
      value: {
        assignments: [
          {
            id: "assignment-a",
            targetType: "node",
            targetId: "node-a",
            categoryId: "confirmed",
            status: "active",
            provenance: "human",
          },
        ],
      },
    });
  });

  it("returns repository evidence candidates through shared contracts", async () => {
    await handleMcpTool(runtime, "project_create", {
      workspace: {
        id: "workspace-a",
        name: "Alpha",
        createdAt: "2026-05-13T21:00:00.000Z",
      },
    });
    await handleMcpTool(runtime, "repository_index_start", {
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
    await handleMcpTool(runtime, "repository_index_execute", {
      workspaceId: "workspace-a",
      indexId: "repo-index-a",
    });

    await expect(
      handleMcpTool(runtime, "repository_evidence_candidates", {
        workspaceId: "workspace-a",
        indexId: "repo-index-a",
        profileId: "documentation-conflicts",
        profileVersion: 1,
        criterionId: "broken-references",
      }),
    ).resolves.toEqual({
      ok: true,
      tool: "repository_evidence_candidates",
      value: expect.objectContaining({
        indexId: "repo-index-a",
        profileId: "documentation-conflicts",
        profileVersion: 1,
        criterionId: "broken-references",
        calibrationAssessment: expect.objectContaining({
          classification: "missing-evidence",
        }),
        candidates: [],
        overlay: expect.objectContaining({
          status: "missing",
          guidanceTool: "scan_profile_overlay_help",
          overlayPath: ".hivemap/scan-profiles/documentation-conflicts.yaml",
        }),
      }),
    });
  });

  it("returns scan profile overlay help through shared runtime", async () => {
    await handleMcpTool(runtime, "project_create", {
      workspace: {
        id: "workspace-a",
        name: "Alpha",
        createdAt: "2026-05-13T21:00:00.000Z",
      },
    });

    await expect(
      handleMcpTool(runtime, "scan_profile_overlay_help", {
        workspaceId: "workspace-a",
        profileId: "code-quality-review",
        profileVersion: 1,
      }),
    ).resolves.toEqual({
      ok: true,
      tool: "scan_profile_overlay_help",
      value: expect.objectContaining({
        profileId: "code-quality-review",
        profileVersion: 1,
        overlayPath: ".hivemap/scan-profiles/code-quality.yaml",
        guidanceTool: "scan_profile_overlay_help",
      }),
    });
  });

  it("stores concept embeddings and returns similar concept suggestions through MCP", async () => {
    await createWorkspaceWithNode();
    await handleMcpTool(runtime, "graph_command", {
      workspaceId: "workspace-a",
      commands: [
        {
          id: "cmd-b",
          type: "node.create",
          payload: { node: { id: "node-b", label: "Beta", type: "concept" } },
        },
      ],
    });

    await handleMcpTool(runtime, "concept_embedding_upsert", {
      workspaceId: "workspace-a",
      nodeId: "node-a",
      embedding: {
        model: "nomic-embed-text",
        values: [1, 0],
        updatedAt: "2026-08-19T22:30:00.000Z",
      },
    });
    await handleMcpTool(runtime, "concept_embedding_upsert", {
      workspaceId: "workspace-a",
      nodeId: "node-b",
      embedding: {
        model: "nomic-embed-text",
        values: [0.8, 0.2],
        updatedAt: "2026-08-19T22:30:00.000Z",
      },
    });

    await expect(
      handleMcpTool(runtime, "concept_similar_list", {
        workspaceId: "workspace-a",
        nodeId: "node-a",
        model: "nomic-embed-text",
        limit: 1,
      }),
    ).resolves.toEqual({
      ok: true,
      tool: "concept_similar_list",
      value: {
        sourceNodeId: "node-a",
        model: "nomic-embed-text",
        matches: [
          {
            nodeId: "node-b",
            label: "Beta",
            score: expect.any(Number),
            updatedAt: "2026-08-19T22:30:00.000Z",
          },
        ],
      },
    });
  });

  it("refreshes and backfills concept embeddings through MCP", async () => {
    await createWorkspaceWithNode();
    await handleMcpTool(runtime, "graph_command", {
      workspaceId: "workspace-a",
      commands: [
        {
          id: "cmd-b",
          type: "node.create",
          payload: { node: { id: "node-b", label: "Beta", notes: "near alpha", type: "concept" } },
        },
      ],
    });

    await expect(
      handleMcpTool(runtime, "concept_embedding_refresh", {
        workspaceId: "workspace-a",
        nodeId: "node-a",
        model: "test:nomic-embed-text",
      }),
    ).resolves.toEqual({
      ok: true,
      tool: "concept_embedding_refresh",
      value: {
        embedding: {
          workspaceId: "workspace-a",
          nodeId: "node-a",
          model: "test:nomic-embed-text",
          dimensions: 2,
          contentDigest: expect.any(String),
          updatedAt: expect.any(String),
        },
        provider: "test",
        status: "refreshed",
      },
    });

    await expect(
      handleMcpTool(runtime, "concept_embedding_backfill", {
        workspaceId: "workspace-a",
        model: "test:nomic-embed-text",
      }),
    ).resolves.toEqual({
      ok: true,
      tool: "concept_embedding_backfill",
      value: {
        workspaceId: "workspace-a",
        model: "test:nomic-embed-text",
        provider: "test",
        summary: {
          totalConcepts: 2,
          selectedConcepts: 2,
          refreshed: 1,
          unchanged: 1,
        },
        results: [
          {
            nodeId: "node-a",
            label: "Alpha",
            status: "unchanged",
            dimensions: 2,
            contentDigest: expect.any(String),
            updatedAt: expect.any(String),
          },
          {
            nodeId: "node-b",
            label: "Beta",
            status: "refreshed",
            dimensions: 2,
            contentDigest: expect.any(String),
            updatedAt: expect.any(String),
          },
        ],
      },
    });
  });

  it("returns visible tool errors without silent fallback", async () => {
    const result = await handleMcpTool(runtime, "graph_get", { workspaceId: "missing" });

    expect(result).toEqual({
      ok: false,
      tool: "graph_get",
      error: {
        code: "STORAGE_ERROR",
        message: "Workspace not found: missing",
      },
    });
  });

  it("discovers and resolves workspaces through MCP tools", async () => {
    await handleMcpTool(runtime, "project_create", {
      workspace: {
        id: "workspace-a",
        slug: "caravanworld",
        name: "Caravan World",
        createdAt: "2026-05-13T21:00:00.000Z",
        updatedAt: "2026-07-17T10:00:00.000Z",
      },
    });

    await expect(handleMcpTool(runtime, "workspace_list", { query: "caravan" })).resolves.toEqual({
      ok: true,
      tool: "workspace_list",
      value: {
        items: [{ id: "workspace-a", slug: "caravanworld", name: "Caravan World", updatedAt: "2026-07-17T10:00:00.000Z" }],
      },
    });

    await expect(handleMcpTool(runtime, "workspace_resolve", { ref: "caravanworld" })).resolves.toEqual({
      ok: true,
      tool: "workspace_resolve",
      value: {
        workspace: { id: "workspace-a", slug: "caravanworld", name: "Caravan World", updatedAt: "2026-07-17T10:00:00.000Z" },
      },
    });
  });

  it("returns machine-readable ambiguity details for workspace resolution", async () => {
    await handleMcpTool(runtime, "project_create", {
      workspace: {
        id: "workspace-a",
        slug: "alpha-a",
        name: "Alpha",
        createdAt: "2026-05-13T21:00:00.000Z",
        updatedAt: "2026-05-13T21:00:00.000Z",
      },
    });
    await handleMcpTool(runtime, "project_create", {
      workspace: {
        id: "workspace-b",
        slug: "alpha-b",
        name: "Alpha",
        createdAt: "2026-05-13T21:00:00.000Z",
        updatedAt: "2026-05-13T21:00:00.000Z",
      },
    });

    await expect(handleMcpTool(runtime, "workspace_resolve", { ref: "Alpha" })).resolves.toEqual({
      ok: false,
      tool: "workspace_resolve",
      error: {
        code: "workspace_ambiguous",
        message: "Workspace reference is ambiguous: Alpha",
        details: {
          ref: "Alpha",
          candidates: [
            { id: "workspace-a", slug: "alpha-a", name: "Alpha", updatedAt: "2026-05-13T21:00:00.000Z" },
            { id: "workspace-b", slug: "alpha-b", name: "Alpha", updatedAt: "2026-05-13T21:00:00.000Z" },
          ],
        },
      },
    });
  });

  it("starts an instructed agent scan through MCP", async () => {
    await createWorkspaceWithNode();
    await createCompletedRepositoryIndex();

    const result = await handleMcpTool(runtime, "scan_start", {
      workspaceId: "workspace-a",
      scan: {
        id: "scan-a",
        profileId: "documentation-conflicts",
        profileVersion: 1,
        repositoryIndexId: "repo-index-scan",
        actor: { agentId: "agent-a", tool: "codex" },
        startedAt: "2026-07-17T10:00:00.000Z",
      },
    });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.run.status).toBe("in_progress");
      expect(result.value.workflowPhase).toBe("calibration");
      expect(result.value.calibrationChecklist).toEqual(
        expect.arrayContaining([expect.stringContaining("Confirm profile identity: documentation-conflicts@1.")]),
      );
      expect(result.value.calibrationAssessment).toEqual(
        expect.objectContaining({
          classification: "findings-ready",
          confidence: "medium",
        }),
      );
      expect(result.value.decisionGuidance).toEqual(
        expect.objectContaining({
          decisionRequired: true,
          recommendedDecisions: ["continue"],
        }),
      );
      expect(result.value.run.repository).toMatchObject({
        repositoryIndexId: "repo-index-scan",
        root: "index:repo-index-scan",
        branch: "main",
      });
      expect(result.value.run.coverage?.included).toEqual(["docs/architecture.md"]);
      expect(result.value.overlay.guidanceTool).toBe("scan_profile_overlay_help");
      expect(result.value.instructions).toContainEqual(
        expect.stringContaining("Calibration checkpoint: before creating findings"),
      );
      expect(result.value.instructions).toContainEqual(
        expect.stringContaining("Use the repository-index-derived coverage already attached to this run"),
      );
    }
  });

  it("builds a candidate boundary map for an in-progress code scan through MCP", async () => {
    await createWorkspaceWithNode();
    await createCompletedRepositoryIndex();

    await handleMcpTool(runtime, "scan_start", {
      workspaceId: "workspace-a",
      scan: {
        id: "scan-boundary",
        profileId: "code-quality-review",
        profileVersion: 1,
        repositoryIndexId: "repo-index-scan",
        actor: { agentId: "agent-a", tool: "codex" },
        startedAt: "2026-08-20T12:10:00.000Z",
      },
    });
    await handleMcpTool(runtime, "scan_calibration_decide", {
      workspaceId: "workspace-a",
      scanId: "scan-boundary",
      decision: "build-boundary-map",
      rationale: "The code scan needs a structural pass before findings.",
      recordedAt: "2026-08-20T12:10:30.000Z",
    });

    await expect(handleMcpTool(runtime, "scan_boundary_map_build", { workspaceId: "workspace-a", scanId: "scan-boundary" })).resolves.toEqual({
      ok: true,
      tool: "scan_boundary_map_build",
      value: expect.objectContaining({
        scanId: "scan-boundary",
        profileId: "code-quality-review",
        calibrationAssessment: expect.objectContaining({
          classification: "ambiguous-shape",
        }),
        boundaryMap: expect.objectContaining({
          boundaries: [
            expect.objectContaining({
              id: "module:src",
              ownedPaths: ["src/index.ts"],
            }),
          ],
        }),
      }),
    });
  });
});

async function createWorkspaceWithNode(): Promise<void> {
  await handleMcpTool(runtime, "project_create", {
    workspace: {
      id: "workspace-a",
      slug: "alpha",
      name: "Alpha",
      createdAt: "2026-05-13T21:00:00.000Z",
      updatedAt: "2026-05-13T21:00:00.000Z",
    },
  });
  await handleMcpTool(runtime, "graph_command", {
    workspaceId: "workspace-a",
    commands: [
      {
        id: "cmd-a",
        type: "node.create",
        payload: { node: { id: "node-a", label: "Alpha", type: "concept" } },
      },
    ],
  });
}

async function createCompletedRepositoryIndex(): Promise<void> {
  await handleMcpTool(runtime, "repository_index_start", {
    workspaceId: "workspace-a",
    index: {
      id: "repo-index-scan",
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
  await handleMcpTool(runtime, "repository_index_execute", {
    workspaceId: "workspace-a",
    indexId: "repo-index-scan",
  });
}

function createTestEmbeddingProvider(): EmbeddingProvider {
  return {
    id: "test",
    async embed(request) {
      return request.inputs.map((input) => (input.includes("Alpha") ? [1, 0] : [0.9, 0.1]));
    },
  };
}

function createTestRepositoryIndexExecutor(): RepositoryIndexExecutor {
  return async ({ workspaceId, indexId }) => ({
    resolvedCommit: "0123456789abcdef0123456789abcdef01234567",
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
        text: "The system keeps a single source of truth for ownership and concept evidence.",
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
  });
}
