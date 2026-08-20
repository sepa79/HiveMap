import {
  validateProjectSourceRef,
  type GraphNode,
  type ProjectSourceRef,
  type SemanticGraph,
} from "@hivemap/graph-core";

export const SCAN_REQUIRED_OUTPUT_VALUES = ["document-inventory", "concept-map", "findings", "coverage-report"] as const;
export type ScanRequiredOutput = (typeof SCAN_REQUIRED_OUTPUT_VALUES)[number];

export type ScanCriterion = {
  id: string;
  description: string;
};

export type ScanProfile = {
  id: string;
  version: number;
  name: string;
  description: string;
  instructions: string[];
  scope: {
    include: string[];
    exclude: string[];
  };
  sourceTypes: string[];
  criteria: ScanCriterion[];
  ssotOrder: string[];
  requiredOutputs: ScanRequiredOutput[];
};

export const SCAN_PROFILE_OVERLAY_FORMAT_VERSION = 1 as const;
export const SCAN_PROFILE_OVERLAY_DIRECTORY = ".hivemap/scan-profiles" as const;

export type ScanProfileOverlay = {
  formatVersion: typeof SCAN_PROFILE_OVERLAY_FORMAT_VERSION;
  profileId: string;
  include?: string[];
  exclude?: string[];
  archivePatterns?: string[];
  legacyPatterns?: string[];
  generatedPatterns?: string[];
};

export type ScanRepository = {
  repositoryIndexId?: string;
  root: string;
  repositoryUrl?: string;
  branch: string;
  revision: string;
  worktreeDigest?: string;
};

export type ScanActor = {
  agentId: string;
  tool: string;
};

export type ScanCoverageException = {
  target: string;
  reason: string;
};

export type ScanCoverage = {
  discovered: string[];
  included: string[];
  excluded: ScanCoverageException[];
  failed: ScanCoverageException[];
};

export const FINDING_KIND_VALUES = [
  "conflict",
  "stale",
  "missing",
  "ambiguous",
  "broken-reference",
  "duplicate-authority",
  "implementation-drift",
  "quality-problem",
  "architecture-risk",
  "runtime-risk",
  "authority-gap",
  "test-gap",
  "deployment-risk",
] as const;
export type FindingKind = (typeof FINDING_KIND_VALUES)[number];

export const FINDING_SEVERITY_VALUES = ["low", "normal", "high", "critical"] as const;
export type FindingSeverity = (typeof FINDING_SEVERITY_VALUES)[number];

export const FINDING_CONFIDENCE_VALUES = ["low", "medium", "high"] as const;
export type FindingConfidence = (typeof FINDING_CONFIDENCE_VALUES)[number];

export const FINDING_STATUS_VALUES = [
  "open",
  "acknowledged",
  "proposed-fix",
  "resolved",
  "accepted",
  "unverifiable",
] as const;
export type FindingStatus = (typeof FINDING_STATUS_VALUES)[number];

export type FindingClaim = {
  sourceRefIndex: number;
  claim: string;
};

export type FindingMetadata = {
  fingerprint: string;
  kind: FindingKind;
  severity: FindingSeverity;
  confidence: FindingConfidence;
  status: FindingStatus;
  originScanId: string;
  criterionIds: string[];
  claims: FindingClaim[];
  affectedNodeIds: string[];
  expectedOwner?: string;
  recommendedAction?: string;
  resolutionEvidence?: string;
};

export type FindingNodeInput = {
  id: string;
  label: string;
  notes: string;
  fingerprint: string;
  kind: FindingKind;
  severity: FindingSeverity;
  confidence: FindingConfidence;
  status?: FindingStatus;
  criterionIds: string[];
  sources: Array<{
    sourceRef: ProjectSourceRef;
    claim: string;
  }>;
  affectedNodeIds: string[];
  expectedOwner?: string;
  recommendedAction?: string;
  resolutionEvidence?: string;
};

export type FindingNodeUpdate = {
  notes?: string;
  severity?: FindingSeverity;
  confidence?: FindingConfidence;
  status?: FindingStatus;
  expectedOwner?: string;
  recommendedAction?: string;
  resolutionEvidence?: string;
};

export type FindingEvidence = {
  nodeId: string;
  label: string;
  notes: string;
  sourceRefs: ProjectSourceRef[];
  finding: FindingMetadata;
};

type ScanRunBase = {
  id: string;
  profileId: string;
  profileVersion: number;
  repository: ScanRepository;
  actor: ScanActor;
  startedAt: string;
  coverage?: ScanCoverage;
  appliedCriteria: string[];
  declaredOutputs: ScanRequiredOutput[];
  findingNodeIds: string[];
};

export type InProgressScanRun = ScanRunBase & {
  status: "in_progress";
};

export type CompletedScanRun = ScanRunBase & {
  status: "completed";
  coverage: ScanCoverage;
  completedAt: string;
  graphDigest: string;
  findingEvidence: FindingEvidence[];
};

export type ScanRun = InProgressScanRun | CompletedScanRun;

export type ScanComparisonStatus = "resolved" | "still_open" | "changed" | "new" | "regressed" | "unverifiable";

export type ScanComparisonItem = {
  fingerprint: string;
  status: ScanComparisonStatus;
  before?: FindingEvidence;
  after?: FindingEvidence;
};

export type ScanComparison = {
  beforeScanId: string;
  afterScanId: string;
  profileId: string;
  profileVersionChanged: boolean;
  items: ScanComparisonItem[];
  coverage: {
    added: string[];
    removed: string[];
    failed: ScanCoverageException[];
  };
  verdict: "pass" | "fail";
};

export class ScanValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ScanValidationError";
  }
}

export const DOCUMENTATION_CONFLICTS_PROFILE: ScanProfile = {
  id: "documentation-conflicts",
  version: 1,
  name: "Documentation conflicts",
  description: "Map repository documentation with emphasis on conflicting authority, stale claims, and missing ownership.",
  instructions: [
    "Read repository rules and establish the documented SSOT order before interpreting claims.",
    "Use the run coverage derived from the selected completed repository index as the bounded source inventory for this scan.",
    "Map bounded concepts and their owning source sections before creating findings.",
    "Represent every conflict with exact source claims, anchors, revisions, and the expected owner.",
    "Distinguish product direction, current contract, implementation evidence, and historical material.",
  ],
  scope: {
    include: ["AGENTS.md", "README.md", "docs/**/*.md", "**/README.md"],
    exclude: ["node_modules/**", "dist/**", "vendor/**", "docs/archive/**"],
  },
  sourceTypes: ["project-rules", "specification", "architecture", "product-direction", "operational-documentation"],
  criteria: [
    { id: "contradictory-claims", description: "Two current sources make incompatible claims about the same concern." },
    { id: "duplicate-authority", description: "Multiple sources present themselves as owner of the same contract." },
    { id: "stale-documentation", description: "A current-looking source describes superseded behavior or structure." },
    { id: "broken-references", description: "A referenced document, section, symbol, or link does not exist." },
    { id: "missing-owner", description: "A material concern has no explicit owning source." },
    { id: "ambiguous-status", description: "Direction, implementation, history, or deprecation status is unclear." },
    { id: "direction-as-implementation", description: "Future direction is presented as implemented behavior." },
  ],
  ssotOrder: ["AGENTS.md", "docs/specs/**", "docs/architecture*", "docs/product/**", "implementation"],
  requiredOutputs: ["document-inventory", "concept-map", "findings", "coverage-report"],
};

export const CODE_QUALITY_PROFILE: ScanProfile = {
  id: "code-quality-review",
  version: 1,
  name: "Code quality review",
  description: "Map implementation boundaries and record code, contract, test, and runtime problems.",
  instructions: [
    "Read repository rules, architecture, and relevant contracts before assessing implementation.",
    "Use the run coverage derived from the selected completed repository index as the bounded code and test inventory for this scan.",
    "Map components and boundaries before recording local symptoms.",
    "Attach code symbols, tests, and contract sources to every finding.",
    "Use technical finding kinds such as architecture-risk, runtime-risk, authority-gap, test-gap, and deployment-risk when they describe the problem more precisely than documentation-oriented kinds.",
    "Separate verified defects from risks and missing evidence.",
  ],
  scope: {
    include: ["src/**", "apps/**", "packages/**", "tests/**", "docs/specs/**"],
    exclude: ["node_modules/**", "dist/**", "coverage/**", "vendor/**"],
  },
  sourceTypes: ["project-rules", "specification", "code", "test", "runtime-evidence"],
  criteria: [
    { id: "contract-drift", description: "Implementation behavior differs from the owning contract." },
    { id: "missing-tests", description: "A material boundary or failure mode lacks verification." },
    { id: "duplicate-responsibility", description: "Multiple modules own the same responsibility." },
    { id: "boundary-violation", description: "A module performs work owned by another boundary." },
    { id: "unsafe-failure", description: "Invalid state or IO failure is hidden or ambiguously recovered." },
    { id: "concurrency-risk", description: "Async or concurrent behavior has an unbounded or unverified race." },
    { id: "undocumented-api", description: "A public API or tool behavior lacks an owning contract." },
  ],
  ssotOrder: ["AGENTS.md", "docs/specs/**", "docs/architecture*", "implementation", "tests"],
  requiredOutputs: ["document-inventory", "concept-map", "findings", "coverage-report"],
};

export const INITIAL_SCAN_PROFILES: ScanProfile[] = [DOCUMENTATION_CONFLICTS_PROFILE, CODE_QUALITY_PROFILE];

export function getScanProfileOverlayFileStem(profileId: string): string {
  switch (profileId) {
    case "code-quality-review":
      return "code-quality";
    default:
      return profileId;
  }
}

export function getScanProfileOverlayPath(profileId: string): string {
  return `${SCAN_PROFILE_OVERLAY_DIRECTORY}/${getScanProfileOverlayFileStem(profileId)}.yaml`;
}

export function validateScanProfile(profile: ScanProfile): void {
  assertNonEmpty("profile.id", profile.id);
  if (!Number.isInteger(profile.version) || profile.version < 1) {
    throw new ScanValidationError("profile.version must be a positive integer");
  }
  assertNonEmpty("profile.name", profile.name);
  assertNonEmpty("profile.description", profile.description);
  assertNonEmptyArray("profile.instructions", profile.instructions);
  assertNonEmptyArray("profile.scope.include", profile.scope.include);
  validateStringArray("profile.scope.exclude", profile.scope.exclude);
  assertNonEmptyArray("profile.sourceTypes", profile.sourceTypes);
  assertNonEmptyArray("profile.ssotOrder", profile.ssotOrder);
  assertUnique("profile.requiredOutputs", profile.requiredOutputs);
  if (profile.requiredOutputs.length === 0) {
    throw new ScanValidationError("profile.requiredOutputs must contain at least one output");
  }
  for (const output of profile.requiredOutputs) {
    if (!SCAN_REQUIRED_OUTPUT_VALUES.includes(output)) {
      throw new ScanValidationError(`Unknown required output: ${output}`);
    }
  }
  if (profile.criteria.length === 0) {
    throw new ScanValidationError("profile.criteria must contain at least one criterion");
  }
  assertUnique("profile.criteria ids", profile.criteria.map((criterion) => criterion.id));
  for (const criterion of profile.criteria) {
    assertNonEmpty("criterion.id", criterion.id);
    assertNonEmpty("criterion.description", criterion.description);
  }
}

export function validateScanProfileOverlay(overlay: ScanProfileOverlay): void {
  if (overlay.formatVersion !== SCAN_PROFILE_OVERLAY_FORMAT_VERSION) {
    throw new ScanValidationError(`scan profile overlay formatVersion must be ${SCAN_PROFILE_OVERLAY_FORMAT_VERSION}`);
  }
  assertNonEmpty("overlay.profileId", overlay.profileId);
  validateOptionalPatternList("overlay.include", overlay.include);
  validateOptionalPatternList("overlay.exclude", overlay.exclude);
  validateOptionalPatternList("overlay.archivePatterns", overlay.archivePatterns);
  validateOptionalPatternList("overlay.legacyPatterns", overlay.legacyPatterns);
  validateOptionalPatternList("overlay.generatedPatterns", overlay.generatedPatterns);
}

export function applyScanProfileOverlay(profile: ScanProfile, overlay: ScanProfileOverlay): ScanProfile {
  validateScanProfileOverlay(overlay);
  if (overlay.profileId !== profile.id) {
    throw new ScanValidationError(`scan profile overlay targets ${overlay.profileId}, expected ${profile.id}`);
  }
  return {
    ...profile,
    scope: {
      include: uniqueStable([...profile.scope.include, ...(overlay.include ?? [])]),
      exclude: uniqueStable([
        ...profile.scope.exclude,
        ...(overlay.exclude ?? []),
        ...(overlay.archivePatterns ?? []),
        ...(overlay.legacyPatterns ?? []),
        ...(overlay.generatedPatterns ?? []),
      ]),
    },
  };
}

export function validateScanCoverage(coverage: ScanCoverage): void {
  assertNonEmptyArray("coverage.discovered", coverage.discovered);
  assertNonEmptyArray("coverage.included", coverage.included);
  assertUnique("coverage.discovered", coverage.discovered);
  assertUnique("coverage.included", coverage.included);
  const discovered = new Set(coverage.discovered);
  for (const target of coverage.included) {
    if (!discovered.has(target)) {
      throw new ScanValidationError(`Included source was not discovered: ${target}`);
    }
  }
  validateCoverageExceptions("coverage.excluded", coverage.excluded, discovered);
  validateCoverageExceptions("coverage.failed", coverage.failed, discovered);
  const classified = [...coverage.included, ...coverage.excluded.map((entry) => entry.target), ...coverage.failed.map((entry) => entry.target)];
  assertUnique("coverage classified targets", classified);
}

export function createFindingNode(scanId: string, input: FindingNodeInput): GraphNode {
  assertNonEmpty("scanId", scanId);
  const sourceRefs = input.sources.map((source) => source.sourceRef);
  const finding: FindingMetadata = {
    fingerprint: input.fingerprint,
    kind: input.kind,
    severity: input.severity,
    confidence: input.confidence,
    status: input.status ?? "open",
    originScanId: scanId,
    criterionIds: input.criterionIds,
    claims: input.sources.map((source, index) => ({ sourceRefIndex: index, claim: source.claim })),
    affectedNodeIds: input.affectedNodeIds,
  };
  if (input.expectedOwner !== undefined) finding.expectedOwner = input.expectedOwner;
  if (input.recommendedAction !== undefined) finding.recommendedAction = input.recommendedAction;
  if (input.resolutionEvidence !== undefined) finding.resolutionEvidence = input.resolutionEvidence;

  const node: GraphNode = {
    id: input.id,
    label: input.label,
    type: "finding",
    notes: input.notes,
    metadata: { sourceRefs, finding },
  };
  validateFindingNode(node);
  return node;
}

export function validateFindingNode(node: GraphNode): void {
  if (node.type !== "finding") {
    throw new ScanValidationError(`Finding node must use type finding: ${node.id}`);
  }
  assertNonEmpty("finding node id", node.id);
  assertNonEmpty("finding node label", node.label);
  assertNonEmpty("finding node notes", node.notes ?? "");
  const metadata = node.metadata;
  if (metadata === undefined || !isObject(metadata.finding)) {
    throw new ScanValidationError(`Finding node ${node.id} must contain metadata.finding`);
  }
  const finding = metadata.finding as FindingMetadata;
  assertNonEmpty("finding.fingerprint", finding.fingerprint);
  if (!FINDING_KIND_VALUES.includes(finding.kind)) throw new ScanValidationError(`Unknown finding kind: ${finding.kind}`);
  if (!FINDING_SEVERITY_VALUES.includes(finding.severity)) throw new ScanValidationError(`Unknown finding severity: ${finding.severity}`);
  if (!FINDING_CONFIDENCE_VALUES.includes(finding.confidence)) throw new ScanValidationError(`Unknown finding confidence: ${finding.confidence}`);
  if (!FINDING_STATUS_VALUES.includes(finding.status)) throw new ScanValidationError(`Unknown finding status: ${finding.status}`);
  assertNonEmpty("finding.originScanId", finding.originScanId);
  assertNonEmptyArray("finding.criterionIds", finding.criterionIds);
  assertUnique("finding.criterionIds", finding.criterionIds);
  validateStringArray("finding.affectedNodeIds", finding.affectedNodeIds);
  const sourceRefs = metadata.sourceRefs ?? [];
  if (sourceRefs.length === 0) throw new ScanValidationError(`Finding node ${node.id} must contain source references`);
  sourceRefs.forEach(validateProjectSourceRef);
  if (finding.claims.length === 0) throw new ScanValidationError(`Finding node ${node.id} must contain claims`);
  const indexes = finding.claims.map((claim) => claim.sourceRefIndex);
  assertUnique("finding claim source indexes", indexes);
  for (const claim of finding.claims) {
    if (!Number.isInteger(claim.sourceRefIndex) || claim.sourceRefIndex < 0 || claim.sourceRefIndex >= sourceRefs.length) {
      throw new ScanValidationError(`Finding claim references invalid source index: ${claim.sourceRefIndex}`);
    }
    assertNonEmpty("finding claim", claim.claim);
  }
  if (finding.kind === "conflict" && finding.claims.length < 2) {
    throw new ScanValidationError("Conflict finding must contain at least two source claims");
  }
  assertOptionalNonEmpty("finding.expectedOwner", finding.expectedOwner);
  assertOptionalNonEmpty("finding.recommendedAction", finding.recommendedAction);
  assertOptionalNonEmpty("finding.resolutionEvidence", finding.resolutionEvidence);
  if (finding.status === "resolved" && finding.resolutionEvidence === undefined) {
    throw new ScanValidationError("Resolved finding requires resolution evidence");
  }
}

export function updateFindingNode(node: GraphNode, changes: FindingNodeUpdate): GraphNode {
  validateFindingNode(node);
  if (Object.keys(changes).length === 0) throw new ScanValidationError("Finding update must contain at least one change");
  const current = node.metadata?.finding as FindingMetadata;
  const finding: FindingMetadata = { ...current };
  if (changes.severity !== undefined) finding.severity = changes.severity;
  if (changes.confidence !== undefined) finding.confidence = changes.confidence;
  if (changes.status !== undefined) finding.status = changes.status;
  if (changes.expectedOwner !== undefined) finding.expectedOwner = changes.expectedOwner;
  if (changes.recommendedAction !== undefined) finding.recommendedAction = changes.recommendedAction;
  if (changes.resolutionEvidence !== undefined) finding.resolutionEvidence = changes.resolutionEvidence;
  const updated: GraphNode = {
    ...node,
    notes: changes.notes ?? (node.notes as string),
    metadata: { ...node.metadata, finding },
  };
  validateFindingNode(updated);
  return updated;
}

export function toFindingEvidence(node: GraphNode): FindingEvidence {
  validateFindingNode(node);
  return {
    nodeId: node.id,
    label: node.label,
    notes: node.notes as string,
    sourceRefs: [...(node.metadata?.sourceRefs ?? [])],
    finding: structuredClone(node.metadata?.finding as FindingMetadata),
  };
}

export function validateScanRun(run: ScanRun, profiles: readonly ScanProfile[], graph?: SemanticGraph): void {
  assertNonEmpty("scan.id", run.id);
  assertNonEmpty("scan.profileId", run.profileId);
  if (!Number.isInteger(run.profileVersion) || run.profileVersion < 1) throw new ScanValidationError("scan.profileVersion must be positive");
  const profile = profiles.find((candidate) => candidate.id === run.profileId && candidate.version === run.profileVersion);
  if (profile === undefined) throw new ScanValidationError(`Scan profile not found: ${run.profileId}@${run.profileVersion}`);
  validateRepository(run.repository);
  assertNonEmpty("scan.actor.agentId", run.actor.agentId);
  assertNonEmpty("scan.actor.tool", run.actor.tool);
  assertDate("scan.startedAt", run.startedAt);
  assertUnique("scan.appliedCriteria", run.appliedCriteria);
  assertUnique("scan.declaredOutputs", run.declaredOutputs);
  assertUnique("scan.findingNodeIds", run.findingNodeIds);
  if (run.coverage !== undefined) validateScanCoverage(run.coverage);
  if (run.status === "in_progress") return;
  assertDate("scan.completedAt", run.completedAt);
  assertNonEmpty("scan.graphDigest", run.graphDigest);
  for (const criterion of profile.criteria) {
    if (!run.appliedCriteria.includes(criterion.id)) throw new ScanValidationError(`Scan did not apply required criterion: ${criterion.id}`);
  }
  for (const output of profile.requiredOutputs) {
    if (!run.declaredOutputs.includes(output)) throw new ScanValidationError(`Scan did not declare required output: ${output}`);
  }
  if (run.findingEvidence.length !== run.findingNodeIds.length) throw new ScanValidationError("Completed scan finding evidence count mismatch");
  const evidenceIds = run.findingEvidence.map((evidence) => evidence.nodeId);
  assertUnique("scan finding evidence ids", evidenceIds);
  for (const findingId of run.findingNodeIds) {
    if (!evidenceIds.includes(findingId)) throw new ScanValidationError(`Completed scan is missing finding evidence: ${findingId}`);
  }
  for (const evidence of run.findingEvidence) {
    const node = evidenceToNode(evidence);
    validateFindingNode(node);
    if (evidence.finding.originScanId !== run.id) throw new ScanValidationError(`Finding ${evidence.nodeId} originates in another scan`);
  }
  if (graph !== undefined) {
    for (const findingId of run.findingNodeIds) {
      const node = graph.nodes.find((candidate) => candidate.id === findingId);
      if (node === undefined) throw new ScanValidationError(`Completed scan finding is missing from graph: ${findingId}`);
      validateFindingNode(node);
    }
  }
}

export function validateScanState(profiles: readonly ScanProfile[], runs: readonly ScanRun[], graph: SemanticGraph): void {
  const profileRefs = new Set<string>();
  for (const profile of profiles) {
    validateScanProfile(profile);
    const ref = `${profile.id}@${profile.version}`;
    if (profileRefs.has(ref)) throw new ScanValidationError(`Duplicate scan profile: ${ref}`);
    profileRefs.add(ref);
  }
  const runIds = new Set<string>();
  for (const run of runs) {
    if (runIds.has(run.id)) throw new ScanValidationError(`Duplicate scan run: ${run.id}`);
    runIds.add(run.id);
    validateScanRun(run, profiles, graph);
  }
  for (const node of graph.nodes.filter((candidate) => candidate.type === "finding")) {
    validateFindingNode(node);
    const finding = node.metadata?.finding as FindingMetadata;
    if (!runIds.has(finding.originScanId)) throw new ScanValidationError(`Finding ${node.id} references missing scan: ${finding.originScanId}`);
  }
}

export function compareCompletedScans(before: CompletedScanRun, after: CompletedScanRun): ScanComparison {
  if (before.profileId !== after.profileId) throw new ScanValidationError("Cannot compare scans from different profiles");
  const beforeByFingerprint = evidenceByFingerprint(before.findingEvidence, before.id);
  const afterByFingerprint = evidenceByFingerprint(after.findingEvidence, after.id);
  const failedTargets = new Set(after.coverage.failed.map((entry) => entry.target));
  const fingerprints = [...new Set([...beforeByFingerprint.keys(), ...afterByFingerprint.keys()])].sort();
  const items = fingerprints.map((fingerprint): ScanComparisonItem => {
    const previous = beforeByFingerprint.get(fingerprint);
    const current = afterByFingerprint.get(fingerprint);
    if (previous !== undefined && current === undefined) {
      const unverifiable = previous.sourceRefs.some((sourceRef) => failedTargets.has(sourceRef.target));
      return { fingerprint, status: unverifiable ? "unverifiable" : "resolved", before: previous };
    }
    if (previous === undefined && current !== undefined) return { fingerprint, status: "new", after: current };
    if (previous === undefined || current === undefined) throw new ScanValidationError("Invalid comparison state");
    if (current.finding.status === "unverifiable") return { fingerprint, status: "unverifiable", before: previous, after: current };
    if (current.finding.status === "resolved" || current.finding.status === "accepted") {
      return { fingerprint, status: "resolved", before: previous, after: current };
    }
    if (severityRank(current.finding.severity) > severityRank(previous.finding.severity)) {
      return { fingerprint, status: "regressed", before: previous, after: current };
    }
    const changed = stableFindingContent(previous) !== stableFindingContent(current);
    return { fingerprint, status: changed ? "changed" : "still_open", before: previous, after: current };
  });
  const profileVersionChanged = before.profileVersion !== after.profileVersion;
  const blocking = items.some((item) => {
    if (item.status === "unverifiable") return true;
    if (!["still_open", "regressed", "new"].includes(item.status)) return false;
    const evidence = item.after ?? item.before;
    return evidence !== undefined && ["high", "critical"].includes(evidence.finding.severity);
  });
  return {
    beforeScanId: before.id,
    afterScanId: after.id,
    profileId: before.profileId,
    profileVersionChanged,
    items,
    coverage: {
      added: after.coverage.discovered.filter((target) => !before.coverage.discovered.includes(target)).sort(),
      removed: before.coverage.discovered.filter((target) => !after.coverage.discovered.includes(target)).sort(),
      failed: after.coverage.failed,
    },
    verdict: profileVersionChanged || blocking ? "fail" : "pass",
  };
}

export function evidenceToNode(evidence: FindingEvidence): GraphNode {
  return {
    id: evidence.nodeId,
    label: evidence.label,
    type: "finding",
    notes: evidence.notes,
    metadata: { sourceRefs: evidence.sourceRefs, finding: evidence.finding },
  };
}

function evidenceByFingerprint(evidence: readonly FindingEvidence[], scanId: string): Map<string, FindingEvidence> {
  const result = new Map<string, FindingEvidence>();
  for (const item of evidence) {
    if (result.has(item.finding.fingerprint)) throw new ScanValidationError(`Duplicate finding fingerprint in scan ${scanId}: ${item.finding.fingerprint}`);
    result.set(item.finding.fingerprint, item);
  }
  return result;
}

function stableFindingContent(evidence: FindingEvidence): string {
  return JSON.stringify({
    label: evidence.label,
    notes: evidence.notes,
    sourceRefs: evidence.sourceRefs,
    kind: evidence.finding.kind,
    severity: evidence.finding.severity,
    confidence: evidence.finding.confidence,
    claims: evidence.finding.claims,
    affectedNodeIds: evidence.finding.affectedNodeIds,
    expectedOwner: evidence.finding.expectedOwner,
    recommendedAction: evidence.finding.recommendedAction,
  });
}

function severityRank(severity: FindingSeverity): number {
  return FINDING_SEVERITY_VALUES.indexOf(severity);
}

function validateRepository(repository: ScanRepository): void {
  assertOptionalNonEmpty("repository.repositoryIndexId", repository.repositoryIndexId);
  assertNonEmpty("repository.root", repository.root);
  assertOptionalNonEmpty("repository.repositoryUrl", repository.repositoryUrl);
  assertNonEmpty("repository.branch", repository.branch);
  assertNonEmpty("repository.revision", repository.revision);
  assertOptionalNonEmpty("repository.worktreeDigest", repository.worktreeDigest);
}

function validateCoverageExceptions(label: string, entries: readonly ScanCoverageException[], discovered: ReadonlySet<string>): void {
  assertUnique(label, entries.map((entry) => entry.target));
  for (const entry of entries) {
    assertNonEmpty(`${label}.target`, entry.target);
    assertNonEmpty(`${label}.reason`, entry.reason);
    if (!discovered.has(entry.target)) throw new ScanValidationError(`${label} source was not discovered: ${entry.target}`);
  }
}

function assertNonEmptyArray(label: string, values: readonly string[]): void {
  if (values.length === 0) throw new ScanValidationError(`${label} must contain at least one value`);
  validateStringArray(label, values);
}

function validateOptionalPatternList(label: string, values: readonly string[] | undefined): void {
  if (values !== undefined) {
    validateStringArray(label, values);
  }
}

function validateStringArray(label: string, values: readonly string[]): void {
  for (const value of values) assertNonEmpty(label, value);
  assertUnique(label, values);
}

function uniqueStable(values: readonly string[]): string[] {
  return [...new Set(values)];
}

function assertUnique(label: string, values: readonly unknown[]): void {
  if (new Set(values).size !== values.length) throw new ScanValidationError(`${label} must not contain duplicates`);
}

function assertNonEmpty(label: string, value: string): void {
  if (value.trim().length === 0) throw new ScanValidationError(`${label} must be non-empty`);
}

function assertOptionalNonEmpty(label: string, value: string | undefined): void {
  if (value !== undefined) assertNonEmpty(label, value);
}

function assertDate(label: string, value: string): void {
  assertNonEmpty(label, value);
  if (Number.isNaN(Date.parse(value))) throw new ScanValidationError(`${label} must be a valid date`);
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
