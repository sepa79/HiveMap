# Category Overlay

Categories are semantic/visual labels layered over graph items.

They do not replace node type.

## Category Assignment

```ts
type CategoryAssignment = {
  id: string;
  targetType: "node" | "edge" | "projection";
  targetId: string;
  categoryId: string;
  status: "active" | "superseded";
  provenance: "human" | "agent" | "system";
  notes?: string;
};
```

## Initial Category Catalog

- `confirmed`: human-approved truth.
- `inferred`: AI inference / speculative interpretation.
- `critique`: critique / contradiction / skepticism.
- `risk`: known risk / dangerous shortcut / technical debt.
- `learning`: reusable learning / organizational knowledge.
- `unknown`: ambiguity / missing evidence / unclear ownership.
- `idea`: new idea / emerging concept.
- `rule`: governance / mandatory constraint / architecture standard.
- `dependency`: cross-system dependency / shared context.
- `experiment`: experimental feature / unsafe prototype / operational test.
- `stale`: stale concept / abandoned direction.
- `critical`: critical alert / rule failure / major drift.

## Display Themes

Playful labels/icons such as Banana, Opera, Jester, and Lab Rat are display themes over stable semantic category ids. Do not persist theme-specific names as core category ids unless a project explicitly defines them as custom categories.

## Custom Categories

Projects may define custom categories. Custom categories must be explicit project data, not ad hoc strings scattered through graph nodes.
