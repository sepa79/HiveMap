export type GraphNodeType = "concept" | "decision" | "risk" | "question" | "evidence";

export type GraphNode = {
  id: string;
  label: string;
  type: GraphNodeType;
  notes?: string;
};

export type GraphEdge = {
  id: string;
  from: string;
  to: string;
  label: string;
};

export type Graph = {
  nodes: GraphNode[];
  edges: GraphEdge[];
};

export type ViewNode = {
  nodeId: string;
  x: number;
  y: number;
};

export type ViewState = {
  nodes: ViewNode[];
};

export type GraphResponse = {
  graph: Graph;
  view: ViewState;
};

export type FeedbackEvent = {
  id: string;
  createdAt: string;
  type: "node_moved" | "node_marked" | "edge_marked" | "map_comment";
  payload: Record<string, unknown>;
};
