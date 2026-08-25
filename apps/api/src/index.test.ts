import { mkdtempSync, rmSync } from "node:fs";
import type { IncomingHttpHeaders, ServerResponse } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Readable } from "node:stream";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { type EmbeddingProvider, type RepositoryIndexExecutor } from "@hivemap/runtime";
import { InMemoryHiveMapStore } from "@hivemap/storage";

import { createApiRequestHandler, type ApiRequestHandler } from "./index.js";

let store: InMemoryHiveMapStore;
let handleRequest: ApiRequestHandler;

beforeEach(async () => {
  store = new InMemoryHiveMapStore();
  await store.initialize();
  handleRequest = createApiRequestHandler({
    store,
    embeddingProviders: { test: createTestEmbeddingProvider() },
    repositoryIndexExecutor: createTestRepositoryIndexExecutor(),
  });
});

afterEach(async () => {
  await store.close();
});

describe("api server", () => {
  it("creates a workspace and returns its empty graph", async () => {
    const createResponse = await postJson("/workspaces", {
      workspace: {
        id: "workspace-a",
        name: "Alpha",
        createdAt: "2026-05-13T21:00:00.000Z",
      },
    });

    expect(createResponse.status).toBe(201);
    expect(parseJson(createResponse)).toEqual({
      workspace: {
        id: "workspace-a",
        name: "Alpha",
        createdAt: "2026-05-13T21:00:00.000Z",
      },
    });

    const graphResponse = await request(handleRequest, "/workspaces/workspace-a/graph");
    expect(graphResponse.status).toBe(200);
    expect(parseJson(graphResponse)).toEqual({ graph: { nodes: [], edges: [] } });
  });

  it("applies graph commands through graph-core", async () => {
    await createWorkspace();

    const response = await postJson("/workspaces/workspace-a/commands", {
      commands: [
        {
          id: "cmd-a",
          type: "node.create",
          payload: { node: { id: "node-a", label: "Alpha", type: "concept" } },
        },
      ],
    });

    expect(response.status).toBe(200);
    expect(parseJson(response)).toEqual({
      graph: {
        nodes: [{ id: "node-a", label: "Alpha", type: "concept" }],
        edges: [],
      },
    });
  });

  it("starts and reads repository index jobs through REST", async () => {
    await createWorkspace();

    const createResponse = await postJson("/workspaces/workspace-a/repository-indexes", {
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
    });

    expect(createResponse.status).toBe(201);
    expect(parseJson(createResponse)).toEqual({
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

    const listResponse = await request(handleRequest, "/workspaces/workspace-a/repository-indexes");
    expect(listResponse.status).toBe(200);
    expect(parseJson(listResponse)).toEqual({
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

    const getResponse = await request(handleRequest, "/workspaces/workspace-a/repository-indexes/repo-index-a");
    expect(getResponse.status).toBe(200);
    expect(parseJson(getResponse)).toEqual({
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

  it("executes a repository index and searches it through REST", async () => {
    await createWorkspace();
    const startResponse = await postJson("/workspaces/workspace-a/repository-indexes", {
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
    expect(startResponse.status).toBe(201);

    const executeResponse = await postJson("/workspaces/workspace-a/repository-indexes/repo-index-a/execute", {});
    expect(executeResponse.status).toBe(200);
    expect(parseJson(executeResponse)).toEqual({
      index: expect.objectContaining({
        id: "repo-index-a",
        stage: "completed",
        resolvedCommit: expect.stringMatching(/^[0-9a-f]{40}$/),
        stats: {
          fileCount: 3,
          chunkCount: 2,
          indexedBytes: 208,
        },
      }),
    });

    const searchResponse = await request(
      handleRequest,
      "/workspaces/workspace-a/repository-indexes/repo-index-a/search?query=single%20source%20truth&limit=5",
    );
    expect(searchResponse.status).toBe(200);
    expect(parseJson(searchResponse)).toEqual({
      indexId: "repo-index-a",
      query: "single source truth",
      hits: expect.arrayContaining([
        expect.objectContaining({
          kind: "chunk",
          filePath: "docs/architecture.md",
          sourceKind: "documentation",
        }),
      ]),
    });
  });

  it("builds a candidate boundary map for an in-progress code scan through REST", async () => {
    await createWorkspace();
    expect(
      (
        await postJson("/workspaces/workspace-a/repository-indexes", {
          index: {
            id: "repo-index-boundary",
            repositoryUrl: "/fixtures/repo",
            requestedRef: "main",
            mode: "safe",
            requestedAt: "2026-08-20T12:00:00.000Z",
            actor: {
              agentId: "codex",
              tool: "mcp",
            },
          },
        })
      ).status,
    ).toBe(201);
    expect((await postJson("/workspaces/workspace-a/repository-indexes/repo-index-boundary/execute", {})).status).toBe(200);

    const scanStartResponse = await postJson("/workspaces/workspace-a/scans", {
      scan: {
        id: "scan-boundary",
        profileId: "code-quality-review",
        profileVersion: 1,
        repositoryIndexId: "repo-index-boundary",
        actor: { agentId: "agent-a", tool: "codex" },
        startedAt: "2026-08-20T12:10:00.000Z",
      },
    });
    expect(scanStartResponse.status).toBe(201);
    expect(
      (
        await postJson("/workspaces/workspace-a/scans/scan-boundary/calibration-decision", {
          decision: "build-boundary-map",
          rationale: "The code scan needs a structural pass before findings.",
          recordedAt: "2026-08-20T12:10:30.000Z",
        })
      ).status,
    ).toBe(200);

    const boundaryMapResponse = await request(handleRequest, "/workspaces/workspace-a/scans/scan-boundary/boundary-map");
    expect(boundaryMapResponse.status).toBe(200);
    expect(parseJson(boundaryMapResponse)).toEqual(
      expect.objectContaining({
        scanId: "scan-boundary",
        profileId: "code-quality-review",
        profileVersion: 1,
        repositoryIndexId: "repo-index-boundary",
        coverageSummary: expect.objectContaining({
          includedCodeFileCount: 1,
        }),
        boundaryMap: expect.objectContaining({
          boundaries: [
            expect.objectContaining({
              id: "module:src",
              ownedPaths: ["src/index.ts"],
            }),
          ],
        }),
        calibrationAssessment: expect.objectContaining({
          classification: "ambiguous-shape",
          confidence: "high",
        }),
        decisionGuidance: expect.objectContaining({
          decisionRequired: true,
          recommendedDecisions: ["build-boundary-map", "refine-overlay", "restart-scan"],
        }),
      }),
    );

    const overlaySuggestionResponse = await postJson("/workspaces/workspace-a/scans/scan-boundary/overlay-suggestion", {
      symptomId: "scope-roots",
    });
    expect(overlaySuggestionResponse.status).toBe(200);
    expect(parseJson(overlaySuggestionResponse)).toEqual(
      expect.objectContaining({
        scanId: "scan-boundary",
        recommendedDecision: "refine-overlay",
        symptom: expect.objectContaining({ id: "scope-roots" }),
        suggestedFields: expect.arrayContaining([
          expect.objectContaining({ name: "include" }),
          expect.objectContaining({ name: "boundaryMapRoots" }),
        ]),
      }),
    );
  });

  it("returns 409 when boundary map build skips the explicit calibration decision", async () => {
    await createWorkspace();
    expect(
      (
        await postJson("/workspaces/workspace-a/repository-indexes", {
          index: {
            id: "repo-index-boundary-missing-decision",
            repositoryUrl: "/fixtures/repo",
            requestedRef: "main",
            mode: "safe",
            requestedAt: "2026-08-20T12:00:00.000Z",
            actor: {
              agentId: "codex",
              tool: "mcp",
            },
          },
        })
      ).status,
    ).toBe(201);
    expect(
      (await postJson("/workspaces/workspace-a/repository-indexes/repo-index-boundary-missing-decision/execute", {})).status,
    ).toBe(200);

    const scanStartResponse = await postJson("/workspaces/workspace-a/scans", {
      scan: {
        id: "scan-boundary-missing-decision",
        profileId: "code-quality-review",
        profileVersion: 1,
        repositoryIndexId: "repo-index-boundary-missing-decision",
        actor: { agentId: "agent-a", tool: "codex" },
        startedAt: "2026-08-20T12:10:00.000Z",
      },
    });
    expect(scanStartResponse.status).toBe(201);

    const boundaryMapResponse = await request(
      handleRequest,
      "/workspaces/workspace-a/scans/scan-boundary-missing-decision/boundary-map",
    );
    expect(boundaryMapResponse.status).toBe(409);
    expect(parseJson(boundaryMapResponse)).toEqual({
      error: {
        code: "SCAN_CALIBRATION_DECISION_REQUIRED",
        message:
          "Building a boundary map requires explicit calibration decision build-boundary-map for scan scan-boundary-missing-decision",
        details: {
          scanId: "scan-boundary-missing-decision",
          requiredDecision: "build-boundary-map",
        },
      },
    });
  });

  it("rejects action routes with unexpected extra path segments", async () => {
    await createWorkspace();
    const startResponse = await postJson("/workspaces/workspace-a/repository-indexes", {
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
    expect(startResponse.status).toBe(201);

    const response = await postJson("/workspaces/workspace-a/repository-indexes/repo-index-a/execute/extra", {});

    expect(response.status).toBe(404);
    expect(parseJson(response)).toEqual({
      error: {
        code: "ROUTE_NOT_FOUND",
        message: "Unknown route: POST /workspaces/workspace-a/repository-indexes/repo-index-a/execute/extra",
      },
    });
  });

  it("returns a stable 400 for malformed JSON bodies", async () => {
    const response = await request(handleRequest, "/workspaces", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: Buffer.from('{"workspace":', "utf8"),
    });

    expect(response.status).toBe(400);
    expect(parseJson(response)).toEqual({
      error: {
        code: "INVALID_JSON",
        message: "Request body must be valid JSON",
      },
    });
  });

  it("records feedback without mutating the graph", async () => {
    await createWorkspace();

    const response = await postJson("/workspaces/workspace-a/feedback", {
      feedbackEvent: {
        id: "feedback-a",
        createdAt: "2026-05-13T21:01:00.000Z",
        type: "map_comment",
        payload: { text: "Group this" },
      },
    });

    expect(response.status).toBe(201);
    expect(parseJson(response)).toEqual({
      feedbackEvents: [
        {
          id: "feedback-a",
          createdAt: "2026-05-13T21:01:00.000Z",
          type: "map_comment",
          payload: { text: "Group this" },
        },
      ],
    });

    const graphResponse = await request(handleRequest, "/workspaces/workspace-a/graph");
    expect(parseJson(graphResponse)).toEqual({ graph: { nodes: [], edges: [] } });
  });

  it("creates projections over existing graph ids", async () => {
    await createWorkspaceWithNode();

    const response = await postJson("/workspaces/workspace-a/projections", {
      input: {
        id: "projection-a",
        name: "Overview",
        maxNodes: 1,
      },
    });

    expect(response.status).toBe(201);
    expect(parseJson(response)).toEqual({
      projection: {
        id: "projection-a",
        name: "Overview",
        type: "overview",
        rootNodeIds: [],
        visibleNodeIds: ["node-a"],
        visibleEdgeIds: [],
      },
    });
  });

  it("assigns categories through the category contract", async () => {
    await createWorkspaceWithNode();

    const response = await postJson("/workspaces/workspace-a/category-assignments", {
      assignment: {
        id: "assignment-a",
        targetType: "node",
        targetId: "node-a",
        categoryId: "confirmed",
        status: "active",
        provenance: "human",
      },
    });

    expect(response.status).toBe(201);
    expect(parseJson(response)).toEqual({
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
    });
  });

  it("stores concept embeddings and lists similar concepts through REST", async () => {
    await createWorkspaceWithNode();

    await postJson("/workspaces/workspace-a/commands", {
      commands: [
        {
          id: "cmd-b",
          type: "node.create",
          payload: { node: { id: "node-b", label: "Beta", notes: "near alpha", type: "concept" } },
        },
        {
          id: "cmd-c",
          type: "node.create",
          payload: { node: { id: "node-c", label: "Gamma", notes: "far alpha", type: "concept" } },
        },
      ],
    });

    const upsertResponse = await postJson("/workspaces/workspace-a/concepts/node-a/embedding", {
      embedding: {
        model: "nomic-embed-text",
        values: [1, 0],
        updatedAt: "2026-08-19T22:20:00.000Z",
      },
    });
    expect(upsertResponse.status).toBe(201);

    await postJson("/workspaces/workspace-a/concepts/node-b/embedding", {
      embedding: {
        model: "nomic-embed-text",
        values: [0.9, 0.1],
        updatedAt: "2026-08-19T22:20:00.000Z",
      },
    });
    await postJson("/workspaces/workspace-a/concepts/node-c/embedding", {
      embedding: {
        model: "nomic-embed-text",
        values: [0, 1],
        updatedAt: "2026-08-19T22:20:00.000Z",
      },
    });

    const similarResponse = await request(
      handleRequest,
      "/workspaces/workspace-a/concepts/node-a/similar?model=nomic-embed-text&limit=2&minScore=0",
    );
    expect(similarResponse.status).toBe(200);
    expect(parseJson(similarResponse)).toEqual({
      sourceNodeId: "node-a",
      model: "nomic-embed-text",
      matches: [
        {
          nodeId: "node-b",
          label: "Beta",
          score: expect.any(Number),
          updatedAt: "2026-08-19T22:20:00.000Z",
        },
        {
          nodeId: "node-c",
          label: "Gamma",
          score: expect.any(Number),
          updatedAt: "2026-08-19T22:20:00.000Z",
        },
      ],
    });
  });

  it("refreshes and backfills concept embeddings through REST", async () => {
    await createWorkspaceWithNode();

    await postJson("/workspaces/workspace-a/commands", {
      commands: [
        {
          id: "cmd-b",
          type: "node.create",
          payload: { node: { id: "node-b", label: "Beta", notes: "near alpha", type: "concept" } },
        },
      ],
    });

    const refreshResponse = await postJson("/workspaces/workspace-a/concepts/node-a/embedding-refresh", {
      model: "test:nomic-embed-text",
    });
    expect(refreshResponse.status).toBe(200);
    expect(parseJson(refreshResponse)).toEqual({
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
    });

    const backfillResponse = await postJson("/workspaces/workspace-a/concept-embeddings/backfill", {
      model: "test:nomic-embed-text",
    });
    expect(backfillResponse.status).toBe(200);
    expect(parseJson(backfillResponse)).toEqual({
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
    });
  });

  it("fails clearly for invalid graph commands", async () => {
    await createWorkspace();

    const response = await postJson("/workspaces/workspace-a/commands", {
      commands: [
        {
          id: "cmd-a",
          type: "edge.create",
          payload: { edge: { id: "edge-a", from: "missing", to: "also-missing", relation: "supports" } },
        },
      ],
    });

    expect(response.status).toBe(400);
    expect(parseJson(response)).toEqual({
      error: {
        code: "GraphValidationError",
        message: "Edge edge-a references missing source node: missing",
      },
    });
  });

  it("approves and applies proposals through separate endpoints", async () => {
    await createWorkspace();

    const proposalResponse = await postJson("/workspaces/workspace-a/proposals", {
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
    expect(proposalResponse.status).toBe(201);

    const approveResponse = await postJson("/workspaces/workspace-a/proposals/proposal-a/approve", {});
    expect(approveResponse.status).toBe(200);
    expect(parseJson(approveResponse)).toEqual({
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
        status: "approved",
      },
    });

    const applyResponse = await postJson("/workspaces/workspace-a/proposals/proposal-a/apply", {});
    expect(applyResponse.status).toBe(200);
    expect(parseJson(applyResponse) as unknown).toMatchObject({
      graph: {
        nodes: [{ id: "node-a", label: "Alpha", type: "concept" }],
        edges: [],
      },
      proposal: {
        id: "proposal-a",
        status: "applied",
      },
    });
  });

  it("exposes scan profiles and starts an auditable scan", async () => {
    await createWorkspace();
    await createCompletedRepositoryIndex();

    const profilesResponse = await request(handleRequest, "/workspaces/workspace-a/scan-profiles");
    expect(profilesResponse.status).toBe(200);
    expect((parseJson<{ profiles: Array<{ id: string }> }>(profilesResponse).profiles.map((profile) => profile.id))).toEqual([
      "documentation-conflicts",
      "code-quality-review",
    ]);

    const startResponse = await postJson("/workspaces/workspace-a/scans", {
      scan: {
        id: "scan-a",
        profileId: "documentation-conflicts",
        profileVersion: 1,
        repositoryIndexId: "repo-index-scan",
        actor: { agentId: "agent-a", tool: "codex" },
        startedAt: "2026-07-17T10:00:00.000Z",
      },
    });

    expect(startResponse.status).toBe(201);
    expect(parseJson(startResponse) as unknown).toMatchObject({
      run: {
        id: "scan-a",
        status: "in_progress",
        repository: {
          repositoryIndexId: "repo-index-scan",
          root: "index:repo-index-scan",
          branch: "main",
        },
        coverage: {
          included: ["docs/architecture.md"],
        },
      },
    });
  });

  it("returns repository evidence candidates through REST", async () => {
    await createWorkspace();
    await createCompletedRepositoryIndex();

    const response = await request(
      handleRequest,
      "/workspaces/workspace-a/repository-indexes/repo-index-scan/evidence-candidates?profileId=documentation-conflicts&profileVersion=1&criterionId=broken-references",
    );

    expect(response.status).toBe(200);
    expect(parseJson(response)).toEqual(
      expect.objectContaining({
        indexId: "repo-index-scan",
        profileId: "documentation-conflicts",
        profileVersion: 1,
        criterionId: "broken-references",
        candidates: [],
        overlay: expect.objectContaining({
          status: "missing",
          source: "defaults",
          applied: false,
        }),
        coverageSummary: expect.objectContaining({
          discoveredCount: 3,
          includedCount: 1,
          warnings: [],
        }),
      }),
    );
  });

  it("classifies a code-scan finding through REST before durable creation", async () => {
    await createWorkspace();
    await createCompletedRepositoryIndex();

    const startResponse = await postJson("/workspaces/workspace-a/scans", {
      scan: {
        id: "scan-validate",
        profileId: "code-quality-review",
        profileVersion: 1,
        repositoryIndexId: "repo-index-scan",
        actor: { agentId: "agent-a", tool: "codex" },
        startedAt: "2026-08-20T12:10:00.000Z",
      },
    });
    expect(startResponse.status).toBe(201);

    const response = await postJson("/workspaces/workspace-a/scans/scan-validate/finding-validation", {
      criterionId: "duplicate-responsibility",
    });

    expect(response.status).toBe(200);
    expect(parseJson(response)).toEqual(
      expect.objectContaining({
        scanId: "scan-validate",
        criterionId: "duplicate-responsibility",
        assessment: expect.objectContaining({
          classification: "ambiguous-shape",
        }),
      }),
    );
  });

  it("lists workspaces and round-trips a browser ZIP bundle", async () => {
    await createWorkspace();

    const listResponse = await request(handleRequest, "/workspaces");
    expect(listResponse.status).toBe(200);
    expect(parseJson(listResponse)).toEqual({
      workspaces: [{ id: "workspace-a", name: "Alpha", createdAt: "2026-05-13T21:00:00.000Z" }],
    });

    const exportResponse = await postJson("/workspaces/workspace-a/export-bundle", {
      exportedAt: "2026-07-17T12:00:00.000Z",
    });
    expect(exportResponse.status).toBe(200);
    expect(exportResponse.headers["content-type"]).toBe("application/zip");
    expect(exportResponse.headers["content-disposition"]).toBe('attachment; filename="workspace-a.hivemap.zip"');
    const zip = exportResponse.body;
    expect(new Uint8Array(zip).slice(0, 2)).toEqual(new Uint8Array([0x50, 0x4b]));

    await store.deleteWorkspace("workspace-a");
    const importResponse = await request(handleRequest, "/workspace-import-bundles?mode=new", {
      method: "POST",
      headers: { "content-type": "application/zip" },
      body: zip,
    });
    expect(importResponse.status).toBe(201);
    expect(parseJson(importResponse) as unknown).toMatchObject({ workspace: { id: "workspace-a", name: "Alpha" } });
    expect((await store.loadWorkspaceState("workspace-a")).workspace.name).toBe("Alpha");
  });
});

async function createWorkspace(): Promise<void> {
  const response = await postJson("/workspaces", {
    workspace: {
      id: "workspace-a",
      name: "Alpha",
      createdAt: "2026-05-13T21:00:00.000Z",
    },
  });
  expect(response.status).toBe(201);
}

async function createWorkspaceWithNode(): Promise<void> {
  await createWorkspace();
  const response = await postJson("/workspaces/workspace-a/commands", {
    commands: [
      {
        id: "cmd-a",
        type: "node.create",
        payload: { node: { id: "node-a", label: "Alpha", type: "concept" } },
      },
    ],
  });
  expect(response.status).toBe(200);
}

async function createCompletedRepositoryIndex(): Promise<void> {
  const startResponse = await postJson("/workspaces/workspace-a/repository-indexes", {
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
  expect(startResponse.status).toBe(201);

  const executeResponse = await postJson("/workspaces/workspace-a/repository-indexes/repo-index-scan/execute", {});
  expect(executeResponse.status).toBe(200);
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

async function postJson(pathname: string, body: unknown): Promise<Response> {
  return request(handleRequest, pathname, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

type Response = {
  status: number;
  headers: IncomingHttpHeaders;
  body: Buffer;
};

async function request(
  handleRequest: ApiRequestHandler,
  pathname: string,
  init: {
    method?: string;
    headers?: Record<string, string>;
    body?: Buffer | string;
  } = {},
): Promise<Response> {
  const request = new MockRequest(init.method ?? "GET", pathname, init.body);
  const response = new MockResponse();
  handleRequest(request as never, response as never);
  await response.done;
  return { status: response.statusCode, headers: response.headers, body: response.body };
}

function parseJson<T>(response: Response): T {
  return JSON.parse(response.body.toString("utf8")) as T;
}

class MockRequest extends Readable {
  readonly method: string;
  readonly url: string;
  private bodySent = false;
  private readonly body: Buffer | string | undefined;

  constructor(method: string, url: string, body?: Buffer | string) {
    super();
    this.method = method;
    this.url = url;
    this.body = body;
  }

  override _read(): void {
    if (this.bodySent) {
      return;
    }
    this.bodySent = true;
    if (this.body !== undefined) {
      this.push(this.body);
    }
    this.push(null);
  }
}

class MockResponse {
  statusCode = 200;
  headers: IncomingHttpHeaders = {};
  private readonly chunks: Buffer[] = [];
  private resolveDone!: () => void;
  readonly done = new Promise<void>((resolve) => {
    this.resolveDone = resolve;
  });

  writeHead(statusCode: number, headers: IncomingHttpHeaders): ServerResponse {
    this.statusCode = statusCode;
    this.headers = headers;
    return this as never;
  }

  end(chunk?: Buffer | string): this {
    if (chunk !== undefined) {
      this.chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
    }
    this.resolveDone();
    return this;
  }

  get body(): Buffer {
    return Buffer.concat(this.chunks);
  }
}
