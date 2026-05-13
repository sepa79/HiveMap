# Graph Model

Draft contract for the semantic graph.

## Invariant

The graph is the source of truth. Projection/layout data is not graph semantics.

## Node

```ts
type GraphNode = {
  id: string;
  label: string;
  type: GraphNodeType;
  notes?: string;
  metadata?: Record<string, unknown>;
};
```

## Node Type

```ts
type GraphNodeType =
  | "concept"
  | "decision"
  | "risk"
  | "question"
  | "evidence"
  | "component"
  | "system"
  | "role"
  | "pattern";
```

## Edge

```ts
type GraphEdge = {
  id: string;
  from: string;
  to: string;
  relation: string;
  label?: string;
  notes?: string;
  metadata?: Record<string, unknown>;
};
```

## Validation

- Node ids must be unique.
- Edge ids must be unique.
- Edge endpoints must reference existing nodes.
- Required fields must be non-empty.
- Unknown node types are invalid unless introduced through a spec change.
