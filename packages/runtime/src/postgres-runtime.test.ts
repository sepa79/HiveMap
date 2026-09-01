import { randomUUID } from "node:crypto";

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { PostgresHiveMapStore } from "@hivemap/storage";

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

});
