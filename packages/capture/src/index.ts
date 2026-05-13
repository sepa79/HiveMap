import { applyGraphCommands, type GraphCommand, type SemanticGraph } from "@hivemap/graph-core";

const CAPTURE_POLICY_MODES = ["approved", "delegated", "proposed", "custom"] as const;
const FEEDBACK_EVENT_TYPES = [
  "node_moved",
  "node_marked",
  "edge_marked",
  "map_comment",
  "group_requested",
  "dive_in_requested",
  "proposal_requested",
] as const;
const GRAPH_PROPOSAL_STATUSES = ["pending", "approved", "rejected", "applied", "superseded"] as const;

export type CapturePolicyMode = (typeof CAPTURE_POLICY_MODES)[number];
export type FeedbackEventType = (typeof FEEDBACK_EVENT_TYPES)[number];
export type GraphProposalStatus = (typeof GRAPH_PROPOSAL_STATUSES)[number];

export type CapturePolicy = {
  id: string;
  mode: CapturePolicyMode;
  rules?: string[];
};

export type FeedbackEvent = {
  id: string;
  createdAt: string;
  type: FeedbackEventType;
  payload: Record<string, unknown>;
  projectionId?: string;
};

export type GraphProposal = {
  id: string;
  createdAt: string;
  sourceFeedbackIds: string[];
  graphCommands: GraphCommand[];
  explanation: string;
  riskCategoryImpact?: string;
  status: GraphProposalStatus;
};

export type CaptureDecision =
  | { kind: "apply"; commands: GraphCommand[] }
  | { kind: "proposal"; proposal: GraphProposal };

export class CaptureValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CaptureValidationError";
  }
}

export const DEFAULT_CAPTURE_POLICY: CapturePolicy = {
  id: "default-delegated",
  mode: "delegated",
};

const CAPTURE_POLICY_MODE_SET: ReadonlySet<string> = new Set(CAPTURE_POLICY_MODES);
const FEEDBACK_EVENT_TYPE_SET: ReadonlySet<string> = new Set(FEEDBACK_EVENT_TYPES);
const GRAPH_PROPOSAL_STATUS_SET: ReadonlySet<string> = new Set(GRAPH_PROPOSAL_STATUSES);

export function validateCapturePolicy(policy: CapturePolicy): void {
  assertNonEmpty("policy.id", policy.id);

  if (!CAPTURE_POLICY_MODE_SET.has(policy.mode)) {
    throw new CaptureValidationError(`Unknown capture policy mode: ${policy.mode}`);
  }

  if (policy.mode === "custom" && (policy.rules === undefined || policy.rules.length === 0)) {
    throw new CaptureValidationError("Custom capture policy requires at least one explicit rule");
  }

  if (policy.rules !== undefined) {
    for (const rule of policy.rules) {
      assertNonEmpty("policy.rules[]", rule);
    }
  }
}

export function validateFeedbackEvent(event: FeedbackEvent): void {
  assertNonEmpty("event.id", event.id);
  assertIsoDate("event.createdAt", event.createdAt);

  if (!FEEDBACK_EVENT_TYPE_SET.has(event.type)) {
    throw new CaptureValidationError(`Unknown feedback event type: ${event.type}`);
  }

  if (!isRecord(event.payload)) {
    throw new CaptureValidationError("event.payload must be an object");
  }

  if (event.projectionId !== undefined) {
    assertNonEmpty("event.projectionId", event.projectionId);
  }
}

export function validateFeedbackEvents(events: readonly FeedbackEvent[]): void {
  const ids = new Set<string>();

  for (const event of events) {
    validateFeedbackEvent(event);

    if (ids.has(event.id)) {
      throw new CaptureValidationError(`Duplicate feedback event id: ${event.id}`);
    }

    ids.add(event.id);
  }
}

export function validateGraphProposal(proposal: GraphProposal): void {
  assertNonEmpty("proposal.id", proposal.id);
  assertIsoDate("proposal.createdAt", proposal.createdAt);
  assertNonEmpty("proposal.explanation", proposal.explanation);

  if (!GRAPH_PROPOSAL_STATUS_SET.has(proposal.status)) {
    throw new CaptureValidationError(`Unknown graph proposal status: ${proposal.status}`);
  }

  if (proposal.graphCommands.length === 0) {
    throw new CaptureValidationError("proposal.graphCommands must contain at least one command");
  }

  for (const sourceFeedbackId of proposal.sourceFeedbackIds) {
    assertNonEmpty("proposal.sourceFeedbackIds[]", sourceFeedbackId);
  }

  if (proposal.riskCategoryImpact !== undefined) {
    assertNonEmpty("proposal.riskCategoryImpact", proposal.riskCategoryImpact);
  }
}

export function decideCapturePolicy(
  policy: CapturePolicy,
  commands: readonly GraphCommand[],
  proposalFactory: () => GraphProposal,
): CaptureDecision {
  validateCapturePolicy(policy);

  if (commands.length === 0) {
    throw new CaptureValidationError("Capture decision requires at least one graph command");
  }

  if (policy.mode === "delegated") {
    return { kind: "apply", commands: [...commands] };
  }

  const proposal = proposalFactory();
  validateGraphProposal(proposal);
  return { kind: "proposal", proposal };
}

export function applyApprovedProposal(graph: SemanticGraph, proposal: GraphProposal): {
  graph: SemanticGraph;
  proposal: GraphProposal;
} {
  validateGraphProposal(proposal);

  if (proposal.status !== "approved") {
    throw new CaptureValidationError(`Cannot apply proposal with status: ${proposal.status}`);
  }

  return {
    graph: applyGraphCommands(graph, proposal.graphCommands),
    proposal: { ...proposal, status: "applied" },
  };
}

export function approvePendingProposal(proposal: GraphProposal): GraphProposal {
  validateGraphProposal(proposal);

  if (proposal.status !== "pending") {
    throw new CaptureValidationError(`Cannot approve proposal with status: ${proposal.status}`);
  }

  return { ...proposal, status: "approved" };
}

export function rejectPendingProposal(proposal: GraphProposal): GraphProposal {
  validateGraphProposal(proposal);

  if (proposal.status !== "pending") {
    throw new CaptureValidationError(`Cannot reject proposal with status: ${proposal.status}`);
  }

  return { ...proposal, status: "rejected" };
}

function assertNonEmpty(fieldName: string, value: string): void {
  if (value.trim().length === 0) {
    throw new CaptureValidationError(`${fieldName} must be non-empty`);
  }
}

function assertIsoDate(fieldName: string, value: string): void {
  assertNonEmpty(fieldName, value);

  const timestamp = Date.parse(value);
  if (Number.isNaN(timestamp)) {
    throw new CaptureValidationError(`${fieldName} must be a valid date string`);
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
