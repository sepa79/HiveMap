import { describe, expect, it } from "vitest";
import { strFromU8, strToU8, unzipSync, zipSync } from "fflate";

import { DEFAULT_CAPTURE_POLICY } from "@hivemap/capture";
import { INITIAL_CATEGORY_CATALOG } from "@hivemap/categories";
import { INITIAL_SCAN_PROFILES } from "@hivemap/scans";

import {
  BundleValidationError,
  HIVEMAP_BUNDLE_FORMAT_VERSION,
  HIVEMAP_LOGICAL_STATE_VERSION,
  createWorkspaceBundle,
  parseWorkspaceBundle,
  type WorkspaceState,
} from "./index.js";

const state: WorkspaceState = {
  workspace: { id: "portable", name: "Portable Map", createdAt: "2026-07-17T10:00:00.000Z" },
  graphId: "portable:graph",
  graph: { nodes: [{ id: "root", label: "Root", type: "concept" }], edges: [] },
  categoryCatalog: INITIAL_CATEGORY_CATALOG,
  categoryAssignments: [],
  capturePolicy: DEFAULT_CAPTURE_POLICY,
  feedbackEvents: [],
  proposals: [],
  projections: [],
  scanProfiles: INITIAL_SCAN_PROFILES,
  scanRuns: [],
};

describe("HiveMap ZIP bundle", () => {
  it("is deterministic for the same state and export timestamp", () => {
    const first = createWorkspaceBundle(state, "2026-07-17T10:01:00.000Z");
    const second = createWorkspaceBundle(state, "2026-07-17T10:01:00.000Z");

    expect(first.bytes).toEqual(second.bytes);
    expect(first.manifest.files.find((file) => file.path === "workspace.json")?.role).toBe("canonical");
    expect(first.manifest.formatVersion).toBe(HIVEMAP_BUNDLE_FORMAT_VERSION);
    expect(first.manifest.logicalStateVersion).toBe(HIVEMAP_LOGICAL_STATE_VERSION);
    expect("storageSchemaVersion" in first.manifest).toBe(false);
  });

  it("round-trips a validated workspace", () => {
    const bundle = createWorkspaceBundle(state, "2026-07-17T10:01:00.000Z");

    expect(parseWorkspaceBundle(bundle.bytes).state).toEqual(state);
  });

  it("rejects corrupt archives", () => {
    const bundle = createWorkspaceBundle(state, "2026-07-17T10:01:00.000Z");
    const archive = unzipSync(bundle.bytes);
    archive["workspace.json"] = strToU8(strFromU8(archive["workspace.json"] as Uint8Array).replace("Portable Map", "Tampered Map"));
    const corrupt = zipSync(archive);

    expect(() => parseWorkspaceBundle(corrupt)).toThrow(BundleValidationError);
  });

  it("accepts legacy format version 1 bundles tied to storage schema version 4", () => {
    const bundle = createWorkspaceBundle(state, "2026-07-17T10:01:00.000Z");
    const archive = unzipSync(bundle.bytes);
    const manifest = JSON.parse(strFromU8(archive["manifest.json"] as Uint8Array)) as {
      format: string;
      formatVersion: number;
      logicalStateVersion?: number;
      storageSchemaVersion?: string;
    };
    manifest.formatVersion = 1;
    delete manifest.logicalStateVersion;
    manifest.storageSchemaVersion = "4";
    archive["manifest.json"] = strToU8(`${JSON.stringify(manifest, null, 2)}\n`);

    expect(parseWorkspaceBundle(zipSync(archive)).state).toEqual(state);
  });

  it("accepts legacy format version 1 bundles tied to storage schema version 2", () => {
    const bundle = createWorkspaceBundle(state, "2026-07-17T10:01:00.000Z");
    const archive = unzipSync(bundle.bytes);
    const manifest = JSON.parse(strFromU8(archive["manifest.json"] as Uint8Array)) as {
      format: string;
      formatVersion: number;
      logicalStateVersion?: number;
      storageSchemaVersion?: string;
    };
    manifest.formatVersion = 1;
    delete manifest.logicalStateVersion;
    manifest.storageSchemaVersion = "2";
    archive["manifest.json"] = strToU8(`${JSON.stringify(manifest, null, 2)}\n`);

    expect(parseWorkspaceBundle(zipSync(archive)).state).toEqual(state);
  });

  it("exports repeat-scan instructions that reuse repository-index-backed coverage flow", () => {
    const scanState: WorkspaceState = {
      ...state,
      scanRuns: [
        {
          id: "scan-a",
          profileId: "documentation-conflicts",
          profileVersion: 1,
          status: "completed",
          repository: {
            repositoryIndexId: "repo-index-a",
            root: "index:repo-index-a",
            repositoryUrl: "https://example.com/org/repo.git",
            branch: "main",
            revision: "0123456789abcdef0123456789abcdef01234567",
          },
          actor: { agentId: "agent-a", tool: "codex" },
          startedAt: "2026-07-17T10:00:00.000Z",
          coverage: {
            discovered: ["docs/architecture.md"],
            included: ["docs/architecture.md"],
            excluded: [],
            failed: [],
          },
          appliedCriteria: INITIAL_SCAN_PROFILES[0]?.criteria.map((criterion) => criterion.id) ?? [],
          declaredOutputs: [...(INITIAL_SCAN_PROFILES[0]?.requiredOutputs ?? [])],
          findingNodeIds: [],
          completedAt: "2026-07-17T10:05:00.000Z",
          graphDigest: "deadbeef",
          findingEvidence: [],
          calibrationOverrideReason: "Freeze the baseline despite incomplete structural calibration.",
        },
      ],
    };

    const bundle = createWorkspaceBundle(scanState, "2026-07-17T10:10:00.000Z");
    const archive = unzipSync(bundle.bytes);
    const repeatInstructions = strFromU8(archive["scans/scan-a/repeat-scan.md"] as Uint8Array);

    expect(repeatInstructions).toContain("Repository index used previously: `repo-index-a`");
    expect(repeatInstructions).toContain("repository_index_start");
    expect(repeatInstructions).toContain("repository_index_execute");
    expect(repeatInstructions).toContain("Use the derived coverage attached to the started run as the normal scan inventory.");
    expect(repeatInstructions).not.toContain("current repository identity");
  });
});
