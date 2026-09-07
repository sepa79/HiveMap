import { validateGraph, type SemanticGraph } from "@hivemap/graph-core";

const PROJECTION_TYPES = ["conversation-map", "project-map", "overview", "dive-in"] as const;

export type ProjectionType = (typeof PROJECTION_TYPES)[number];

export type Projection = {
  id: string;
  name: string;
  type: ProjectionType;
  rootNodeIds: string[];
  visibleNodeIds: string[];
  visibleEdgeIds: string[];
  groups?: ProjectionGroup[];
  layout?: ProjectionLayout;
};

export type ProjectionOrientationNote = {
  title: string;
  purpose: string;
  usage: string[];
};

export type ProjectionLayout = Record<string, unknown> & {
  orientationNote?: ProjectionOrientationNote;
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

export type ProjectMapProjectionInput = {
  id: string;
  name: string;
  type: "project-map";
  rootNodeIds: readonly string[];
  visibleNodeIds: readonly string[];
  groups?: readonly ProjectionGroup[];
  layout?: Record<string, unknown>;
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

  const rootNode = graph.nodes.find((node) => node.id === input.rootNodeId);
  if (rootNode === undefined) {
    throw new ProjectionValidationError(`Unknown dive-in root node id: ${input.rootNodeId}`);
  }

  const visibleNodeIds = new Set([input.rootNodeId]);
  const finding = rootNode.type === "finding" ? readFindingProjectionMetadata(rootNode.metadata) : undefined;

  if (finding !== undefined) {
    for (const affectedNodeId of finding.affectedNodeIds) {
      if (!graph.nodes.some((node) => node.id === affectedNodeId)) {
        throw new ProjectionValidationError(`Finding ${rootNode.id} references unknown affected node id: ${affectedNodeId}`);
      }
      visibleNodeIds.add(affectedNodeId);
    }
  }

  for (const edge of graph.edges) {
    if (edge.from === input.rootNodeId || edge.to === input.rootNodeId) {
      visibleNodeIds.add(edge.from);
      visibleNodeIds.add(edge.to);
    }
  }

  const visibleEdgeIds = graph.edges
    .filter((edge) => visibleNodeIds.has(edge.from) && visibleNodeIds.has(edge.to))
    .map((edge) => edge.id);

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
  } else if (finding !== undefined) {
    projection.groups = [
      { id: "finding", label: "Finding", nodeIds: [input.rootNodeId] },
      { id: "affected-concepts", label: "Affected concepts", nodeIds: [...finding.affectedNodeIds] },
    ].filter((group) => group.nodeIds.length > 0);
    projection.layout = {
      orientationNote: {
        title: "Finding deep dive",
        purpose: "Understand one problem, the project concepts it affects, and the evidence behind it.",
        usage: [
          "Read the finding first.",
          "Inspect affected concepts beside it.",
          "Use the sidebar for source files, claims, and the recommended action.",
          "Use Back to return to the previous map.",
        ],
      } satisfies ProjectionOrientationNote,
    };
  }

  validateProjection(projection, graph);
  return projection;
}

function readFindingProjectionMetadata(metadata: Record<string, unknown> | undefined): { affectedNodeIds: string[] } | undefined {
  const finding = metadata?.finding;
  if (typeof finding !== "object" || finding === null || !("affectedNodeIds" in finding)) return undefined;
  const affectedNodeIds = finding.affectedNodeIds;
  if (!Array.isArray(affectedNodeIds) || affectedNodeIds.some((nodeId) => typeof nodeId !== "string" || nodeId.length === 0)) {
    throw new ProjectionValidationError("Finding projection metadata requires non-empty string affectedNodeIds");
  }
  return { affectedNodeIds };
}

export function createProjectMapProjection(graph: SemanticGraph, input: ProjectMapProjectionInput): Projection {
  validateGraph(graph);
  assertNonEmpty("projection.id", input.id);
  assertNonEmpty("projection.name", input.name);

  if (input.visibleNodeIds.length === 0) {
    throw new ProjectionValidationError("project map must contain at least one visible node");
  }

  const visibleNodeIds = [...input.visibleNodeIds];
  const visibleNodeIdSet = new Set(visibleNodeIds);
  const projection: Projection = {
    id: input.id,
    name: input.name,
    type: "project-map",
    rootNodeIds: [...input.rootNodeIds],
    visibleNodeIds,
    visibleEdgeIds: graph.edges
      .filter((edge) => visibleNodeIdSet.has(edge.from) && visibleNodeIdSet.has(edge.to))
      .map((edge) => edge.id),
  };

  if (input.groups !== undefined) {
    projection.groups = input.groups.map(cloneProjectionGroup);
  }

  if (input.layout !== undefined) {
    projection.layout = structuredClone(input.layout);
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


  validateProjectionOrientationNote(projection.layout);
}

function validateProjectionOrientationNote(layout: Record<string, unknown> | undefined): void {
  if (layout === undefined || layout.orientationNote === undefined) return;
  const note = layout.orientationNote;
  if (typeof note !== "object" || note === null) {
    throw new ProjectionValidationError("projection.layout.orientationNote must be an object");
  }
  if (!("title" in note) || typeof note.title !== "string" || note.title.trim().length === 0) {
    throw new ProjectionValidationError("projection.layout.orientationNote.title must be non-empty");
  }
  if (!("purpose" in note) || typeof note.purpose !== "string" || note.purpose.trim().length === 0) {
    throw new ProjectionValidationError("projection.layout.orientationNote.purpose must be non-empty");
  }
  if (!("usage" in note) || !Array.isArray(note.usage) || note.usage.length === 0 || note.usage.some((item) => typeof item !== "string" || item.trim().length === 0)) {
    throw new ProjectionValidationError("projection.layout.orientationNote.usage must contain non-empty strings");
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
