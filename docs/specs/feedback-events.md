# Feedback Events

Feedback events capture human intent from UI gestures and comments.

Feedback is not a semantic graph mutation by itself.

## Event Shape

```ts
type FeedbackEvent = {
  id: string;
  createdAt: string;
  type: string;
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
