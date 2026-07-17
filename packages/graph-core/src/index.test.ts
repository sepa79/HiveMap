import { describe, expect, it } from "vitest";

import {
  GraphValidationError,
  applyGraphCommand,
  applyGraphCommands,
  createEmptyGraph,
  validateGraph,
  type GraphCommand,
  type SemanticGraph,
} from "./index.js";

const baseGraph: SemanticGraph = {
  nodes: [
    { id: "node-a", label: "Alpha", type: "concept" },
    { id: "node-b", label: "Beta", type: "decision" },
  ],
  edges: [{ id: "edge-a", from: "node-a", to: "node-b", relation: "supports" }],
};

describe("validateGraph", () => {
  it("accepts a valid semantic graph", () => {
    expect(() => validateGraph(baseGraph)).not.toThrow();
  });

  it("rejects duplicate node ids", () => {
    const graph: SemanticGraph = {
      nodes: [
        { id: "node-a", label: "Alpha", type: "concept" },
        { id: "node-a", label: "Duplicate", type: "risk" },
      ],
      edges: [],
    };

    expect(() => validateGraph(graph)).toThrow(GraphValidationError);
  });

  it("rejects duplicate edge ids", () => {
    const graph: SemanticGraph = {
      nodes: baseGraph.nodes,
      edges: [
        { id: "edge-a", from: "node-a", to: "node-b", relation: "supports" },
        { id: "edge-a", from: "node-b", to: "node-a", relation: "blocks" },
      ],
    };

    expect(() => validateGraph(graph)).toThrow(GraphValidationError);
  });

  it("rejects edges that reference missing endpoints", () => {
    const graph: SemanticGraph = {
      nodes: [{ id: "node-a", label: "Alpha", type: "concept" }],
      edges: [{ id: "edge-a", from: "node-a", to: "missing", relation: "supports" }],
    };

    expect(() => validateGraph(graph)).toThrow(GraphValidationError);
  });

  it("rejects empty required fields", () => {
    const graph: SemanticGraph = {
      nodes: [{ id: " ", label: "Alpha", type: "concept" }],
      edges: [],
    };

    expect(() => validateGraph(graph)).toThrow(GraphValidationError);
  });

  it("rejects unknown node types", () => {
    const graph = {
      nodes: [{ id: "node-a", label: "Alpha", type: "layout" }],
      edges: [],
    } as unknown as SemanticGraph;

    expect(() => validateGraph(graph)).toThrow(GraphValidationError);
  });

  it("accepts typed project source references in node metadata", () => {
    const graph: SemanticGraph = {
      nodes: [
        {
          id: "focus-cognition",
          label: "Focus/Cognition",
          type: "concept",
          metadata: {
            sourceRefs: [
              {
                role: "defines",
                source: "repo-doc",
                target: "docs/specs/signal-rock-perception-ui.md",
                anchor: "Focus and Cognition",
              },
              {
                role: "implements",
                source: "code",
                target: "apps/the-probe/src/ui/perception-cognition.ts",
              },
            ],
          },
        },
      ],
      edges: [],
    };

    expect(() => validateGraph(graph)).not.toThrow();
  });

  it("rejects unknown project source reference values", () => {
    const graph = {
      nodes: [
        {
          id: "focus-cognition",
          label: "Focus/Cognition",
          type: "concept",
          metadata: {
            sourceRefs: [{ role: "guesses", source: "wiki", target: " " }],
          },
        },
      ],
      edges: [],
    } as unknown as SemanticGraph;

    expect(() => validateGraph(graph)).toThrow(GraphValidationError);
  });
});

describe("applyGraphCommand", () => {
  it("creates nodes through commands", () => {
    const graph = applyGraphCommand(createEmptyGraph(), {
      id: "cmd-a",
      type: "node.create",
      payload: { node: { id: "node-a", label: "Alpha", type: "concept" } },
    });

    expect(graph.nodes).toEqual([{ id: "node-a", label: "Alpha", type: "concept" }]);
  });

  it("creates edges only when endpoints exist", () => {
    const command: GraphCommand = {
      id: "cmd-a",
      type: "edge.create",
      payload: { edge: { id: "edge-b", from: "node-a", to: "missing", relation: "supports" } },
    };

    expect(() => applyGraphCommand(baseGraph, command)).toThrow(GraphValidationError);
  });

  it("updates nodes while keeping ids immutable", () => {
    const graph = applyGraphCommand(baseGraph, {
      id: "cmd-a",
      type: "node.update",
      payload: {
        id: "node-a",
        changes: { id: "changed", label: "Updated", type: "question" } as never,
      },
    });

    expect(graph.nodes.find((node) => node.id === "node-a")).toEqual({
      id: "node-a",
      label: "Updated",
      type: "question",
    });
    expect(graph.nodes.some((node) => node.id === "changed")).toBe(false);
  });

  it("updates edges while keeping ids immutable", () => {
    const graph = applyGraphCommand(baseGraph, {
      id: "cmd-a",
      type: "edge.update",
      payload: {
        id: "edge-a",
        changes: { id: "changed", relation: "blocks" } as never,
      },
    });

    expect(graph.edges).toEqual([{ id: "edge-a", from: "node-a", to: "node-b", relation: "blocks" }]);
  });

  it("rejects deleting a node with incident edges", () => {
    expect(() =>
      applyGraphCommand(baseGraph, {
        id: "cmd-a",
        type: "node.delete",
        payload: { id: "node-a" },
      }),
    ).toThrow(GraphValidationError);
  });

  it("deletes edges explicitly before deleting nodes", () => {
    const graph = applyGraphCommands(baseGraph, [
      { id: "cmd-a", type: "edge.delete", payload: { id: "edge-a" } },
      { id: "cmd-b", type: "node.delete", payload: { id: "node-a" } },
    ]);

    expect(graph).toEqual({
      nodes: [{ id: "node-b", label: "Beta", type: "decision" }],
      edges: [],
    });
  });

  it("fails atomically for invalid commands", () => {
    expect(() =>
      applyGraphCommand(baseGraph, {
        id: "cmd-a",
        type: "node.create",
        payload: { node: { id: "node-a", label: "Duplicate", type: "concept" } },
      }),
    ).toThrow(GraphValidationError);

    expect(baseGraph.nodes).toHaveLength(2);
    expect(baseGraph.edges).toHaveLength(1);
  });
});
