import { randomUUID } from "node:crypto";

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { PostgresHiveMapStore } from "@hivemap/storage";
import { CODE_QUALITY_PROFILE, createFindingNode, type InProgressScanRun } from "@hivemap/scans";

import { HiveMapRuntime } from "./index.js";

const POSTGRES_TEST_URL = process.env.HIVEMAP_TEST_POSTGRES_URL;
const describeIfPostgres = POSTGRES_TEST_URL === undefined ? describe.skip : describe;

describeIfPostgres("HiveMapRuntime on Postgres", () => {
  let store: PostgresHiveMapStore;
  let runtime: HiveMapRuntime;

  beforeAll(async () => {
    store = PostgresHiveMapStore.open(POSTGRES_TEST_URL as string);
    await store.initialize();
    runtime = new HiveMapRuntime({
      store,
      now: () => "2026-08-19T23:10:00.000Z",
    });
  });

  afterAll(async () => {
    await store.close();
  });

  it("lists and resolves workspace summaries without timestamp drift", async () => {
    const workspaceId = `pg-runtime-${randomUUID()}`;
    const workspace = {
      id: workspaceId,
      slug: `${workspaceId}-slug`,
      name: `Postgres Runtime Workspace ${workspaceId}`,
      createdAt: "2026-08-19T21:00:00.000Z",
      updatedAt: "2026-08-19T21:05:00.000Z",
    };

    try {
      await runtime.createWorkspace({ workspace });

      await expect(runtime.listWorkspaceSummaries({ query: workspaceId, includeArchived: false, limit: 10 })).resolves.toEqual({
        items: [{ id: workspace.id, slug: workspace.slug, name: workspace.name, updatedAt: workspace.updatedAt }],
      });

      await expect(runtime.getWorkspaceSummary({ workspaceId: workspace.id })).resolves.toEqual({
        workspace: { id: workspace.id, slug: workspace.slug, name: workspace.name, updatedAt: workspace.updatedAt },
      });

      await expect(runtime.resolveWorkspace({ ref: workspace.slug })).resolves.toEqual({
        workspace: { id: workspace.id, slug: workspace.slug, name: workspace.name, updatedAt: workspace.updatedAt },
      });
    } finally {
      if (await store.workspaceExists(workspace.id)) {
        await store.deleteWorkspace(workspace.id);
      }
    }
  });

  it("stores concept embeddings and returns read-only similar concept suggestions", async () => {
    const workspaceId = `pg-runtime-${randomUUID()}`;
    const workspace = {
      id: workspaceId,
      slug: `${workspaceId}-slug`,
      name: `Postgres Runtime Similarity ${workspaceId}`,
      createdAt: "2026-08-19T22:00:00.000Z",
      updatedAt: "2026-08-19T22:00:00.000Z",
    };

    try {
      await runtime.createWorkspace({ workspace });
      await runtime.applyGraphCommands({
        workspaceId: workspace.id,
        commands: [
          {
            id: "cmd-alpha",
            type: "node.create",
            payload: { node: { id: "alpha", label: "Alpha", notes: "roadmap planning", type: "concept" } },
          },
          {
            id: "cmd-beta",
            type: "node.create",
            payload: { node: { id: "beta", label: "Beta", notes: "roadmap execution", type: "concept" } },
          },
          {
            id: "cmd-gamma",
            type: "node.create",
            payload: { node: { id: "gamma", label: "Gamma", notes: "kitchen inventory", type: "concept" } },
          },
        ],
      });

      await runtime.upsertConceptEmbedding({
        workspaceId: workspace.id,
        nodeId: "alpha",
        embedding: {
          model: "nomic-embed-text",
          values: [1, 0],
          updatedAt: "2026-08-19T22:01:00.000Z",
        },
      });
      await runtime.upsertConceptEmbedding({
        workspaceId: workspace.id,
        nodeId: "beta",
        embedding: {
          model: "nomic-embed-text",
          values: [0.95, 0.05],
          updatedAt: "2026-08-19T22:01:00.000Z",
        },
      });
      await runtime.upsertConceptEmbedding({
        workspaceId: workspace.id,
        nodeId: "gamma",
        embedding: {
          model: "nomic-embed-text",
          values: [0, 1],
          updatedAt: "2026-08-19T22:01:00.000Z",
        },
      });

      await expect(
        runtime.listSimilarConcepts({
          workspaceId: workspace.id,
          nodeId: "alpha",
          model: "nomic-embed-text",
          limit: 2,
          minScore: 0,
        }),
      ).resolves.toEqual({
        sourceNodeId: "alpha",
        model: "nomic-embed-text",
        matches: [
          {
            nodeId: "beta",
            label: "Beta",
            score: expect.any(Number),
            updatedAt: "2026-08-19T22:01:00.000Z",
          },
          {
            nodeId: "gamma",
            label: "Gamma",
            score: expect.any(Number),
            updatedAt: "2026-08-19T22:01:00.000Z",
          },
        ],
      });

      await runtime.applyGraphCommands({
        workspaceId: workspace.id,
        commands: [
          {
            id: "cmd-alpha-update",
            type: "node.update",
            payload: { id: "alpha", changes: { notes: "changed note" } },
          },
        ],
      });

      await expect(
        runtime.listSimilarConcepts({
          workspaceId: workspace.id,
          nodeId: "alpha",
          model: "nomic-embed-text",
          limit: 2,
        }),
      ).rejects.toMatchObject({ code: "CONCEPT_EMBEDDING_STALE" });
    } finally {
      if (await store.workspaceExists(workspace.id)) {
        await store.deleteWorkspace(workspace.id);
      }
    }
  });

  it("persists the complete finding-owned scan deletion cascade", async () => {
    const workspaceId = `pg-runtime-${randomUUID()}`;
    const workspace = {
      id: workspaceId,
      name: `Postgres Scan Cascade ${workspaceId}`,
      createdAt: "2026-09-02T10:00:00.000Z",
    };

    try {
      await runtime.createWorkspace({ workspace });
      await runtime.applyGraphCommands({
        workspaceId,
        commands: [{
          id: "cmd-component",
          type: "node.create",
          payload: { node: { id: "component-a", label: "Component A", type: "component" } },
        }],
      });
      await store.upsertRepositoryIndex({
        id: "repo-cascade",
        workspaceId,
        repositoryUrl: "https://example.com/hivemap/postgres-cascade.git",
        requestedRef: "main",
        resolvedCommit: "abc123",
        mode: "safe",
        stage: "completed",
        requestedAt: "2026-09-02T10:00:00.000Z",
        updatedAt: "2026-09-02T10:00:30.000Z",
        completedAt: "2026-09-02T10:00:30.000Z",
        actor: { agentId: "codex", tool: "test" },
        stats: { fileCount: 1, chunkCount: 1, indexedBytes: 128 },
      });
      const finding = createFindingNode("scan-cascade", {
        id: "finding-cascade",
        label: "Cascade finding",
        notes: "This finding and all of its owned presentation artifacts must be deleted atomically.",
        fingerprint: "postgres-cascade-finding",
        kind: "test-gap",
        severity: "high",
        confidence: "high",
        criterionIds: ["missing-tests"],
        sources: [{
          sourceRef: { role: "verifies", source: "test", target: "packages/runtime/src/postgres-runtime.test.ts" },
          claim: "The real PostgreSQL cascade requires direct coverage.",
        }],
        affectedNodeIds: ["component-a"],
      });
      const scan: InProgressScanRun = {
        id: "scan-cascade",
        profileId: CODE_QUALITY_PROFILE.id,
        profileVersion: CODE_QUALITY_PROFILE.version,
        repository: { root: "index:repo-cascade", repositoryIndexId: "repo-cascade", branch: "main", revision: "abc123" },
        actor: { agentId: "codex", tool: "test" },
        startedAt: "2026-09-02T10:01:00.000Z",
        status: "in_progress",
        appliedCriteria: [],
        declaredOutputs: [],
        findingNodeIds: [finding.id],
        calibrationDecisions: [],
      };
      const seeded = await store.loadWorkspaceState(workspaceId);
      await store.saveWorkspaceState({
        ...seeded,
        graph: { ...seeded.graph, nodes: [...seeded.graph.nodes, finding] },
        scanRuns: [scan],
      });
      await runtime.applyGraphCommands({
        workspaceId,
        commands: [{
          id: "cmd-finding-edge",
          type: "edge.create",
          payload: { edge: { id: "edge-finding-component", from: finding.id, to: "component-a", relation: "affects" } },
        }],
      });
      await runtime.createProjection({
        workspaceId,
        input: { id: "projection-finding", name: "Finding dive-in", rootNodeId: finding.id },
      });
      await runtime.assignCategory({
        workspaceId,
        assignment: { id: "category-finding", targetType: "node", targetId: finding.id, categoryId: "risk", status: "active", provenance: "agent" },
      });
      await runtime.assignCategory({
        workspaceId,
        assignment: { id: "category-edge", targetType: "edge", targetId: "edge-finding-component", categoryId: "dependency", status: "active", provenance: "agent" },
      });
      await runtime.assignCategory({
        workspaceId,
        assignment: { id: "category-projection", targetType: "projection", targetId: "projection-finding", categoryId: "critique", status: "active", provenance: "agent" },
      });

      await expect(runtime.deleteScan({ workspaceId, scanId: scan.id })).resolves.toEqual({
        deletedScanId: scan.id,
        deletedFindingNodeIds: [finding.id],
        deletedEdgeIds: ["edge-finding-component"],
        deletedProjectionIds: ["projection-finding"],
      });

      await expect(store.loadWorkspaceState(workspaceId)).resolves.toMatchObject({
        graph: { nodes: [{ id: "component-a" }], edges: [] },
        scanRuns: [],
        projections: [],
        categoryAssignments: [],
      });
    } finally {
      if (await store.workspaceExists(workspaceId)) await store.deleteWorkspace(workspaceId);
    }
  });

});
