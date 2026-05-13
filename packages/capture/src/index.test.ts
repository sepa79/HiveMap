import { describe, expect, it } from "vitest";

import {
  CaptureValidationError,
  DEFAULT_CAPTURE_POLICY,
  approvePendingProposal,
  applyApprovedProposal,
  decideCapturePolicy,
  rejectPendingProposal,
  validateCapturePolicy,
  validateFeedbackEvent,
  validateFeedbackEvents,
  validateGraphProposal,
  type GraphProposal,
} from "./index.js";

const command = {
  id: "cmd-a",
  type: "node.create",
  payload: { node: { id: "node-a", label: "Alpha", type: "concept" } },
} as const;

const proposal: GraphProposal = {
  id: "proposal-a",
  createdAt: "2026-05-13T21:00:00.000Z",
  sourceFeedbackIds: ["feedback-a"],
  graphCommands: [command],
  explanation: "Capture the concept explicitly.",
  status: "pending",
};

describe("capture policy", () => {
  it("defaults to delegated capture", () => {
    expect(DEFAULT_CAPTURE_POLICY).toEqual({
      id: "default-delegated",
      mode: "delegated",
    });
  });

  it("validates known policy modes", () => {
    expect(() => validateCapturePolicy({ id: "policy-a", mode: "approved" })).not.toThrow();
    expect(() => validateCapturePolicy({ id: "policy-a", mode: "delegated" })).not.toThrow();
    expect(() => validateCapturePolicy({ id: "policy-a", mode: "proposed" })).not.toThrow();
  });

  it("requires custom policies to include explicit rules", () => {
    expect(() => validateCapturePolicy({ id: "policy-a", mode: "custom" })).toThrow(CaptureValidationError);
  });

  it("rejects unknown policy modes", () => {
    expect(() => validateCapturePolicy({ id: "policy-a", mode: "automatic" } as never)).toThrow(
      CaptureValidationError,
    );
  });

  it("chooses direct apply for delegated policy", () => {
    const decision = decideCapturePolicy(DEFAULT_CAPTURE_POLICY, [command], () => proposal);

    expect(decision).toEqual({ kind: "apply", commands: [command] });
  });

  it("chooses proposal for approved policy", () => {
    const decision = decideCapturePolicy({ id: "policy-a", mode: "approved" }, [command], () => proposal);

    expect(decision).toEqual({ kind: "proposal", proposal });
  });

  it("chooses proposal for proposed policy", () => {
    const decision = decideCapturePolicy({ id: "policy-a", mode: "proposed" }, [command], () => proposal);

    expect(decision.kind).toBe("proposal");
  });

  it("rejects empty command batches", () => {
    expect(() => decideCapturePolicy(DEFAULT_CAPTURE_POLICY, [], () => proposal)).toThrow(CaptureValidationError);
  });
});

describe("feedback events", () => {
  it("validates feedback events without mutating graph semantics", () => {
    expect(() =>
      validateFeedbackEvent({
        id: "feedback-a",
        createdAt: "2026-05-13T21:00:00.000Z",
        type: "node_marked",
        payload: { nodeId: "node-a", mark: "unclear" },
        projectionId: "projection-a",
      }),
    ).not.toThrow();
  });

  it("rejects unknown feedback event types", () => {
    expect(() =>
      validateFeedbackEvent({
        id: "feedback-a",
        createdAt: "2026-05-13T21:00:00.000Z",
        type: "graph_mutated",
        payload: {},
      } as never),
    ).toThrow(CaptureValidationError);
  });

  it("rejects non-object payloads", () => {
    expect(() =>
      validateFeedbackEvent({
        id: "feedback-a",
        createdAt: "2026-05-13T21:00:00.000Z",
        type: "map_comment",
        payload: "comment" as never,
      }),
    ).toThrow(CaptureValidationError);
  });

  it("rejects duplicate feedback event ids", () => {
    expect(() =>
      validateFeedbackEvents([
        {
          id: "feedback-a",
          createdAt: "2026-05-13T21:00:00.000Z",
          type: "map_comment",
          payload: {},
        },
        {
          id: "feedback-a",
          createdAt: "2026-05-13T21:00:01.000Z",
          type: "proposal_requested",
          payload: {},
        },
      ]),
    ).toThrow(CaptureValidationError);
  });
});

describe("graph proposals", () => {
  it("validates proposal shape", () => {
    expect(() => validateGraphProposal(proposal)).not.toThrow();
  });

  it("rejects proposals without commands", () => {
    expect(() => validateGraphProposal({ ...proposal, graphCommands: [] })).toThrow(CaptureValidationError);
  });

  it("rejects proposals without explanation", () => {
    expect(() => validateGraphProposal({ ...proposal, explanation: " " })).toThrow(CaptureValidationError);
  });

  it("applies only approved proposals through graph-core commands", () => {
    const result = applyApprovedProposal({ nodes: [], edges: [] }, { ...proposal, status: "approved" });

    expect(result.graph.nodes).toEqual([{ id: "node-a", label: "Alpha", type: "concept" }]);
    expect(result.proposal.status).toBe("applied");
  });

  it("approves pending proposals before application", () => {
    expect(approvePendingProposal(proposal)).toEqual({ ...proposal, status: "approved" });
  });

  it("rejects approving already applied proposals", () => {
    expect(() => approvePendingProposal({ ...proposal, status: "applied" })).toThrow(CaptureValidationError);
  });

  it("rejects applying pending proposals", () => {
    expect(() => applyApprovedProposal({ nodes: [], edges: [] }, proposal)).toThrow(CaptureValidationError);
  });

  it("rejects pending proposals without graph mutation", () => {
    expect(rejectPendingProposal(proposal)).toEqual({ ...proposal, status: "rejected" });
  });

  it("rejects rejecting already applied proposals", () => {
    expect(() => rejectPendingProposal({ ...proposal, status: "applied" })).toThrow(CaptureValidationError);
  });
});
