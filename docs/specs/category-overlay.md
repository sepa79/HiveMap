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

- `banana`: confirmed / human-approved truth.
- `opera`: AI inference / speculative interpretation.
- `jester`: critique / contradiction / skepticism.
- `dumpster-fire`: known risk / dangerous shortcut / technical debt.
- `hive`: reusable learning / organizational knowledge.
- `fog`: unknown / ambiguity / missing evidence.
- `spark`: new idea / emerging concept.
- `law`: rule / governance / mandatory constraint.
- `thread`: cross-system dependency / shared context.
- `lab-rat`: experiment / unsafe prototype / operational test.
- `ghost`: stale concept / abandoned direction.
- `siren`: critical alert / rule failure / major drift.

## Custom Categories

Projects may define custom categories. Custom categories must be explicit project data, not ad hoc strings scattered through graph nodes.
