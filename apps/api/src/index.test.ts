import type { IncomingHttpHeaders, ServerResponse } from "node:http";
import { Readable } from "node:stream";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { type RepositoryIndexExecutor } from "@hivemap/runtime";
import { InMemoryHiveMapStore } from "@hivemap/storage";

import { createApiRequestHandler, createApiServer, type ApiRequestHandler } from "./index.js";

let store: InMemoryHiveMapStore;
let handleRequest: ApiRequestHandler;

beforeEach(async () => {
  store = new InMemoryHiveMapStore();
  await store.initialize();
  handleRequest = createApiRequestHandler({
    store,
    authToken: "test-token",
    repositoryIndexExecutor: createTestRepositoryIndexExecutor(),
  });
});

afterEach(async () => {
  vi.restoreAllMocks();
  await store.close();
});

describe("api server", () => {
  it("keeps health public and protects REST and MCP with the same bearer token", async () => {
    const connectionProbe = vi.spyOn(store, "checkConnection");
    const healthResponse = await request(handleRequest, "/health", { headers: { authorization: "" } });
    expect(healthResponse.status).toBe(200);
    expect(parseJson(healthResponse)).toEqual({ status: "ok" });
    expect(connectionProbe).toHaveBeenCalledOnce();

    const restResponse = await request(handleRequest, "/workspaces", { headers: { authorization: "" } });
    expect(restResponse.status).toBe(401);
    expect(parseJson(restResponse)).toEqual({ error: { code: "UNAUTHORIZED", message: "Unauthorized" } });

    const mcpResponse = await request(handleRequest, "/mcp", {
      method: "POST",
      headers: { authorization: "Bearer wrong-token", "content-type": "application/json" },
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "initialize", params: {} }),
    });
    expect(mcpResponse.status).toBe(401);
  });

  it("returns a sanitized 503 when storage is unavailable", async () => {
    const infrastructureError = new Error("connect ECONNREFUSED postgres://operator:secret@database:5432/hivemap");
    vi.spyOn(store, "checkConnection").mockRejectedValue(infrastructureError);
    vi.spyOn(store, "listWorkspaces").mockRejectedValue(infrastructureError);

    const healthResponse = await request(handleRequest, "/health", { headers: { authorization: "" } });
    expect(healthResponse.status).toBe(503);
    expect(parseJson(healthResponse)).toEqual({
      error: {
        code: "STORAGE_UNAVAILABLE",
        message: "HiveMap storage is unavailable",
      },
    });
    expect(healthResponse.body.toString("utf8")).not.toContain("ECONNREFUSED");
    expect(healthResponse.body.toString("utf8")).not.toContain("secret");

    const workspaceResponse = await request(handleRequest, "/workspaces");
    expect(workspaceResponse.status).toBe(503);
    expect(parseJson(workspaceResponse)).toEqual({
      error: {
        code: "STORAGE_UNAVAILABLE",
        message: "HiveMap storage is unavailable",
      },
    });
    expect(workspaceResponse.body.toString("utf8")).not.toContain("ECONNREFUSED");
    expect(workspaceResponse.body.toString("utf8")).not.toContain("secret");
  });

  it("fails fast when the auth token is empty", () => {
    expect(() => createApiRequestHandler({ store, authToken: "" })).toThrow("HiveMap API requires a non-empty auth token");
  });

  it("routes an authorized MCP initialization request through Streamable HTTP", async () => {
    const server = createApiServer({ store, authToken: "test-token" });
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    const address = server.address();
    if (address === null || typeof address === "string") {
      throw new Error("Expected an allocated TCP port for the API test server");
    }

    try {
      const response = await fetch(`http://127.0.0.1:${address.port}/mcp`, {
        method: "POST",
        headers: {
          accept: "application/json, text/event-stream",
          authorization: "Bearer test-token",
          "content-type": "application/json",
        },
        body: JSON.stringify({
          jsonrpc: "2.0",
          id: 1,
          method: "initialize",
          params: {
            protocolVersion: "2025-03-26",
            capabilities: {},
            clientInfo: { name: "hivemap-api-test", version: "0.1.0" },
          },
        }),
      });

      expect(response.status).toBe(200);
      expect(await response.text()).toContain("hivemap");
    } finally {
      await new Promise<void>((resolve, reject) => {
        server.close((error) => error === undefined ? resolve() : reject(error));
      });
    }
  });

  it("applies an authorized MCP tool call to the state read by REST", async () => {
    const server = createApiServer({ store, authToken: "test-token" });
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    const address = server.address();
    if (address === null || typeof address === "string") {
      throw new Error("Expected an allocated TCP port for the API test server");
    }
    const baseUrl = `http://127.0.0.1:${address.port}`;
    const client = new Client({ name: "hivemap-shared-state-test", version: "0.1.0" });
    const transport = new StreamableHTTPClientTransport(new URL(`${baseUrl}/mcp`), {
      requestInit: { headers: { authorization: "Bearer test-token" } },
    });

    try {
      await client.connect(transport as unknown as Parameters<typeof client.connect>[0]);
      const result = await client.callTool({
        name: "project_create",
        arguments: {
          workspace: {
            id: "mcp-workspace",
            name: "Created over MCP",
            createdAt: "2026-08-26T12:00:00.000Z",
          },
        },
      });
      expect(result.isError).not.toBe(true);

      const response = await fetch(`${baseUrl}/workspaces/mcp-workspace`, {
        headers: { authorization: "Bearer test-token" },
      });
      expect(response.status).toBe(200);
      expect(await response.json()).toMatchObject({
        state: {
          workspace: { id: "mcp-workspace", name: "Created over MCP" },
          graph: { nodes: [], edges: [] },
        },
      });
    } finally {
      await client.close();
      await new Promise<void>((resolve, reject) => {
        server.close((error) => error === undefined ? resolve() : reject(error));
      });
    }
  });

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

  it("rejects finding lifecycle mutations through the generic REST graph-command route", async () => {
    await createWorkspace();

    const response = await postJson("/workspaces/workspace-a/commands", {
      commands: [{
        id: "cmd-finding",
        type: "node.create",
        payload: { node: { id: "finding-a", label: "Finding A", type: "finding" } },
      }],
    });

    expect(response.status).toBe(400);
    expect(parseJson(response)).toEqual({
      error: {
        code: "FINDING_LIFECYCLE_COMMAND_FORBIDDEN",
        message: "Finding node finding-a must use scan_finding_create, finding_update, scan_delete, or approved proposal creation",
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

  it("rejects server-local repository sources over REST", async () => {
    await createWorkspace();

    const response = await postJson("/workspaces/workspace-a/repository-indexes", {
      index: {
        id: "repo-index-local",
        repositoryUrl: "/srv/private-repository",
        mode: "safe",
        requestedAt: "2026-08-20T12:00:00.000Z",
        actor: { agentId: "codex", tool: "rest" },
      },
    });

    expect(response.status).toBe(400);
    expect(parseJson(response)).toEqual({
      error: {
        code: "LOCAL_REPOSITORY_SOURCE_NOT_ALLOWED",
        message: "Local repository paths are not allowed by this runtime",
      },
    });
  });

  it("rejects SSH repository sources over REST", async () => {
    await createWorkspace();

    const response = await postJson("/workspaces/workspace-a/repository-indexes", {
      index: {
        id: "repo-index-ssh",
        repositoryUrl: "ssh://git@example.com/org/repo.git",
        mode: "safe",
        requestedAt: "2026-08-20T12:00:00.000Z",
        actor: { agentId: "codex", tool: "rest" },
      },
    });

    expect(response.status).toBe(400);
    expect(parseJson(response)).toEqual({
      error: {
        code: "ApiContractValidationError",
        message: "index.repositoryUrl must use HTTPS for remote repositories",
      },
    });
  });

  it("executes a repository index and searches it through REST", async () => {
    await createWorkspace();
    const startResponse = await postJson("/workspaces/workspace-a/repository-indexes", {
      index: {
        id: "repo-index-a",
        repositoryUrl: "https://example.com/fixtures/repo.git",
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
            repositoryUrl: "https://example.com/fixtures/repo.git",
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
            repositoryUrl: "https://example.com/fixtures/repo.git",
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
        repositoryUrl: "https://example.com/fixtures/repo.git",
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

  it("returns a stable 400 for malformed path encoding", async () => {
    const response = await request(handleRequest, "/workspaces/workspace-a/scans/%not-encoded", { method: "DELETE" });

    expect(response.status).toBe(400);
    expect(parseJson(response)).toEqual({
      error: {
        code: "INVALID_PATH_ENCODING",
        message: "Invalid percent-encoding in path segment: %not-encoded",
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

  it("deletes an empty in-progress scan through REST", async () => {
    await createWorkspace();
    await createCompletedRepositoryIndex();
    const scanId = "scan/delete?draft#1";
    const encodedScanId = encodeURIComponent(scanId);
    await postJson("/workspaces/workspace-a/scans", {
      scan: {
        id: scanId,
        profileId: "documentation-conflicts",
        profileVersion: 1,
        repositoryIndexId: "repo-index-scan",
        actor: { agentId: "agent-a", tool: "codex" },
        startedAt: "2026-07-17T10:00:00.000Z",
      },
    });

    const deleteResponse = await request(handleRequest, `/workspaces/workspace-a/scans/${encodedScanId}`, { method: "DELETE" });
    expect(deleteResponse.status).toBe(200);
    expect(parseJson(deleteResponse)).toEqual({
      deletedScanId: scanId,
      deletedFindingNodeIds: [],
      deletedEdgeIds: [],
      deletedProjectionIds: [],
    });

    const scansResponse = await request(handleRequest, "/workspaces/workspace-a/scans");
    expect(parseJson(scansResponse)).toEqual({ runs: [] });
    const repeatedDelete = await request(handleRequest, `/workspaces/workspace-a/scans/${encodedScanId}`, { method: "DELETE" });
    expect(repeatedDelete.status).toBe(404);
    expect(parseJson(repeatedDelete)).toEqual({
      error: { code: "SCAN_NOT_FOUND", message: `Scan not found: ${scanId}`, details: { scanId } },
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

  it("lists workspaces", async () => {
    await createWorkspace();

    const listResponse = await request(handleRequest, "/workspaces");
    expect(listResponse.status).toBe(200);
    expect(parseJson(listResponse)).toEqual({
      workspaces: [{ id: "workspace-a", name: "Alpha", createdAt: "2026-05-13T21:00:00.000Z" }],
    });
  });

  it("rejects declared JSON request bodies above the transport limit", async () => {
    const jsonResponse = await request(handleRequest, "/workspaces", {
      method: "POST",
      headers: { "content-type": "application/json", "content-length": String(2 * 1024 * 1024 + 1) },
      body: "{}",
    });
    expect(jsonResponse.status).toBe(413);
    expect(parseJson(jsonResponse)).toEqual({
      error: { code: "PAYLOAD_TOO_LARGE", message: "JSON request body exceeds the 2 MiB limit" },
    });
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
      repositoryUrl: "https://example.com/fixtures/repo.git",
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
  const request = new MockRequest(
    init.method ?? "GET",
    pathname,
    { authorization: "Bearer test-token", ...init.headers },
    init.body,
  );
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
  readonly headers: Record<string, string>;
  private bodySent = false;
  private readonly body: Buffer | string | undefined;

  constructor(method: string, url: string, headers: Record<string, string>, body?: Buffer | string) {
    super();
    this.method = method;
    this.url = url;
    this.headers = headers;
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
