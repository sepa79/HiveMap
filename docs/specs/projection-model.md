# Projection Model

Projections are visual/readable views over the semantic graph.

## Projection Types

- `conversation-map`
- `project-map`
- `overview`
- `dive-in`

## Projection Rule

A projection may hide, group, position, or annotate graph data. It must not become the semantic source of truth.

## Initial Shape

```ts
type Projection = {
  id: string;
  name: string;
  type: "conversation-map" | "project-map" | "overview" | "dive-in";
  rootNodeIds: string[];
  visibleNodeIds: string[];
  visibleEdgeIds: string[];
  groups?: ProjectionGroup[];
  layout?: Record<string, unknown>;
};
```

`layout.orientationNote` is a projection-owned visual annotation with a non-empty `title`, `purpose`, and ordered `usage` steps. The UI renders it as a large note node. It explains a view without creating a fake semantic concept in the graph.

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
- renders generic projection group counts as items; only findings-overview groups use finding counts.

Finding dive-in projection:

- treats `finding.affectedNodeIds` as the semantic correlation owner instead of duplicating those relations as graph edges;
- shows the finding first and its affected concepts as a separate group;
- includes existing semantic edges whose endpoints are visible;
- leaves source claims and code/document references in finding detail rather than manufacturing graph nodes for files.
- carries an orientation note explaining the purpose, inspection order, evidence panel, and Back navigation.

Project Map projection:

- uses an explicit curated set of visible nodes,
- derives visible edges whose endpoints are both visible,
- uses projection groups for architectural areas or layers,
- identifies important system roots explicitly,
- remains a view over the shared semantic graph rather than a separate architecture model.

Projection generation must not mutate graph nodes or edges.

## Validation

- Projection ids and names must be non-empty.
- Root, visible node, and visible edge ids must reference existing graph items.
- Visible edges must have both endpoints visible.
- Group ids and labels must be non-empty.
- Group node ids must be visible in the projection.
