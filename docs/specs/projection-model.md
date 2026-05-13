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

## Initial Projection Generation

Overview projection:

- shows a bounded set of graph nodes,
- hides detail by default,
- may group visible nodes,
- includes only edges whose endpoints are visible.

Dive-in projection:

- focuses on one root node,
- includes the root node,
- includes directly connected neighbor nodes,
- includes edges touching the root node,
- may include category annotations as projection groups.

Projection generation must not mutate graph nodes or edges.

## Validation

- Projection ids and names must be non-empty.
- Root, visible node, and visible edge ids must reference existing graph items.
- Visible edges must have both endpoints visible.
- Group ids and labels must be non-empty.
- Group node ids must be visible in the projection.
