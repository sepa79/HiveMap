import { describe, expect, it } from "vitest";

import type { ProjectSourceRef } from "@hivemap/graph-core";

import {
  validateBoundaryMap,
  CODE_QUALITY_PROFILE,
  DOCUMENTATION_CONFLICTS_PROFILE,
  ScanValidationError,
  applyScanProfileOverlay,
  compareCompletedScans,
  createBoundaryMapBuildConfig,
  createFindingNode,
  toFindingEvidence,
  updateFindingNode,
  validateScanRun,
  validateFindingNode,
  validateScanCoverage,
  validateScanProfile,
  type CompletedScanRun,
} from "./index.js";

const sourceA: ProjectSourceRef = { role: "defines", source: "repo-doc", target: "docs/a.md", anchor: "Owner", revision: "a1" };
const sourceB: ProjectSourceRef = { role: "implements", source: "code", target: "src/a.ts", anchor: "owner", revision: "b1" };

describe("repository scans", () => {
  it("validates the built-in documentation profile", () => {
    expect(() => validateScanProfile(DOCUMENTATION_CONFLICTS_PROFILE)).not.toThrow();
  });

  it("validates the built-in code quality profile and technical finding kinds", () => {
    expect(() => validateScanProfile(CODE_QUALITY_PROFILE)).not.toThrow();

    for (const kind of ["architecture-risk", "runtime-risk", "authority-gap", "test-gap", "deployment-risk"] as const) {
      const node = createFindingNode("scan-a", {
        id: `finding-${kind}`,
        label: `Technical ${kind}`,
        notes: `The scan found a ${kind}.`,
        fingerprint: `technical-${kind}`,
        kind,
        severity: "high",
        confidence: "high",
        criterionIds: ["contract-drift"],
        sources: [{ sourceRef: sourceB, claim: `The implementation exposes a ${kind}.` }],
        affectedNodeIds: [],
      });

      expect(() => validateFindingNode(node)).not.toThrow();
    }
  });

  it("requires complete, non-overlapping coverage", () => {
    expect(() =>
      validateScanCoverage({
        discovered: ["docs/a.md", "docs/b.md"],
        included: ["docs/a.md"],
        excluded: [{ target: "docs/b.md", reason: "Archived" }],
        failed: [],
      }),
    ).not.toThrow();
    expect(() =>
      validateScanCoverage({ discovered: ["docs/a.md"], included: ["docs/a.md"], excluded: [], failed: [{ target: "docs/a.md", reason: "Unreadable" }] }),
    ).toThrow(ScanValidationError);
  });

  it("creates and validates conflict finding nodes", () => {
    const node = createFindingNode("scan-a", {
      id: "finding-a",
      label: "Conflicting owner",
      notes: "The architecture and implementation disagree about ownership.",
      fingerprint: "owner-conflict",
      kind: "conflict",
      severity: "high",
      confidence: "high",
      criterionIds: ["contradictory-claims"],
      sources: [
        { sourceRef: sourceA, claim: "Module A owns the concern." },
        { sourceRef: sourceB, claim: "Module B owns the concern." },
      ],
      affectedNodeIds: [],
      expectedOwner: "docs/a.md#Owner",
      recommendedAction: "Align implementation documentation with the owning contract.",
    });

    expect(node.type).toBe("finding");
    expect(() => validateFindingNode(node)).not.toThrow();
    expect(toFindingEvidence(node).finding.fingerprint).toBe("owner-conflict");
  });

  it("validates a typed boundary-map artifact", () => {
    expect(() =>
      validateBoundaryMap({
        boundaries: [
          {
            id: "boundary-runtime",
            label: "Runtime",
            kind: "module",
            ownedPaths: ["packages/runtime/**"],
            ownedSymbolKeys: ["runtime:HiveMapRuntime"],
            publicEntrypoints: [
              {
                id: "runtime-api",
                label: "HiveMapRuntime API",
                kind: "export",
                symbolKey: "runtime:HiveMapRuntime",
              },
            ],
            contractSourceRefs: [{ role: "defines", source: "repo-doc", target: "docs/architecture.md", anchor: "Main Components" }],
            testSourceRefs: [{ role: "verifies", source: "test", target: "packages/runtime/src/index.test.ts" }],
            confidence: "high",
            openQuestions: ["Should runtime expose a narrower public surface?"],
          },
        ],
        relations: [
          {
            id: "runtime-depends-on-storage",
            fromBoundaryId: "boundary-runtime",
            toBoundaryId: "boundary-runtime",
            kind: "depends-on",
            sourceRefs: [{ role: "depends-on", source: "code", target: "packages/runtime/src/index.ts", anchor: "constructor" }],
          },
        ],
      }),
    ).not.toThrow();
  });

  it("builds boundary-map config from replaceable overlay fields", () => {
    const config = createBoundaryMapBuildConfig({
      formatVersion: 1,
      profileId: CODE_QUALITY_PROFILE.id,
      boundaryMapRoots: ["services:service", "shared:library"],
      boundaryMapContractPathMarkers: ["/contracts/"],
      boundaryMapContractFileStems: ["Runtime-Policy"],
      boundaryMapIgnoredTokens: ["Docs", "Generated"],
      boundaryMapTestDirectoryNames: ["Qa", "Specs"],
      boundaryMapRoutePathMarkers: ["/endpoints/"],
      boundaryMapRouteNameSuffixes: ["Flow"],
      boundaryMapApiPathMarkers: ["/rpc/"],
      boundaryMapApiNameSuffixes: ["Policy"],
    });

    expect(config).toEqual({
      roots: [
        { pathPrefix: "services", kind: "service" },
        { pathPrefix: "shared", kind: "library" },
      ],
      contractPathMarkers: ["/contracts/"],
      contractFileStems: ["runtime-policy"],
      ignoredDocTokens: ["docs", "generated"],
      testDirectoryNames: ["qa", "specs"],
      routePathMarkers: ["/endpoints/"],
      routeNameSuffixes: ["flow"],
      apiPathMarkers: ["/rpc/"],
      apiNameSuffixes: ["policy"],
    });
  });

  it("replaces repository-specific profile sections through the overlay", () => {
    const profile = applyScanProfileOverlay(CODE_QUALITY_PROFILE, {
      formatVersion: 1,
      profileId: CODE_QUALITY_PROFILE.id,
      name: "Services code review",
      description: "Repository-specific service review.",
      instructions: ["Review services first."],
      sourceTypes: ["code", "test"],
      criteria: [{ id: "service-contract-drift", description: "Service behavior differs from the contract." }],
      duplicateResponsibilityTopLevelSymbolKinds: ["class", "type-alias"],
      duplicateResponsibilityIgnorePathGlobs: ["**/fixtures/**"],
      ssotOrder: ["AGENTS.md", "services/**"],
      requiredOutputs: ["findings", "boundary-map"],
    });

    expect(profile).toMatchObject({
      name: "Services code review",
      description: "Repository-specific service review.",
      instructions: ["Review services first."],
      sourceTypes: ["code", "test"],
      criteria: [{ id: "service-contract-drift", description: "Service behavior differs from the contract." }],
      duplicateResponsibilityTopLevelSymbolKinds: ["class", "type-alias"],
      duplicateResponsibilityIgnorePathGlobs: ["**/fixtures/**"],
      ssotOrder: ["AGENTS.md", "services/**"],
      requiredOutputs: ["findings", "boundary-map"],
    });
  });

  it("replaces documentation evidence recipes through the overlay", () => {
    const profile = applyScanProfileOverlay(DOCUMENTATION_CONFLICTS_PROFILE, {
      formatVersion: 1,
      profileId: DOCUMENTATION_CONFLICTS_PROFILE.id,
      duplicateAuthorityClaimPatterns: ["source of truth"],
      duplicateAuthorityIgnoredTopicTokens: ["source", "truth"],
      duplicateAuthorityGenericTopicTokens: ["runtime"],
      missingOwnerMaterialPaths: ["docs/index.md"],
      missingOwnerMaterialFileNames: ["readme.md"],
      missingOwnerIgnoredPathMarkers: ["docs/history/"],
      missingOwnerPathKeywords: ["design"],
      missingOwnerTextKeywords: ["incident"],
      staleDocumentationMaterialFileNames: ["readme.md"],
      staleDocumentationIgnoredPathMarkers: ["archive"],
      staleDocumentationPathKeywords: ["guide"],
      staleDocumentationTextKeywords: ["supported"],
      staleDocumentationNonCurrentPathMarkers: ["legacy"],
      staleDocumentationNonCurrentTextMarkers: ["superseded by"],
    });

    expect(profile).toMatchObject({
      duplicateAuthorityClaimPatterns: ["source of truth"],
      duplicateAuthorityIgnoredTopicTokens: ["source", "truth"],
      duplicateAuthorityGenericTopicTokens: ["runtime"],
      missingOwnerMaterialPaths: ["docs/index.md"],
      missingOwnerMaterialFileNames: ["readme.md"],
      missingOwnerIgnoredPathMarkers: ["docs/history/"],
      missingOwnerPathKeywords: ["design"],
      missingOwnerTextKeywords: ["incident"],
      staleDocumentationMaterialFileNames: ["readme.md"],
      staleDocumentationIgnoredPathMarkers: ["archive"],
      staleDocumentationPathKeywords: ["guide"],
      staleDocumentationTextKeywords: ["supported"],
      staleDocumentationNonCurrentPathMarkers: ["legacy"],
      staleDocumentationNonCurrentTextMarkers: ["superseded by"],
    });
  });

  it("requires explicit documentation evidence recipes when the related criteria are active", () => {
    const {
      duplicateAuthorityClaimPatterns: _omittedDuplicateAuthorityClaimPatterns,
      ...profileWithoutDuplicateAuthorityClaimPatterns
    } = DOCUMENTATION_CONFLICTS_PROFILE;
    expect(() =>
      validateScanProfile(profileWithoutDuplicateAuthorityClaimPatterns),
    ).toThrow("duplicateAuthorityClaimPatterns");

    const {
      missingOwnerMaterialPaths: _omittedMissingOwnerMaterialPaths,
      ...profileWithoutMissingOwnerMaterialPaths
    } = DOCUMENTATION_CONFLICTS_PROFILE;
    expect(() =>
      validateScanProfile(profileWithoutMissingOwnerMaterialPaths),
    ).toThrow("missingOwnerMaterialPaths");

    const {
      staleDocumentationNonCurrentTextMarkers: _omittedStaleDocumentationNonCurrentTextMarkers,
      ...profileWithoutStaleDocumentationNonCurrentTextMarkers
    } = DOCUMENTATION_CONFLICTS_PROFILE;
    expect(() =>
      validateScanProfile(profileWithoutStaleDocumentationNonCurrentTextMarkers),
    ).toThrow("staleDocumentationNonCurrentTextMarkers");
  });

  it("requires an explicit duplicate-responsibility recipe when that criterion is active", () => {
    const {
      duplicateResponsibilityTopLevelSymbolKinds: _omittedTopLevelKinds,
      ...profileWithoutTopLevelKinds
    } = CODE_QUALITY_PROFILE;
    expect(() =>
      validateScanProfile(profileWithoutTopLevelKinds),
    ).toThrow("duplicateResponsibilityTopLevelSymbolKinds");

    const {
      duplicateResponsibilityIgnorePathGlobs: _omittedIgnoreGlobs,
      ...profileWithoutIgnoreGlobs
    } = CODE_QUALITY_PROFILE;
    expect(() =>
      validateScanProfile(profileWithoutIgnoreGlobs),
    ).toThrow("duplicateResponsibilityIgnorePathGlobs");
  });

  it("rejects overlays that produce an invalid effective profile", () => {
    expect(() =>
      applyScanProfileOverlay(CODE_QUALITY_PROFILE, {
        formatVersion: 1,
        profileId: CODE_QUALITY_PROFILE.id,
        instructions: [],
      }),
    ).toThrow("profile.instructions");

    expect(() =>
      applyScanProfileOverlay(CODE_QUALITY_PROFILE, {
        formatVersion: 1,
        profileId: CODE_QUALITY_PROFILE.id,
        sourceTypes: [],
      }),
    ).toThrow("profile.sourceTypes");

    expect(() =>
      applyScanProfileOverlay(CODE_QUALITY_PROFILE, {
        formatVersion: 1,
        profileId: CODE_QUALITY_PROFILE.id,
        ssotOrder: [],
      }),
    ).toThrow("profile.ssotOrder");
  });

  it("rejects semantically invalid boundary-map evidence", () => {
    expect(() =>
      validateBoundaryMap({
        boundaries: [
          {
            id: "boundary-runtime",
            label: "Runtime",
            kind: "module",
            ownedPaths: ["packages/runtime/src/index.ts"],
            ownedSymbolKeys: ["runtime:index"],
            publicEntrypoints: [],
            contractSourceRefs: [{ role: "defines", source: "repo-doc", target: "docs/architecture.md" }],
            testSourceRefs: [{ role: "implements", source: "code", target: "packages/runtime/src/index.test.ts" }],
            confidence: "medium",
          },
        ],
        relations: [],
      }),
    ).toThrow("testSourceRefs");

    expect(() =>
      validateBoundaryMap({
        boundaries: [
          {
            id: "boundary-runtime",
            label: "Runtime",
            kind: "module",
            ownedPaths: ["packages/runtime/src/index.ts"],
            ownedSymbolKeys: ["runtime:index"],
            publicEntrypoints: [],
            contractSourceRefs: [{ role: "defines", source: "repo-doc", target: "docs/architecture.md" }],
            testSourceRefs: [{ role: "verifies", source: "test", target: "packages/runtime/src/index.test.ts" }],
            confidence: "medium",
          },
          {
            id: "boundary-shared",
            label: "Shared",
            kind: "module",
            ownedPaths: ["packages/shared/src/index.ts"],
            ownedSymbolKeys: ["shared:index"],
            publicEntrypoints: [],
            contractSourceRefs: [{ role: "defines", source: "repo-doc", target: "docs/shared.md" }],
            testSourceRefs: [{ role: "verifies", source: "test", target: "packages/shared/src/index.test.ts" }],
            confidence: "medium",
          },
        ],
        relations: [
          {
            id: "runtime-depends-on-shared",
            fromBoundaryId: "boundary-runtime",
            toBoundaryId: "boundary-shared",
            kind: "depends-on",
            sourceRefs: [{ role: "implements", source: "code", target: "packages/runtime/src/index.ts" }],
          },
        ],
      }),
    ).toThrow("depends-on");
  });

  it("rejects resolved findings without evidence", () => {
    expect(() =>
      createFindingNode("scan-a", {
        id: "finding-a",
        label: "Missing evidence",
        notes: "Cannot be resolved without proof.",
        fingerprint: "missing-evidence",
        kind: "stale",
        severity: "normal",
        confidence: "medium",
        status: "resolved",
        criterionIds: ["stale-documentation"],
        sources: [{ sourceRef: sourceA, claim: "The section is stale." }],
        affectedNodeIds: [],
      }),
    ).toThrow("Resolved finding requires resolution evidence");
  });

  it("updates active findings but requires evidence for resolution", () => {
    const node = createFindingNode("scan-a", {
      id: "finding-a",
      label: "Stale owner",
      notes: "The owner is stale.",
      fingerprint: "stale-owner",
      kind: "stale",
      severity: "normal",
      confidence: "medium",
      criterionIds: ["stale-documentation"],
      sources: [{ sourceRef: sourceA, claim: "The owner is stale." }],
      affectedNodeIds: [],
    });

    expect(() => updateFindingNode(node, { status: "resolved" })).toThrow("resolution evidence");
    expect(
      (updateFindingNode(node, { status: "resolved", resolutionEvidence: "Verified by scan-after." }).metadata?.finding as { status: string }).status,
    ).toBe("resolved");
  });

  it("compares completed scans by stable finding fingerprint", () => {
    const beforeFinding = createFindingNode("scan-before", {
      id: "finding-before",
      label: "Conflicting owner",
      notes: "Ownership conflicts.",
      fingerprint: "owner-conflict",
      kind: "conflict",
      severity: "high",
      confidence: "high",
      criterionIds: ["contradictory-claims"],
      sources: [{ sourceRef: sourceA, claim: "A owns it." }, { sourceRef: sourceB, claim: "B owns it." }],
      affectedNodeIds: [],
    });
    const before = completedRun("scan-before", [toFindingEvidence(beforeFinding)], ["docs/a.md", "src/a.ts"]);
    const after = completedRun("scan-after", [], ["docs/a.md", "src/a.ts"]);

    const comparison = compareCompletedScans(before, after);

    expect(comparison.items).toEqual([
      expect.objectContaining({ fingerprint: "owner-conflict", status: "resolved" }),
    ]);
    expect(comparison.verdict).toBe("pass");
  });

  it("does not claim resolution when a source failed in the second scan", () => {
    const finding = createFindingNode("scan-before", {
      id: "finding-before",
      label: "Stale owner",
      notes: "The owner is stale.",
      fingerprint: "stale-owner",
      kind: "stale",
      severity: "high",
      confidence: "high",
      criterionIds: ["stale-documentation"],
      sources: [{ sourceRef: sourceA, claim: "The owner is stale." }],
      affectedNodeIds: [],
    });
    const before = completedRun("scan-before", [toFindingEvidence(finding)], ["docs/a.md"]);
    const after = completedRun("scan-after", [], ["docs/a.md"]);
    after.coverage.included = [];
    after.coverage.failed = [{ target: "docs/a.md", reason: "Unreadable" }];

    const comparison = compareCompletedScans(before, after);

    expect(comparison.items[0]?.status).toBe("unverifiable");
    expect(comparison.verdict).toBe("fail");
  });

  it("requires boundary-map evidence when a completed scan declares the output", () => {
    const run = completedRun("scan-boundary", [], ["src/a.ts"]);
    run.declaredOutputs = [...run.declaredOutputs, "boundary-map"];

    expect(() => validateScanRun(run, [DOCUMENTATION_CONFLICTS_PROFILE])).toThrow("boundary-map");
  });
});

function completedRun(id: string, findingEvidence: CompletedScanRun["findingEvidence"], discovered: string[]): CompletedScanRun {
  return {
    id,
    profileId: DOCUMENTATION_CONFLICTS_PROFILE.id,
    profileVersion: DOCUMENTATION_CONFLICTS_PROFILE.version,
    repository: { root: "/repo", branch: "main", revision: id },
    actor: { agentId: "agent-a", tool: "codex" },
    startedAt: "2026-07-17T10:00:00.000Z",
    status: "completed",
    coverage: { discovered, included: [...discovered], excluded: [], failed: [] },
    appliedCriteria: DOCUMENTATION_CONFLICTS_PROFILE.criteria.map((criterion) => criterion.id),
    declaredOutputs: [...DOCUMENTATION_CONFLICTS_PROFILE.requiredOutputs],
    findingNodeIds: findingEvidence.map((evidence) => evidence.nodeId),
    calibrationDecisions: [],
    completedAt: "2026-07-17T10:01:00.000Z",
    graphDigest: id,
    findingEvidence,
  };
}
