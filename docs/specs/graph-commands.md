# Graph Commands

Graph commands are the only supported way to mutate the semantic graph.

## Invariant

Every graph-changing flow must be expressible as:

```text
human intent or agent decision
  -> typed command
  -> validation
  -> graph mutation
  -> projection refresh
```

Projection layout, UI gestures, and feedback events are not graph commands unless an agent or API boundary explicitly converts them into one of these commands.

## Command Envelope

```ts
type GraphCommand = {
  id: string;
  type: GraphCommandType;
  payload: GraphCommandPayload;
};
```

Command ids must be stable and non-empty. They identify the attempted graph mutation for logs, proposals, and future storage.

## Command Types

```ts
type GraphCommandType =
  | "node.create"
  | "node.update"
  | "node.delete"
  | "edge.create"
  | "edge.update"
  | "edge.delete";
```

## Payloads

```ts
type CreateNodePayload = {
  node: GraphNode;
};

type UpdateNodePayload = {
  id: string;
  changes: Partial<Omit<GraphNode, "id">>;
};

type DeleteNodePayload = {
  id: string;
};

type CreateEdgePayload = {
  edge: GraphEdge;
};

type UpdateEdgePayload = {
  id: string;
  changes: Partial<Omit<GraphEdge, "id">>;
};

type DeleteEdgePayload = {
  id: string;
};
```

## Validation Rules

- Command ids must be non-empty.
- Command payloads must match the command type.
- Created nodes and edges must satisfy `graph-model.md`.
- Updated nodes and edges must remain valid after changes are applied.
- Node ids and edge ids are immutable.
- Deleting a missing node or edge is invalid.
- Deleting a node with incident edges is invalid. Delete edges explicitly first.
- Creating or updating an edge with missing endpoints is invalid.

## Mutation Rule

Command application is atomic: an invalid command must fail without returning a partially mutated graph.
