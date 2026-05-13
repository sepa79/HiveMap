import { appendFile, mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";
import {
  FeedbackEvent,
  Graph,
  GraphEdge,
  GraphNode,
  GraphNodeType,
  ViewNode,
  ViewState,
  nodeTypes
} from "./types";

const dataDir = path.resolve("data");
const graphPath = path.join(dataDir, "graph.json");
const viewPath = path.join(dataDir, "view.json");
const eventsPath = path.join(dataDir, "events.jsonl");

export async function readGraph(): Promise<Graph> {
  return parseGraph(await readFile(graphPath, "utf8"), graphPath);
}

export async function readView(): Promise<ViewState> {
  return parseView(await readFile(viewPath, "utf8"), viewPath);
}

export async function saveNode(input: unknown): Promise<Graph> {
  const node = parseNode(input);
  const graph = await readGraph();
  const existingIndex = graph.nodes.findIndex((item) => item.id === node.id);
  const nextNodes =
    existingIndex === -1
      ? [...graph.nodes, node]
      : graph.nodes.map((item) => (item.id === node.id ? node : item));
  const nextGraph = { ...graph, nodes: nextNodes };
  validateGraph(nextGraph, graphPath);
  await writeJson(graphPath, nextGraph);
  return nextGraph;
}

export async function saveEdge(input: unknown): Promise<Graph> {
  const edge = parseEdge(input);
  const graph = await readGraph();
  const nodeIds = new Set(graph.nodes.map((node) => node.id));
  if (!nodeIds.has(edge.from) || !nodeIds.has(edge.to)) {
    throw new Error(`Edge '${edge.id}' references missing nodes '${edge.from}' -> '${edge.to}'.`);
  }
  const existingIndex = graph.edges.findIndex((item) => item.id === edge.id);
  const nextEdges =
    existingIndex === -1
      ? [...graph.edges, edge]
      : graph.edges.map((item) => (item.id === edge.id ? edge : item));
  const nextGraph = { ...graph, edges: nextEdges };
  validateGraph(nextGraph, graphPath);
  await writeJson(graphPath, nextGraph);
  return nextGraph;
}

export async function saveViewNode(input: unknown): Promise<ViewState> {
  const viewNode = parseViewNode(input);
  const graph = await readGraph();
  if (!graph.nodes.some((node) => node.id === viewNode.nodeId)) {
    throw new Error(`View node references missing graph node '${viewNode.nodeId}'.`);
  }
  const view = await readView();
  const existingIndex = view.nodes.findIndex((item) => item.nodeId === viewNode.nodeId);
  const nextNodes =
    existingIndex === -1
      ? [...view.nodes, viewNode]
      : view.nodes.map((item) => (item.nodeId === viewNode.nodeId ? viewNode : item));
  const nextView = { nodes: nextNodes };
  await writeJson(viewPath, nextView);
  return nextView;
}

export async function appendFeedback(input: unknown): Promise<FeedbackEvent> {
  const feedback = parseFeedback(input);
  await mkdir(dataDir, { recursive: true });
  await appendFile(eventsPath, `${JSON.stringify(feedback)}\n`, "utf8");
  return feedback;
}

export async function readFeedback(limit: number): Promise<FeedbackEvent[]> {
  const raw = await readFile(eventsPath, "utf8");
  const events = raw
    .split("\n")
    .filter((line) => line.trim().length > 0)
    .map((line, index) => parseFeedbackLine(line, index + 1));
  return events.slice(Math.max(events.length - limit, 0));
}

function parseGraph(raw: string, source: string): Graph {
  const value = JSON.parse(raw) as unknown;
  if (!isRecord(value) || !Array.isArray(value.nodes) || !Array.isArray(value.edges)) {
    throw new Error(`${source} must contain { nodes: [], edges: [] }.`);
  }
  const graph = {
    nodes: value.nodes.map(parseNode),
    edges: value.edges.map(parseEdge)
  };
  validateGraph(graph, source);
  return graph;
}

function validateGraph(graph: Graph, source: string): void {
  const nodeIds = new Set<string>();
  for (const node of graph.nodes) {
    if (nodeIds.has(node.id)) {
      throw new Error(`${source} contains duplicate node id '${node.id}'.`);
    }
    nodeIds.add(node.id);
  }
  const edgeIds = new Set<string>();
  for (const edge of graph.edges) {
    if (edgeIds.has(edge.id)) {
      throw new Error(`${source} contains duplicate edge id '${edge.id}'.`);
    }
    edgeIds.add(edge.id);
    if (!nodeIds.has(edge.from) || !nodeIds.has(edge.to)) {
      throw new Error(`${source} edge '${edge.id}' references missing nodes.`);
    }
  }
}

function parseNode(input: unknown): GraphNode {
  if (!isRecord(input)) {
    throw new Error("Node must be an object.");
  }
  const id = readString(input, "id");
  const label = readString(input, "label");
  const type = readNodeType(input.type);
  const notes = input.notes === undefined ? undefined : readString(input, "notes");
  return notes === undefined ? { id, label, type } : { id, label, type, notes };
}

function parseEdge(input: unknown): GraphEdge {
  if (!isRecord(input)) {
    throw new Error("Edge must be an object.");
  }
  return {
    id: readString(input, "id"),
    from: readString(input, "from"),
    to: readString(input, "to"),
    label: readString(input, "label")
  };
}

function parseView(raw: string, source: string): ViewState {
  const value = JSON.parse(raw) as unknown;
  if (!isRecord(value) || !Array.isArray(value.nodes)) {
    throw new Error(`${source} must contain { nodes: [] }.`);
  }
  return { nodes: value.nodes.map(parseViewNode) };
}

function parseViewNode(input: unknown): ViewNode {
  if (!isRecord(input)) {
    throw new Error("View node must be an object.");
  }
  return {
    nodeId: readString(input, "nodeId"),
    x: readNumber(input, "x"),
    y: readNumber(input, "y")
  };
}

function parseFeedback(input: unknown): FeedbackEvent {
  if (!isRecord(input)) {
    throw new Error("Feedback event must be an object.");
  }
  const type = readString(input, "type");
  if (!["node_moved", "node_marked", "edge_marked", "map_comment"].includes(type)) {
    throw new Error(`Unsupported feedback type '${type}'.`);
  }
  const payload = input.payload;
  if (!isRecord(payload)) {
    throw new Error("Feedback event payload must be an object.");
  }
  return {
    id: typeof input.id === "string" ? input.id : randomUUID(),
    createdAt: typeof input.createdAt === "string" ? input.createdAt : new Date().toISOString(),
    type: type as FeedbackEvent["type"],
    payload
  };
}

function parseFeedbackLine(line: string, lineNumber: number): FeedbackEvent {
  try {
    return parseFeedback(JSON.parse(line) as unknown);
  } catch (error) {
    throw new Error(`Invalid feedback event at data/events.jsonl:${lineNumber}: ${(error as Error).message}`);
  }
}

function readNodeType(value: unknown): GraphNodeType {
  if (typeof value !== "string" || !nodeTypes.includes(value as GraphNodeType)) {
    throw new Error(`Node type must be one of: ${nodeTypes.join(", ")}.`);
  }
  return value as GraphNodeType;
}

function readString(source: Record<string, unknown>, key: string): string {
  const value = source[key];
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new Error(`Expected non-empty string field '${key}'.`);
  }
  return value;
}

function readNumber(source: Record<string, unknown>, key: string): number {
  const value = source[key];
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new Error(`Expected finite number field '${key}'.`);
  }
  return value;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

async function writeJson(filePath: string, value: unknown): Promise<void> {
  await mkdir(dataDir, { recursive: true });
  await writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}
