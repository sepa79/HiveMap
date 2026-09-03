import { describe, expect, it } from "vitest";
import { INITIAL_CATEGORY_CATALOG } from "@hivemap/categories";
import { DEFAULT_CAPTURE_POLICY } from "@hivemap/capture";

import { buildProjectionFlowModel } from "./repository-map-layout.js";

const state = {
  workspace: { id: "workspace", slug: "workspace", name: "Workspace", createdAt: "2026-09-01T00:00:00.000Z", updatedAt: "2026-09-01T00:00:00.000Z" },
  graphId: "workspace:graph",
  graph: {
    nodes: [
      { id: "apps-api", label: "Apps / API", type: "component" as const, metadata: { boundaryKind: "surface" } },
      { id: "runtime", label: "Packages / Runtime", type: "component" as const, metadata: { boundaryKind: "package" } },
      { id: "storage", label: "Packages / Storage", type: "component" as const, metadata: { boundaryKind: "package" } },
    ],
    edges: [
      { id: "dependency", from: "apps-api", to: "runtime", relation: "depends-on" },
      { id: "verification", from: "storage", to: "runtime", relation: "verifies" },
    ],
  },
  categoryCatalog: INITIAL_CATEGORY_CATALOG, categoryAssignments: [], capturePolicy: DEFAULT_CAPTURE_POLICY,
  feedbackEvents: [], proposals: [], scanProfiles: [], scanRuns: [], projections: [],
};

const projection = {
  id: "boundary-map", name: "Boundary Map", type: "project-map" as const,
  rootNodeIds: ["apps-api"], visibleNodeIds: ["apps-api", "runtime", "storage"], visibleEdgeIds: ["dependency", "verification"],
  groups: [
    { id: "applications", label: "Applications", nodeIds: ["apps-api"] },
    { id: "packages", label: "Packages", nodeIds: ["runtime", "storage"] },
  ],
};

describe("repository map layout", () => {
  it("places later boundary groups to the right", () => {
    const model = buildProjectionFlowModel({ state, projection, selectedNodeId: "runtime", filters: {
      query: "", visibleGroupIds: new Set(["applications", "packages"]), showDependencies: true, showVerifications: true,
    } });
    const api = model.nodes.find((node) => node.id === "apps-api")!;
    const runtime = model.nodes.find((node) => node.id === "runtime")!;
    expect(runtime.position.x).toBeGreaterThan(api.position.x);
    expect(model.edges.map((edge) => edge.id)).toEqual(["dependency", "verification"]);
  });

  it("filters groups, labels, and relation classes without changing semantic state", () => {
    const model = buildProjectionFlowModel({ state, projection, selectedNodeId: null, filters: {
      query: "runtime", visibleGroupIds: new Set(["packages"]), showDependencies: false, showVerifications: true,
    } });
    expect([...model.semanticNodeIds]).toEqual(["runtime"]);
    expect(model.edges).toEqual([]);
    expect(state.graph.nodes).toHaveLength(3);
  });
});
