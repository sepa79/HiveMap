import { describe, expect, it } from "vitest";

import { INITIAL_CATEGORY_CATALOG } from "@hivemap/categories";

import {
  ApiContractValidationError,
  validateApplyGraphCommandsRequest,
  validateApplyProposalRequest,
  validateApproveProposalRequest,
  validateAssignCategoryRequest,
  validateBackfillConceptEmbeddingsRequest,
  validateBuildScanBoundaryMapRequest,
  validateCompleteScanRequest,
  validateCreateProposalRequest,
  validateGetRepositoryIndexRequest,
  validateCreateWorkspaceRequest,
  validateExecuteRepositoryIndexRequest,
  validateGetScanProfileOverlayHelpRequest,
  validateListRepositoryEvidenceCandidatesRequest,
  validateGetWorkspaceSummaryRequest,
  validateGetProjectionRequest,
  validateExportWorkspaceBundleRequest,
  validateImportWorkspaceBundleRequest,
  validateListRepositoryIndexesRequest,
  validateListWorkspaceSummariesRequest,
  validateRecordFeedbackRequest,
  validateRecordScanCalibrationDecisionRequest,
  validateRefreshConceptEmbeddingRequest,
  validateResolveWorkspaceRequest,
  validateSearchRepositoryIndexRequest,
  validateStartRepositoryIndexRequest,
  type McpToolName,
  type McpToolRequestMap,
} from "./index.js";

describe("api contracts", () => {
  it("validates workspace creation requests", () => {
    expect(() =>
      validateCreateWorkspaceRequest({
        workspace: {
          id: "workspace-a",
          slug: "alpha",
          name: "Alpha",
          archived: false,
          createdAt: "2026-05-13T21:00:00.000Z",
          updatedAt: "2026-05-13T22:00:00.000Z",
        },
      }),
    ).not.toThrow();
  });

  it("validates workspace discovery requests", () => {
    expect(() => validateListWorkspaceSummariesRequest({ query: "alpha", limit: 10, includeArchived: true })).not.toThrow();
    expect(() => validateGetWorkspaceSummaryRequest({ workspaceId: "workspace-a" })).not.toThrow();
    expect(() => validateResolveWorkspaceRequest({ ref: "alpha" })).not.toThrow();
    expect(() => validateListWorkspaceSummariesRequest({ limit: 0 })).toThrow("limit must be a positive integer");
  });

  it("rejects missing workspace ids for graph commands", () => {
    expect(() =>
      validateApplyGraphCommandsRequest({
        workspaceId: " ",
        commands: [
          {
            id: "cmd-a",
            type: "node.create",
            payload: { node: { id: "node-a", label: "Alpha", type: "concept" } },
          },
        ],
      }),
    ).toThrow(ApiContractValidationError);
  });

  it("validates repository index requests", () => {
    expect(() => validateListRepositoryIndexesRequest({ workspaceId: "workspace-a" })).not.toThrow();
    expect(() => validateGetRepositoryIndexRequest({ workspaceId: "workspace-a", indexId: "repo-index-a" })).not.toThrow();
    expect(() =>
      validateStartRepositoryIndexRequest({
        workspaceId: "workspace-a",
        index: {
          id: "repo-index-a",
          repositoryUrl: "https://example.com/org/repo.git",
          requestedRef: "main",
          mode: "safe",
          requestedAt: "2026-08-20T12:00:00.000Z",
          actor: {
            agentId: "codex",
            tool: "mcp",
          },
        },
      }),
    ).not.toThrow();
    expect(() =>
      validateStartRepositoryIndexRequest({
        workspaceId: "workspace-a",
        index: {
          id: "repo-index-a",
          repositoryUrl: " ",
          mode: "safe",
          requestedAt: "2026-08-20T12:00:00.000Z",
          actor: {
            agentId: "codex",
            tool: "mcp",
          },
        },
      }),
    ).toThrow("index.repositoryUrl must be non-empty");
    expect(() => validateExecuteRepositoryIndexRequest({ workspaceId: "workspace-a", indexId: "repo-index-a" })).not.toThrow();
    expect(() =>
      validateSearchRepositoryIndexRequest({
        workspaceId: "workspace-a",
        indexId: "repo-index-a",
        query: "ownership docs",
        limit: 5,
      }),
    ).not.toThrow();
    expect(() =>
      validateListRepositoryEvidenceCandidatesRequest({
        workspaceId: "workspace-a",
        indexId: "repo-index-a",
        profileId: "documentation-conflicts",
        profileVersion: 1,
        criterionId: "broken-references",
        limit: 5,
      }),
    ).not.toThrow();
    expect(() =>
      validateGetScanProfileOverlayHelpRequest({
        workspaceId: "workspace-a",
        profileId: "code-quality-review",
        profileVersion: 1,
      }),
    ).not.toThrow();
    expect(() => validateBuildScanBoundaryMapRequest({ workspaceId: "workspace-a", scanId: "scan-a" })).not.toThrow();
  });

  it("rejects semantically invalid boundary-map payloads on scan completion", () => {
    expect(() =>
      validateCompleteScanRequest({
        workspaceId: "workspace-a",
        scanId: "scan-a",
        completedAt: "2026-08-24T12:00:00.000Z",
        appliedCriteria: ["contract-drift"],
        declaredOutputs: ["findings", "boundary-map"],
        boundaryMap: {
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
        },
      }),
    ).toThrow("depends-on");
  });

  it("rejects an empty calibration override reason on scan completion", () => {
    expect(() =>
      validateCompleteScanRequest({
        workspaceId: "workspace-a",
        scanId: "scan-a",
        completedAt: "2026-08-24T12:00:00.000Z",
        appliedCriteria: ["contract-drift"],
        declaredOutputs: ["findings"],
        calibrationOverrideReason: "  ",
      }),
    ).toThrow("calibrationOverrideReason");
  });

  it("validates explicit calibration decisions for in-progress scans", () => {
    expect(() =>
      validateRecordScanCalibrationDecisionRequest({
        workspaceId: "workspace-a",
        scanId: "scan-a",
        decision: "build-boundary-map",
        rationale: "The provisional pass needs a structural check before findings.",
        recordedAt: "2026-08-25T10:00:00.000Z",
      }),
    ).not.toThrow();
    expect(() =>
      validateRecordScanCalibrationDecisionRequest({
        workspaceId: "workspace-a",
        scanId: "scan-a",
        decision: "bad-decision" as "continue",
        rationale: "nope",
        recordedAt: "2026-08-25T10:00:00.000Z",
      }),
    ).toThrow("Unknown scan calibration decision");
  });

  it("rejects empty graph command batches", () => {
    expect(() => validateApplyGraphCommandsRequest({ workspaceId: "workspace-a", commands: [] })).toThrow(
      ApiContractValidationError,
    );
  });

  it("validates category assignment through category contract", () => {
    expect(() =>
      validateAssignCategoryRequest(
        {
          workspaceId: "workspace-a",
          assignment: {
            id: "assignment-a",
            targetType: "node",
            targetId: "node-a",
            categoryId: "confirmed",
            status: "active",
            provenance: "human",
          },
        },
        INITIAL_CATEGORY_CATALOG,
        { nodeIds: ["node-a"], edgeIds: [], projectionIds: [] },
      ),
    ).not.toThrow();
  });

  it("rejects projection lookup without projection id", () => {
    expect(() => validateGetProjectionRequest({ workspaceId: "workspace-a", projectionId: "" })).toThrow(
      ApiContractValidationError,
    );
  });

  it("validates feedback through capture contract", () => {
    expect(() =>
      validateRecordFeedbackRequest({
        workspaceId: "workspace-a",
        feedbackEvent: {
          id: "feedback-a",
          createdAt: "2026-05-13T21:00:00.000Z",
          type: "map_comment",
          payload: { text: "Needs grouping" },
        },
      }),
    ).not.toThrow();
  });

  it("validates proposal creation through capture contract", () => {
    expect(() =>
      validateCreateProposalRequest({
        workspaceId: "workspace-a",
        proposal: {
          id: "proposal-a",
          createdAt: "2026-05-13T21:00:00.000Z",
          sourceFeedbackIds: [],
          graphCommands: [
            {
              id: "cmd-a",
              type: "node.create",
              payload: { node: { id: "node-a", label: "Alpha", type: "concept" } },
            },
          ],
          explanation: "Capture Alpha.",
          status: "pending",
        },
      }),
    ).not.toThrow();
  });

  it("rejects proposal apply without proposal id", () => {
    expect(() => validateApplyProposalRequest({ workspaceId: "workspace-a", proposalId: "" })).toThrow(
      ApiContractValidationError,
    );
  });

  it("rejects proposal approve without proposal id", () => {
    expect(() => validateApproveProposalRequest({ workspaceId: "workspace-a", proposalId: "" })).toThrow(
      ApiContractValidationError,
    );
  });

  it("validates browser ZIP bundle boundaries", () => {
    expect(() =>
      validateExportWorkspaceBundleRequest({
        workspaceId: "workspace-a",
        exportedAt: "2026-07-17T12:00:00.000Z",
      }),
    ).not.toThrow();
    expect(() => validateImportWorkspaceBundleRequest({ bytes: new Uint8Array(), mode: "new" })).toThrow(
      "bytes must contain a ZIP bundle",
    );
  });

  it("validates provider-backed embedding refresh and backfill requests", () => {
    expect(() =>
      validateRefreshConceptEmbeddingRequest({
        workspaceId: "workspace-a",
        nodeId: "node-a",
        model: "ollama:nomic-embed-text",
      }),
    ).not.toThrow();
    expect(() =>
      validateBackfillConceptEmbeddingsRequest({
        workspaceId: "workspace-a",
        model: "ollama:nomic-embed-text",
        nodeIds: ["node-a"],
        limit: 10,
        force: true,
      }),
    ).not.toThrow();
    expect(() =>
      validateBackfillConceptEmbeddingsRequest({
        workspaceId: "workspace-a",
        model: "ollama:nomic-embed-text",
        nodeIds: [],
      }),
    ).toThrow("nodeIds must contain at least one node id");
  });

  it("keeps MCP tool request map tied to explicit tool names", () => {
    const toolName: McpToolName = "graph_command";
    const request: McpToolRequestMap[typeof toolName] = {
      workspaceId: "workspace-a",
      commands: [
        {
          id: "cmd-a",
          type: "node.create",
          payload: { node: { id: "node-a", label: "Alpha", type: "concept" } },
        },
      ],
    };

    expect(request.workspaceId).toBe("workspace-a");
  });
});
