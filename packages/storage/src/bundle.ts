import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";

import { strFromU8, strToU8, unzipSync, zipSync, type Zippable } from "fflate";

import { compareCompletedScans, toFindingEvidence, type CompletedScanRun, type ScanComparison, type ScanProfile, type ScanRun } from "@hivemap/scans";

import { validateWorkspaceState, type WorkspaceState } from "./index.js";
import { STORAGE_SCHEMA_VERSION } from "./schema.js";

export const HIVEMAP_BUNDLE_FORMAT_VERSION = 1;

export type BundleFileRole = "canonical" | "generated";

export type BundleManifest = {
  format: "hivemap-workspace";
  formatVersion: number;
  storageSchemaVersion: string;
  exportedAt: string;
  workspaceId: string;
  files: Array<{
    path: string;
    sha256: string;
    role: BundleFileRole;
  }>;
};

export type WorkspaceBundle = {
  manifest: BundleManifest;
  state: WorkspaceState;
};

export class BundleValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "BundleValidationError";
  }
}

export function writeWorkspaceBundle(path: string, state: WorkspaceState, exportedAt: string): BundleManifest {
  assertNonEmpty("path", path);
  const { bytes, manifest } = createWorkspaceBundle(state, exportedAt);
  writeFileSync(path, bytes, { flag: "wx" });
  return manifest;
}

export function readWorkspaceBundle(path: string): WorkspaceBundle {
  assertNonEmpty("path", path);
  return parseWorkspaceBundle(readFileSync(path));
}

export function createWorkspaceBundle(
  state: WorkspaceState,
  exportedAt: string,
): { bytes: Uint8Array; manifest: BundleManifest } {
  validateWorkspaceState(state);
  assertDate("exportedAt", exportedAt);
  const files = createBundleFiles(state);
  const manifest: BundleManifest = {
    format: "hivemap-workspace",
    formatVersion: HIVEMAP_BUNDLE_FORMAT_VERSION,
    storageSchemaVersion: STORAGE_SCHEMA_VERSION,
    exportedAt,
    workspaceId: state.workspace.id,
    files: [...files.entries()]
      .map(([path, file]) => ({ path, sha256: sha256(file.content), role: file.role }))
      .sort((left, right) => left.path.localeCompare(right.path)),
  };
  const zipInput: Zippable = {};
  const allEntries = new Map(files);
  allEntries.set("manifest.json", { role: "generated", content: stableJson(manifest) });
  for (const [path, file] of [...allEntries.entries()].sort(([left], [right]) => left.localeCompare(right))) {
    zipInput[path] = [strToU8(file.content), { level: 9, mtime: new Date("1980-01-01T00:00:00.000Z") }];
  }
  return { bytes: zipSync(zipInput, { level: 9 }), manifest };
}

export function parseWorkspaceBundle(bytes: Uint8Array): WorkspaceBundle {
  const archive = unzipSync(bytes);
  const paths = Object.keys(archive).sort();
  for (const path of paths) validateArchivePath(path);
  const manifestText = readRequiredEntry(archive, "manifest.json");
  const manifest = parseJson<BundleManifest>(manifestText, "manifest.json");
  validateManifest(manifest);
  const declaredPaths = manifest.files.map((file) => file.path).sort();
  const expectedPaths = ["manifest.json", ...declaredPaths].sort();
  if (stableJson(paths) !== stableJson(expectedPaths)) {
    throw new BundleValidationError("Bundle entries do not match manifest files");
  }
  for (const file of manifest.files) {
    const content = readRequiredEntry(archive, file.path);
    if (sha256(content) !== file.sha256) throw new BundleValidationError(`Checksum mismatch: ${file.path}`);
  }
  const state = parseJson<WorkspaceState>(readRequiredEntry(archive, "workspace.json"), "workspace.json");
  validateWorkspaceState(state);
  if (state.workspace.id !== manifest.workspaceId) throw new BundleValidationError("Manifest workspace id does not match workspace.json");
  const expectedFiles = createBundleFiles(state);
  for (const [path, expected] of expectedFiles) {
    if (readRequiredEntry(archive, path) !== expected.content) {
      throw new BundleValidationError(`Generated bundle entry does not match workspace.json: ${path}`);
    }
  }
  return { manifest, state };
}

function createBundleFiles(state: WorkspaceState): Map<string, { role: BundleFileRole; content: string }> {
  const files = new Map<string, { role: BundleFileRole; content: string }>();
  files.set("workspace.json", { role: "canonical", content: stableJson(state) });
  files.set("graph.json", { role: "generated", content: stableJson(state.graph) });
  files.set("findings.json", { role: "generated", content: stableJson(currentFindingEvidence(state)) });
  files.set("SUMMARY.md", { role: "generated", content: createSummary(state) });
  for (const run of state.scanRuns) {
    const profile = state.scanProfiles.find(
      (candidate) => candidate.id === run.profileId && candidate.version === run.profileVersion,
    );
    if (profile === undefined) throw new BundleValidationError(`Scan profile missing while exporting run: ${run.id}`);
    const root = `scans/${run.id}`;
    files.set(`${root}/run.json`, { role: "generated", content: stableJson(run) });
    files.set(`${root}/coverage.json`, { role: "generated", content: stableJson(run.coverage ?? null) });
    files.set(`${root}/instructions.md`, { role: "generated", content: createInstructions(profile) });
    files.set(`${root}/repeat-scan.md`, { role: "generated", content: createRepeatInstructions(state.workspace.id, profile, run) });
  }
  for (const comparison of createComparisons(state.scanRuns)) {
    files.set(`comparisons/${comparison.beforeScanId}--${comparison.afterScanId}.json`, {
      role: "generated",
      content: stableJson(comparison),
    });
  }
  return files;
}

function currentFindingEvidence(state: WorkspaceState) {
  return state.graph.nodes.filter((node) => node.type === "finding").map(toFindingEvidence);
}

function createSummary(state: WorkspaceState): string {
  const findings = currentFindingEvidence(state);
  const open = findings.filter((finding) => !["resolved", "accepted"].includes(finding.finding.status));
  const completed = state.scanRuns.filter((run) => run.status === "completed");
  const comparisons = createComparisons(state.scanRuns);
  return `# ${state.workspace.name} — HiveMap Export

- Workspace: \`${state.workspace.id}\`
- Nodes: ${state.graph.nodes.length}
- Edges: ${state.graph.edges.length}
- Scan profiles: ${state.scanProfiles.length}
- Completed scans: ${completed.length}
- Findings: ${findings.length}
- Open findings: ${open.length}
- Scan comparisons: ${comparisons.length}

## Findings

${findings.length === 0 ? "No findings were exported." : findings.map((finding) => `- **${finding.finding.severity} / ${finding.finding.status}** \`${finding.finding.fingerprint}\`: ${finding.label}`).join("\n")}

## Verification

${comparisons.length === 0 ? "No before/after comparison is available." : comparisons.map((comparison) => `- **${comparison.verdict.toUpperCase()}** \`${comparison.beforeScanId}\` → \`${comparison.afterScanId}\`: ${comparison.items.filter((item) => item.status === "resolved").length} resolved, ${comparison.items.filter((item) => item.status === "new").length} new, ${comparison.items.filter((item) => item.status === "regressed").length} regressed, ${comparison.items.filter((item) => item.status === "unverifiable").length} unverifiable.`).join("\n")}

Import this ZIP into HiveMap. Treat \`workspace.json\` as canonical; the remaining files are generated review projections.
`;
}

function createComparisons(runs: readonly ScanRun[]): ScanComparison[] {
  const completed = runs.filter((run): run is CompletedScanRun => run.status === "completed");
  const comparisons: ScanComparison[] = [];
  for (let index = 0; index < completed.length; index += 1) {
    const after = completed[index] as CompletedScanRun;
    const before = completed.slice(0, index).reverse().find((candidate) => candidate.profileId === after.profileId);
    if (before !== undefined) comparisons.push(compareCompletedScans(before, after));
  }
  return comparisons;
}

function createInstructions(profile: ScanProfile): string {
  return `# ${profile.name} (${profile.id}@${profile.version})

${profile.description}

## Instructions

${profile.instructions.map((instruction, index) => `${index + 1}. ${instruction}`).join("\n")}

## Discovery

Include:
${profile.scope.include.map((pattern) => `- \`${pattern}\``).join("\n")}

Exclude:
${profile.scope.exclude.map((pattern) => `- \`${pattern}\``).join("\n")}

## Criteria

${profile.criteria.map((criterion) => `- \`${criterion.id}\`: ${criterion.description}`).join("\n")}

## SSOT Order

${profile.ssotOrder.map((source, index) => `${index + 1}. \`${source}\``).join("\n")}
`;
}

function createRepeatInstructions(workspaceId: string, profile: ScanProfile, run: ScanRun): string {
  return `# Repeat Scan ${run.id}

Repository root used previously: \`${run.repository.root}\`
Previous revision: \`${run.repository.revision}\`
Profile: \`${profile.id}@${profile.version}\`

1. Import this bundle with \`workspace_import_zip\` in explicit \`new\` or \`replace\` mode.
2. Read the target repository rules and this scan profile.
3. Call \`scan_start\` for workspace \`${workspaceId}\` with profile \`${profile.id}@${profile.version}\` and the current repository identity.
4. Rediscover files using the profile include/exclude rules. Do not reuse the previous inventory as current truth.
5. Call \`scan_record_coverage\` with every discovered, included, excluded, and failed source.
6. Apply semantic graph commands and call \`scan_finding_create\` for current problems.
7. Call \`scan_complete\` with every applied criterion and required output.
8. Call \`scan_compare\` with before scan \`${run.id}\` and the new completed scan.
9. Export a new ZIP as verification evidence.
`;
}

function validateManifest(manifest: BundleManifest): void {
  if (manifest.format !== "hivemap-workspace") throw new BundleValidationError(`Unknown bundle format: ${String(manifest.format)}`);
  if (manifest.formatVersion !== HIVEMAP_BUNDLE_FORMAT_VERSION) {
    throw new BundleValidationError(`Unsupported bundle format version: ${manifest.formatVersion}`);
  }
  if (manifest.storageSchemaVersion !== STORAGE_SCHEMA_VERSION) throw new BundleValidationError(`Unsupported bundle storage schema: ${manifest.storageSchemaVersion}`);
  assertDate("manifest.exportedAt", manifest.exportedAt);
  assertNonEmpty("manifest.workspaceId", manifest.workspaceId);
  const paths = manifest.files.map((file) => file.path);
  if (new Set(paths).size !== paths.length) throw new BundleValidationError("Manifest contains duplicate file paths");
  for (const file of manifest.files) {
    validateArchivePath(file.path);
    if (!/^[a-f0-9]{64}$/.test(file.sha256)) throw new BundleValidationError(`Invalid SHA-256 for ${file.path}`);
    if (file.role !== "canonical" && file.role !== "generated") throw new BundleValidationError(`Invalid file role for ${file.path}`);
  }
  const canonical = manifest.files.filter((file) => file.role === "canonical").map((file) => file.path);
  if (stableJson(canonical) !== stableJson(["workspace.json"])) {
    throw new BundleValidationError("workspace.json must be the only canonical bundle file");
  }
}

function validateArchivePath(path: string): void {
  assertNonEmpty("archive path", path);
  if (path.startsWith("/") || path.includes("..") || path.includes("\\")) {
    throw new BundleValidationError(`Unsafe archive path: ${path}`);
  }
}

function readRequiredEntry(archive: Record<string, Uint8Array>, path: string): string {
  const bytes = archive[path];
  if (bytes === undefined) throw new BundleValidationError(`Bundle entry missing: ${path}`);
  return strFromU8(bytes);
}

function parseJson<T>(text: string, path: string): T {
  try {
    return JSON.parse(text) as T;
  } catch (error) {
    throw new BundleValidationError(`Invalid JSON in ${path}: ${error instanceof Error ? error.message : String(error)}`);
  }
}

function sha256(content: string): string {
  return createHash("sha256").update(content).digest("hex");
}

export function stableJson(value: unknown): string {
  return `${JSON.stringify(sortValue(value), null, 2)}\n`;
}

function sortValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortValue);
  if (typeof value !== "object" || value === null) return value;
  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, child]) => [key, sortValue(child)]),
  );
}

function assertNonEmpty(label: string, value: string): void {
  if (value.trim().length === 0) throw new BundleValidationError(`${label} must be non-empty`);
}

function assertDate(label: string, value: string): void {
  assertNonEmpty(label, value);
  if (Number.isNaN(Date.parse(value))) throw new BundleValidationError(`${label} must be a valid date`);
}
