import "@xyflow/react/dist/style.css";
import "./styles.css";

/**
 * Responsibility: Compose the single-page HiveMap workspace from bounded navigation, context, map, inspector, and settings surfaces.
 * Must not: Persist credentials, implement REST/domain contracts, or become semantic graph authority.
 * Contract: Renders server-owned workspace projections and emits typed client operations.
 */
import { Background, Controls, ReactFlow, type ReactFlowInstance } from "@xyflow/react";
import { type FormEvent, useEffect, useMemo, useRef, useState } from "react";
import { createRoot } from "react-dom/client";

import {
  applyProposal, approveProposal, assignCategory, createDiveIn, createEdge, createNode, createOverview,
  createProjectMap, createProposal, createWorkspace, deleteScan, getWorkspace, listWorkspaces, recordFeedback,
  rejectProposal, type CategoryAssignment, type FeedbackEvent, type GraphNodeType, type Projection,
  type ProjectionGroup, type WorkspaceRecord, type WorkspaceState,
} from "./api.js";
import { getAuthToken } from "./auth-token.js";
import { FINDING_PRIORITY_GROUPS } from "./finding-priorities.js";
import { readFindingMetadata } from "./finding-metadata.js";
import { slugifyNodeId } from "./ids.js";
import { FINDINGS_OVERVIEW_NOTE, FLOW_NODE_TYPES } from "./MapCard.js";
import { NodeInspector } from "./NodeInspector.js";
import { ProjectionToolbar } from "./ProjectionToolbar.js";
import {
  clearProjectionLocation, isFindingsOverviewProjection, pushProjectionLocation, readHistoryDepth,
  readProjectionLocation, replaceProjectionLocation, requireProjection, selectInitialProjection,
} from "./projection-navigation.js";
import { useProjectionViewportFit } from "./projection-viewport-fit.js";
import { buildProjectionFlowModel } from "./repository-map-layout.js";
import { WorkspaceContextPanel } from "./WorkspaceContextPanel.js";
import { WorkspaceHeader } from "./WorkspaceHeader.js";
import { WorkspaceNavigationRail, type WorkspaceSection } from "./WorkspaceNavigationRail.js";
import { WorkspaceSettingsPanel } from "./WorkspaceSettingsPanel.js";

const FINDING_SEVERITIES = ["critical", "high", "normal", "low"] as const;

export function App() {
  const [activeSection, setActiveSection] = useState<WorkspaceSection>(() => getAuthToken() === "" ? "settings" : "map");
  const [workspaceSelectionId, setWorkspaceSelectionId] = useState("");
  const [workspaceOptions, setWorkspaceOptions] = useState<WorkspaceRecord[]>([]);
  const [newWorkspaceId, setNewWorkspaceId] = useState("");
  const [newWorkspaceName, setNewWorkspaceName] = useState("");
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
  const [query, setQuery] = useState("");
  const [visibleGroupIds, setVisibleGroupIds] = useState<Set<string>>(new Set());
  const [showDependencies, setShowDependencies] = useState(true);
  const [showVerifications, setShowVerifications] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [flowInstance, setFlowInstance] = useState<ReactFlowInstance | null>(null);
  const [navigationDepth, setNavigationDepth] = useState(0);
  const operationQueue = useRef<Promise<void>>(Promise.resolve());
  const pendingOperationCount = useRef(0);

  useEffect(() => {
    if (getAuthToken() === "") return;
    const location = readProjectionLocation();
    if (location.workspaceId !== null) setWorkspaceSelectionId(location.workspaceId);
    void run(async () => {
      await refreshWorkspaceOptions(location.workspaceId ?? undefined);
      if (location.workspaceId !== null) await loadProjectionLocation();
    });
  }, []);

  useEffect(() => {
    function handlePopState(event: PopStateEvent): void {
      void run(async () => {
        const location = readProjectionLocation();
        if (location.workspaceId === null) return clearWorkspaceScreen();
        setWorkspaceSelectionId(location.workspaceId);
        const next = await refresh(location.workspaceId);
        const projection = location.projectionId === null ? selectInitialProjection(next) : requireProjection(next, location.projectionId);
        setSelectedProjection(projection);
        setSelectedNodeId(projection?.rootNodeIds[0] ?? next.graph.nodes[0]?.id ?? null);
        setNavigationDepth(readHistoryDepth(event.state));
      });
    }
    window.addEventListener("popstate", handlePopState);
    return () => window.removeEventListener("popstate", handlePopState);
  }, []);

  useEffect(() => {
    setVisibleGroupIds(new Set(selectedProjection?.groups?.map((group) => group.id) ?? []));
    setQuery("");
  }, [state?.workspace.id, selectedProjection?.id]);

  const selectedNode = useMemo(() => state?.graph.nodes.find((node) => node.id === selectedNodeId) ?? null, [selectedNodeId, state]);
  const selectedFinding = selectedNode?.type === "finding" ? readFindingMetadata(selectedNode) ?? null : null;
  const findingNodes = useMemo(() => {
    const rank = new Map(FINDING_SEVERITIES.map((severity, index) => [severity, index]));
    return [...(state?.graph.nodes.filter((node) => node.type === "finding") ?? [])].sort((left, right) => {
      const leftRank = rank.get(readFindingMetadata(left)?.severity ?? "low") ?? FINDING_SEVERITIES.length;
      const rightRank = rank.get(readFindingMetadata(right)?.severity ?? "low") ?? FINDING_SEVERITIES.length;
      return leftRank - rightRank || left.label.localeCompare(right.label);
    });
  }, [state]);
  const findingGroups = useMemo<ProjectionGroup[]>(() => FINDING_PRIORITY_GROUPS.map((priority) => ({
    id: priority.id,
    label: priority.label,
    nodeIds: findingNodes.filter((node) => readFindingMetadata(node)?.severity === priority.severity).map((node) => node.id),
  })), [findingNodes]);
  const flowModel = useMemo(() => state === null ? { nodes: [], edges: [], semanticNodeIds: new Set<string>() } : buildProjectionFlowModel({
    state,
    projection: selectedProjection,
    selectedNodeId,
    filters: { query, visibleGroupIds, showDependencies, showVerifications },
  }), [query, selectedNodeId, selectedProjection, showDependencies, showVerifications, state, visibleGroupIds]);

  useProjectionViewportFit({
    flowInstance,
    nodes: flowModel.nodes,
    projectionId: selectedProjection?.id ?? null,
    workspaceId: state?.workspace.id ?? null,
  });

  function run(operation: () => Promise<void>): Promise<void> {
    pendingOperationCount.current += 1;
    setBusy(true);
    const queued = operationQueue.current.then(async () => {
      setError(null);
      try { await operation(); }
      catch (caught) { setError(caught instanceof Error ? caught.message : "Unknown HiveMap error"); }
      finally {
        pendingOperationCount.current -= 1;
        if (pendingOperationCount.current === 0) setBusy(false);
      }
    });
    operationQueue.current = queued;
    return queued;
  }

  async function refresh(id: string): Promise<WorkspaceState> {
    const next = await getWorkspace(id);
    setState(next);
    setWorkspaceSelectionId(next.workspace.id);
    if (selectedProjection !== null) setSelectedProjection(next.projections.find((projection) => projection.id === selectedProjection.id) ?? null);
    return next;
  }

  async function refreshWorkspaceOptions(preferredId?: string): Promise<void> {
    const workspaces = await listWorkspaces();
    setWorkspaceOptions(workspaces);
    if (preferredId !== undefined) setWorkspaceSelectionId(preferredId);
  }

  async function loadProjectionLocation(): Promise<void> {
    const location = readProjectionLocation();
    if (location.workspaceId === null) return;
    setWorkspaceSelectionId(location.workspaceId);
    const next = await refresh(location.workspaceId);
    const projection = location.projectionId === null ? selectInitialProjection(next) : requireProjection(next, location.projectionId);
    setSelectedProjection(projection);
    setSelectedNodeId(projection?.rootNodeIds[0] ?? next.graph.nodes[0]?.id ?? null);
    setEdgeFrom(next.graph.nodes[0]?.id ?? ""); setEdgeTo(next.graph.nodes[1]?.id ?? "");
    replaceProjectionLocation(location.workspaceId, projection, 0);
  }

  function navigateToProjection(projection: Projection | null, mode: "push" | "replace"): void {
    const targetWorkspaceId = requireLoadedWorkspace(state).workspace.id;
    setSelectedProjection(projection); setActiveSection("map");
    const nextDepth = mode === "push" ? navigationDepth + 1 : 0;
    if (mode === "push") pushProjectionLocation(targetWorkspaceId, projection, nextDepth);
    else replaceProjectionLocation(targetWorkspaceId, projection, nextDepth);
    setNavigationDepth(nextDepth);
  }

  function handleBack(): void {
    if (navigationDepth > 0) return window.history.back();
    if (state === null) return;
    const overview = [...state.projections].reverse().find(isFindingsOverviewProjection);
    if (overview !== undefined && overview.id !== selectedProjection?.id) navigateToProjection(overview, "replace");
  }

  function handleWorkspaceSubmit(event: FormEvent<HTMLFormElement>): void {
    event.preventDefault();
    void run(async () => {
      await createWorkspace({ id: newWorkspaceId, name: newWorkspaceName, createdAt: new Date().toISOString() });
      setWorkspaceSelectionId(newWorkspaceId); await refreshWorkspaceOptions(newWorkspaceId);
      const next = await refresh(newWorkspaceId);
      setNewWorkspaceId(""); setNewWorkspaceName(""); setSelectedProjection(null);
      replaceProjectionLocation(newWorkspaceId, null, 0); setNavigationDepth(0);
      setSelectedNodeId(next.graph.nodes[0]?.id ?? null); setActiveSection("map");
    });
  }

  function handleLoadWorkspace(): void {
    void run(async () => {
      const next = await refresh(workspaceSelectionId);
      const projection = selectInitialProjection(next);
      setSelectedProjection(projection); setActiveSection("map");
      replaceProjectionLocation(next.workspace.id, projection, 0);
      setNavigationDepth(0); setSelectedNodeId(next.graph.nodes[0]?.id ?? null);
      setEdgeFrom(next.graph.nodes[0]?.id ?? ""); setEdgeTo(next.graph.nodes[1]?.id ?? "");
    });
  }

  function handleDeleteScan(scanId: string): void {
    const loadedState = requireLoadedWorkspace(state);
    const targetWorkspaceId = loadedState.workspace.id;
    const scan = loadedState.scanRuns.find((candidate) => candidate.id === scanId);
    if (scan === undefined) return;
    if (!window.confirm(`Delete scan ${scanId} and all findings owned by it? This cannot be undone.`)) return;
    void run(async () => {
      const deletion = await deleteScan(targetWorkspaceId, scanId);
      const next = await refresh(targetWorkspaceId);
      if (selectedProjection !== null && deletion.deletedProjectionIds.includes(selectedProjection.id)) {
        const fallback = selectInitialProjection(next);
        setSelectedProjection(fallback);
        setSelectedNodeId(fallback?.rootNodeIds[0] ?? fallback?.visibleNodeIds[0] ?? next.graph.nodes[0]?.id ?? null);
        replaceProjectionLocation(targetWorkspaceId, fallback, 0);
        setNavigationDepth(0);
      } else if (selectedNodeId !== null && deletion.deletedFindingNodeIds.includes(selectedNodeId)) {
        setSelectedNodeId(next.graph.nodes[0]?.id ?? null);
      }
    });
  }

  function handleAddNode(event: FormEvent<HTMLFormElement>): void {
    event.preventDefault();
    void run(async () => {
      const targetWorkspaceId = requireLoadedWorkspace(state).workspace.id;
      const id = slugifyNodeId(nodeLabel);
      await createNode(targetWorkspaceId, { id, label: nodeLabel, type: nodeType });
      setNodeLabel(""); await refresh(targetWorkspaceId); setSelectedNodeId(id);
    });
  }

  function handleAddEdge(event: FormEvent<HTMLFormElement>): void {
    event.preventDefault();
    void run(async () => {
      const targetWorkspaceId = requireLoadedWorkspace(state).workspace.id;
      await createEdge(targetWorkspaceId, { id: `edge-${edgeFrom}-${edgeRelation}-${edgeTo}`.replace(/[^a-zA-Z0-9-]+/g, "-"), from: edgeFrom, to: edgeTo, relation: edgeRelation });
      await refresh(targetWorkspaceId);
    });
  }

  function handleCreateOverview(): void {
    void run(async () => {
      const targetWorkspaceId = requireLoadedWorkspace(state).workspace.id;
      const projection = await createOverview(targetWorkspaceId, 8); await refresh(targetWorkspaceId); navigateToProjection(projection, "push");
    });
  }

  function handleDiveIn(): void {
    if (selectedNodeId === null) return;
    void run(async () => {
      const targetWorkspaceId = requireLoadedWorkspace(state).workspace.id;
      const projection = await createDiveIn(targetWorkspaceId, selectedNodeId);
      await recordFeedback(targetWorkspaceId, { id: `feedback-dive-${Date.now()}`, createdAt: new Date().toISOString(), type: "dive_in_requested", payload: { nodeId: selectedNodeId }, projectionId: projection.id });
      await refresh(targetWorkspaceId); navigateToProjection(projection, "push");
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
      const targetWorkspaceId = requireLoadedWorkspace(state).workspace.id;
      const projection = await createProjectMap(targetWorkspaceId, findingNodes.filter((node) => readFindingMetadata(node)?.severity === "critical").map((node) => node.id), findingNodes.map((node) => node.id), { name: "Findings Overview", groups: findingGroups, layout: { orientationNote: FINDINGS_OVERVIEW_NOTE } });
      await refresh(targetWorkspaceId); navigateToProjection(projection, "push"); setSelectedNodeId(findingNodes[0]?.id ?? null);
    });
  }

  function handleCreateProjectMap(): void {
    const rootNode = state?.graph.nodes[0];
    if (state === null || rootNode === undefined) return;
    void run(async () => {
      const targetWorkspaceId = state.workspace.id;
      const projection = await createProjectMap(targetWorkspaceId, [rootNode.id], state.graph.nodes.map((node) => node.id)); await refresh(targetWorkspaceId); navigateToProjection(projection, "push");
    });
  }

  function handleFeedback(event: FormEvent<HTMLFormElement>): void {
    event.preventDefault();
    void run(async () => {
      const targetWorkspaceId = requireLoadedWorkspace(state).workspace.id;
      const feedbackEvent: FeedbackEvent = { id: `feedback-${Date.now()}`, createdAt: new Date().toISOString(), type: "map_comment", payload: { text: feedbackText, selectedNodeId }, ...(selectedProjection === null ? {} : { projectionId: selectedProjection.id }) };
      await recordFeedback(targetWorkspaceId, feedbackEvent); setFeedbackText(""); await refresh(targetWorkspaceId);
    });
  }

  function handleConfirmCategory(): void {
    if (selectedNodeId === null) return;
    void run(async () => {
      const targetWorkspaceId = requireLoadedWorkspace(state).workspace.id;
      const assignment: CategoryAssignment = { id: `assignment-${selectedNodeId}-confirmed-${Date.now()}`, targetType: "node", targetId: selectedNodeId, categoryId: "confirmed", status: "active", provenance: "human" };
      await assignCategory(targetWorkspaceId, assignment); await refresh(targetWorkspaceId);
    });
  }

  function handleFindingFeedback(intent: "acknowledge_finding" | "resolve_finding"): void {
    if (selectedNode?.type !== "finding") return;
    void run(async () => {
      const targetWorkspaceId = requireLoadedWorkspace(state).workspace.id;
      await recordFeedback(targetWorkspaceId, { id: `feedback-${intent}-${Date.now()}`, createdAt: new Date().toISOString(), type: "map_comment", payload: { intent, findingNodeId: selectedNode.id, ...(intent === "resolve_finding" ? { resolutionEvidence } : {}) }, ...(selectedProjection === null ? {} : { projectionId: selectedProjection.id }) });
      if (intent === "resolve_finding") setResolutionEvidence("");
      await refresh(targetWorkspaceId);
    });
  }

  function handleCreateProposal(event: FormEvent<HTMLFormElement>): void {
    event.preventDefault();
    void run(async () => {
      const targetWorkspaceId = requireLoadedWorkspace(state).workspace.id;
      const nodeId = slugifyNodeId(proposalLabel);
      await createProposal(targetWorkspaceId, { id: `proposal-${nodeId}-${Date.now()}`, createdAt: new Date().toISOString(), sourceFeedbackIds: [], graphCommands: [{ id: `cmd-proposed-${nodeId}`, type: "node.create", payload: { node: { id: nodeId, label: proposalLabel, type: proposalType } } }], explanation: proposalExplanation, status: "pending" });
      setProposalLabel(""); setProposalExplanation(""); await refresh(targetWorkspaceId);
    });
  }

  function handleProposalAction(action: "approve" | "apply" | "reject", proposalId: string): void {
    void run(async () => {
      const targetWorkspaceId = requireLoadedWorkspace(state).workspace.id;
      if (action === "approve") await approveProposal(targetWorkspaceId, proposalId);
      else if (action === "apply") await applyProposal(targetWorkspaceId, proposalId);
      else await rejectProposal(targetWorkspaceId, proposalId);
      await refresh(targetWorkspaceId);
    });
  }

  function clearWorkspaceScreen(): void {
    setWorkspaceSelectionId(""); setWorkspaceOptions([]); setState(null); setSelectedProjection(null); setSelectedNodeId(null);
    setEdgeFrom(""); setEdgeTo(""); setNavigationDepth(0); setError(null); clearProjectionLocation();
  }

  async function handleAuthTokenChanged(hasToken: boolean): Promise<void> {
    if (!hasToken) { clearWorkspaceScreen(); setActiveSection("settings"); return; }
    setActiveSection("map");
    await run(async () => {
      const location = readProjectionLocation();
      await refreshWorkspaceOptions(location.workspaceId ?? undefined);
      if (location.workspaceId !== null) await loadProjectionLocation();
    });
  }

  function toggleGroup(groupId: string): void {
    setVisibleGroupIds((current) => {
      const next = new Set(current);
      if (next.has(groupId)) next.delete(groupId); else next.add(groupId);
      return next;
    });
  }

  const canGoBack = navigationDepth > 0 || (selectedProjection?.type === "dive-in" && state?.projections.some(isFindingsOverviewProjection) === true);

  return (
    <main aria-busy={busy} className="app-shell" inert={busy}>
      <WorkspaceHeader busy={busy} error={error} projectionName={selectedProjection?.name} workspaceName={state?.workspace.name} />
      <WorkspaceNavigationRail activeSection={activeSection} findingCount={findingNodes.length} onSelect={setActiveSection} scanCount={state?.scanRuns.length ?? 0} />
      <WorkspaceContextPanel
        activeSection={activeSection} findingGroups={findingGroups} findingNodes={findingNodes}
        onFindingMapOpen={handleCreateFindingsOverview} onFindingSelect={setSelectedNodeId} onLoadWorkspace={handleLoadWorkspace}
        onScanDelete={handleDeleteScan}
        onProjectionSelect={(projection) => navigateToProjection(projection, "push")} onWorkspaceChange={setWorkspaceSelectionId}
        selectedProjection={selectedProjection}
        settings={<WorkspaceSettingsPanel
          edgeFrom={edgeFrom} edgeRelation={edgeRelation} edgeTo={edgeTo} feedbackText={feedbackText}
          newWorkspaceId={newWorkspaceId} newWorkspaceName={newWorkspaceName} nodeLabel={nodeLabel} nodeType={nodeType}
          onAddEdge={handleAddEdge} onAddNode={handleAddNode} onApplyProposal={(id) => handleProposalAction("apply", id)}
          onApproveProposal={(id) => handleProposalAction("approve", id)} onAuthTokenChanged={handleAuthTokenChanged}
          onCreateOverview={handleCreateOverview} onCreateProjectMap={handleCreateProjectMap} onCreateProposal={handleCreateProposal}
          onEdgeFromChange={setEdgeFrom} onEdgeRelationChange={setEdgeRelation} onEdgeToChange={setEdgeTo}
          onFeedback={handleFeedback} onFeedbackTextChange={setFeedbackText} onNewWorkspaceIdChange={setNewWorkspaceId}
          onNewWorkspaceNameChange={setNewWorkspaceName} onNodeLabelChange={setNodeLabel} onNodeTypeChange={setNodeType}
          onProposalExplanationChange={setProposalExplanation} onProposalLabelChange={setProposalLabel}
          onProposalTypeChange={setProposalType} onRejectProposal={(id) => handleProposalAction("reject", id)}
          onWorkspaceSubmit={handleWorkspaceSubmit} proposalExplanation={proposalExplanation} proposalLabel={proposalLabel}
          proposalType={proposalType} state={state}
        />} state={state} workspaceSelectionId={workspaceSelectionId} workspaceOptions={workspaceOptions}
      />
      <section className="map-stage">
        <ProjectionToolbar canGoBack={canGoBack} onBack={handleBack} onQueryChange={setQuery}
          onToggleDependencies={() => setShowDependencies((value) => !value)} onToggleGroup={toggleGroup}
          onToggleVerifications={() => setShowVerifications((value) => !value)} projection={selectedProjection}
          query={query} showDependencies={showDependencies} showVerifications={showVerifications} visibleGroupIds={visibleGroupIds} />
        <div className="map-canvas">
          {state === null && <div className="map-empty"><strong>No workspace loaded</strong><span>Choose a workspace or set the operator token in Settings.</span></div>}
          <ReactFlow edges={flowModel.edges} fitView fitViewOptions={{ maxZoom: 1, padding: 0.14 }} nodes={flowModel.nodes}
            nodesDraggable={false} nodeTypes={FLOW_NODE_TYPES} onInit={setFlowInstance}
            onNodeClick={(_, node) => { if (flowModel.semanticNodeIds.has(node.id)) setSelectedNodeId(node.id); }}>
            <Background color="rgba(128, 150, 174, 0.12)" bgColor="#080c12" gap={24} />
            <Controls />
          </ReactFlow>
        </div>
      </section>
      <NodeInspector finding={selectedFinding} node={selectedNode} onClearSelection={() => setSelectedNodeId(null)}
        onConfirm={handleConfirmCategory} onDiveIn={handleDiveIn} onFindingFeedback={handleFindingFeedback}
        onResolutionEvidenceChange={setResolutionEvidence} resolutionEvidence={resolutionEvidence} state={state} />
    </main>
  );
}

function requireLoadedWorkspace(state: WorkspaceState | null): WorkspaceState {
  if (state === null) throw new Error("A workspace must be loaded before running this operation");
  return state;
}

createRoot(document.getElementById("root")!).render(<App />);
