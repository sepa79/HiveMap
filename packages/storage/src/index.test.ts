import { describe, expect, it } from "vitest";

import { DEFAULT_CAPTURE_POLICY } from "@hivemap/capture";
import { INITIAL_CATEGORY_CATALOG } from "@hivemap/categories";
import type { SemanticGraph } from "@hivemap/graph-core";
import { createOverviewProjection } from "@hivemap/projections";
import { INITIAL_SCAN_PROFILES } from "@hivemap/scans";

import { InMemoryHiveMapStore, StorageError, type WorkspaceState } from "./index.js";

const graph: SemanticGraph = {
  nodes: [
    { id: "node-a", label: "Alpha", type: "concept" },
    { id: "node-b", label: "Beta", type: "decision", metadata: { owner: "agent" } },
  ],
  edges: [{ id: "edge-a", from: "node-a", to: "node-b", relation: "supports" }],
};

function createState(): WorkspaceState {
  const projection = createOverviewProjection(graph, {
    id: "projection-a",
    name: "Overview",
    maxNodes: 2,
  });

  return {
    workspace: {
      id: "workspace-a",
      slug: "alpha-workspace",
      name: "Alpha Workspace",
      createdAt: "2026-05-13T21:00:00.000Z",
      updatedAt: "2026-05-13T21:00:00.000Z",
    },
    graphId: "graph-a",
    graph: {
      nodes: [...graph.nodes],
      edges: [...graph.edges],
    },
    categoryCatalog: INITIAL_CATEGORY_CATALOG,
    categoryAssignments: [
      {
        id: "assignment-a",
        targetType: "node",
        targetId: "node-a",
        categoryId: "confirmed",
        status: "active",
        provenance: "human",
      },
      {
        id: "assignment-b",
        targetType: "projection",
        targetId: "projection-a",
        categoryId: "inferred",
        status: "active",
        provenance: "agent",
      },
    ],
    capturePolicy: DEFAULT_CAPTURE_POLICY,
    feedbackEvents: [
      {
        id: "feedback-a",
        createdAt: "2026-05-13T21:01:00.000Z",
        type: "node_marked",
        payload: { nodeId: "node-a", mark: "important" },
        projectionId: "projection-a",
      },
    ],
    proposals: [
      {
        id: "proposal-a",
        createdAt: "2026-05-13T21:02:00.000Z",
        sourceFeedbackIds: ["feedback-a"],
        graphCommands: [
          {
            id: "cmd-a",
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

describe("InMemoryHiveMapStore", () => {
  it("persists and loads workspace state", async () => {
    const store = new InMemoryHiveMapStore();
    await store.initialize();

    const state = createState();
    await store.saveWorkspaceState(state);

    await expect(store.loadWorkspaceState("workspace-a")).resolves.toEqual(state);

    await store.close();
  });

  it("round-trips completed scan boundary-map artifacts", async () => {
    const store = new InMemoryHiveMapStore();
    await store.initialize();

    const state = createState();
    state.scanRuns = [
      {
        id: "scan-a",
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
          ssotOrder: ["AGENTS.md", "docs/specs/**", "services/**"],
          requiredOutputs: ["findings", "boundary-map"],
        },
        repository: { root: "/repo", repositoryUrl: "/repo", branch: "main", revision: "abc123" },
        actor: { agentId: "agent-a", tool: "codex" },
        startedAt: "2026-08-24T14:00:00.000Z",
        status: "completed",
        coverage: { discovered: ["packages/runtime/src/index.ts"], included: ["packages/runtime/src/index.ts"], excluded: [], failed: [] },
        appliedCriteria: ["duplicate-responsibility"],
        declaredOutputs: ["findings", "boundary-map"],
        findingNodeIds: [],
        completedAt: "2026-08-24T14:05:00.000Z",
        graphDigest: "digest-a",
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

    await expect(store.loadWorkspaceState("workspace-a")).resolves.toEqual(state);

    await store.close();
  });

  it("returns cloned state instead of exposing internal mutable references", async () => {
    const store = new InMemoryHiveMapStore();
    await store.initialize();

    const state = createState();
    await store.saveWorkspaceState(state);
    state.workspace.name = "Mutated Outside";
    state.graph.nodes[0]!.label = "Changed Outside";

    const loaded = await store.loadWorkspaceState("workspace-a");
    expect(loaded.workspace.name).toBe("Alpha Workspace");
    expect(loaded.graph.nodes[0]).toEqual({ id: "node-a", label: "Alpha", type: "concept" });
  });

  it("lists workspace records without loading their graphs", async () => {
    const store = new InMemoryHiveMapStore();
    await store.initialize();
    await store.saveWorkspaceState(createState());

    await expect(store.listWorkspaces()).resolves.toEqual([
      {
        id: "workspace-a",
        slug: "alpha-workspace",
        name: "Alpha Workspace",
        createdAt: "2026-05-13T21:00:00.000Z",
        updatedAt: "2026-05-13T21:00:00.000Z",
      },
    ]);
  });

  it("returns one workspace record without loading its graph", async () => {
    const store = new InMemoryHiveMapStore();
    await store.initialize();
    await store.saveWorkspaceState(createState());

    await expect(store.getWorkspaceRecord("workspace-a")).resolves.toEqual({
      id: "workspace-a",
      slug: "alpha-workspace",
      name: "Alpha Workspace",
      createdAt: "2026-05-13T21:00:00.000Z",
      updatedAt: "2026-05-13T21:00:00.000Z",
    });
  });

  it("replaces a catalog after assignments already reference it", async () => {
    const store = new InMemoryHiveMapStore();
    await store.initialize();

    const state = createState();
    await store.saveWorkspaceState(state);
    const nextState: WorkspaceState = {
      ...state,
      categoryAssignments: [
        ...state.categoryAssignments,
        {
          id: "assignment-c",
          targetType: "edge",
          targetId: "edge-a",
          categoryId: "dependency",
          status: "active",
          provenance: "agent",
        },
      ],
    };

    await expect(store.saveWorkspaceState(nextState)).resolves.toBeUndefined();
    await expect(store.loadWorkspaceState("workspace-a")).resolves.toMatchObject({
      categoryAssignments: nextState.categoryAssignments,
    });
  });

  it("fails when loading a missing workspace", async () => {
    const store = new InMemoryHiveMapStore();
    await store.initialize();

    await expect(store.loadWorkspaceState("missing")).rejects.toThrow(StorageError);
  });

  it("reports workspace existence and deletes explicitly", async () => {
    const store = new InMemoryHiveMapStore();
    await store.initialize();
    await store.saveWorkspaceState(createState());

    await expect(store.workspaceExists("workspace-a")).resolves.toBe(true);
    await store.deleteWorkspace("workspace-a");
    await expect(store.workspaceExists("workspace-a")).resolves.toBe(false);
    await expect(store.deleteWorkspace("workspace-a")).rejects.toThrow(StorageError);
  });

  it("persists repository index job records outside canonical workspace state", async () => {
    const store = new InMemoryHiveMapStore();
    await store.initialize();
    await store.saveWorkspaceState(createState());

    await store.upsertRepositoryIndex({
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
    });

    await expect(store.getRepositoryIndex("workspace-a", "repo-index-a")).resolves.toEqual({
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
    });
    await expect(store.listRepositoryIndexes("workspace-a")).resolves.toHaveLength(1);
    await expect(store.loadWorkspaceState("workspace-a")).resolves.toMatchObject({
      workspace: { id: "workspace-a" },
      scanRuns: [],
    });
  });

  it("stores repository index files and chunks and searches them", async () => {
    const store = new InMemoryHiveMapStore();
    await store.initialize();
    await store.saveWorkspaceState(createState());
    await store.upsertRepositoryIndex({
      id: "repo-index-a",
      workspaceId: "workspace-a",
      repositoryUrl: "/tmp/repo",
      mode: "safe",
      stage: "completed",
      requestedAt: "2026-08-20T12:00:00.000Z",
      updatedAt: "2026-08-20T12:05:00.000Z",
      completedAt: "2026-08-20T12:05:00.000Z",
      actor: {
        agentId: "codex",
        tool: "mcp",
      },
      stats: {
        fileCount: 1,
        chunkCount: 1,
        indexedBytes: 128,
      },
    });

    await store.replaceRepositoryIndexContents(
      "workspace-a",
      "repo-index-a",
      [
        {
          workspaceId: "workspace-a",
          indexId: "repo-index-a",
          path: "docs/architecture.md",
          language: "markdown",
          sourceKind: "documentation",
          contentHash: "hash-a",
          byteSize: 128,
        },
      ],
      [
        {
          workspaceId: "workspace-a",
          indexId: "repo-index-a",
          id: "chunk-a",
          filePath: "docs/architecture.md",
          language: "markdown",
          sourceKind: "documentation",
          startLine: 1,
          endLine: 3,
          text: "The system keeps a single source of truth for ownership.",
          contentHash: "chunk-hash-a",
        },
      ],
      [
        {
          workspaceId: "workspace-a",
          indexId: "repo-index-a",
          key: "symbol-a",
          filePath: "docs/architecture.md",
          language: "markdown",
          name: "Architecture",
          qualifiedName: "Architecture",
          kind: "heading",
          startLine: 1,
          startColumn: 0,
          endLine: 1,
          endColumn: 12,
          isExported: false,
          isPublic: false,
          producerTool: "test",
          producerVersion: "1",
        },
      ],
    );

    await expect(store.listRepositoryIndexSymbols("workspace-a", "repo-index-a")).resolves.toEqual([
      expect.objectContaining({
        key: "symbol-a",
        filePath: "docs/architecture.md",
        qualifiedName: "Architecture",
      }),
    ]);
    await expect(store.listRepositoryIndexReferences("workspace-a", "repo-index-a")).resolves.toEqual([]);
    await expect(store.listRepositoryIndexDependencies("workspace-a", "repo-index-a")).resolves.toEqual([]);

    await expect(store.searchRepositoryIndex("workspace-a", "repo-index-a", "single source truth", 5)).resolves.toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          kind: "chunk",
          filePath: "docs/architecture.md",
          sourceKind: "documentation",
        }),
      ]),
    );

    await store.replaceRepositoryIndexContents(
      "workspace-a",
      "repo-index-a",
      [
        {
          workspaceId: "workspace-a",
          indexId: "repo-index-a",
          path: "docs/replacement.md",
          language: "markdown",
          sourceKind: "documentation",
          contentHash: "hash-b",
          byteSize: 96,
        },
      ],
      [
        {
          workspaceId: "workspace-a",
          indexId: "repo-index-a",
          id: "chunk-b",
          filePath: "docs/replacement.md",
          language: "markdown",
          sourceKind: "documentation",
          startLine: 1,
          endLine: 2,
          text: "Replacement evidence only.",
          contentHash: "chunk-hash-b",
        },
      ],
      [
        {
          workspaceId: "workspace-a",
          indexId: "repo-index-a",
          key: "symbol-b",
          filePath: "docs/replacement.md",
          language: "markdown",
          name: "Replacement",
          qualifiedName: "Replacement",
          kind: "heading",
          startLine: 1,
          startColumn: 0,
          endLine: 1,
          endColumn: 11,
          isExported: false,
          isPublic: false,
          producerTool: "test",
          producerVersion: "1",
        },
      ],
      [
        {
          workspaceId: "workspace-a",
          indexId: "repo-index-a",
          key: "reference-b",
          filePath: "docs/replacement.md",
          language: "markdown",
          sourceKind: "documentation",
          kind: "reference",
          targetText: "Replacement",
          startLine: 1,
          startColumn: 0,
          endLine: 1,
          endColumn: 11,
          resolutionConfidence: "low",
          producerTool: "test",
          producerVersion: "1",
        },
      ],
      [
        {
          workspaceId: "workspace-a",
          indexId: "repo-index-a",
          key: "dependency-b",
          filePath: "docs/replacement.md",
          language: "markdown",
          sourceKind: "documentation",
          kind: "reference",
          targetText: "docs/replacement.md",
          targetFilePath: "docs/replacement.md",
          startLine: 1,
          startColumn: 0,
          endLine: 1,
          endColumn: 11,
          resolutionConfidence: "high",
          producerTool: "test",
          producerVersion: "1",
        },
      ],
    );

    await expect(store.searchRepositoryIndex("workspace-a", "repo-index-a", "single source truth", 5)).resolves.toEqual([]);
    await expect(store.listRepositoryIndexSymbols("workspace-a", "repo-index-a")).resolves.toEqual([
      expect.objectContaining({
        key: "symbol-b",
        filePath: "docs/replacement.md",
      }),
    ]);
    await expect(store.listRepositoryIndexReferences("workspace-a", "repo-index-a")).resolves.toEqual([
      expect.objectContaining({
        key: "reference-b",
        filePath: "docs/replacement.md",
        targetText: "Replacement",
      }),
    ]);
    await expect(store.listRepositoryIndexDependencies("workspace-a", "repo-index-a")).resolves.toEqual([
      expect.objectContaining({
        key: "dependency-b",
        filePath: "docs/replacement.md",
        targetFilePath: "docs/replacement.md",
      }),
    ]);
    await expect(store.searchRepositoryIndex("workspace-a", "repo-index-a", "Replacement evidence", 5)).resolves.toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          kind: "chunk",
          filePath: "docs/replacement.md",
        }),
      ]),
    );
  });

  it("rejects repository index contents whose ownership does not match the replace target", async () => {
    const store = new InMemoryHiveMapStore();
    await store.initialize();
    await store.saveWorkspaceState(createState());
    await store.upsertRepositoryIndex({
      id: "repo-index-a",
      workspaceId: "workspace-a",
      repositoryUrl: "/tmp/repo",
      mode: "safe",
      stage: "completed",
      requestedAt: "2026-08-20T12:00:00.000Z",
      updatedAt: "2026-08-20T12:05:00.000Z",
      completedAt: "2026-08-20T12:05:00.000Z",
      actor: {
        agentId: "codex",
        tool: "mcp",
      },
      stats: {
        fileCount: 1,
        chunkCount: 1,
        indexedBytes: 128,
      },
    });

    await expect(
      store.replaceRepositoryIndexContents(
        "workspace-a",
        "repo-index-a",
        [
          {
            workspaceId: "workspace-a",
            indexId: "repo-index-b",
            path: "docs/architecture.md",
            language: "markdown",
            sourceKind: "documentation",
            contentHash: "hash-a",
            byteSize: 128,
          },
        ],
        [],
        [],
      ),
    ).rejects.toThrow("repository file ownership must match replaceRepositoryIndexContents target");

    await expect(
      store.replaceRepositoryIndexContents(
        "workspace-a",
        "repo-index-a",
        [],
        [],
        [
          {
            workspaceId: "workspace-a",
            indexId: "repo-index-b",
            key: "symbol-a",
            filePath: "docs/architecture.md",
            language: "markdown",
            name: "Architecture",
            qualifiedName: "Architecture",
            kind: "heading",
            startLine: 1,
            startColumn: 0,
            endLine: 1,
            endColumn: 12,
            isExported: false,
            isPublic: false,
            producerTool: "test",
            producerVersion: "1",
          },
        ],
        [
          {
            workspaceId: "workspace-a",
            indexId: "repo-index-b",
            key: "reference-a",
            filePath: "docs/architecture.md",
            language: "markdown",
            sourceKind: "documentation",
            kind: "reference",
            targetText: "Architecture",
            startLine: 1,
            startColumn: 0,
            endLine: 1,
            endColumn: 12,
            resolutionConfidence: "low",
            producerTool: "test",
            producerVersion: "1",
          },
        ],
      ),
    ).rejects.toThrow("repository symbol ownership must match replaceRepositoryIndexContents target");

    await expect(
      store.replaceRepositoryIndexContents(
        "workspace-a",
        "repo-index-a",
        [],
        [],
        [],
        [
          {
            workspaceId: "workspace-a",
            indexId: "repo-index-b",
            key: "reference-a",
            filePath: "docs/architecture.md",
            language: "markdown",
            sourceKind: "documentation",
            kind: "reference",
            targetText: "Architecture",
            startLine: 1,
            startColumn: 0,
            endLine: 1,
            endColumn: 12,
            resolutionConfidence: "low",
            producerTool: "test",
            producerVersion: "1",
          },
        ],
      ),
    ).rejects.toThrow("repository reference ownership must match replaceRepositoryIndexContents target");

    await expect(
      store.replaceRepositoryIndexContents(
        "workspace-a",
        "repo-index-a",
        [],
        [],
        [],
        [],
        [
          {
            workspaceId: "workspace-a",
            indexId: "repo-index-b",
            key: "dependency-a",
            filePath: "docs/architecture.md",
            language: "markdown",
            sourceKind: "documentation",
            kind: "reference",
            targetText: "Architecture",
            targetFilePath: "docs/architecture.md",
            startLine: 1,
            startColumn: 0,
            endLine: 1,
            endColumn: 12,
            resolutionConfidence: "high",
            producerTool: "test",
            producerVersion: "1",
          },
        ],
      ),
    ).rejects.toThrow("repository dependency ownership must match replaceRepositoryIndexContents target");
  });

  it("atomically replaces a workspace even when its graph id changes", async () => {
    const store = new InMemoryHiveMapStore();
    await store.initialize();
    const state = createState();
    await store.saveWorkspaceState(state);
    const replacement: WorkspaceState = {
      ...state,
      workspace: { ...state.workspace, name: "Replacement" },
      graphId: "replacement-graph",
    };

    await store.replaceWorkspaceState(replacement);

    await expect(store.loadWorkspaceState("workspace-a")).resolves.toEqual(replacement);
  });

  it("rejects replacement when the workspace does not exist", async () => {
    const store = new InMemoryHiveMapStore();
    await store.initialize();

    await expect(store.replaceWorkspaceState(createState())).rejects.toThrow("Workspace not found for replacement: workspace-a");
  });

  it("rejects invalid workspace state before writing", async () => {
    const store = new InMemoryHiveMapStore();
    await store.initialize();
    const state = createState();

    await expect(
      store.saveWorkspaceState({
        ...state,
        categoryAssignments: [
          {
            id: "assignment-a",
            targetType: "node",
            targetId: "missing",
            categoryId: "confirmed",
            status: "active",
            provenance: "human",
          },
        ],
      }),
    ).rejects.toThrow();

    await expect(store.loadWorkspaceState("workspace-a")).rejects.toThrow(StorageError);
  });
});
