import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { type RepositoryIndexExecutor, HiveMapRuntime } from "@hivemap/runtime";
import { InMemoryHiveMapStore } from "@hivemap/storage";

import { createHiveMapMcpServer } from "./sdk-server.js";

let client: Client;
let server: ReturnType<typeof createHiveMapMcpServer>;
let store: InMemoryHiveMapStore;

beforeEach(async () => {
  store = new InMemoryHiveMapStore();
  await store.initialize();
  server = createHiveMapMcpServer(
    new HiveMapRuntime({
      store,
      repositoryIndexExecutor: createTestRepositoryIndexExecutor(),
    }),
  );
  client = new Client({ name: "hivemap-test-client", version: "0.1.0" });
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  await Promise.all([server.connect(serverTransport), client.connect(clientTransport)]);
});

afterEach(async () => {
  await client.close();
  await server.close();
  await store.close();
});

describe("HiveMap MCP SDK server", () => {
  it("lists HiveMap tools through MCP", async () => {
    const result = await client.listTools();

    expect(result.tools.map((tool) => tool.name)).toEqual([
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
      "scan_profile_overlay_suggest",
      "concept_embedding_upsert",
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
      "scan_finding_validate",
      "scan_finding_create",
      "finding_update",
      "scan_complete",
      "scan_compare",
    ]);
    expect(result.tools.find((tool) => tool.name === "scan_start")?.description).toContain("calibration-phase response");
  });

  it("calls HiveMap tools through MCP transport", async () => {
    const createResult = await client.callTool({
      name: "project_create",
      arguments: {
        workspace: {
          id: "workspace-a",
          slug: "alpha",
          name: "Alpha",
          createdAt: "2026-05-13T21:00:00.000Z",
          updatedAt: "2026-05-13T21:00:00.000Z",
        },
      },
    });

    expect(createResult.structuredContent).toEqual({
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

    const listResult = await client.callTool({
      name: "workspace_list",
      arguments: { query: "alp" },
    });

    expect(listResult.structuredContent).toEqual({
      ok: true,
      tool: "workspace_list",
      value: {
        items: [{ id: "workspace-a", slug: "alpha", name: "Alpha", updatedAt: "2026-05-13T21:00:00.000Z" }],
      },
    });

    const resolveResult = await client.callTool({
      name: "workspace_resolve",
      arguments: { ref: "alpha" },
    });

    expect(resolveResult.structuredContent).toEqual({
      ok: true,
      tool: "workspace_resolve",
      value: {
        workspace: { id: "workspace-a", slug: "alpha", name: "Alpha", updatedAt: "2026-05-13T21:00:00.000Z" },
      },
    });

    const graphResult = await client.callTool({
      name: "graph_command",
      arguments: {
        workspaceId: "workspace-a",
        commands: [
          {
            id: "cmd-a",
            type: "node.create",
            payload: { node: { id: "node-a", label: "Alpha", type: "concept" } },
          },
        ],
      },
    });

    expect(graphResult.structuredContent).toEqual({
      ok: true,
      tool: "graph_command",
      value: {
        graph: {
          nodes: [{ id: "node-a", label: "Alpha", type: "concept" }],
          edges: [],
        },
      },
    });

    const repositoryIndexResult = await client.callTool({
      name: "repository_index_start",
      arguments: {
        workspaceId: "workspace-a",
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
      },
    });
    expect(repositoryIndexResult.structuredContent).toEqual({
      ok: true,
      tool: "repository_index_start",
      value: {
        index: {
          id: "repo-index-a",
          workspaceId: "workspace-a",
          repositoryUrl: "https://example.com/fixtures/repo.git",
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

    const executeResult = await client.callTool({
      name: "repository_index_execute",
      arguments: {
        workspaceId: "workspace-a",
        indexId: "repo-index-a",
      },
    });
    expect(executeResult.structuredContent).toEqual({
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

    const searchResult = await client.callTool({
      name: "repository_search",
      arguments: {
        workspaceId: "workspace-a",
        indexId: "repo-index-a",
        query: "single source truth",
        limit: 5,
      },
    });
    expect(searchResult.structuredContent).toEqual({
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

    const evidenceResult = await client.callTool({
      name: "repository_evidence_candidates",
      arguments: {
        workspaceId: "workspace-a",
        indexId: "repo-index-a",
        profileId: "documentation-conflicts",
        profileVersion: 1,
        criterionId: "broken-references",
      },
    });
    expect(evidenceResult.structuredContent).toEqual({
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
        }),
      }),
    });

    const scanStartResult = await client.callTool({
      name: "scan_start",
      arguments: {
        workspaceId: "workspace-a",
        scan: {
          id: "scan-boundary",
          profileId: "code-quality-review",
          profileVersion: 1,
          repositoryIndexId: "repo-index-a",
          actor: { agentId: "agent-a", tool: "codex" },
          startedAt: "2026-08-20T12:10:00.000Z",
        },
      },
    });
    expect(scanStartResult.structuredContent).toEqual({
      ok: true,
      tool: "scan_start",
      value: expect.objectContaining({
        run: expect.objectContaining({ id: "scan-boundary", status: "in_progress" }),
        workflowPhase: "calibration",
        calibrationChecklist: expect.arrayContaining([expect.stringContaining("Confirm profile identity: code-quality-review@1.")]),
        calibrationAssessment: expect.objectContaining({
          classification: "ambiguous-shape",
        }),
        decisionGuidance: expect.objectContaining({
          decisionRequired: true,
          recommendedDecisions: ["build-boundary-map", "refine-overlay", "restart-scan"],
        }),
      }),
    });

    const findingValidationResult = await client.callTool({
      name: "scan_finding_validate",
      arguments: {
        workspaceId: "workspace-a",
        scanId: "scan-boundary",
        criterionId: "duplicate-responsibility",
      },
    });
    expect(findingValidationResult.structuredContent).toEqual({
      ok: true,
      tool: "scan_finding_validate",
      value: expect.objectContaining({
        scanId: "scan-boundary",
        criterionId: "duplicate-responsibility",
        assessment: expect.objectContaining({
          classification: "ambiguous-shape",
        }),
      }),
    });

    const calibrationDecisionResult = await client.callTool({
      name: "scan_calibration_decide",
      arguments: {
        workspaceId: "workspace-a",
        scanId: "scan-boundary",
        decision: "build-boundary-map",
        rationale: "The code scan needs a structural pass before findings.",
        recordedAt: "2026-08-20T12:10:30.000Z",
      },
    });
    expect(calibrationDecisionResult.structuredContent).toEqual({
      ok: true,
      tool: "scan_calibration_decide",
      value: expect.objectContaining({
        recordedDecision: {
          decision: "build-boundary-map",
          rationale: "The code scan needs a structural pass before findings.",
          recordedAt: "2026-08-20T12:10:30.000Z",
        },
      }),
    });

    const boundaryMapResult = await client.callTool({
      name: "scan_boundary_map_build",
      arguments: {
        workspaceId: "workspace-a",
        scanId: "scan-boundary",
      },
    });
    expect(boundaryMapResult.structuredContent).toEqual({
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

    const overlayHelpResult = await client.callTool({
      name: "scan_profile_overlay_help",
      arguments: {
        workspaceId: "workspace-a",
        profileId: "code-quality-review",
        profileVersion: 1,
      },
    });
    expect(overlayHelpResult.structuredContent).toEqual({
      ok: true,
      tool: "scan_profile_overlay_help",
      value: expect.objectContaining({
        overlayPath: ".hivemap/scan-profiles/code-quality.yaml",
        guidanceTool: "scan_profile_overlay_help",
        overlayBuildWorkflow: expect.any(Array),
        symptomToFieldHints: expect.arrayContaining([
          expect.objectContaining({ id: "scope-roots", fields: expect.arrayContaining(["boundaryMapRoots"]) }),
        ]),
      }),
    });

    const overlaySuggestionResult = await client.callTool({
      name: "scan_profile_overlay_suggest",
      arguments: {
        workspaceId: "workspace-a",
        scanId: "scan-boundary",
        symptomId: "scope-roots",
      },
    });
    expect(overlaySuggestionResult.structuredContent).toEqual({
      ok: true,
      tool: "scan_profile_overlay_suggest",
      value: expect.objectContaining({
        scanId: "scan-boundary",
        recommendedDecision: "refine-overlay",
        symptom: expect.objectContaining({ id: "scope-roots" }),
        suggestedFields: expect.arrayContaining([
          expect.objectContaining({ name: "include" }),
          expect.objectContaining({ name: "boundaryMapRoots" }),
        ]),
      }),
    });

    const embeddingResult = await client.callTool({
      name: "concept_embedding_upsert",
      arguments: {
        workspaceId: "workspace-a",
        nodeId: "node-a",
        embedding: {
          model: "nomic-embed-text",
          values: [1, 0],
          updatedAt: "2026-08-19T22:31:00.000Z",
        },
      },
    });
    expect(embeddingResult.structuredContent).toEqual({
      ok: true,
      tool: "concept_embedding_upsert",
      value: {
        embedding: {
          workspaceId: "workspace-a",
          nodeId: "node-a",
          model: "nomic-embed-text",
          dimensions: 2,
          contentDigest: expect.any(String),
          updatedAt: "2026-08-19T22:31:00.000Z",
        },
      },
    });

  });
});

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
