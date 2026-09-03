// @vitest-environment jsdom
import { renderHook } from "@testing-library/react";
import { type Node, type ReactFlowInstance } from "@xyflow/react";
import { describe, expect, it, vi } from "vitest";

import { useProjectionViewportFit } from "./projection-viewport-fit.js";

describe("useProjectionViewportFit", () => {
  it("preserves the viewport for selection styling and refits when visible geometry changes", () => {
    const fitView = vi.fn().mockResolvedValue(true);
    const flowInstance = { fitView } as unknown as ReactFlowInstance;
    const node = createNode("node-a", 40);
    const { rerender } = renderHook(
      (options) => useProjectionViewportFit(options),
      { initialProps: { flowInstance, nodes: [node], projectionId: "projection-a", workspaceId: "workspace-a" } },
    );

    expect(fitView).toHaveBeenCalledOnce();

    rerender({
      flowInstance,
      nodes: [{ ...node, style: { ...node.style, border: "2px solid cyan", boxShadow: "0 0 20px cyan" } }],
      projectionId: "projection-a",
      workspaceId: "workspace-a",
    });
    expect(fitView).toHaveBeenCalledOnce();

    rerender({
      flowInstance,
      nodes: [node, createNode("node-b", 320)],
      projectionId: "projection-a",
      workspaceId: "workspace-a",
    });
    expect(fitView).toHaveBeenCalledTimes(2);

    rerender({
      flowInstance,
      nodes: [node, createNode("node-b", 320)],
      projectionId: "projection-b",
      workspaceId: "workspace-a",
    });
    expect(fitView).toHaveBeenCalledTimes(3);
  });
});

function createNode(id: string, x: number): Node {
  return {
    data: {},
    id,
    position: { x, y: 100 },
    style: { height: 150, width: 230 },
  };
}
