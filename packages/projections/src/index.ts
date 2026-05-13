import { validateGraph, type SemanticGraph } from "@hivemap/graph-core";

const PROJECTION_TYPES = ["conversation-map", "project-map", "overview", "dive-in", "snapshot"] as const;

export type ProjectionType = (typeof PROJECTION_TYPES)[number];

export type Projection = {
  id: string;
  name: string;
  type: ProjectionType;
  rootNodeIds: string[];
  visibleNodeIds: string[];
  visibleEdgeIds: string[];
  groups?: ProjectionGroup[];
  layout?: Record<string, unknown>;
};

export type ProjectionGroup = {
  id: string;
  label: string;
  nodeIds: string[];
  categoryIds?: string[];
};

export type OverviewProjectionInput = {
  id: string;
  name: string;
  maxNodes: number;
  rootNodeIds?: readonly string[];
  groups?: readonly ProjectionGroup[];
};

export type DiveInProjectionInput = {
  id: string;
  name: string;
  rootNodeId: string;
  groups?: readonly ProjectionGroup[];
};

export class ProjectionValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ProjectionValidationError";
  }
}

const PROJECTION_TYPE_SET: ReadonlySet<string> = new Set(PROJECTION_TYPES);

export function createOverviewProjection(graph: SemanticGraph, input: OverviewProjectionInput): Projection {
  validateGraph(graph);
  assertNonEmpty("projection.id", input.id);
  assertNonEmpty("projection.name", input.name);

  if (!Number.isInteger(input.maxNodes) || input.maxNodes < 1) {
    throw new ProjectionValidationError("overview maxNodes must be a positive integer");
  }

  const rootNodeIds = input.rootNodeIds === undefined ? [] : [...input.rootNodeIds];
  const selectedNodeIds = rootNodeIds.length > 0 ? rootNodeIds : graph.nodes.map((node) => node.id);
  const visibleNodeIds = selectedNodeIds.slice(0, input.maxNodes);
  const visibleNodeIdSet = new Set(visibleNodeIds);
  const visibleEdgeIds = graph.edges
    .filter((edge) => visibleNodeIdSet.has(edge.from) && visibleNodeIdSet.has(edge.to))
    .map((edge) => edge.id);

  const projection: Projection = {
    id: input.id,
    name: input.name,
    type: "overview",
    rootNodeIds,
    visibleNodeIds,
    visibleEdgeIds,
  };

  if (input.groups !== undefined) {
    projection.groups = input.groups.map(cloneProjectionGroup);
  }

  validateProjection(projection, graph);
  return projection;
}

export function createDiveInProjection(graph: SemanticGraph, input: DiveInProjectionInput): Projection {
  validateGraph(graph);
  assertNonEmpty("projection.id", input.id);
  assertNonEmpty("projection.name", input.name);
  assertNonEmpty("rootNodeId", input.rootNodeId);

  if (!graph.nodes.some((node) => node.id === input.rootNodeId)) {
    throw new ProjectionValidationError(`Unknown dive-in root node id: ${input.rootNodeId}`);
  }

  const visibleNodeIds = new Set([input.rootNodeId]);
  const visibleEdgeIds: string[] = [];

  for (const edge of graph.edges) {
    if (edge.from === input.rootNodeId || edge.to === input.rootNodeId) {
      visibleEdgeIds.push(edge.id);
      visibleNodeIds.add(edge.from);
      visibleNodeIds.add(edge.to);
    }
  }

  const projection: Projection = {
    id: input.id,
    name: input.name,
    type: "dive-in",
    rootNodeIds: [input.rootNodeId],
    visibleNodeIds: [...visibleNodeIds],
    visibleEdgeIds,
  };

  if (input.groups !== undefined) {
    projection.groups = input.groups.map(cloneProjectionGroup);
  }

  validateProjection(projection, graph);
  return projection;
}

export function validateProjection(projection: Projection, graph: SemanticGraph): void {
  validateGraph(graph);
  assertNonEmpty("projection.id", projection.id);
  assertNonEmpty("projection.name", projection.name);

  if (!PROJECTION_TYPE_SET.has(projection.type)) {
    throw new ProjectionValidationError(`Unknown projection type: ${projection.type}`);
  }

  const graphNodeIds = new Set(graph.nodes.map((node) => node.id));
  const graphEdges = new Map(graph.edges.map((edge) => [edge.id, edge]));

  for (const nodeId of projection.rootNodeIds) {
    assertExistingNodeId("projection.rootNodeIds[]", nodeId, graphNodeIds);
  }

  const visibleNodeIds = new Set<string>();
  for (const nodeId of projection.visibleNodeIds) {
    assertExistingNodeId("projection.visibleNodeIds[]", nodeId, graphNodeIds);

    if (visibleNodeIds.has(nodeId)) {
      throw new ProjectionValidationError(`Duplicate visible node id: ${nodeId}`);
    }

    visibleNodeIds.add(nodeId);
  }

  const visibleEdgeIds = new Set<string>();
  for (const edgeId of projection.visibleEdgeIds) {
    assertNonEmpty("projection.visibleEdgeIds[]", edgeId);

    if (visibleEdgeIds.has(edgeId)) {
      throw new ProjectionValidationError(`Duplicate visible edge id: ${edgeId}`);
    }

    const edge = graphEdges.get(edgeId);
    if (edge === undefined) {
      throw new ProjectionValidationError(`Unknown visible edge id: ${edgeId}`);
    }

    if (!visibleNodeIds.has(edge.from) || !visibleNodeIds.has(edge.to)) {
      throw new ProjectionValidationError(`Visible edge ${edgeId} has hidden endpoint`);
    }

    visibleEdgeIds.add(edgeId);
  }

  if (projection.groups !== undefined) {
    validateProjectionGroups(projection.groups, visibleNodeIds);
  }
}

function validateProjectionGroups(groups: readonly ProjectionGroup[], visibleNodeIds: ReadonlySet<string>): void {
  const groupIds = new Set<string>();

  for (const group of groups) {
    assertNonEmpty("group.id", group.id);
    assertNonEmpty("group.label", group.label);

    if (groupIds.has(group.id)) {
      throw new ProjectionValidationError(`Duplicate projection group id: ${group.id}`);
    }

    for (const nodeId of group.nodeIds) {
      assertNonEmpty("group.nodeIds[]", nodeId);

      if (!visibleNodeIds.has(nodeId)) {
        throw new ProjectionValidationError(`Projection group ${group.id} references hidden node: ${nodeId}`);
      }
    }

    if (group.categoryIds !== undefined) {
      for (const categoryId of group.categoryIds) {
        assertNonEmpty("group.categoryIds[]", categoryId);
      }
    }

    groupIds.add(group.id);
  }
}

function assertExistingNodeId(fieldName: string, nodeId: string, graphNodeIds: ReadonlySet<string>): void {
  assertNonEmpty(fieldName, nodeId);

  if (!graphNodeIds.has(nodeId)) {
    throw new ProjectionValidationError(`Unknown node id: ${nodeId}`);
  }
}

function cloneProjectionGroup(group: ProjectionGroup): ProjectionGroup {
  const cloned: ProjectionGroup = {
    id: group.id,
    label: group.label,
    nodeIds: [...group.nodeIds],
  };

  if (group.categoryIds !== undefined) {
    cloned.categoryIds = [...group.categoryIds];
  }

  return cloned;
}

function assertNonEmpty(fieldName: string, value: string): void {
  if (value.trim().length === 0) {
    throw new ProjectionValidationError(`${fieldName} must be non-empty`);
  }
}
