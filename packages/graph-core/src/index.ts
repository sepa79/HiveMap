const GRAPH_NODE_TYPE_VALUES = [
  "concept",
  "decision",
  "risk",
  "question",
  "evidence",
  "component",
  "system",
  "role",
  "pattern",
] as const;

export type GraphNodeType = (typeof GRAPH_NODE_TYPE_VALUES)[number];

export type GraphNode = {
  id: string;
  label: string;
  type: GraphNodeType;
  notes?: string;
  metadata?: Record<string, unknown>;
};

export type GraphEdge = {
  id: string;
  from: string;
  to: string;
  relation: string;
  label?: string;
  notes?: string;
  metadata?: Record<string, unknown>;
};

export type SemanticGraph = {
  nodes: GraphNode[];
  edges: GraphEdge[];
};

export type CreateNodePayload = {
  node: GraphNode;
};

export type UpdateNodePayload = {
  id: string;
  changes: Partial<Omit<GraphNode, "id">>;
};

export type DeleteNodePayload = {
  id: string;
};

export type CreateEdgePayload = {
  edge: GraphEdge;
};

export type UpdateEdgePayload = {
  id: string;
  changes: Partial<Omit<GraphEdge, "id">>;
};

export type DeleteEdgePayload = {
  id: string;
};

export type GraphCommand =
  | { id: string; type: "node.create"; payload: CreateNodePayload }
  | { id: string; type: "node.update"; payload: UpdateNodePayload }
  | { id: string; type: "node.delete"; payload: DeleteNodePayload }
  | { id: string; type: "edge.create"; payload: CreateEdgePayload }
  | { id: string; type: "edge.update"; payload: UpdateEdgePayload }
  | { id: string; type: "edge.delete"; payload: DeleteEdgePayload };

const GRAPH_NODE_TYPES: ReadonlySet<string> = new Set(GRAPH_NODE_TYPE_VALUES);

export class GraphValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "GraphValidationError";
  }
}

export function createEmptyGraph(): SemanticGraph {
  return { nodes: [], edges: [] };
}

export function validateGraph(graph: SemanticGraph): void {
  const nodeIds = new Set<string>();
  const edgeIds = new Set<string>();

  for (const node of graph.nodes) {
    validateNode(node);

    if (nodeIds.has(node.id)) {
      throw new GraphValidationError(`Duplicate node id: ${node.id}`);
    }

    nodeIds.add(node.id);
  }

  for (const edge of graph.edges) {
    validateEdgeShape(edge);

    if (edgeIds.has(edge.id)) {
      throw new GraphValidationError(`Duplicate edge id: ${edge.id}`);
    }

    if (!nodeIds.has(edge.from)) {
      throw new GraphValidationError(`Edge ${edge.id} references missing source node: ${edge.from}`);
    }

    if (!nodeIds.has(edge.to)) {
      throw new GraphValidationError(`Edge ${edge.id} references missing target node: ${edge.to}`);
    }

    edgeIds.add(edge.id);
  }
}

export function applyGraphCommand(graph: SemanticGraph, command: GraphCommand): SemanticGraph {
  assertNonEmpty("command.id", command.id);
  validateGraph(graph);

  const nextGraph = applyValidatedCommand(graph, command);
  validateGraph(nextGraph);
  return nextGraph;
}

export function applyGraphCommands(graph: SemanticGraph, commands: readonly GraphCommand[]): SemanticGraph {
  return commands.reduce((currentGraph, command) => applyGraphCommand(currentGraph, command), graph);
}

function applyValidatedCommand(graph: SemanticGraph, command: GraphCommand): SemanticGraph {
  switch (command.type) {
    case "node.create":
      return createNode(graph, command.payload);
    case "node.update":
      return updateNode(graph, command.payload);
    case "node.delete":
      return deleteNode(graph, command.payload);
    case "edge.create":
      return createEdge(graph, command.payload);
    case "edge.update":
      return updateEdge(graph, command.payload);
    case "edge.delete":
      return deleteEdge(graph, command.payload);
  }
}

function createNode(graph: SemanticGraph, payload: CreateNodePayload): SemanticGraph {
  validateNode(payload.node);

  if (graph.nodes.some((node) => node.id === payload.node.id)) {
    throw new GraphValidationError(`Node already exists: ${payload.node.id}`);
  }

  return {
    nodes: [...graph.nodes, payload.node],
    edges: graph.edges,
  };
}

function updateNode(graph: SemanticGraph, payload: UpdateNodePayload): SemanticGraph {
  assertNonEmpty("payload.id", payload.id);

  let found = false;
  const nodes = graph.nodes.map((node) => {
    if (node.id !== payload.id) {
      return node;
    }

    found = true;
    const updated = { ...node, ...payload.changes, id: node.id };
    validateNode(updated);
    return updated;
  });

  if (!found) {
    throw new GraphValidationError(`Node does not exist: ${payload.id}`);
  }

  return { nodes, edges: graph.edges };
}

function deleteNode(graph: SemanticGraph, payload: DeleteNodePayload): SemanticGraph {
  assertNonEmpty("payload.id", payload.id);

  if (!graph.nodes.some((node) => node.id === payload.id)) {
    throw new GraphValidationError(`Node does not exist: ${payload.id}`);
  }

  const incidentEdge = graph.edges.find((edge) => edge.from === payload.id || edge.to === payload.id);
  if (incidentEdge !== undefined) {
    throw new GraphValidationError(`Cannot delete node ${payload.id} while edge ${incidentEdge.id} references it`);
  }

  return {
    nodes: graph.nodes.filter((node) => node.id !== payload.id),
    edges: graph.edges,
  };
}

function createEdge(graph: SemanticGraph, payload: CreateEdgePayload): SemanticGraph {
  validateEdgeShape(payload.edge);

  if (graph.edges.some((edge) => edge.id === payload.edge.id)) {
    throw new GraphValidationError(`Edge already exists: ${payload.edge.id}`);
  }

  return {
    nodes: graph.nodes,
    edges: [...graph.edges, payload.edge],
  };
}

function updateEdge(graph: SemanticGraph, payload: UpdateEdgePayload): SemanticGraph {
  assertNonEmpty("payload.id", payload.id);

  let found = false;
  const edges = graph.edges.map((edge) => {
    if (edge.id !== payload.id) {
      return edge;
    }

    found = true;
    const updated = { ...edge, ...payload.changes, id: edge.id };
    validateEdgeShape(updated);
    return updated;
  });

  if (!found) {
    throw new GraphValidationError(`Edge does not exist: ${payload.id}`);
  }

  return { nodes: graph.nodes, edges };
}

function deleteEdge(graph: SemanticGraph, payload: DeleteEdgePayload): SemanticGraph {
  assertNonEmpty("payload.id", payload.id);

  if (!graph.edges.some((edge) => edge.id === payload.id)) {
    throw new GraphValidationError(`Edge does not exist: ${payload.id}`);
  }

  return {
    nodes: graph.nodes,
    edges: graph.edges.filter((edge) => edge.id !== payload.id),
  };
}

function validateNode(node: GraphNode): void {
  assertNonEmpty("node.id", node.id);
  assertNonEmpty("node.label", node.label);

  if (!GRAPH_NODE_TYPES.has(node.type)) {
    throw new GraphValidationError(`Unknown node type: ${node.type}`);
  }
}

function validateEdgeShape(edge: GraphEdge): void {
  assertNonEmpty("edge.id", edge.id);
  assertNonEmpty("edge.from", edge.from);
  assertNonEmpty("edge.to", edge.to);
  assertNonEmpty("edge.relation", edge.relation);
}

function assertNonEmpty(fieldName: string, value: string): void {
  if (value.trim().length === 0) {
    throw new GraphValidationError(`${fieldName} must be non-empty`);
  }
}
