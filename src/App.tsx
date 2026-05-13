import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Background,
  Controls,
  Edge,
  MiniMap,
  Node,
  NodeChange,
  OnNodeDrag,
  ReactFlow,
  applyNodeChanges
} from "@xyflow/react";

import { fetchGraph, saveNode, saveViewNode, sendFeedback } from "./api";
import { Graph, GraphNode, GraphNodeType, GraphResponse, ViewState } from "./types";

type SelectedItem =
  | { kind: "node"; id: string }
  | { kind: "edge"; id: string }
  | { kind: "none" };

const typeClass: Record<GraphNodeType, string> = {
  concept: "nodeConcept",
  decision: "nodeDecision",
  risk: "nodeRisk",
  question: "nodeQuestion",
  evidence: "nodeEvidence"
};

const emptyGraph: Graph = { nodes: [], edges: [] };
const emptyView: ViewState = { nodes: [] };

export default function App() {
  const [graph, setGraph] = useState<Graph>(emptyGraph);
  const [view, setView] = useState<ViewState>(emptyView);
  const [nodes, setNodes] = useState<Node[]>([]);
  const [edges, setEdges] = useState<Edge[]>([]);
  const [selected, setSelected] = useState<SelectedItem>({ kind: "none" });
  const [status, setStatus] = useState("Loading graph");
  const [draft, setDraft] = useState({ id: "", label: "", type: "concept" as GraphNodeType, notes: "" });
  const [comment, setComment] = useState("");

  const selectedNode = selected.kind === "node" ? graph.nodes.find((node) => node.id === selected.id) : undefined;
  const selectedEdge = selected.kind === "edge" ? graph.edges.find((edge) => edge.id === selected.id) : undefined;

  const loadGraph = useCallback(async () => {
    const response = await fetchGraph();
    setGraph(response.graph);
    setView(response.view);
    setStatus(`Loaded ${response.graph.nodes.length} nodes and ${response.graph.edges.length} edges`);
  }, []);

  useEffect(() => {
    loadGraph().catch((error: unknown) => {
      setStatus((error as Error).message);
    });
  }, [loadGraph]);

  useEffect(() => {
    const next = toFlow(responseFromState(graph, view));
    setNodes(next.nodes);
    setEdges(next.edges);
  }, [graph, view]);

  const onNodesChange = useCallback((changes: NodeChange[]) => {
    setNodes((current) => applyNodeChanges(changes, current));
  }, []);

  const onNodeDragStop: OnNodeDrag = useCallback(async (_event, node) => {
    const viewNode = { nodeId: node.id, x: node.position.x, y: node.position.y };
    try {
      await saveViewNode(viewNode);
      await sendFeedback("node_moved", viewNode);
      setView((current) => ({
        nodes: [...current.nodes.filter((item) => item.nodeId !== viewNode.nodeId), viewNode]
      }));
      setStatus(`Captured movement feedback for ${node.id}`);
    } catch (error) {
      setStatus((error as Error).message);
    }
  }, []);

  const markNode = useCallback(
    async (mark: "important" | "unclear" | "wrong") => {
      if (selected.kind !== "node") {
        setStatus("Select a node first.");
        return;
      }
      await sendFeedback("node_marked", { nodeId: selected.id, mark });
      setStatus(`Captured '${mark}' feedback for node ${selected.id}`);
    },
    [selected]
  );

  const markEdge = useCallback(
    async (mark: "important" | "unclear" | "wrong") => {
      if (selected.kind !== "edge") {
        setStatus("Select an edge first.");
        return;
      }
      await sendFeedback("edge_marked", { edgeId: selected.id, mark });
      setStatus(`Captured '${mark}' feedback for edge ${selected.id}`);
    },
    [selected]
  );

  const submitComment = useCallback(async () => {
    if (comment.trim().length === 0) {
      setStatus("Comment cannot be empty.");
      return;
    }
    await sendFeedback("map_comment", { comment });
    setComment("");
    setStatus("Captured map comment.");
  }, [comment]);

  const submitNode = useCallback(async () => {
    const node: GraphNode = {
      id: draft.id,
      label: draft.label,
      type: draft.type,
      notes: draft.notes.trim().length === 0 ? undefined : draft.notes
    };
    try {
      await saveNode(node);
      setDraft({ id: "", label: "", type: "concept", notes: "" });
      await loadGraph();
    } catch (error) {
      setStatus((error as Error).message);
    }
  }, [draft, loadGraph]);

  const selectionLabel = useMemo(() => {
    if (selectedNode) return selectedNode.label;
    if (selectedEdge) return selectedEdge.label;
    return "Nothing selected";
  }, [selectedEdge, selectedNode]);

  return (
    <main className="appShell">
      <section className="mapPane" aria-label="HiveMap graph">
        <ReactFlow
          nodes={nodes}
          edges={edges}
          onNodesChange={onNodesChange}
          onNodeDragStop={onNodeDragStop}
          onNodeClick={(_event, node) => setSelected({ kind: "node", id: node.id })}
          onEdgeClick={(_event, edge) => setSelected({ kind: "edge", id: edge.id })}
          onPaneClick={() => setSelected({ kind: "none" })}
          fitView
        >
          <Background />
          <MiniMap pannable zoomable />
          <Controls />
        </ReactFlow>
      </section>

      <aside className="sidePanel">
        <header>
          <p className="eyebrow">HiveMap POC</p>
          <h1>Conversation graph</h1>
          <p className="status">{status}</p>
        </header>

        <section className="panelSection">
          <h2>{selectionLabel}</h2>
          {selectedNode ? (
            <div className="details">
              <span className={`typeBadge ${typeClass[selectedNode.type]}`}>{selectedNode.type}</span>
              <p>{selectedNode.notes ?? "No notes."}</p>
              <div className="buttonRow">
                <button type="button" onClick={() => void markNode("important")}>
                  Important
                </button>
                <button type="button" onClick={() => void markNode("unclear")}>
                  Unclear
                </button>
                <button type="button" onClick={() => void markNode("wrong")}>
                  Wrong
                </button>
              </div>
            </div>
          ) : null}
          {selectedEdge ? (
            <div className="details">
              <p>
                {selectedEdge.from} {"->"} {selectedEdge.to}
              </p>
              <div className="buttonRow">
                <button type="button" onClick={() => void markEdge("important")}>
                  Important
                </button>
                <button type="button" onClick={() => void markEdge("unclear")}>
                  Unclear
                </button>
                <button type="button" onClick={() => void markEdge("wrong")}>
                  Wrong
                </button>
              </div>
            </div>
          ) : null}
        </section>

        <section className="panelSection">
          <h2>Map feedback</h2>
          <textarea value={comment} onChange={(event) => setComment(event.target.value)} rows={4} />
          <button type="button" onClick={() => void submitComment()}>
            Capture comment
          </button>
        </section>

        <details className="panelSection emergencyEdit">
          <summary>Emergency manual edit</summary>
          <input
            value={draft.id}
            placeholder="id"
            onChange={(event) => setDraft((current) => ({ ...current, id: event.target.value }))}
          />
          <input
            value={draft.label}
            placeholder="label"
            onChange={(event) => setDraft((current) => ({ ...current, label: event.target.value }))}
          />
          <select
            value={draft.type}
            onChange={(event) => setDraft((current) => ({ ...current, type: event.target.value as GraphNodeType }))}
          >
            <option value="concept">concept</option>
            <option value="decision">decision</option>
            <option value="risk">risk</option>
            <option value="question">question</option>
            <option value="evidence">evidence</option>
          </select>
          <textarea
            value={draft.notes}
            placeholder="notes"
            rows={3}
            onChange={(event) => setDraft((current) => ({ ...current, notes: event.target.value }))}
          />
          <button type="button" onClick={() => void submitNode()}>
            Save node
          </button>
        </details>
      </aside>
    </main>
  );
}

function responseFromState(graph: Graph, view: ViewState): GraphResponse {
  return { graph, view };
}

function toFlow(response: GraphResponse): { nodes: Node[]; edges: Edge[] } {
  const positions = new Map(response.view.nodes.map((node) => [node.nodeId, node]));
  return {
    nodes: response.graph.nodes.map((node, index) => {
      const position = positions.get(node.id) ?? { x: 120 + index * 80, y: 120 + index * 40 };
      return {
        id: node.id,
        position,
        data: { label: node.label },
        className: typeClass[node.type]
      };
    }),
    edges: response.graph.edges.map((edge) => ({
      id: edge.id,
      source: edge.from,
      target: edge.to,
      label: edge.label,
      animated: false
    }))
  };
}
