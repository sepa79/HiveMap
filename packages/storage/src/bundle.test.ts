import { describe, expect, it } from "vitest";
import { strFromU8, strToU8, unzipSync, zipSync } from "fflate";

import { DEFAULT_CAPTURE_POLICY } from "@hivemap/capture";
import { INITIAL_CATEGORY_CATALOG } from "@hivemap/categories";
import { INITIAL_SCAN_PROFILES } from "@hivemap/scans";

import { BundleValidationError, createWorkspaceBundle, parseWorkspaceBundle, type WorkspaceState } from "./index.js";

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
  snapshots: [],
  scanProfiles: INITIAL_SCAN_PROFILES,
  scanRuns: [],
};

describe("HiveMap ZIP bundle", () => {
  it("is deterministic for the same state and export timestamp", () => {
    const first = createWorkspaceBundle(state, "2026-07-17T10:01:00.000Z");
    const second = createWorkspaceBundle(state, "2026-07-17T10:01:00.000Z");

    expect(first.bytes).toEqual(second.bytes);
    expect(first.manifest.files.find((file) => file.path === "workspace.json")?.role).toBe("canonical");
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
});
