/**
 * Responsibility: Render the bounded context panel for Map, Scans, Findings, or Settings.
 * Must not: Fetch workspace data, mutate semantic state, or render selected-node details.
 * Contract: Keeps the default Map context viewport-bounded and delegates explicit navigation or selection intents.
 */
import { CheckCircle2, Clock3, FileText, GitBranchPlus, History, Layers3, ScanSearch, Trash2, TriangleAlert } from "lucide-react";
import { type ReactNode } from "react";

import { type GraphNode, type Projection, type ProjectionGroup, type ScanRun, type WorkspaceRecord, type WorkspaceState } from "./api.js";
import { readFindingMetadata } from "./finding-metadata.js";
import { type WorkspaceSection } from "./WorkspaceNavigationRail.js";

const COMPACT_VIEW_LIMIT = 5;

export function WorkspaceContextPanel(props: {
  activeSection: WorkspaceSection;
  state: WorkspaceState | null;
  workspaceSelectionId: string;
  workspaceOptions: readonly WorkspaceRecord[];
  selectedProjection: Projection | null;
  findingGroups: readonly ProjectionGroup[];
  findingNodes: readonly GraphNode[];
  settings: ReactNode;
  onWorkspaceChange: (workspaceId: string) => void;
  onLoadWorkspace: () => void;
  onProjectionSelect: (projection: Projection) => void;
  onScanDelete: (scanId: string) => void;
  onFindingSelect: (nodeId: string) => void;
  onFindingMapOpen: () => void;
}) {
  return (
    <aside className={`workspace-context workspace-context-${props.activeSection}`}>
      {props.activeSection === "map" && <MapContext {...props} />}
      {props.activeSection === "scans" && <ScanContext onDelete={props.onScanDelete} runs={props.state?.scanRuns ?? []} />}
      {props.activeSection === "findings" && (
        <FindingContext groups={props.findingGroups} nodes={props.findingNodes} onOpenMap={props.onFindingMapOpen} onSelect={props.onFindingSelect} />
      )}
      {props.activeSection === "settings" && <div className="settings-context">{props.settings}</div>}
    </aside>
  );
}

function MapContext(props: Parameters<typeof WorkspaceContextPanel>[0]) {
  const latestScan = latestScanRun(props.state?.scanRuns ?? []);
  const fileCount = latestScan?.coverage?.discovered.length ?? 0;
  const boundaryCount = latestScan === undefined ? 0 : readBoundaryCount(latestScan);
  const projections = props.state?.projections ?? [];
  const compactProjections = selectCompactProjections(projections, props.selectedProjection?.id);
  const compactProjectionIds = new Set(compactProjections.map((projection) => projection.id));
  const remainingProjections = projections.filter((projection) => !compactProjectionIds.has(projection.id));

  return (
    <>
      <div className="context-heading">
        <span>Repository Scan</span>
        <ScanSearch size={18} />
      </div>
      <section className="scan-summary-card">
        <div className={`scan-summary-status scan-summary-status-${latestScan?.status ?? "none"}`}>
          {latestScan?.status === "completed" ? <CheckCircle2 size={18} /> : <Clock3 size={18} />}
          <strong>{humanScanStatus(latestScan)}</strong>
        </div>
        <div className="scan-summary-metrics">
          <span><FileText size={19} /><strong>{fileCount}</strong><small>files</small></span>
          <span><Layers3 size={19} /><strong>{boundaryCount}</strong><small>boundaries</small></span>
        </div>
      </section>
      <section className="context-section context-views">
        <div className="context-section-title">Views</div>
        <div className="compact-view-list">
          {compactProjections.map((projection) => (
            <button
              className={props.selectedProjection?.id === projection.id ? "context-view context-view-active" : "context-view"}
              key={projection.id}
              onClick={() => props.onProjectionSelect(projection)}
              type="button"
            >
              <GitBranchPlus size={17} /><span>{projection.name}</span>
            </button>
          ))}
          {projections.length === 0 && props.state !== null && <span className="muted">No saved views</span>}
          {remainingProjections.length > 0 && (
            <label className="compact-view-picker">
              <span>{remainingProjections.length} more</span>
              <select
                aria-label="More saved views"
                onChange={(event) => {
                  const projection = remainingProjections.find((candidate) => candidate.id === event.currentTarget.value);
                  if (projection === undefined) throw new Error(`Unknown saved projection: ${event.currentTarget.value}`);
                  props.onProjectionSelect(projection);
                }}
                value=""
              >
                <option disabled value="">Open another view…</option>
                {remainingProjections.map((projection) => <option key={projection.id} value={projection.id}>{projection.name}</option>)}
              </select>
            </label>
          )}
        </div>
      </section>
      <WorkspaceSwitcher {...props} />
    </>
  );
}

function selectCompactProjections(projections: readonly Projection[], selectedProjectionId: string | undefined): Projection[] {
  const newestFirst = [...projections].reverse();
  const selected = projections.find((projection) => projection.id === selectedProjectionId);
  if (selected === undefined) return newestFirst.slice(0, COMPACT_VIEW_LIMIT);
  return [selected, ...newestFirst.filter((projection) => projection.id !== selected.id).slice(0, COMPACT_VIEW_LIMIT - 1)];
}

function ScanContext(props: { runs: readonly ScanRun[]; onDelete: (scanId: string) => void }) {
  return (
    <>
      <div className="context-heading"><span>Scan history</span><History size={18} /></div>
      <div className="context-scroll-list">
        {[...props.runs].reverse().map((scan) => (
          <article className="context-record" key={scan.id}>
            <div><strong>{scan.id}</strong><span className={`scan-status scan-status-${scan.status}`}>{scan.status === "in_progress" ? "draft" : "completed"}</span></div>
            <span>{scan.profileId}@{scan.profileVersion}</span>
            <span>{scan.coverage === undefined ? "Coverage pending" : `${scan.coverage.included.length} included · ${scan.coverage.excluded.length} excluded`}</span>
            <span>{scan.findingNodeIds.length} findings</span>
            <button className="scan-delete" onClick={() => props.onDelete(scan.id)} type="button"><Trash2 size={14} />Delete scan</button>
          </article>
        ))}
        {props.runs.length === 0 && <span className="muted">No repository scans</span>}
      </div>
    </>
  );
}

function FindingContext(props: {
  groups: readonly ProjectionGroup[];
  nodes: readonly GraphNode[];
  onOpenMap: () => void;
  onSelect: (nodeId: string) => void;
}) {
  return (
    <>
      <div className="context-heading"><span>Findings</span><TriangleAlert size={18} /></div>
      <button className="context-primary-action" disabled={props.nodes.length === 0} onClick={props.onOpenMap} type="button">Open findings map</button>
      <div className="context-scroll-list">
        {props.groups.map((group) => (
          <section className="context-finding-group" key={group.id}>
            <div><strong>{group.label}</strong><small>{group.nodeIds.length}</small></div>
            {group.nodeIds.map((nodeId) => {
              const node = props.nodes.find((candidate) => candidate.id === nodeId);
              if (node === undefined) throw new Error(`Finding group references missing node ${nodeId}`);
              const finding = readFindingMetadata(node);
              return (
                <button key={node.id} onClick={() => props.onSelect(node.id)} type="button">
                  <span>{node.label}</span><small>{finding?.kind} · {finding?.status}</small>
                </button>
              );
            })}
          </section>
        ))}
        {props.nodes.length === 0 && <span className="muted">No findings</span>}
      </div>
    </>
  );
}

function WorkspaceSwitcher(props: Parameters<typeof WorkspaceContextPanel>[0]) {
  return (
    <section className="workspace-switcher">
      <label>
        <span>Workspace</span>
        <select value={props.workspaceSelectionId} onChange={(event) => props.onWorkspaceChange(event.currentTarget.value)}>
          <option value="">Select a workspace…</option>
          {props.workspaceOptions.map((workspace) => <option key={workspace.id} value={workspace.id}>{workspace.name}</option>)}
        </select>
      </label>
      <button disabled={props.workspaceSelectionId === ""} onClick={props.onLoadWorkspace} type="button">Load</button>
    </section>
  );
}

function latestScanRun(runs: readonly ScanRun[]): ScanRun | undefined {
  return [...runs].sort((left, right) => right.startedAt.localeCompare(left.startedAt))[0];
}

function readBoundaryCount(scan: ScanRun): number {
  return scan.status === "completed" ? scan.boundaryMap?.boundaries.length ?? 0 : 0;
}

function humanScanStatus(scan: ScanRun | undefined): string {
  if (scan === undefined) return "No scan";
  return scan.status === "completed" ? "Completed" : "In progress";
}
