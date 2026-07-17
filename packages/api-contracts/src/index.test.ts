import { describe, expect, it } from "vitest";

import { INITIAL_CATEGORY_CATALOG } from "@hivemap/categories";

import {
  ApiContractValidationError,
  validateApplyGraphCommandsRequest,
  validateApplyProposalRequest,
  validateApproveProposalRequest,
  validateAssignCategoryRequest,
  validateCreateProposalRequest,
  validateCreateSnapshotRequest,
  validateCreateWorkspaceRequest,
  validateGetProjectionRequest,
  validateExportWorkspaceBundleRequest,
  validateImportWorkspaceBundleRequest,
  validateRecordFeedbackRequest,
  type McpToolName,
  type McpToolRequestMap,
} from "./index.js";

describe("api contracts", () => {
  it("validates workspace creation requests", () => {
    expect(() =>
      validateCreateWorkspaceRequest({
        workspace: {
          id: "workspace-a",
          name: "Alpha",
          createdAt: "2026-05-13T21:00:00.000Z",
        },
      }),
    ).not.toThrow();
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

  it("validates snapshot creation requests", () => {
    expect(() =>
      validateCreateSnapshotRequest({
        workspaceId: "workspace-a",
        snapshot: {
          id: "snapshot-a",
          createdAt: "2026-05-13T21:00:00.000Z",
          projectionId: "projection-a",
        },
      }),
    ).not.toThrow();
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
