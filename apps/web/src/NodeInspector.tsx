/**
 * Responsibility: Render read-oriented details and explicit actions for the selected semantic node.
 * Must not: Fetch state, invent repository evidence, mutate projections, or persist semantic changes directly.
 * Contract: Derives inspector sections from the supplied graph node, graph relations, categories, and finding metadata.
 */
import { Boxes, CheckCircle2, Code2, FileCode2, GitBranchPlus, Search, ShieldCheck, Tags, X } from "lucide-react";
import { type ReactNode } from "react";

import { type FindingMetadata, type GraphNode, type WorkspaceState } from "./api.js";

export function NodeInspector(props: {
  state: WorkspaceState | null;
  node: GraphNode | null;
  finding: FindingMetadata | null;
  resolutionEvidence: string;
  onResolutionEvidenceChange: (value: string) => void;
  onDiveIn: () => void;
  onConfirm: () => void;
  onFindingFeedback: (intent: "acknowledge_finding" | "resolve_finding") => void;
  onClearSelection: () => void;
}) {
  if (props.node === null || props.state === null) {
    return (
      <aside className="node-inspector node-inspector-empty">
        <Boxes size={24} />
        <strong>Select a component</strong>
        <span>Responsibilities, relations, entrypoints, and source files will appear here.</span>
      </aside>
    );
  }

  const metadata = props.node.metadata ?? {};
  const entrypoints = readEntrypoints(metadata.publicEntrypoints);
  const sourceFiles = readSourceFiles(props.node);
  const outgoingDependencies = relatedNodeLabels(props.state, props.node.id, "outgoing", "depends-on");
  const incomingDependencies = relatedNodeLabels(props.state, props.node.id, "incoming", "depends-on");
  const verifiedBy = relatedNodeLabels(props.state, props.node.id, "incoming", "verifies");
  const categories = props.state.categoryAssignments.filter(
    (assignment) => assignment.targetType === "node" && assignment.targetId === props.node?.id,
  );
  const boundaryKind = typeof metadata.boundaryKind === "string" ? metadata.boundaryKind : props.node.type;

  return (
    <aside className="node-inspector">
      <header className="inspector-header">
        <div><strong>{props.node.label}</strong><span><Boxes size={15} />{boundaryKind}</span></div>
        <button aria-label="Clear selection" onClick={props.onClearSelection} type="button"><X size={18} /></button>
      </header>

      <div className="inspector-actions">
        <button onClick={props.onDiveIn} type="button"><Search size={15} />Dive in</button>
        <button onClick={props.onConfirm} type="button"><Tags size={15} />Confirm</button>
      </div>

      <InspectorSection icon={<GitBranchPlus size={17} />} title="Responsibility">
        <p>{props.node.notes ?? "No responsibility note has been recorded for this component."}</p>
        {typeof metadata.confidence === "string" && <span className="inspector-confidence">{metadata.confidence} confidence</span>}
      </InspectorSection>

      <InspectorSection icon={<Code2 size={17} />} title="Entrypoints">
        <InspectorList values={entrypoints.map((entrypoint) => entrypoint.label)} empty="No public entrypoints recorded" mono />
      </InspectorSection>

      <InspectorSection icon={<GitBranchPlus size={17} />} title="Dependencies">
        <InspectorList values={[...outgoingDependencies.map((label) => `Uses ${label}`), ...incomingDependencies.map((label) => `Used by ${label}`)]} empty="No visible dependency relations" />
      </InspectorSection>

      <InspectorSection icon={<ShieldCheck size={17} />} title="Verified by">
        <InspectorList values={verifiedBy} empty="No explicit verification relation" />
      </InspectorSection>

      <InspectorSection icon={<FileCode2 size={17} />} title="Source files" count={sourceFiles.length}>
        <InspectorList values={sourceFiles.slice(0, 8)} empty="No source references" mono />
        {sourceFiles.length > 8 && <span className="inspector-more">+ {sourceFiles.length - 8} more</span>}
      </InspectorSection>

      <InspectorSection icon={<Tags size={17} />} title="Categories">
        <div className="badge-row">
          {categories.map((assignment) => <span className={`badge badge-${assignment.categoryId}`} key={assignment.id}>{assignment.categoryId}</span>)}
          {categories.length === 0 && <span className="muted">No categories</span>}
        </div>
      </InspectorSection>

      {props.finding !== null && (
        <InspectorSection icon={<CheckCircle2 size={17} />} title="Finding review">
          <div className="finding-meta">
            <span className={`finding-severity finding-severity-${props.finding.severity}`}>{props.finding.severity}</span>
            <span>{props.finding.kind}</span><span>{props.finding.status}</span>
          </div>
          {props.finding.claims.map((claim) => <p className="finding-claim" key={claim.sourceRefIndex}>{claim.claim}</p>)}
          {props.finding.recommendedAction !== undefined && <p><strong>Action:</strong> {props.finding.recommendedAction}</p>}
          <button disabled={props.finding.status !== "open"} onClick={() => props.onFindingFeedback("acknowledge_finding")} type="button">Request acknowledgement</button>
          <label>Resolution evidence<textarea value={props.resolutionEvidence} onChange={(event) => props.onResolutionEvidenceChange(event.currentTarget.value)} /></label>
          <button disabled={props.resolutionEvidence.trim().length === 0 || props.finding.status === "resolved"} onClick={() => props.onFindingFeedback("resolve_finding")} type="button">Propose resolution</button>
        </InspectorSection>
      )}
    </aside>
  );
}

function InspectorSection(props: { title: string; icon: ReactNode; count?: number; children: ReactNode }) {
  return (
    <section className="inspector-section">
      <header>{props.icon}<strong>{props.title}</strong>{props.count !== undefined && <small>{props.count}</small>}</header>
      {props.children}
    </section>
  );
}

function InspectorList(props: { values: readonly string[]; empty: string; mono?: boolean }) {
  if (props.values.length === 0) return <span className="muted">{props.empty}</span>;
  return <ul className={props.mono ? "inspector-list inspector-list-mono" : "inspector-list"}>{props.values.map((value) => <li key={value}>{value}</li>)}</ul>;
}

function relatedNodeLabels(
  state: WorkspaceState,
  nodeId: string,
  direction: "incoming" | "outgoing",
  relation: string,
): string[] {
  const relatedIds = state.graph.edges
    .filter((edge) => edge.relation === relation && (direction === "incoming" ? edge.to === nodeId : edge.from === nodeId))
    .map((edge) => direction === "incoming" ? edge.from : edge.to);
  return relatedIds.map((id) => {
    const node = state.graph.nodes.find((candidate) => candidate.id === id);
    if (node === undefined) throw new Error(`Graph edge references missing node ${id}`);
    return node.label;
  });
}

function readSourceFiles(node: GraphNode): string[] {
  const ownedPaths = Array.isArray(node.metadata?.ownedPaths)
    ? node.metadata.ownedPaths.filter((value): value is string => typeof value === "string")
    : [];
  const sourceRefs = node.metadata?.sourceRefs?.map((sourceRef) => sourceRef.target) ?? [];
  return [...new Set([...ownedPaths, ...sourceRefs])].sort();
}

function readEntrypoints(value: unknown): Array<{ label: string }> {
  if (!Array.isArray(value)) return [];
  return value.map((entrypoint) => {
    if (typeof entrypoint !== "object" || entrypoint === null || !("label" in entrypoint) || typeof entrypoint.label !== "string") {
      throw new Error("Boundary entrypoint metadata must contain a string label");
    }
    return { label: entrypoint.label };
  });
}
