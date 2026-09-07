/**
 * Responsibility: Derive the atomic workspace-state cascade for one explicit scan deletion.
 * Must not: Persist state, validate transport input, or select which scan to delete.
 * Contract: docs/specs/repository-scan.md and docs/specs/storage-format.md.
 */
import { applyGraphCommands, type GraphCommand } from "@hivemap/graph-core";
import { type FindingMetadata, type ScanRun } from "@hivemap/scans";
import { type WorkspaceState } from "@hivemap/storage";

export type ScanDeletion = {
  state: WorkspaceState;
  deletedFindingNodeIds: string[];
  deletedEdgeIds: string[];
  deletedProjectionIds: string[];
};

export function deleteScanFromWorkspaceState(state: WorkspaceState, run: ScanRun): ScanDeletion {
  const deletedFindingNodeIds = state.graph.nodes
    .filter((node) => node.type === "finding" && (node.metadata?.finding as FindingMetadata | undefined)?.originScanId === run.id)
    .map((node) => node.id);
  const deletedFindingNodeIdSet = new Set(deletedFindingNodeIds);
  const deletedEdgeIds = state.graph.edges
    .filter((edge) => deletedFindingNodeIdSet.has(edge.from) || deletedFindingNodeIdSet.has(edge.to))
    .map((edge) => edge.id);
  const deletedEdgeIdSet = new Set(deletedEdgeIds);
  const commands: GraphCommand[] = [
    ...deletedEdgeIds.map((edgeId) => ({ id: `scan-delete-${run.id}-edge-${edgeId}`, type: "edge.delete" as const, payload: { id: edgeId } })),
    ...deletedFindingNodeIds.map((nodeId) => ({ id: `scan-delete-${run.id}-node-${nodeId}`, type: "node.delete" as const, payload: { id: nodeId } })),
  ];
  const graph = commands.length === 0 ? state.graph : applyGraphCommands(state.graph, commands);
  const projectionCascades = state.projections.map((original) => ({
    original,
    projection: {
      ...original,
      rootNodeIds: original.rootNodeIds.filter((nodeId) => !deletedFindingNodeIdSet.has(nodeId)),
      visibleNodeIds: original.visibleNodeIds.filter((nodeId) => !deletedFindingNodeIdSet.has(nodeId)),
      visibleEdgeIds: original.visibleEdgeIds.filter((edgeId) => !deletedEdgeIdSet.has(edgeId)),
      ...(original.groups === undefined
        ? {}
        : { groups: original.groups.map((group) => ({ ...group, nodeIds: group.nodeIds.filter((nodeId) => !deletedFindingNodeIdSet.has(nodeId)) })) }),
    },
  }));
  const deletedProjectionIds = projectionCascades
    .filter(({ original, projection }) => {
      const lostAllVisibleNodes = original.visibleNodeIds.length !== 0 && projection.visibleNodeIds.length === 0;
      const lostAllRootNodes = original.rootNodeIds.length !== 0 && projection.rootNodeIds.length === 0;
      return lostAllVisibleNodes || lostAllRootNodes;
    })
    .map(({ projection }) => projection.id);
  const deletedProjectionIdSet = new Set(deletedProjectionIds);
  const projections = projectionCascades
    .map(({ projection }) => projection)
    .filter((projection) => !deletedProjectionIdSet.has(projection.id));

  return {
    state: {
      ...state,
      graph,
      projections,
      categoryAssignments: state.categoryAssignments.filter((assignment) => {
        if (assignment.targetType === "node") return !deletedFindingNodeIdSet.has(assignment.targetId);
        if (assignment.targetType === "edge") return !deletedEdgeIdSet.has(assignment.targetId);
        return !deletedProjectionIdSet.has(assignment.targetId);
      }),
      scanRuns: state.scanRuns.filter((candidate) => candidate.id !== run.id),
    },
    deletedFindingNodeIds,
    deletedEdgeIds,
    deletedProjectionIds,
  };
}
