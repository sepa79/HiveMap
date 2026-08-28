/**
 * Responsibility: Own browser URL/history projection navigation and deterministic initial selection.
 * Must not: Fetch data, mutate semantic graph state, render UI, or persist workspace state.
 * Contract: Encodes and resolves workspace/projection location through explicit browser history entries.
 */
import type { Projection, WorkspaceState } from "./api.js";
import { FINDING_PRIORITY_GROUP_IDS } from "./finding-priorities.js";

type ProjectionLocation = { workspaceId: string | null; projectionId: string | null };
type HiveMapHistoryState = { hiveMap: true; depth: number };

export function readProjectionLocation(): ProjectionLocation {
  const parameters = new URLSearchParams(window.location.search);
  return {
    workspaceId: parameters.get("workspace"),
    projectionId: parameters.get("projection"),
  };
}

export function pushProjectionLocation(workspaceId: string, projection: Projection | null, depth: number): void {
  window.history.pushState({ hiveMap: true, depth } satisfies HiveMapHistoryState, "", projectionUrl(workspaceId, projection));
}

export function replaceProjectionLocation(workspaceId: string, projection: Projection | null, depth: number): void {
  window.history.replaceState({ hiveMap: true, depth } satisfies HiveMapHistoryState, "", projectionUrl(workspaceId, projection));
}

export function clearProjectionLocation(): void {
  const url = new URL(window.location.href);
  url.searchParams.delete("workspace");
  url.searchParams.delete("projection");
  window.history.replaceState({ hiveMap: true, depth: 0 } satisfies HiveMapHistoryState, "", `${url.pathname}${url.search}${url.hash}`);
}

function projectionUrl(workspaceId: string, projection: Projection | null): string {
  const url = new URL(window.location.href);
  url.searchParams.set("workspace", workspaceId);
  if (projection === null) url.searchParams.delete("projection");
  else url.searchParams.set("projection", projection.id);
  return `${url.pathname}${url.search}${url.hash}`;
}

export function readHistoryDepth(value: unknown): number {
  if (typeof value !== "object" || value === null || !("hiveMap" in value) || value.hiveMap !== true || !("depth" in value)) return 0;
  const depth = value.depth;
  if (!Number.isInteger(depth) || (depth as number) < 0) return 0;
  return depth as number;
}

export function requireProjection(state: WorkspaceState, projectionId: string): Projection {
  const projection = state.projections.find((candidate) => candidate.id === projectionId);
  if (projection === undefined) throw new Error(`Workspace ${state.workspace.id} does not contain projection ${projectionId}`);
  return projection;
}

export function selectInitialProjection(state: WorkspaceState): Projection | null {
  const findingsOverview = [...state.projections].reverse().find(isFindingsOverviewProjection);
  return findingsOverview ?? state.projections.at(-1) ?? null;
}

export function isFindingsOverviewProjection(projection: Projection): boolean {
  return projection.type === "project-map" &&
    projection.groups !== undefined &&
    projection.groups.length > 0 &&
    projection.groups.every((group) => FINDING_PRIORITY_GROUP_IDS.has(group.id));
}

export function describeProjection(projection: Projection | null): string {
  if (projection === null) return "Semantic graph source";
  if (projection.type === "dive-in") return "Finding deep dive · affected concepts on the map · evidence in the sidebar";
  if (isFindingsOverviewProjection(projection)) {
    return "Documentation review queue · priority columns · click a finding to open its evidence";
  }
  return projection.type;
}
