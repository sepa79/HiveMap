import "@xyflow/react/dist/style.css";
import "./styles.css";

import {
  ReactFlow,
  Background,
  Controls,
  Handle,
  Position,
  type Edge,
  type Node,
  type NodeProps,
  type NodeTypes,
  type ReactFlowInstance,
} from "@xyflow/react";
import {
  AlertCircle,
  ArrowLeft,
  Check,
  CheckCircle2,
  CircleSlash,
  Download,
  FolderPlus,
  GitBranchPlus,
  GitCommitHorizontal,
  Loader2,
  MessageSquarePlus,
  Plus,
  Search,
  Tags,
  Upload,
} from "lucide-react";
import { ChangeEvent, FormEvent, useEffect, useMemo, useRef, useState } from "react";
import { createRoot } from "react-dom/client";

import {
  applyProposal,
  approveProposal,
  assignCategory,
  createEdge,
  createDiveIn,
  createNode,
  createOverview,
  createProjectMap,
  createProposal,
  createWorkspace,
  downloadWorkspaceBundle,
  getWorkspace,
  importWorkspaceBundle,
  listWorkspaces,
  rejectProposal,
  recordFeedback,
  type CategoryAssignment,
  type FeedbackEvent,
  type FindingMetadata,
  type GraphNodeType,
  type Projection,
  type ProjectionGroup,
  type WorkspaceState,
  type WorkspaceRecord,
} from "./api.js";
import { slugifyNodeId } from "./ids.js";

const NODE_TYPES: Array<Exclude<GraphNodeType, "finding">> = [
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

const FINDING_SEVERITIES = ["critical", "high", "normal", "low"] as const;
const FINDING_PRIORITY_GROUPS: Array<{ id: string; label: string; severity: FindingMetadata["severity"] }> = [
  { id: "severity-critical", label: "Critical", severity: "critical" },
  { id: "severity-high", label: "High", severity: "high" },
  { id: "severity-medium", label: "Medium", severity: "normal" },
  { id: "severity-low", label: "Low", severity: "low" },
];
const FINDING_PRIORITY_GROUP_IDS = new Set(FINDING_PRIORITY_GROUPS.map((group) => group.id));
const MAP_CARD_HEIGHT = 210;
const MAP_CARD_ROW_PITCH = 235;
type MapCardData = { title: string; tags: string[]; variant: "finding" | "concept" };
type MapCardNode = Node<MapCardData, "map-card">;
const FLOW_NODE_TYPES: NodeTypes = { "map-card": MapCard };
const FINDINGS_OVERVIEW_NOTE: NonNullable<NonNullable<Projection["layout"]>["orientationNote"]> = {
  title: "Documentation review map",
  purpose: "Review documentation problems found by the repository scan and open the evidence needed to fix them.",
  usage: [
    "Start with the Critical and High priority columns.",
    "Use the problem kind shown on each card to understand the type of cleanup.",
    "Click a finding to open its deep dive.",
    "Read source files, conflicting claims, and the recommended action in the sidebar.",
    "Use Back to return to this review map.",
  ],
};

function MapCard({ data }: NodeProps<MapCardNode>) {
  return (
    <div className={`map-card map-card-${data.variant}`}>
      <Handle type="target" position={Position.Top} isConnectable={false} />
      <div className="map-card-title">{data.title}</div>
      <div className="map-card-tags">
        {data.tags.map((tag) => (
          <span className={`map-card-tag map-card-tag-${tag.replace(/[^a-z0-9]+/g, "-").toLowerCase()}`} key={tag}>
            {tag}
          </span>
        ))}
      </div>
      <Handle type="source" position={Position.Bottom} isConnectable={false} />
    </div>
  );
}

function App() {
  const [workspaceId, setWorkspaceId] = useState("");
  const [workspaceOptions, setWorkspaceOptions] = useState<WorkspaceRecord[]>([]);
  const [newWorkspaceId, setNewWorkspaceId] = useState("");
  const [newWorkspaceName, setNewWorkspaceName] = useState("");
  const [importMode, setImportMode] = useState<"new" | "replace">("new");
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
  const [resolutionEvidence, setResolutionEvidence] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const importInputRef = useRef<HTMLInputElement>(null);
  const conceptDetailsRef = useRef<HTMLElement>(null);
  const [flowInstance, setFlowInstance] = useState<ReactFlowInstance | null>(null);
  const [navigationDepth, setNavigationDepth] = useState(0);

  useEffect(() => {
    void run(async () => {
      await refreshWorkspaceOptions();
      const location = readProjectionLocation();
      if (location.workspaceId !== null) {
        setWorkspaceId(location.workspaceId);
        const next = await refresh(location.workspaceId);
        const projection = location.projectionId === null
          ? selectInitialProjection(next)
          : requireProjection(next, location.projectionId);
        setSelectedProjection(projection);
        setSelectedNodeId(projection?.rootNodeIds[0] ?? next.graph.nodes[0]?.id ?? null);
        setEdgeFrom(next.graph.nodes[0]?.id ?? "");
        setEdgeTo(next.graph.nodes[1]?.id ?? "");
        replaceProjectionLocation(location.workspaceId, projection, 0);
      }
    });
  }, []);

  useEffect(() => {
    function handlePopState(event: PopStateEvent): void {
      void run(async () => {
        const location = readProjectionLocation();
        if (location.workspaceId === null) {
          setWorkspaceId("");
          setState(null);
          setSelectedProjection(null);
          setSelectedNodeId(null);
          setNavigationDepth(0);
          return;
        }
        setWorkspaceId(location.workspaceId);
        const next = await refresh(location.workspaceId);
        const projection = location.projectionId === null
          ? selectInitialProjection(next)
          : requireProjection(next, location.projectionId);
        setSelectedProjection(projection);
        setSelectedNodeId(projection?.rootNodeIds[0] ?? next.graph.nodes[0]?.id ?? null);
        setNavigationDepth(readHistoryDepth(event.state));
      });
    }

    window.addEventListener("popstate", handlePopState);
    return () => window.removeEventListener("popstate", handlePopState);
  }, []);

  const visibleNodeIds = useMemo(() => {
    if (selectedProjection === null) {
      return new Set(state?.graph.nodes.map((node) => node.id) ?? []);
    }
    return new Set(selectedProjection.visibleNodeIds);
  }, [selectedProjection, state]);

  const selectedNode = useMemo(
    () => state?.graph.nodes.find((node) => node.id === selectedNodeId) ?? null,
    [selectedNodeId, state],
  );

  const selectedFinding = selectedNode?.type === "finding" ? selectedNode.metadata?.finding ?? null : null;
  const findingNodes = useMemo(() => {
    const rank = new Map(FINDING_SEVERITIES.map((severity, index) => [severity, index]));
    return [...(state?.graph.nodes.filter((node) => node.type === "finding") ?? [])].sort((left, right) => {
      const leftRank = rank.get(left.metadata?.finding?.severity ?? "low") ?? FINDING_SEVERITIES.length;
      const rightRank = rank.get(right.metadata?.finding?.severity ?? "low") ?? FINDING_SEVERITIES.length;
      return leftRank - rightRank || left.label.localeCompare(right.label);
    });
  }, [state]);

  const findingGroups = useMemo<ProjectionGroup[]>(() => FINDING_PRIORITY_GROUPS.map((priority) => {
    const nodeIds = findingNodes
      .filter((node) => node.metadata?.finding?.severity === priority.severity)
      .map((node) => node.id);
    return { id: priority.id, label: priority.label, nodeIds };
  }), [findingNodes]);

  const flowNodes = useMemo<Node[]>(() => {
    if (state === null) {
      return [];
    }

    const groupByNodeId = new Map(
      (selectedProjection?.groups ?? []).flatMap((group) => group.nodeIds.map((nodeId) => [nodeId, group] as const)),
    );
    const groupStartX = new Map<string, number>();
    let nextGroupX = 80;
    for (const group of selectedProjection?.groups ?? []) {
      groupStartX.set(group.id, nextGroupX);
      nextGroupX += Math.max(1, Math.ceil(group.nodeIds.length / 4)) * 190 + 70;
    }
    const positionsWithinGroup = new Map<string, number>();
    const orientationNote = selectedProjection?.layout?.orientationNote;
    const semanticOffsetY = orientationNote === undefined ? 0 : 250;

    const semanticNodes: Node[] = state.graph.nodes
      .filter((node) => visibleNodeIds.has(node.id))
      .map((node, index) => ({
        ...(() => {
          const group = groupByNodeId.get(node.id);
          const positionInGroup = group === undefined ? index : (positionsWithinGroup.get(group.id) ?? 0);
          if (group !== undefined) {
            positionsWithinGroup.set(group.id, positionInGroup + 1);
          }
          return {
            data: {
              title: node.label,
              tags: node.type === "finding"
                ? [node.metadata?.finding?.kind ?? "finding", humanSeverity(node.metadata?.finding?.severity)]
                : [node.type],
              variant: node.type === "finding" ? "finding" : "concept",
            } satisfies MapCardData,
            position: {
              x: group === undefined ? 80 : (groupStartX.get(group.id) ?? 80) + Math.floor(positionInGroup / 4) * 190,
              y: 80 + semanticOffsetY + (group === undefined ? positionInGroup : positionInGroup % 4) * MAP_CARD_ROW_PITCH,
            },
          };
        })(),
        id: node.id,
        type: "map-card",
        style: nodeStyle(node.type, selectedNodeId === node.id, node.metadata?.finding?.severity),
      }));

    const groupHeaderNodes: Node[] = (selectedProjection?.groups ?? []).map((group) => ({
      id: `__projection-group-${group.id}`,
      className: "projection-group-header-node",
      data: { label: `${group.label}\n${group.nodeIds.length} ${group.nodeIds.length === 1 ? "finding" : "findings"}` },
      position: { x: groupStartX.get(group.id) ?? 80, y: orientationNote === undefined ? 10 : 250 },
      selectable: false,
      connectable: false,
      draggable: false,
      style: projectionGroupHeaderStyle(group.id, Math.max(1, Math.ceil(group.nodeIds.length / 4)) * 190 - 20),
    }));

    const noteNodes: Node[] = orientationNote === undefined ? [] : [{
        id: "__projection-orientation-note",
        className: "orientation-note-node",
        data: {
          label: `${orientationNote.title}\n${orientationNote.purpose}\n\n${orientationNote.usage.map((step, index) => `${index + 1}. ${step}`).join("\n")}`,
        },
        position: { x: 80, y: 40 },
        selectable: false,
        connectable: false,
        draggable: false,
        style: orientationNoteStyle(selectedProjection?.groups?.length ?? 1),
      }];
    return [...noteNodes, ...groupHeaderNodes, ...semanticNodes];
  }, [selectedNodeId, selectedProjection, state, visibleNodeIds]);

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

  useEffect(() => {
    if (flowInstance !== null && flowNodes.length > 0) {
      void flowInstance.fitView({ duration: 180, maxZoom: 1, padding: 0.18 });
    }
  }, [flowEdges, flowInstance, flowNodes, selectedProjection]);

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

  async function refreshWorkspaceOptions(preferredId?: string): Promise<void> {
    const workspaces = await listWorkspaces();
    setWorkspaceOptions(workspaces);
    if (preferredId !== undefined) setWorkspaceId(preferredId);
  }

  function navigateToProjection(projection: Projection | null, mode: "push" | "replace"): void {
    setSelectedProjection(projection);
    const nextDepth = mode === "push" ? navigationDepth + 1 : 0;
    if (mode === "push") pushProjectionLocation(workspaceId, projection, nextDepth);
    else replaceProjectionLocation(workspaceId, projection, nextDepth);
    setNavigationDepth(nextDepth);
  }

  function handleBack(): void {
    if (navigationDepth > 0) {
      window.history.back();
      return;
    }
    if (state === null) return;
    const overview = [...state.projections].reverse().find(isFindingsOverviewProjection);
    if (overview !== undefined && overview.id !== selectedProjection?.id) {
      navigateToProjection(overview, "replace");
    }
  }

  function handleWorkspaceSubmit(event: FormEvent<HTMLFormElement>): void {
    event.preventDefault();
    void run(async () => {
      await createWorkspace({
        id: newWorkspaceId,
        name: newWorkspaceName,
        createdAt: new Date().toISOString(),
      });
      setWorkspaceId(newWorkspaceId);
      await refreshWorkspaceOptions(newWorkspaceId);
      const next = await refresh(newWorkspaceId);
      setNewWorkspaceId("");
      setNewWorkspaceName("");
      setSelectedProjection(null);
      replaceProjectionLocation(newWorkspaceId, null, 0);
      setNavigationDepth(0);
      setSelectedNodeId(next.graph.nodes[0]?.id ?? null);
      setEdgeFrom(next.graph.nodes[0]?.id ?? "");
      setEdgeTo(next.graph.nodes[1]?.id ?? "");
    });
  }

  function handleLoadWorkspace(): void {
    void run(async () => {
      const next = await refresh();
      navigateToProjection(selectInitialProjection(next), "replace");
      setNavigationDepth(0);
      setSelectedNodeId(next.graph.nodes[0]?.id ?? null);
      setEdgeFrom(next.graph.nodes[0]?.id ?? "");
      setEdgeTo(next.graph.nodes[1]?.id ?? "");
    });
  }

  function handleExportWorkspace(): void {
    if (state === null) return;
    void run(async () => {
      const blob = await downloadWorkspaceBundle(state.workspace.id, new Date().toISOString());
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `${state.workspace.id}.hivemap.zip`;
      document.body.append(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
    });
  }

  function handleImportWorkspace(event: ChangeEvent<HTMLInputElement>): void {
    const input = event.currentTarget;
    const file = input.files?.[0];
    if (file === undefined) return;
    void run(async () => {
      try {
        const imported = await importWorkspaceBundle(file, importMode);
        await refreshWorkspaceOptions(imported.id);
        const next = await refresh(imported.id);
        setWorkspaceId(imported.id);
        const projection = selectInitialProjection(next);
        setSelectedProjection(projection);
        replaceProjectionLocation(imported.id, projection, 0);
        setNavigationDepth(0);
        setSelectedNodeId(next.graph.nodes[0]?.id ?? null);
        setEdgeFrom(next.graph.nodes[0]?.id ?? "");
        setEdgeTo(next.graph.nodes[1]?.id ?? "");
      } finally {
        input.value = "";
      }
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
      navigateToProjection(projection, "push");
    });
  }

  function handleDiveIn(): void {
    if (selectedNodeId === null) {
      return;
    }

    void run(async () => {
      const projection = await createDiveIn(workspaceId, selectedNodeId);
      await refresh();
      conceptDetailsRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
      await recordFeedback(workspaceId, {
        id: `feedback-dive-${Date.now()}`,
        createdAt: new Date().toISOString(),
        type: "dive_in_requested",
        payload: { nodeId: selectedNodeId },
        projectionId: projection.id,
      });
      await refresh();
      navigateToProjection(projection, "push");
    });
  }

  function handleFindingDiveIn(nodeId: string): void {
    setSelectedNodeId(nodeId);
    void run(async () => {
      const projection = await createDiveIn(workspaceId, nodeId);
      await refresh();
      await recordFeedback(workspaceId, {
        id: `feedback-dive-${Date.now()}`,
        createdAt: new Date().toISOString(),
        type: "dive_in_requested",
        payload: { nodeId },
        projectionId: projection.id,
      });
      await refresh();
      navigateToProjection(projection, "push");
      conceptDetailsRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    });
  }

  function handleCreateFindingsOverview(): void {
    if (findingNodes.length === 0) return;
    const existing = [...(state?.projections ?? [])].reverse().find(isFindingsOverviewProjection);
    if (existing !== undefined) {
      navigateToProjection(existing, "push");
      setSelectedNodeId(findingNodes[0]?.id ?? null);
      return;
    }
    void run(async () => {
      const projection = await createProjectMap(
        workspaceId,
        findingNodes.filter((node) => node.metadata?.finding?.severity === "critical").map((node) => node.id),
        findingNodes.map((node) => node.id),
        { name: "Findings Overview", groups: findingGroups, layout: { orientationNote: FINDINGS_OVERVIEW_NOTE } },
      );
      await refresh();
      navigateToProjection(projection, "push");
      setSelectedNodeId(findingNodes[0]?.id ?? null);
    });
  }

  function handleCreateProjectMap(): void {
    const rootNode = state?.graph.nodes[0];
    if (state === null || rootNode === undefined) {
      return;
    }

    void run(async () => {
      const projection = await createProjectMap(
        workspaceId,
        [rootNode.id],
        state.graph.nodes.map((node) => node.id),
      );
      await refresh();
      navigateToProjection(projection, "push");
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

  function handleFindingFeedback(intent: "acknowledge_finding" | "resolve_finding"): void {
    if (selectedNode?.type !== "finding") {
      return;
    }
    void run(async () => {
      await recordFeedback(workspaceId, {
        id: `feedback-${intent}-${Date.now()}`,
        createdAt: new Date().toISOString(),
        type: "map_comment",
        payload: {
          intent,
          findingNodeId: selectedNode.id,
          ...(intent === "resolve_finding" ? { resolutionEvidence } : {}),
        },
        ...(selectedProjection === null ? {} : { projectionId: selectedProjection.id }),
      });
      if (intent === "resolve_finding") setResolutionEvidence("");
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
      <header className="top-bar">
        <div className="top-bar-inner">
          <div className="logo-link" aria-label="HiveMap">
            <GitBranchPlus className="brand-mark" size={28} />
            <span className="brand-wordmark">
              <span className="brand-word-hive">Hive</span>
              <span className="brand-word-map">Map</span>
            </span>
          </div>
          <span className="breadcrumb">{state?.workspace.name ?? "AI-assisted concept graph"}</span>
          <div className={error === null ? "top-bar-status" : "top-bar-status top-bar-status-error"}>
            {busy ? <Loader2 className="spin" size={14} /> : error === null ? <CheckCircle2 size={14} /> : <AlertCircle size={14} />}
            <span>{busy ? "Working" : error ?? "Ready"}</span>
          </div>
        </div>
      </header>

      <aside className="sidebar">
        <div className="nav-header">Workspace controls</div>

        <section className="panel workspace-panel">
          <label>
            Workspace
            <select value={workspaceId} onChange={(event) => setWorkspaceId(event.currentTarget.value)}>
              <option value="">Select a workspace…</option>
              {workspaceOptions.map((workspace) => (
                <option key={workspace.id} value={workspace.id}>
                  {workspace.name} — {workspace.id}
                </option>
              ))}
            </select>
          </label>
          <div className="button-row">
            <button type="button" onClick={handleLoadWorkspace} disabled={workspaceId === ""}>
              <Search size={16} />
              Load
            </button>
            <button
              type="button"
              onClick={handleExportWorkspace}
              disabled={state === null || state.workspace.id !== workspaceId}
            >
              <Download size={16} />
              Export ZIP
            </button>
          </div>

          <div className="workspace-divider" />
          <form className="nested-form" onSubmit={handleWorkspaceSubmit}>
            <label>
              New workspace ID
              <input value={newWorkspaceId} onChange={(event) => setNewWorkspaceId(event.currentTarget.value)} required />
            </label>
            <label>
              New workspace name
              <input value={newWorkspaceName} onChange={(event) => setNewWorkspaceName(event.currentTarget.value)} required />
            </label>
            <button type="submit">
              <FolderPlus size={16} />
              Create
            </button>
          </form>

          <div className="workspace-divider" />
          <label>
            ZIP import behavior
            <select value={importMode} onChange={(event) => setImportMode(event.currentTarget.value as "new" | "replace")}>
              <option value="new">Create a new workspace</option>
              <option value="replace">Replace matching workspace</option>
            </select>
          </label>
          <input
            ref={importInputRef}
            className="file-input"
            type="file"
            accept=".zip,.hivemap.zip,application/zip"
            onChange={handleImportWorkspace}
          />
          <button type="button" onClick={() => importInputRef.current?.click()}>
            <Upload size={16} />
            Import ZIP
          </button>
        </section>

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
            <button type="button" onClick={handleCreateFindingsOverview} disabled={findingNodes.length === 0}>
              <AlertCircle size={16} />
              Findings
            </button>
            <button type="button" onClick={handleCreateOverview} disabled={state === null}>
              <GitBranchPlus size={16} />
              Overview
            </button>
            <button type="button" onClick={handleCreateProjectMap} disabled={state === null}>
              <GitBranchPlus size={16} />
              Project Map
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
        </section>

        <section className="panel">
          <div className="panel-heading">Views</div>
          <div className="view-list">
            {state?.projections.map((projection) => (
              <button
                type="button"
                key={projection.id}
                className={selectedProjection?.id === projection.id ? "view-button view-button-active" : "view-button"}
                onClick={() => navigateToProjection(projection, "push")}
              >
                {projection.name}
              </button>
            ))}
            {state !== null && state.projections.length === 0 && <span className="muted">No saved views</span>}
          </div>
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

        <section className="panel">
          <div className="panel-heading">Repository Scans</div>
          <div className="scan-list">
            {state?.scanRuns.map((scan) => (
              <article className="scan-item" key={scan.id}>
                <div>
                  <strong>{scan.id}</strong>
                  <span className={`scan-status scan-status-${scan.status}`}>{scan.status}</span>
                </div>
                <span>{scan.profileId}@{scan.profileVersion}</span>
                <span>{scan.coverage === undefined ? "Coverage pending" : `${scan.coverage.included.length}/${scan.coverage.discovered.length} sources included`}</span>
                <span>{scan.findingNodeIds.length} findings</span>
              </article>
            ))}
            {state !== null && state.scanRuns.length === 0 && <span className="muted">No repository scans</span>}
          </div>
        </section>

        <section className="panel">
          <div className="panel-heading">Findings</div>
          <div className="finding-list">
            {findingGroups.map((group) => (
              <section className="finding-group" key={group.id}>
                <div className={`finding-group-heading finding-group-heading-${group.id.replace("severity-", "")}`}>
                  <span>{group.label}</span>
                  <small>{group.nodeIds.length}</small>
                </div>
                {group.nodeIds.map((nodeId) => {
                  const node = findingNodes.find((candidate) => candidate.id === nodeId)!;
                  const finding = node.metadata?.finding;
                  return (
                    <button
                      className={selectedNodeId === node.id ? "finding-button finding-button-active" : "finding-button"}
                      key={node.id}
                      onClick={() => handleFindingDiveIn(node.id)}
                      type="button"
                    >
                      <span>{node.label}</span>
                      <small>{finding?.kind} · {finding?.status} · deep dive</small>
                    </button>
                  );
                })}
              </section>
            ))}
            {state !== null && findingNodes.length === 0 && <span className="muted">No findings</span>}
          </div>
        </section>

        <section className="panel" ref={conceptDetailsRef}>
          <div className="panel-heading">{selectedFinding === null ? "Concept Details" : "Finding Details"}</div>
          {selectedNode === null ? (
            <span className="muted">Select a concept</span>
          ) : (
            <>
              <div className="concept-title">
                <strong>{selectedNode.label}</strong>
                <span>{selectedNode.type}</span>
              </div>
              {selectedNode.notes === undefined ? (
                <span className="muted">No orientation note</span>
              ) : (
                <p className="concept-notes">{selectedNode.notes}</p>
              )}
              <div className="source-list">
                {(selectedNode.metadata?.sourceRefs ?? []).map((sourceRef, index) => (
                  <div className="source-item" key={`${sourceRef.role}-${sourceRef.source}-${sourceRef.target}-${index}`}>
                    <div>
                      <span className="source-role">{sourceRef.role}</span>
                      <span className="source-type">{sourceRef.source}</span>
                    </div>
                    <code>{sourceRef.target}</code>
                    {sourceRef.anchor !== undefined && <span>{sourceRef.anchor}</span>}
                    {sourceRef.label !== undefined && <span>{sourceRef.label}</span>}
                  </div>
                ))}
                {(selectedNode.metadata?.sourceRefs ?? []).length === 0 && <span className="muted">No source references</span>}
              </div>
              {selectedFinding !== null && (
                <div className="finding-detail">
                  <div className="finding-meta">
                    <span className={`finding-severity finding-severity-${selectedFinding.severity}`}>{selectedFinding.severity}</span>
                    <span>{selectedFinding.kind}</span>
                    <span>{selectedFinding.status}</span>
                  </div>
                  {selectedFinding.claims.map((claim) => {
                    const sourceRef = selectedNode.metadata?.sourceRefs?.[claim.sourceRefIndex];
                    return (
                      <p key={claim.sourceRefIndex} className="finding-claim">
                        <code>{sourceRef?.target ?? `source[${claim.sourceRefIndex}]`}</code> {claim.claim}
                      </p>
                    );
                  })}
                  {selectedFinding.recommendedAction !== undefined && <p className="concept-notes"><strong>Action:</strong> {selectedFinding.recommendedAction}</p>}
                  {selectedFinding.resolutionEvidence !== undefined && <p className="concept-notes"><strong>Evidence:</strong> {selectedFinding.resolutionEvidence}</p>}
                  <button type="button" onClick={() => handleFindingFeedback("acknowledge_finding")} disabled={selectedFinding.status !== "open"}>
                    Request acknowledgement
                  </button>
                  <label>
                    Resolution evidence
                    <textarea value={resolutionEvidence} onChange={(event) => setResolutionEvidence(event.currentTarget.value)} />
                  </label>
                  <button type="button" onClick={() => handleFindingFeedback("resolve_finding")} disabled={resolutionEvidence.trim().length === 0 || selectedFinding.status === "resolved"}>
                    Propose resolution
                  </button>
                </div>
              )}
            </>
          )}
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

        {error !== null && (
          <div className="error-panel">
            <AlertCircle size={16} />
            <span>{error}</span>
          </div>
        )}
      </aside>

      <section className="map-stage">
        <header className="map-toolbar">
          <button
            className="map-back-button"
            disabled={navigationDepth === 0 && (selectedProjection?.type !== "dive-in" || state?.projections.some(isFindingsOverviewProjection) !== true)}
            onClick={handleBack}
            type="button"
          >
            <ArrowLeft size={16} />
            Back
          </button>
          <div>
            <strong>{selectedProjection?.name ?? "Graph"}</strong>
            <span>{describeProjection(selectedProjection)}</span>
          </div>
          <div className="stats">
            <span>{visibleNodeIds.size}/{state?.graph.nodes.length ?? 0} visible</span>
            <span>{state?.categoryAssignments.length ?? 0} categories</span>
            <span>{state?.feedbackEvents.length ?? 0} feedback</span>
            <span>{state?.proposals.length ?? 0} proposals</span>
          </div>
        </header>
        <div className={(selectedProjection?.groups ?? []).length === 0 ? "map-group-legend map-group-legend-empty" : "map-group-legend"}>
          {selectedProjection?.groups?.map((group) => (
            <span className={`map-group-${group.id}`} key={group.id}><strong>{group.label}</strong>{group.nodeIds.length}</span>
          ))}
        </div>
        <ReactFlow
          nodes={flowNodes}
          nodeTypes={FLOW_NODE_TYPES}
          edges={flowEdges}
          fitView
          fitViewOptions={{ maxZoom: 1, padding: 0.18 }}
          onInit={setFlowInstance}
          onNodeClick={(_, node) => {
            const semanticNode = state?.graph.nodes.find((candidate) => candidate.id === node.id);
            if (semanticNode?.type === "finding") handleFindingDiveIn(node.id);
            else if (semanticNode !== undefined) setSelectedNodeId(node.id);
          }}
          nodesDraggable={false}
        >
          <Background color="rgba(255, 255, 255, 0.10)" bgColor="#05070b" />
          <Controls />
        </ReactFlow>
      </section>
    </main>
  );
}

function nodeStyle(type: GraphNodeType, selected: boolean, findingSeverity?: "low" | "normal" | "high" | "critical") {
  const colors: Record<GraphNodeType, { background: string; border: string }> = {
    concept: { background: "rgba(51, 225, 255, 0.10)", border: "rgba(51, 225, 255, 0.45)" },
    decision: { background: "rgba(86, 211, 145, 0.10)", border: "rgba(86, 211, 145, 0.42)" },
    risk: { background: "rgba(255, 117, 117, 0.10)", border: "rgba(255, 117, 117, 0.45)" },
    question: { background: "rgba(255, 200, 87, 0.10)", border: "rgba(255, 200, 87, 0.42)" },
    evidence: { background: "rgba(255, 255, 255, 0.04)", border: "rgba(255, 255, 255, 0.18)" },
    component: { background: "rgba(167, 139, 250, 0.10)", border: "rgba(167, 139, 250, 0.42)" },
    system: { background: "rgba(96, 165, 250, 0.10)", border: "rgba(96, 165, 250, 0.42)" },
    role: { background: "rgba(244, 114, 182, 0.10)", border: "rgba(244, 114, 182, 0.42)" },
    pattern: { background: "rgba(45, 212, 191, 0.10)", border: "rgba(45, 212, 191, 0.42)" },
    finding: { background: "rgba(255, 117, 117, 0.10)", border: "rgba(255, 117, 117, 0.55)" },
  };

  const findingColors = findingSeverity === "critical"
    ? { background: "rgba(255, 80, 80, 0.18)", border: "rgba(255, 80, 80, 0.82)" }
    : findingSeverity === "high"
    ? { background: "rgba(255, 117, 117, 0.12)", border: "rgba(255, 117, 117, 0.62)" }
    : findingSeverity === "normal"
    ? { background: "rgba(255, 200, 87, 0.10)", border: "rgba(255, 200, 87, 0.48)" }
    : colors[type];

  return {
    background: findingColors.background,
    border: selected ? "2px solid #33e1ff" : `1px solid ${findingColors.border}`,
    borderRadius: 10,
    boxShadow: selected ? "0 0 20px rgba(51, 225, 255, 0.24)" : "0 12px 24px rgba(0, 0, 0, 0.22)",
    color: "rgba(255, 255, 255, 0.94)",
    padding: 12,
    height: MAP_CARD_HEIGHT,
    width: 180,
  };
}

function orientationNoteStyle(groupCount: number) {
  return {
    background: "linear-gradient(135deg, rgba(51, 225, 255, 0.14), rgba(255, 193, 7, 0.08))",
    border: "1px solid rgba(51, 225, 255, 0.52)",
    borderRadius: 14,
    boxShadow: "0 18px 42px rgba(0, 0, 0, 0.32)",
    color: "rgba(255, 255, 255, 0.92)",
    fontSize: 13,
    lineHeight: 1.55,
    minHeight: 160,
    padding: 18,
    textAlign: "left" as const,
    whiteSpace: "pre-line" as const,
    width: Math.max(620, groupCount * 260 - 20),
  };
}

function humanSeverity(severity: FindingMetadata["severity"] | undefined): string {
  if (severity === undefined) return "unknown";
  return severity === "normal" ? "medium" : severity;
}

function projectionGroupHeaderStyle(groupId: string, width: number) {
  const palette = groupId === "severity-critical"
    ? { background: "rgba(255, 80, 80, 0.22)", border: "rgba(255, 80, 80, 0.86)", color: "#ffb0b0" }
    : groupId === "severity-high"
    ? { background: "rgba(255, 117, 117, 0.14)", border: "rgba(255, 117, 117, 0.64)", color: "#ffc2c2" }
    : groupId === "severity-medium"
    ? { background: "rgba(255, 200, 87, 0.12)", border: "rgba(255, 200, 87, 0.58)", color: "#ffdc91" }
    : groupId === "severity-low"
    ? { background: "rgba(86, 211, 145, 0.10)", border: "rgba(86, 211, 145, 0.48)", color: "#8be8b4" }
    : { background: "rgba(51, 225, 255, 0.10)", border: "rgba(51, 225, 255, 0.45)", color: "#8cedff" };
  return {
    ...palette,
    border: `1px solid ${palette.border}`,
    borderRadius: 12,
    fontSize: 16,
    fontWeight: 900,
    letterSpacing: 0.5,
    lineHeight: 1.35,
    minHeight: 64,
    padding: 10,
    textTransform: "uppercase" as const,
    whiteSpace: "pre-line" as const,
    width,
  };
}

type ProjectionLocation = { workspaceId: string | null; projectionId: string | null };
type HiveMapHistoryState = { hiveMap: true; depth: number };

function readProjectionLocation(): ProjectionLocation {
  const parameters = new URLSearchParams(window.location.search);
  return {
    workspaceId: parameters.get("workspace"),
    projectionId: parameters.get("projection"),
  };
}

function pushProjectionLocation(workspaceId: string, projection: Projection | null, depth: number): void {
  window.history.pushState({ hiveMap: true, depth } satisfies HiveMapHistoryState, "", projectionUrl(workspaceId, projection));
}

function replaceProjectionLocation(workspaceId: string, projection: Projection | null, depth: number): void {
  window.history.replaceState({ hiveMap: true, depth } satisfies HiveMapHistoryState, "", projectionUrl(workspaceId, projection));
}

function projectionUrl(workspaceId: string, projection: Projection | null): string {
  const url = new URL(window.location.href);
  url.searchParams.set("workspace", workspaceId);
  if (projection === null) url.searchParams.delete("projection");
  else url.searchParams.set("projection", projection.id);
  return `${url.pathname}${url.search}${url.hash}`;
}

function readHistoryDepth(value: unknown): number {
  if (typeof value !== "object" || value === null || !("hiveMap" in value) || value.hiveMap !== true || !("depth" in value)) return 0;
  const depth = value.depth;
  if (!Number.isInteger(depth) || (depth as number) < 0) return 0;
  return depth as number;
}

function requireProjection(state: WorkspaceState, projectionId: string): Projection {
  const projection = state.projections.find((candidate) => candidate.id === projectionId);
  if (projection === undefined) throw new Error(`Workspace ${state.workspace.id} does not contain projection ${projectionId}`);
  return projection;
}

function selectInitialProjection(state: WorkspaceState): Projection | null {
  const findingsOverview = [...state.projections].reverse().find(isFindingsOverviewProjection);
  return findingsOverview ?? state.projections.at(-1) ?? null;
}

function isFindingsOverviewProjection(projection: Projection): boolean {
  return projection.type === "project-map" &&
    projection.groups !== undefined &&
    projection.groups.length > 0 &&
    projection.groups.every((group) => FINDING_PRIORITY_GROUP_IDS.has(group.id));
}

function describeProjection(projection: Projection | null): string {
  if (projection === null) return "Semantic graph source";
  if (projection.type === "dive-in") return "Finding deep dive · affected concepts on the map · evidence in the sidebar";
  if (isFindingsOverviewProjection(projection)) {
    return "Documentation review queue · priority columns · click a finding to open its evidence";
  }
  return projection.type;
}

createRoot(document.getElementById("root")!).render(<App />);
