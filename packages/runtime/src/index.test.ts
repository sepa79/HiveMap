import { DatabaseSync } from "node:sqlite";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { beforeEach, describe, expect, it } from "vitest";

import { SqliteHiveMapStore } from "@hivemap/storage";
import { DOCUMENTATION_CONFLICTS_PROFILE } from "@hivemap/scans";

import { HiveMapRuntime } from "./index.js";

let store: SqliteHiveMapStore;
let runtime: HiveMapRuntime;

beforeEach(() => {
  store = new SqliteHiveMapStore(new DatabaseSync(":memory:"));
  store.initialize();
  runtime = new HiveMapRuntime({ store });
});

describe("HiveMapRuntime", () => {
  it("creates workspaces with empty graph and delegated capture", () => {
    const response = runtime.createWorkspace({
      workspace: {
        id: "workspace-a",
        name: "Alpha",
        createdAt: "2026-05-13T21:00:00.000Z",
      },
    });

    expect(response.workspace.id).toBe("workspace-a");
    expect(runtime.getWorkspace("workspace-a").state.capturePolicy.mode).toBe("delegated");
  });

  it("applies graph commands and creates projections over the same state", () => {
    createWorkspace();
    runtime.applyGraphCommands({
      workspaceId: "workspace-a",
      commands: [
        {
          id: "cmd-a",
          type: "node.create",
          payload: { node: { id: "node-a", label: "Alpha", type: "concept" } },
        },
      ],
    });

    const projection = runtime.createProjection({
      workspaceId: "workspace-a",
      input: { id: "projection-a", name: "Overview", maxNodes: 1 },
    });

    expect(projection.projection.visibleNodeIds).toEqual(["node-a"]);
  });

  it("creates a project map projection through the shared runtime", () => {
    createWorkspace();
    runtime.applyGraphCommands({
      workspaceId: "workspace-a",
      commands: [
        {
          id: "cmd-a",
          type: "node.create",
          payload: { node: { id: "node-a", label: "Alpha", type: "system" } },
        },
      ],
    });

    const projection = runtime.createProjection({
      workspaceId: "workspace-a",
      input: {
        id: "projection-project",
        name: "Project Map",
        type: "project-map",
        rootNodeIds: ["node-a"],
        visibleNodeIds: ["node-a"],
        groups: [{ id: "group-system", label: "System", nodeIds: ["node-a"] }],
      },
    }).projection;

    expect(projection.type).toBe("project-map");
    expect(projection.groups?.[0]?.label).toBe("System");
  });

  it("records feedback without mutating graph", () => {
    createWorkspace();
    runtime.recordFeedback({
      workspaceId: "workspace-a",
      feedbackEvent: {
        id: "feedback-a",
        createdAt: "2026-05-13T21:01:00.000Z",
        type: "map_comment",
        payload: { text: "Keep this visible" },
      },
    });

    expect(runtime.listFeedback({ workspaceId: "workspace-a" }).feedbackEvents).toHaveLength(1);
    expect(runtime.getGraph({ workspaceId: "workspace-a" }).graph).toEqual({ nodes: [], edges: [] });
  });

  it("approves and applies proposals explicitly", () => {
    createWorkspace();
    runtime.createProposal({
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

    expect(runtime.approveProposal({ workspaceId: "workspace-a", proposalId: "proposal-a" }).proposal.status).toBe(
      "approved",
    );
    expect(runtime.applyProposal({ workspaceId: "workspace-a", proposalId: "proposal-a" }).proposal.status).toBe(
      "applied",
    );
    expect(runtime.getGraph({ workspaceId: "workspace-a" }).graph.nodes).toHaveLength(1);
  });

  it("creates immutable snapshots from current graph and projection", () => {
    createWorkspace();
    runtime.applyGraphCommands({
      workspaceId: "workspace-a",
      commands: [
        {
          id: "cmd-a",
          type: "node.create",
          payload: { node: { id: "node-a", label: "Alpha", type: "concept" } },
        },
      ],
    });
    const projection = runtime.createProjection({
      workspaceId: "workspace-a",
      input: { id: "projection-a", name: "Overview", maxNodes: 1 },
    }).projection;

    const snapshot = runtime.createSnapshot({
      workspaceId: "workspace-a",
      snapshot: {
        id: "snapshot-a",
        createdAt: "2026-05-13T21:05:00.000Z",
        projectionId: projection.id,
      },
    }).snapshot;

    expect(snapshot.graph.nodes).toHaveLength(1);
    expect(snapshot.projection.visibleNodeIds).toEqual(["node-a"]);
    expect(runtime.listSnapshots({ workspaceId: "workspace-a" }).snapshots).toEqual([snapshot]);
  });

  it("runs two agent scans and compares resolved findings as evidence", () => {
    createWorkspace();
    runtime.applyGraphCommands({
      workspaceId: "workspace-a",
      commands: [{ id: "concept-a", type: "node.create", payload: { node: { id: "concept-a", label: "Ownership", type: "concept" } } }],
    });
    startDocumentationScan("scan-before", "rev-before");
    runtime.recordScanCoverage({
      workspaceId: "workspace-a",
      scanId: "scan-before",
      coverage: { discovered: ["docs/a.md", "docs/b.md"], included: ["docs/a.md", "docs/b.md"], excluded: [], failed: [] },
    });
    runtime.createScanFinding({
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
    completeDocumentationScan("scan-before");

    startDocumentationScan("scan-after", "rev-after");
    runtime.recordScanCoverage({
      workspaceId: "workspace-a",
      scanId: "scan-after",
      coverage: { discovered: ["docs/a.md", "docs/b.md"], included: ["docs/a.md", "docs/b.md"], excluded: [], failed: [] },
    });
    completeDocumentationScan("scan-after");

    const comparison = runtime.compareScans({ workspaceId: "workspace-a", beforeScanId: "scan-before", afterScanId: "scan-after" }).comparison;
    expect(comparison.verdict).toBe("pass");
    expect(comparison.items).toEqual([expect.objectContaining({ fingerprint: "ownership-conflict", status: "resolved" })]);

    const directory = mkdtempSync(join(tmpdir(), "hivemap-verification-"));
    try {
      const exported = runtime.exportWorkspace({
        workspaceId: "workspace-a",
        targetPath: join(directory, "verification.hivemap.zip"),
        exportedAt: "2026-07-17T10:10:00.000Z",
      });
      expect(exported.manifest.files.map((file) => file.path)).toContain("comparisons/scan-before--scan-after.json");
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  });

  it("exports and imports a complete workspace ZIP without semantic drift", () => {
    createWorkspace();
    const directory = mkdtempSync(join(tmpdir(), "hivemap-runtime-"));
    const bundlePath = join(directory, "workspace.hivemap.zip");
    try {
      runtime.exportWorkspace({ workspaceId: "workspace-a", targetPath: bundlePath, exportedAt: "2026-07-17T11:00:00.000Z" });
      const importedStore = new SqliteHiveMapStore(new DatabaseSync(":memory:"));
      importedStore.initialize();
      const importedRuntime = new HiveMapRuntime({ store: importedStore });

      importedRuntime.importWorkspace({ sourcePath: bundlePath, mode: "new" });

      expect(importedRuntime.getWorkspace("workspace-a").state).toEqual(runtime.getWorkspace("workspace-a").state);
      expect(() => importedRuntime.importWorkspace({ sourcePath: bundlePath, mode: "new" })).toThrow("already exists");
      importedStore.close();
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  });

  it("does not bypass non-delegated capture when an agent creates a finding", () => {
    createWorkspace();
    const state = store.loadWorkspaceState("workspace-a");
    store.saveWorkspaceState({ ...state, capturePolicy: { id: "capture-policy-default", mode: "proposed" } });
    startDocumentationScan("scan-proposed", "rev-a");

    expect(() =>
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
    ).toThrow("requires delegated capture");
  });
});

function createWorkspace(): void {
  runtime.createWorkspace({
    workspace: {
      id: "workspace-a",
      name: "Alpha",
      createdAt: "2026-05-13T21:00:00.000Z",
    },
  });
}

function startDocumentationScan(id: string, revision: string): void {
  runtime.startScan({
    workspaceId: "workspace-a",
    scan: {
      id,
      profileId: DOCUMENTATION_CONFLICTS_PROFILE.id,
      profileVersion: DOCUMENTATION_CONFLICTS_PROFILE.version,
      repository: { root: "/repo", branch: "main", revision },
      actor: { agentId: "agent-a", tool: "codex" },
      startedAt: "2026-07-17T10:00:00.000Z",
    },
  });
}

function completeDocumentationScan(id: string): void {
  runtime.completeScan({
    workspaceId: "workspace-a",
    scanId: id,
    completedAt: "2026-07-17T10:05:00.000Z",
    appliedCriteria: DOCUMENTATION_CONFLICTS_PROFILE.criteria.map((criterion) => criterion.id),
    declaredOutputs: [...DOCUMENTATION_CONFLICTS_PROFILE.requiredOutputs],
  });
}
