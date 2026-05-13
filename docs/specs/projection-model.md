# Projection Model

Projections are visual/readable views over the semantic graph.

## Projection Types

- `conversation-map`
- `project-map`
- `overview`
- `dive-in`
- `snapshot`

## Projection Rule

A projection may hide, group, position, or annotate graph data. It must not become the semantic source of truth.

## Initial Shape

```ts
type Projection = {
  id: string;
  name: string;
  type: "conversation-map" | "project-map" | "overview" | "dive-in" | "snapshot";
  rootNodeIds: string[];
  visibleNodeIds: string[];
  visibleEdgeIds: string[];
  groups?: ProjectionGroup[];
  layout?: Record<string, unknown>;
};
```

```ts
type ProjectionGroup = {
  id: string;
  label: string;
  nodeIds: string[];
  categoryIds?: string[];
};
```
