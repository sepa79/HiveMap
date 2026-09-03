import { randomUUID } from "node:crypto";
import { Pool } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { DEFAULT_CAPTURE_POLICY } from "@hivemap/capture";
import { INITIAL_CATEGORY_CATALOG } from "@hivemap/categories";
import type { SemanticGraph } from "@hivemap/graph-core";
import { createOverviewProjection } from "@hivemap/projections";
import { INITIAL_SCAN_PROFILES } from "@hivemap/scans";

import { PostgresHiveMapStore, StorageError, type WorkspaceState } from "./index.js";

const POSTGRES_TEST_URL = process.env.HIVEMAP_TEST_POSTGRES_URL;
const describeIfPostgres = POSTGRES_TEST_URL === undefined ? describe.skip : describe;

const graph: SemanticGraph = {
  nodes: [
    { id: "node-a", label: "Alpha", type: "concept" },
    { id: "node-b", label: "Beta", type: "decision", metadata: { owner: "agent" } },
  ],
  edges: [{ id: "edge-a", from: "node-a", to: "node-b", relation: "supports" }],
};

function createState(workspaceId: string): WorkspaceState {
  const projection = createOverviewProjection(graph, {
    id: `${workspaceId}-projection-a`,
    name: "Overview",
    maxNodes: 2,
  });

  return {
    workspace: {
      id: workspaceId,
      slug: `${workspaceId}-slug`,
      name: `Workspace ${workspaceId}`,
      createdAt: "2026-05-13T21:00:00.000Z",
      updatedAt: "2026-05-13T21:00:00.000Z",
    },
    graphId: `${workspaceId}:graph`,
    graph: {
      nodes: [...graph.nodes],
      edges: [...graph.edges],
    },
    categoryCatalog: INITIAL_CATEGORY_CATALOG,
    categoryAssignments: [
      {
        id: `${workspaceId}-assignment-a`,
        targetType: "node",
        targetId: "node-a",
        categoryId: "confirmed",
        status: "active",
        provenance: "human",
      },
      {
        id: `${workspaceId}-assignment-b`,
        targetType: "projection",
        targetId: projection.id,
        categoryId: "inferred",
        status: "active",
        provenance: "agent",
      },
    ],
    capturePolicy: DEFAULT_CAPTURE_POLICY,
    feedbackEvents: [
      {
        id: `${workspaceId}-feedback-a`,
        createdAt: "2026-05-13T21:01:00.000Z",
        type: "node_marked",
        payload: { nodeId: "node-a", mark: "important" },
        projectionId: projection.id,
      },
    ],
    proposals: [
      {
        id: `${workspaceId}-proposal-a`,
        createdAt: "2026-05-13T21:02:00.000Z",
        sourceFeedbackIds: [`${workspaceId}-feedback-a`],
        graphCommands: [
          {
            id: `${workspaceId}-cmd-a`,
            type: "node.update",
            payload: {
              id: "node-a",
              changes: { notes: "Marked important by the human." },
            },
          },
        ],
        explanation: "Preserve important feedback as notes.",
        status: "pending",
      },
    ],
    projections: [projection],
    scanProfiles: INITIAL_SCAN_PROFILES,
    scanRuns: [],
  };
}

describeIfPostgres("PostgresHiveMapStore", () => {
  let store: PostgresHiveMapStore;
  let introspectionPool: Pool;

  beforeAll(async () => {
    store = PostgresHiveMapStore.open(POSTGRES_TEST_URL as string);
    await store.initialize();
    introspectionPool = new Pool({ connectionString: POSTGRES_TEST_URL as string });
  });

  afterAll(async () => {
    await store.close();
    await introspectionPool.end();
  });

  it("completes a live connection probe", async () => {
    await expect(store.checkConnection()).resolves.toBeUndefined();
  });

  it("persists and loads workspace state", async () => {
    const workspaceId = `pg-${randomUUID()}`;
    const state = createState(workspaceId);

    await store.saveWorkspaceState(state);
    await expect(store.loadWorkspaceState(workspaceId)).resolves.toEqual(state);
    await store.deleteWorkspace(workspaceId);
  });

  it("rejects an unsafe repository index location hydrated from Postgres", async () => {
    const workspaceId = `pg-${randomUUID()}`;
    await store.saveWorkspaceState(createState(workspaceId));

    try {
      await introspectionPool.query(
        "INSERT INTO repository_indexes (workspace_id, id, repository_url, mode, stage, requested_at, updated_at, actor_agent_id, actor_tool) VALUES ($1, $2, $3, 'safe', 'requested', $4, $4, $5, $6)",
        [
          workspaceId,
          "repo-index-unsafe",
          "https://example.com/org/repo.git?access_token=secret",
          "2026-08-20T12:00:00.000Z",
          "codex",
          "test",
        ],
      );

      await expect(store.getRepositoryIndex(workspaceId, "repo-index-unsafe")).rejects.toThrow(
        "repositoryUrl must not contain query parameters or fragments",
      );
    } finally {
      await store.deleteWorkspace(workspaceId);
    }
  });

  it("rejects unsupported stored scan profile recipe fields instead of overriding core profile fields", async () => {
    const workspaceId = `pg-${randomUUID()}`;
    await store.saveWorkspaceState(createState(workspaceId));

    try {
      await introspectionPool.query(
        "UPDATE scan_profiles SET profile_recipe = profile_recipe || $1::jsonb WHERE workspace_id = $2 AND id = $3",
        [JSON.stringify({ id: "overridden-profile-id" }), workspaceId, "documentation-conflicts"],
      );

      await expect(store.loadWorkspaceState(workspaceId)).rejects.toThrow(
        "Stored scan profile recipe contains an unsupported field: id",
      );
    } finally {
      await store.deleteWorkspace(workspaceId);
    }
  });

  it("rejects a non-current schema without changing its version or workspace data", async () => {
    const workspaceId = `pg-${randomUUID()}`;
    const state = createState(workspaceId);
    await store.saveWorkspaceState(state);

    try {
      await introspectionPool.query("UPDATE schema_metadata SET value = '16' WHERE key = 'schema_version'");

      await expect(store.initialize()).rejects.toThrow(
        "Postgres storage schema version 16 is not supported; reset the database for schema 17",
      );
      await expect(introspectionPool.query<{ value: string }>("SELECT value FROM schema_metadata WHERE key = 'schema_version'"))
        .resolves.toMatchObject({ rows: [{ value: "16" }] });
      await expect(store.loadWorkspaceState(workspaceId)).resolves.toEqual(state);
    } finally {
      await introspectionPool.query("UPDATE schema_metadata SET value = '17' WHERE key = 'schema_version'");
      await store.deleteWorkspace(workspaceId);
    }
  });

  it("round-trips completed scan boundary-map artifacts", async () => {
    const workspaceId = `pg-${randomUUID()}`;
    const state = createState(workspaceId);
    state.scanRuns = [
      {
        id: `${workspaceId}-scan-a`,
        profileId: "code-quality-review",
        profileVersion: 1,
        effectiveProfile: {
          id: "code-quality-review",
          version: 1,
          name: "Services code quality review",
          description: "Repository-specific service review profile.",
          overlayStem: "code-quality",
          instructions: ["Review service boundaries before filing local findings."],
          scope: { include: ["services/**"], exclude: ["node_modules/**"] },
          sourceTypes: ["code", "test"],
          criteria: [{ id: "duplicate-responsibility", description: "Multiple services own the same runtime policy behavior." }],
          duplicateResponsibilityTopLevelSymbolKinds: ["class", "interface", "enum", "record", "function"],
          duplicateResponsibilityIgnorePathGlobs: ["**/generated/**", "**/fixtures/**", "**/*.mock.*"],
          ssotOrder: ["AGENTS.md", "docs/specs/**", "services/**"],
          requiredOutputs: ["findings", "boundary-map"],
        },
        repository: {
          root: "/repo",
          repositoryUrl: "/repo",
          branch: "main",
          revision: "abc123",
        },
        actor: { agentId: "agent-a", tool: "codex" },
        startedAt: "2026-08-24T14:00:00.000Z",
        status: "completed",
        coverage: { discovered: ["packages/runtime/src/index.ts"], included: ["packages/runtime/src/index.ts"], excluded: [], failed: [] },
        appliedCriteria: ["duplicate-responsibility"],
        declaredOutputs: ["findings", "boundary-map"],
        findingNodeIds: [],
        calibrationDecisions: [],
        completedAt: "2026-08-24T14:05:00.000Z",
        graphDigest: `${workspaceId}-digest-a`,
        findingEvidence: [],
        calibrationOverrideReason: "Boundary map is still provisional, but we need a frozen baseline for comparison.",
        boundaryMap: {
          boundaries: [
            {
              id: "boundary-runtime",
              label: "Runtime",
              kind: "module",
              ownedPaths: ["packages/runtime/**"],
              ownedSymbolKeys: ["runtime:HiveMapRuntime"],
              publicEntrypoints: [{ id: "runtime-export", label: "HiveMapRuntime", kind: "export", symbolKey: "runtime:HiveMapRuntime" }],
              contractSourceRefs: [{ role: "defines", source: "repo-doc", target: "docs/architecture.md" }],
              testSourceRefs: [{ role: "verifies", source: "test", target: "packages/runtime/src/index.test.ts" }],
              confidence: "high",
            },
          ],
          relations: [],
        },
      },
    ];

    await store.saveWorkspaceState(state);
    await expect(store.loadWorkspaceState(workspaceId)).resolves.toEqual(state);
    await store.deleteWorkspace(workspaceId);
  });

  it("lists workspace records with canonical ISO timestamps", async () => {
    const workspaceId = `pg-${randomUUID()}`;
    const state = createState(workspaceId);

    await store.saveWorkspaceState(state);

    const record = (await store.listWorkspaces()).find((workspace) => workspace.id === workspaceId);
    expect(record).toEqual(state.workspace);

    await store.deleteWorkspace(workspaceId);
  });

  it("atomically replaces a workspace when the graph id changes", async () => {
    const workspaceId = `pg-${randomUUID()}`;
    const state = createState(workspaceId);
    await store.saveWorkspaceState(state);

    const replacement: WorkspaceState = {
      ...state,
      workspace: { ...state.workspace, name: "Replacement Workspace" },
      graphId: `${workspaceId}:replacement-graph`,
    };

    await store.replaceWorkspaceState(replacement);
    await expect(store.loadWorkspaceState(workspaceId)).resolves.toEqual(replacement);
    await store.deleteWorkspace(workspaceId);
  });

  it("reports explicit missing-workspace failures", async () => {
    await expect(store.loadWorkspaceState(`missing-${randomUUID()}`)).rejects.toThrow(StorageError);
  });

  it("stores concept embeddings and returns cosine-similar matches in score order", async () => {
    const workspaceId = `pg-${randomUUID()}`;
    const state = createState(workspaceId);
    state.graph = {
      nodes: [
        { id: "node-a", label: "Alpha", type: "concept" },
        { id: "node-b", label: "Beta", type: "concept" },
        { id: "node-c", label: "Gamma", type: "concept" },
      ],
      edges: [],
    };
    state.projections = [
      createOverviewProjection(state.graph, {
        id: `${workspaceId}-projection-a`,
        name: "Overview",
        maxNodes: 3,
      }),
    ];
    const projectionId = state.projections[0]?.id;
    if (projectionId === undefined) throw new Error("Expected a rebuilt overview projection");
    state.categoryAssignments = state.categoryAssignments.map((assignment) =>
      assignment.targetType === "projection" ? { ...assignment, targetId: projectionId } : assignment,
    );
    state.feedbackEvents = state.feedbackEvents.map((event) => ({ ...event, projectionId }));

    await store.saveWorkspaceState(state);

    await store.upsertConceptEmbedding({
      workspaceId,
      nodeId: "node-a",
      model: "nomic-embed-text",
      contentDigest: "digest-a",
      embedding: [1, 0],
      createdAt: "2026-08-19T22:10:00.000Z",
      updatedAt: "2026-08-19T22:10:00.000Z",
    });
    await store.upsertConceptEmbedding({
      workspaceId,
      nodeId: "node-b",
      model: "nomic-embed-text",
      contentDigest: "digest-b",
      embedding: [0.9, 0.1],
      createdAt: "2026-08-19T22:10:00.000Z",
      updatedAt: "2026-08-19T22:10:00.000Z",
    });
    await store.upsertConceptEmbedding({
      workspaceId,
      nodeId: "node-c",
      model: "nomic-embed-text",
      contentDigest: "digest-c",
      embedding: [0, 1],
      createdAt: "2026-08-19T22:10:00.000Z",
      updatedAt: "2026-08-19T22:10:00.000Z",
    });

    await expect(store.getConceptEmbedding(workspaceId, "node-a", "nomic-embed-text")).resolves.toEqual({
      workspaceId,
      nodeId: "node-a",
      model: "nomic-embed-text",
      contentDigest: "digest-a",
      embedding: [1, 0],
      createdAt: "2026-08-19T22:10:00.000Z",
      updatedAt: "2026-08-19T22:10:00.000Z",
    });

    const matches = await store.listSimilarConceptEmbeddings(workspaceId, "node-a", "nomic-embed-text", 2);
    expect(matches).toHaveLength(2);
    expect(matches[0]?.nodeId).toBe("node-b");
    expect(matches[1]?.nodeId).toBe("node-c");
    expect(matches[0]?.score).toBeGreaterThan(matches[1]?.score ?? 1);

    await store.deleteWorkspace(workspaceId);
  });

  it("keeps repository index stats constraints in the live Postgres schema", async () => {
    const result = await introspectionPool.query<{ definition: string }>(
      "SELECT pg_get_constraintdef(oid) AS definition FROM pg_constraint WHERE conrelid = 'repository_indexes'::regclass AND contype = 'c'",
    );
    const definitions = result.rows.map((row) => row.definition);

    expect(definitions.some((definition) => definition.includes("stats_file_count") && definition.includes("stats_chunk_count"))).toBe(true);
    expect(definitions.some((definition) => definition.includes("stats_file_count") && definition.includes("stats_indexed_bytes"))).toBe(true);
    expect(definitions.some((definition) => definition.includes("stats_file_count >= 0"))).toBe(true);
    expect(definitions.some((definition) => definition.includes("stats_chunk_count >= 0"))).toBe(true);
    expect(definitions.some((definition) => definition.includes("stats_indexed_bytes >= 0"))).toBe(true);
  });
});
