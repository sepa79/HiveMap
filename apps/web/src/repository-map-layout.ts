/**
 * Responsibility: Build the filtered React Flow presentation model for one persisted HiveMap projection.
 * Must not: Mutate semantic graph data, persist layout, fetch state, or own browser interactions.
 * Contract: Produces a deterministic left-to-right grouped map from explicit workspace, projection, selection, and display filters.
 */
import { type Edge, type Node } from "@xyflow/react";

import { type Projection, type WorkspaceState } from "./api.js";
import { readFindingMetadata } from "./finding-metadata.js";
import { MAP_CARD_COLUMN_PITCH, MAP_CARD_ROW_PITCH, type MapCardData } from "./MapCard.js";
import { humanSeverity, nodeStyle, projectionGroupHeaderStyle } from "./projection-styles.js";
import { isFindingsOverviewProjection } from "./projection-navigation.js";

export type ProjectionDisplayFilters = {
  query: string;
  visibleGroupIds: ReadonlySet<string>;
  showDependencies: boolean;
  showVerifications: boolean;
};

export type ProjectionFlowModel = { nodes: Node[]; edges: Edge[]; semanticNodeIds: ReadonlySet<string> };

const MAP_START_X = 56;
const MAP_START_Y = 104;
const GROUP_GAP = 72;
const MAX_ROWS_PER_COLUMN = 4;

export function buildProjectionFlowModel(options: {
  state: WorkspaceState;
  projection: Projection | null;
  selectedNodeId: string | null;
  filters: ProjectionDisplayFilters;
}): ProjectionFlowModel {
  const projectedNodeIds = new Set(
    options.projection?.visibleNodeIds ?? options.state.graph.nodes.map((node) => node.id),
  );
  const normalizedQuery = options.filters.query.trim().toLocaleLowerCase();
  const groups = options.projection?.groups ?? [];
  const groupByNodeId = new Map(groups.flatMap((group) => group.nodeIds.map((nodeId) => [nodeId, group] as const)));
  const semanticNodes = options.state.graph.nodes.filter((node) => {
    if (!projectedNodeIds.has(node.id)) return false;
    const group = groupByNodeId.get(node.id);
    if (group !== undefined && !options.filters.visibleGroupIds.has(group.id)) return false;
    return normalizedQuery.length === 0 || node.label.toLocaleLowerCase().includes(normalizedQuery);
  });
  const semanticNodeIds = new Set(semanticNodes.map((node) => node.id));
  const positions = createNodePositions(semanticNodes.map((node) => node.id), groups, semanticNodeIds);
  const findingsProjection = options.projection !== null && isFindingsOverviewProjection(options.projection);
  const projectedEdgeIds = options.projection === null ? null : new Set(options.projection.visibleEdgeIds);

  const mapNodes: Node[] = semanticNodes.map((node, index) => ({
    id: node.id,
    type: "map-card",
    data: {
      title: node.label,
      tags: node.type === "finding"
        ? [readFindingMetadata(node)?.kind ?? "finding", humanSeverity(readFindingMetadata(node)?.severity)]
        : [readBoundaryKind(node) ?? node.type],
      variant: node.type === "finding" ? "finding" : "concept",
      ...(readBoundaryKind(node) === undefined ? {} : { boundaryKind: readBoundaryKind(node) }),
    } satisfies MapCardData,
    position: positions.nodePositions.get(node.id) ?? fallbackPosition(index),
    style: nodeStyle(node.type, options.selectedNodeId === node.id, readFindingMetadata(node)?.severity),
  }));

  const groupHeaderNodes: Node[] = positions.visibleGroups.map(({ group, x, columns }) => ({
    id: `__projection-group-${group.id}`,
    className: "projection-group-header-node",
    data: {
      label: `${group.label}\n${group.nodeIds.filter((nodeId) => semanticNodeIds.has(nodeId)).length} ${findingsProjection ? "findings" : "items"}`,
    },
    position: { x, y: 24 },
    selectable: false,
    connectable: false,
    draggable: false,
    style: projectionGroupHeaderStyle(group.id, columns * MAP_CARD_COLUMN_PITCH - 28),
  }));

  const edges: Edge[] = options.state.graph.edges
    .filter((edge) => projectedEdgeIds === null || projectedEdgeIds.has(edge.id))
    .filter((edge) => semanticNodeIds.has(edge.from) && semanticNodeIds.has(edge.to))
    .filter((edge) => edge.relation !== "depends-on" || options.filters.showDependencies)
    .filter((edge) => edge.relation !== "verifies" || options.filters.showVerifications)
    .map((edge) => ({
      id: edge.id,
      source: edge.from,
      target: edge.to,
      type: "smoothstep",
      className: edge.relation === "verifies" ? "map-edge map-edge-verifies" : "map-edge map-edge-dependency",
    }));

  return { nodes: [...groupHeaderNodes, ...mapNodes], edges, semanticNodeIds };
}

function createNodePositions(
  nodeIds: readonly string[],
  groups: Readonly<NonNullable<Projection["groups"]>>,
  visibleNodeIds: ReadonlySet<string>,
): {
  nodePositions: Map<string, { x: number; y: number }>;
  visibleGroups: Array<{ group: NonNullable<Projection["groups"]>[number]; x: number; columns: number }>;
} {
  const nodePositions = new Map<string, { x: number; y: number }>();
  const visibleGroups: Array<{ group: NonNullable<Projection["groups"]>[number]; x: number; columns: number }> = [];
  let nextX = MAP_START_X;

  for (const group of groups) {
    const visibleIds = group.nodeIds.filter((nodeId) => visibleNodeIds.has(nodeId));
    if (visibleIds.length === 0) continue;
    const columns = Math.max(1, Math.ceil(visibleIds.length / MAX_ROWS_PER_COLUMN));
    visibleGroups.push({ group, x: nextX, columns });
    visibleIds.forEach((nodeId, index) => {
      nodePositions.set(nodeId, {
        x: nextX + Math.floor(index / MAX_ROWS_PER_COLUMN) * MAP_CARD_COLUMN_PITCH,
        y: MAP_START_Y + (index % MAX_ROWS_PER_COLUMN) * MAP_CARD_ROW_PITCH,
      });
    });
    nextX += columns * MAP_CARD_COLUMN_PITCH + GROUP_GAP;
  }

  const ungroupedIds = nodeIds.filter((nodeId) => !nodePositions.has(nodeId));
  ungroupedIds.forEach((nodeId, index) => nodePositions.set(nodeId, fallbackPosition(index, nextX)));
  return { nodePositions, visibleGroups };
}

function fallbackPosition(index: number, startX = MAP_START_X): { x: number; y: number } {
  return {
    x: startX + Math.floor(index / MAX_ROWS_PER_COLUMN) * MAP_CARD_COLUMN_PITCH,
    y: MAP_START_Y + (index % MAX_ROWS_PER_COLUMN) * MAP_CARD_ROW_PITCH,
  };
}

function readBoundaryKind(node: WorkspaceState["graph"]["nodes"][number]): string | undefined {
  const value = node.metadata?.boundaryKind;
  return typeof value === "string" && value.trim().length > 0 ? value : undefined;
}
