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

When a node correlates project knowledge, `metadata.sourceRefs` follows `project-knowledge-map.md`. Source references are typed boundary data; ad hoc document/code/HiveMind reference shapes are invalid.

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
  | "pattern"
  | "finding";
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
- Finding nodes must satisfy the metadata contract in `repository-scan.md`.
