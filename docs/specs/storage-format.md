# Storage Format

Draft placeholder for the first real persistence contract.

## Direction

Use local-first SQLite for the first implementation, behind explicit storage interfaces.

## Required Stores

- workspaces,
- graphs,
- nodes,
- edges,
- categories,
- category assignments,
- capture policies,
- feedback events,
- proposals,
- projections,
- snapshots.

## Rules

- Storage schema follows graph/capture/category/projection specs.
- Storage failure must be visible.
- No duplicate JSON shadow stores unless explicitly documented.
- No hidden migration/fallback paths.

## Open Questions

- Exact SQLite schema.
- Migration policy.
- Snapshot representation.
- Import/export format.
