import { describe, expect, it } from "vitest";

import {
  ProjectionValidationError,
  createDiveInProjection,
  createOverviewProjection,
  createProjectMapProjection,
  validateProjection,
  type Projection,
} from "./index.js";
import type { SemanticGraph } from "@hivemap/graph-core";

const graph: SemanticGraph = {
  nodes: [
    { id: "node-a", label: "Alpha", type: "concept" },
    { id: "node-b", label: "Beta", type: "decision" },
    { id: "node-c", label: "Gamma", type: "risk" },
    { id: "node-d", label: "Delta", type: "question" },
  ],
  edges: [
    { id: "edge-ab", from: "node-a", to: "node-b", relation: "supports" },
    { id: "edge-ac", from: "node-a", to: "node-c", relation: "raises" },
    { id: "edge-cd", from: "node-c", to: "node-d", relation: "blocks" },
  ],
};

describe("overview projections", () => {
  it("creates bounded overview projections that hide detail", () => {
    const projection = createOverviewProjection(graph, {
      id: "projection-a",
      name: "Overview",
      maxNodes: 2,
    });

    expect(projection).toEqual({
      id: "projection-a",
      name: "Overview",
      type: "overview",
      rootNodeIds: [],
      visibleNodeIds: ["node-a", "node-b"],
      visibleEdgeIds: ["edge-ab"],
    });
  });

  it("uses explicit root nodes for overview selection", () => {
    const projection = createOverviewProjection(graph, {
      id: "projection-a",
      name: "Overview",
      maxNodes: 2,
      rootNodeIds: ["node-c", "node-d"],
    });

    expect(projection.rootNodeIds).toEqual(["node-c", "node-d"]);
    expect(projection.visibleNodeIds).toEqual(["node-c", "node-d"]);
    expect(projection.visibleEdgeIds).toEqual(["edge-cd"]);
  });

  it("rejects invalid overview bounds", () => {
    expect(() => createOverviewProjection(graph, { id: "projection-a", name: "Overview", maxNodes: 0 })).toThrow(
      ProjectionValidationError,
    );
  });
});

describe("project map projections", () => {
  it("creates a curated project map with derived visible edges and explicit groups", () => {
    const projection = createProjectMapProjection(graph, {
      id: "projection-project",
      name: "Project Map",
      type: "project-map",
      rootNodeIds: ["node-a"],
      visibleNodeIds: ["node-a", "node-b", "node-c"],
      groups: [
        { id: "group-core", label: "Core", nodeIds: ["node-a", "node-b"] },
        { id: "group-risks", label: "Risks", nodeIds: ["node-c"] },
      ],
    });

    expect(projection).toEqual({
      id: "projection-project",
      name: "Project Map",
      type: "project-map",
      rootNodeIds: ["node-a"],
      visibleNodeIds: ["node-a", "node-b", "node-c"],
      visibleEdgeIds: ["edge-ab", "edge-ac"],
      groups: [
        { id: "group-core", label: "Core", nodeIds: ["node-a", "node-b"] },
        { id: "group-risks", label: "Risks", nodeIds: ["node-c"] },
      ],
    });
  });

  it("rejects an empty project map", () => {
    expect(() =>
      createProjectMapProjection(graph, {
        id: "projection-project",
        name: "Project Map",
        type: "project-map",
        rootNodeIds: [],
        visibleNodeIds: [],
      }),
    ).toThrow(ProjectionValidationError);
  });
});

describe("dive-in projections", () => {
  it("creates a local neighborhood projection around the root node", () => {
    const projection = createDiveInProjection(graph, {
      id: "projection-a",
      name: "Alpha Dive-In",
      rootNodeId: "node-a",
    });

    expect(projection).toEqual({
      id: "projection-a",
      name: "Alpha Dive-In",
      type: "dive-in",
      rootNodeIds: ["node-a"],
      visibleNodeIds: ["node-a", "node-b", "node-c"],
      visibleEdgeIds: ["edge-ab", "edge-ac"],
    });
  });

  it("rejects missing dive-in roots", () => {
    expect(() =>
      createDiveInProjection(graph, {
        id: "projection-a",
        name: "Missing Dive-In",
        rootNodeId: "missing",
      }),
    ).toThrow(ProjectionValidationError);
  });

  it("creates a findings-first dive-in from affected semantic concepts", () => {
    const findingGraph: SemanticGraph = {
      nodes: [
        ...graph.nodes,
        {
          id: "finding-a",
          label: "Contract drift",
          type: "finding",
          metadata: { finding: { affectedNodeIds: ["node-a", "node-c"] } },
        },
      ],
      edges: graph.edges,
    };

    expect(createDiveInProjection(findingGraph, {
      id: "projection-finding",
      name: "Finding Dive-In",
      rootNodeId: "finding-a",
    })).toEqual({
      id: "projection-finding",
      name: "Finding Dive-In",
      type: "dive-in",
      rootNodeIds: ["finding-a"],
      visibleNodeIds: ["finding-a", "node-a", "node-c"],
      visibleEdgeIds: ["edge-ac"],
      groups: [
        { id: "finding", label: "Finding", nodeIds: ["finding-a"] },
        { id: "affected-concepts", label: "Affected concepts", nodeIds: ["node-a", "node-c"] },
      ],
      layout: {
        orientationNote: {
          title: "Finding deep dive",
          purpose: "Understand one problem, the project concepts it affects, and the evidence behind it.",
          usage: [
            "Read the finding first.",
            "Inspect affected concepts beside it.",
            "Use the sidebar for source files, claims, and the recommended action.",
            "Use Back to return to the previous map.",
          ],
        },
      },
    });
  });

  it("rejects a finding that references an unknown affected concept", () => {
    const findingGraph: SemanticGraph = {
      nodes: [
        ...graph.nodes,
        {
          id: "finding-a",
          label: "Contract drift",
          type: "finding",
          metadata: { finding: { affectedNodeIds: ["missing"] } },
        },
      ],
      edges: graph.edges,
    };

    expect(() => createDiveInProjection(findingGraph, {
      id: "projection-finding",
      name: "Finding Dive-In",
      rootNodeId: "finding-a",
    })).toThrow("Finding finding-a references unknown affected node id: missing");
  });
});

describe("projection validation", () => {
  it("accepts groups over visible nodes", () => {
    const projection = createOverviewProjection(graph, {
      id: "projection-a",
      name: "Overview",
      maxNodes: 3,
      groups: [
        {
          id: "group-a",
          label: "Important",
          nodeIds: ["node-a", "node-c"],
          categoryIds: ["risk"],
        },
      ],
    });

    expect(() => validateProjection(projection, graph)).not.toThrow();
  });

  it("rejects projections with hidden edge endpoints", () => {
    const projection: Projection = {
      id: "projection-a",
      name: "Broken",
      type: "overview",
      rootNodeIds: ["node-a"],
      visibleNodeIds: ["node-a"],
      visibleEdgeIds: ["edge-ab"],
    };

    expect(() => validateProjection(projection, graph)).toThrow(ProjectionValidationError);
  });

  it("rejects an incomplete projection orientation note", () => {
    const projection: Projection = {
      id: "projection-a",
      name: "Broken note",
      type: "overview",
      rootNodeIds: [],
      visibleNodeIds: ["node-a"],
      visibleEdgeIds: [],
      layout: { orientationNote: { title: "Help", purpose: "Explain the view", usage: [] } },
    };

    expect(() => validateProjection(projection, graph)).toThrow("orientationNote.usage");
  });

  it("rejects groups that reference hidden nodes", () => {
    const projection: Projection = {
      id: "projection-a",
      name: "Broken",
      type: "overview",
      rootNodeIds: ["node-a"],
      visibleNodeIds: ["node-a"],
      visibleEdgeIds: [],
      groups: [{ id: "group-a", label: "Hidden", nodeIds: ["node-b"] }],
    };

    expect(() => validateProjection(projection, graph)).toThrow(ProjectionValidationError);
  });

  it("rejects unknown projection types", () => {
    const projection = {
      id: "projection-a",
      name: "Broken",
      type: "layout",
      rootNodeIds: [],
      visibleNodeIds: [],
      visibleEdgeIds: [],
    } as unknown as Projection;

    expect(() => validateProjection(projection, graph)).toThrow(ProjectionValidationError);
  });

  it("does not mutate the semantic graph while creating projections", () => {
    const before = JSON.parse(JSON.stringify(graph)) as SemanticGraph;

    createDiveInProjection(graph, {
      id: "projection-a",
      name: "Alpha Dive-In",
      rootNodeId: "node-a",
    });

    expect(graph).toEqual(before);
  });
});
