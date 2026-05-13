import "@xyflow/react/dist/style.css";
import "./styles.css";

import { ReactFlow, Background, Controls, type Edge, type Node } from "@xyflow/react";
import {
  AlertCircle,
  Check,
  CheckCircle2,
  CircleSlash,
  FolderPlus,
  GitBranchPlus,
  GitCommitHorizontal,
  Loader2,
  MessageSquarePlus,
  Plus,
  Save,
  Search,
  Tags,
} from "lucide-react";
import { FormEvent, useMemo, useState } from "react";
import { createRoot } from "react-dom/client";

import {
  applyProposal,
  approveProposal,
  assignCategory,
  createEdge,
  createDiveIn,
  createNode,
  createOverview,
  createProposal,
  createSnapshot,
  createWorkspace,
  getWorkspace,
  rejectProposal,
  recordFeedback,
  type CategoryAssignment,
  type FeedbackEvent,
  type GraphNodeType,
  type Projection,
  type WorkspaceState,
} from "./api.js";
import { slugifyNodeId } from "./ids.js";

const NODE_TYPES: GraphNodeType[] = [
  "concept",
  "decision",
  "risk",
  "question",
  "evidence",
  "component",
  "system",
  "role",
  "pattern",
];

function App() {
  const [workspaceId, setWorkspaceId] = useState("alpha");
  const [workspaceName, setWorkspaceName] = useState("Alpha Map");
  const [state, setState] = useState<WorkspaceState | null>(null);
  const [selectedProjection, setSelectedProjection] = useState<Projection | null>(null);
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [nodeLabel, setNodeLabel] = useState("");
  const [nodeType, setNodeType] = useState<GraphNodeType>("concept");
  const [edgeFrom, setEdgeFrom] = useState("");
  const [edgeTo, setEdgeTo] = useState("");
  const [edgeRelation, setEdgeRelation] = useState("relates_to");
  const [proposalLabel, setProposalLabel] = useState("");
  const [proposalType, setProposalType] = useState<GraphNodeType>("concept");
  const [proposalExplanation, setProposalExplanation] = useState("");
  const [feedbackText, setFeedbackText] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const visibleNodeIds = useMemo(() => {
    if (selectedProjection === null) {
      return new Set(state?.graph.nodes.map((node) => node.id) ?? []);
    }
    return new Set(selectedProjection.visibleNodeIds);
  }, [selectedProjection, state]);

  const flowNodes = useMemo<Node[]>(() => {
    if (state === null) {
      return [];
    }

    return state.graph.nodes
      .filter((node) => visibleNodeIds.has(node.id))
      .map((node, index) => ({
        id: node.id,
        data: {
          label: `${node.label}\n${node.type}`,
        },
        position: {
          x: 120 + (index % 4) * 220,
          y: 100 + Math.floor(index / 4) * 150,
        },
        style: nodeStyle(node.type, selectedNodeId === node.id),
      }));
  }, [selectedNodeId, state, visibleNodeIds]);

  const flowEdges = useMemo<Edge[]>(() => {
    if (state === null) {
      return [];
    }

    return state.graph.edges
      .filter((edge) => visibleNodeIds.has(edge.from) && visibleNodeIds.has(edge.to))
      .map((edge) => ({
        id: edge.id,
        source: edge.from,
        target: edge.to,
        label: edge.label ?? edge.relation,
      }));
  }, [state, visibleNodeIds]);

  async function run(operation: () => Promise<void>): Promise<void> {
    setBusy(true);
    setError(null);
    try {
      await operation();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Unknown HiveMap error");
    } finally {
      setBusy(false);
    }
  }

  async function refresh(id = workspaceId): Promise<WorkspaceState> {
    const next = await getWorkspace(id);
    setState(next);
    if (selectedProjection !== null) {
      setSelectedProjection(next.projections.find((projection) => projection.id === selectedProjection.id) ?? null);
    }
    return next;
  }

  function handleWorkspaceSubmit(event: FormEvent<HTMLFormElement>): void {
    event.preventDefault();
    void run(async () => {
      await createWorkspace({
        id: workspaceId,
        name: workspaceName,
        createdAt: new Date().toISOString(),
      });
      const next = await refresh();
      setSelectedProjection(null);
      setSelectedNodeId(next.graph.nodes[0]?.id ?? null);
      setEdgeFrom(next.graph.nodes[0]?.id ?? "");
      setEdgeTo(next.graph.nodes[1]?.id ?? "");
    });
  }

  function handleLoadWorkspace(): void {
    void run(async () => {
      const next = await refresh();
      setSelectedProjection(next.projections.at(-1) ?? null);
      setSelectedNodeId(next.graph.nodes[0]?.id ?? null);
      setEdgeFrom(next.graph.nodes[0]?.id ?? "");
      setEdgeTo(next.graph.nodes[1]?.id ?? "");
    });
  }

  function handleAddNode(event: FormEvent<HTMLFormElement>): void {
    event.preventDefault();
    void run(async () => {
      const id = slugifyNodeId(nodeLabel);
      await createNode(workspaceId, {
        id,
        label: nodeLabel,
        type: nodeType,
      });
      setNodeLabel("");
      await refresh();
      setSelectedNodeId(id);
    });
  }

  function handleAddEdge(event: FormEvent<HTMLFormElement>): void {
    event.preventDefault();
    void run(async () => {
      await createEdge(workspaceId, {
        id: `edge-${edgeFrom}-${edgeRelation}-${edgeTo}`.replace(/[^a-zA-Z0-9-]+/g, "-"),
        from: edgeFrom,
        to: edgeTo,
        relation: edgeRelation,
      });
      await refresh();
    });
  }

  function handleCreateOverview(): void {
    void run(async () => {
      const projection = await createOverview(workspaceId, 8);
      await refresh();
      setSelectedProjection(projection);
    });
  }

  function handleDiveIn(): void {
    if (selectedNodeId === null) {
      return;
    }

    void run(async () => {
      const projection = await createDiveIn(workspaceId, selectedNodeId);
      await refresh();
      setSelectedProjection(projection);
      await recordFeedback(workspaceId, {
        id: `feedback-dive-${Date.now()}`,
        createdAt: new Date().toISOString(),
        type: "dive_in_requested",
        payload: { nodeId: selectedNodeId },
        projectionId: projection.id,
      });
      await refresh();
    });
  }

  function handleFeedback(event: FormEvent<HTMLFormElement>): void {
    event.preventDefault();
    void run(async () => {
      const feedbackEvent: FeedbackEvent = {
        id: `feedback-${Date.now()}`,
        createdAt: new Date().toISOString(),
        type: "map_comment",
        payload: { text: feedbackText, selectedNodeId },
      };
      if (selectedProjection !== null) {
        feedbackEvent.projectionId = selectedProjection.id;
      }
      await recordFeedback(workspaceId, feedbackEvent);
      setFeedbackText("");
      await refresh();
    });
  }

  function handleConfirmCategory(): void {
    if (selectedNodeId === null) {
      return;
    }

    void run(async () => {
      const assignment: CategoryAssignment = {
        id: `assignment-${selectedNodeId}-confirmed-${Date.now()}`,
        targetType: "node",
        targetId: selectedNodeId,
        categoryId: "confirmed",
        status: "active",
        provenance: "human",
      };
      await assignCategory(workspaceId, assignment);
      await refresh();
    });
  }

  function handleSaveSnapshot(): void {
    if (selectedProjection === null) {
      return;
    }

    void run(async () => {
      await createSnapshot(workspaceId, {
        id: `snapshot-${Date.now()}`,
        createdAt: new Date().toISOString(),
        projectionId: selectedProjection.id,
      });
      await refresh();
    });
  }

  function handleCreateProposal(event: FormEvent<HTMLFormElement>): void {
    event.preventDefault();
    void run(async () => {
      const nodeId = slugifyNodeId(proposalLabel);
      await createProposal(workspaceId, {
        id: `proposal-${nodeId}-${Date.now()}`,
        createdAt: new Date().toISOString(),
        sourceFeedbackIds: [],
        graphCommands: [
          {
            id: `cmd-proposed-${nodeId}`,
            type: "node.create",
            payload: {
              node: {
                id: nodeId,
                label: proposalLabel,
                type: proposalType,
              },
            },
          },
        ],
        explanation: proposalExplanation,
        status: "pending",
      });
      setProposalLabel("");
      setProposalExplanation("");
      await refresh();
    });
  }

  function handleApproveProposal(proposalId: string): void {
    void run(async () => {
      await approveProposal(workspaceId, proposalId);
      await refresh();
    });
  }

  function handleApplyProposal(proposalId: string): void {
    void run(async () => {
      await applyProposal(workspaceId, proposalId);
      await refresh();
    });
  }

  function handleRejectProposal(proposalId: string): void {
    void run(async () => {
      await rejectProposal(workspaceId, proposalId);
      await refresh();
    });
  }

  return (
    <main className="app-shell">
      <aside className="sidebar">
        <div className="brand">
          <div>
            <h1>HiveMap</h1>
            <p>{state?.workspace.name ?? "Local concept graph"}</p>
          </div>
          {busy ? <Loader2 className="spin" size={18} /> : <CheckCircle2 size={18} />}
        </div>

        <form className="panel" onSubmit={handleWorkspaceSubmit}>
          <label>
            Workspace
            <input value={workspaceId} onChange={(event) => setWorkspaceId(event.currentTarget.value)} />
          </label>
          <label>
            Name
            <input value={workspaceName} onChange={(event) => setWorkspaceName(event.currentTarget.value)} />
          </label>
          <div className="button-row">
            <button type="submit">
              <FolderPlus size={16} />
              Create
            </button>
            <button type="button" onClick={handleLoadWorkspace}>
              <Search size={16} />
              Load
            </button>
          </div>
        </form>

        <details className="panel emergency-tools">
          <summary>Emergency Edit Tools</summary>
          <form className="nested-form" onSubmit={handleAddNode}>
            <label>
              Node label
              <input value={nodeLabel} onChange={(event) => setNodeLabel(event.currentTarget.value)} required />
            </label>
            <label>
              Type
              <select value={nodeType} onChange={(event) => setNodeType(event.currentTarget.value as GraphNodeType)}>
                {NODE_TYPES.map((type) => (
                  <option key={type} value={type}>
                    {type}
                  </option>
                ))}
              </select>
            </label>
            <button type="submit" disabled={state === null}>
              <Plus size={16} />
              Add Node
            </button>
          </form>

          <form className="nested-form" onSubmit={handleAddEdge}>
            <label>
              Source
              <select value={edgeFrom} onChange={(event) => setEdgeFrom(event.currentTarget.value)} required>
                <option value="" disabled>
                  Select source
                </option>
                {state?.graph.nodes.map((node) => (
                  <option key={node.id} value={node.id}>
                    {node.label}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Relation
              <input value={edgeRelation} onChange={(event) => setEdgeRelation(event.currentTarget.value)} required />
            </label>
            <label>
              Target
              <select value={edgeTo} onChange={(event) => setEdgeTo(event.currentTarget.value)} required>
                <option value="" disabled>
                  Select target
                </option>
                {state?.graph.nodes.map((node) => (
                  <option key={node.id} value={node.id}>
                    {node.label}
                  </option>
                ))}
              </select>
            </label>
            <button type="submit" disabled={state === null || edgeFrom === "" || edgeTo === ""}>
              <GitCommitHorizontal size={16} />
              Add Edge
            </button>
          </form>
        </details>

        <section className="panel">
          <div className="button-row">
            <button type="button" onClick={handleCreateOverview} disabled={state === null}>
              <GitBranchPlus size={16} />
              Overview
            </button>
            <button type="button" onClick={handleDiveIn} disabled={selectedNodeId === null}>
              <Search size={16} />
              Dive In
            </button>
          </div>
          <button type="button" onClick={handleConfirmCategory} disabled={selectedNodeId === null}>
            <Tags size={16} />
            Confirm
          </button>
          <button type="button" onClick={handleSaveSnapshot} disabled={selectedProjection === null}>
            <Save size={16} />
            Snapshot
          </button>
        </section>

        <section className="panel">
          <div className="panel-heading">Selected Categories</div>
          <div className="badge-row">
            {state?.categoryAssignments
              .filter((assignment) => assignment.targetType === "node" && assignment.targetId === selectedNodeId)
              .map((assignment) => (
                <span key={assignment.id} className={`badge badge-${assignment.categoryId}`}>
                  {assignment.categoryId}
                </span>
              ))}
            {state !== null &&
              state.categoryAssignments.filter(
                (assignment) => assignment.targetType === "node" && assignment.targetId === selectedNodeId,
              ).length === 0 && <span className="muted">No categories</span>}
          </div>
        </section>

        <form className="panel" onSubmit={handleFeedback}>
          <label>
            Feedback
            <textarea value={feedbackText} onChange={(event) => setFeedbackText(event.currentTarget.value)} required />
          </label>
          <button type="submit" disabled={state === null}>
            <MessageSquarePlus size={16} />
            Record
          </button>
        </form>

        <form className="panel" onSubmit={handleCreateProposal}>
          <label>
            Proposal node
            <input value={proposalLabel} onChange={(event) => setProposalLabel(event.currentTarget.value)} required />
          </label>
          <label>
            Type
            <select
              value={proposalType}
              onChange={(event) => setProposalType(event.currentTarget.value as GraphNodeType)}
            >
              {NODE_TYPES.map((type) => (
                <option key={type} value={type}>
                  {type}
                </option>
              ))}
            </select>
          </label>
          <label>
            Explanation
            <textarea
              value={proposalExplanation}
              onChange={(event) => setProposalExplanation(event.currentTarget.value)}
              required
            />
          </label>
          <button type="submit" disabled={state === null}>
            <MessageSquarePlus size={16} />
            Propose
          </button>
        </form>

        <section className="panel proposal-list">
          <div className="panel-heading">Proposals</div>
          {(state?.proposals.length ?? 0) === 0 ? (
            <p className="muted">No proposals</p>
          ) : (
            state?.proposals.map((proposal) => (
              <article key={proposal.id} className="proposal-item">
                <div>
                  <strong>{proposal.status}</strong>
                  <span>{proposal.explanation}</span>
                </div>
                <details>
                  <summary>{proposal.graphCommands.length} command(s)</summary>
                  <pre>{JSON.stringify(proposal.graphCommands, null, 2)}</pre>
                </details>
                <div className="button-row">
                  <button
                    type="button"
                    onClick={() => handleApproveProposal(proposal.id)}
                    disabled={proposal.status !== "pending"}
                  >
                    <Check size={16} />
                    Approve
                  </button>
                  <button
                    type="button"
                    onClick={() => handleApplyProposal(proposal.id)}
                    disabled={proposal.status !== "approved"}
                  >
                    <Plus size={16} />
                    Apply
                  </button>
                </div>
                <button
                  type="button"
                  onClick={() => handleRejectProposal(proposal.id)}
                  disabled={proposal.status !== "pending"}
                >
                  <CircleSlash size={16} />
                  Reject
                </button>
              </article>
            ))
          )}
        </section>

        <section className="panel proposal-list">
          <div className="panel-heading">Snapshots</div>
          {(state?.snapshots.length ?? 0) === 0 ? (
            <p className="muted">No snapshots</p>
          ) : (
            state?.snapshots.map((snapshot) => (
              <article key={snapshot.id} className="snapshot-item">
                <strong>{snapshot.id}</strong>
                <span>{new Date(snapshot.createdAt).toLocaleString()}</span>
                <span>{snapshot.projection.name}</span>
              </article>
            ))
          )}
        </section>

        {error !== null && (
          <div className="error-panel">
            <AlertCircle size={16} />
            <span>{error}</span>
          </div>
        )}
      </aside>

      <section className="map-stage">
        <header className="map-toolbar">
          <div>
            <strong>{selectedProjection?.name ?? "Graph"}</strong>
            <span>{selectedProjection?.type ?? "semantic source"}</span>
          </div>
          <div className="stats">
            <span>{state?.graph.nodes.length ?? 0} nodes</span>
            <span>{state?.categoryAssignments.length ?? 0} categories</span>
            <span>{state?.feedbackEvents.length ?? 0} feedback</span>
            <span>{state?.proposals.length ?? 0} proposals</span>
            <span>{state?.snapshots.length ?? 0} snapshots</span>
          </div>
        </header>
        <ReactFlow
          nodes={flowNodes}
          edges={flowEdges}
          fitView
          onNodeClick={(_, node) => setSelectedNodeId(node.id)}
          nodesDraggable={false}
        >
          <Background />
          <Controls />
        </ReactFlow>
      </section>
    </main>
  );
}

function nodeStyle(type: GraphNodeType, selected: boolean) {
  const colors: Record<GraphNodeType, string> = {
    concept: "#eff6ff",
    decision: "#ecfdf5",
    risk: "#fef2f2",
    question: "#fff7ed",
    evidence: "#f8fafc",
    component: "#f5f3ff",
    system: "#eef2ff",
    role: "#fdf2f8",
    pattern: "#f0fdfa",
  };

  return {
    background: colors[type],
    border: selected ? "2px solid #111827" : "1px solid #94a3b8",
    borderRadius: 8,
    color: "#111827",
    fontSize: 13,
    minWidth: 150,
    whiteSpace: "pre-line" as const,
  };
}

createRoot(document.getElementById("root")!).render(<App />);
