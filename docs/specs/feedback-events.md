# Feedback Events

Feedback events capture human intent from UI gestures and comments.

Feedback is not a semantic graph mutation by itself.

## Event Shape

```ts
type FeedbackEventType =
  | "node_moved"
  | "node_marked"
  | "edge_marked"
  | "map_comment"
  | "group_requested"
  | "dive_in_requested"
  | "proposal_requested";

type FeedbackEvent = {
  id: string;
  createdAt: string;
  type: FeedbackEventType;
  payload: Record<string, unknown>;
  projectionId?: string;
};
```

## Initial Event Types

- `node_moved`
- `node_marked`
- `edge_marked`
- `map_comment`
- `group_requested`
- `dive_in_requested`
- `proposal_requested`

## Rule

An agent may interpret feedback into graph commands. The feedback event remains evidence of human intent.

Feedback events must not mutate the semantic graph directly.

## Proposal Shape

```ts
type GraphProposal = {
  id: string;
  createdAt: string;
  sourceFeedbackIds: string[];
  graphCommands: GraphCommand[];
  explanation: string;
  riskCategoryImpact?: string;
  status: "pending" | "approved" | "rejected" | "applied" | "superseded";
};
```

Proposal creation is distinct from proposal application.

Proposal approval is distinct from application:

- `pending` proposals may be approved or rejected.
- only `approved` proposals may be applied.
- applying an approved proposal changes its status to `applied`.
