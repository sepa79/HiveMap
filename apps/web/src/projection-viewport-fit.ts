/**
 * Responsibility: Refit the React Flow viewport when the loaded projection geometry changes.
 * Must not: Derive semantic graph state, react to selection-only styling, or persist viewport state.
 * Contract: Fits non-empty node geometry on workspace, projection, or rendered-node footprint changes.
 */
import { type Node, type ReactFlowInstance } from "@xyflow/react";
import { useEffect } from "react";

type ViewportNode = Pick<Node, "id" | "parentId" | "position" | "style">;

export function useProjectionViewportFit(options: {
  flowInstance: ReactFlowInstance | null;
  nodes: readonly ViewportNode[];
  projectionId: string | null;
  workspaceId: string | null;
}): void {
  const footprintKey = createViewportFootprintKey(options.nodes);

  useEffect(() => {
    if (options.flowInstance !== null && options.nodes.length > 0) {
      void options.flowInstance.fitView({ duration: 180, maxZoom: 1, padding: 0.14 });
    }
  }, [options.flowInstance, options.nodes.length, options.projectionId, options.workspaceId, footprintKey]);
}

function createViewportFootprintKey(nodes: readonly ViewportNode[]): string {
  return JSON.stringify(nodes
    .map((node) => ({
      height: node.style?.height ?? null,
      id: node.id,
      parentId: node.parentId ?? null,
      position: node.position,
      width: node.style?.width ?? null,
    }))
    .sort((left, right) => left.id.localeCompare(right.id)));
}
