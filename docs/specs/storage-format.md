# Storage Format

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
- The initial implementation uses schema version `1`.
- Storage initialization must create the schema explicitly.
- Unknown schema versions are invalid.

## Schema Version

```sql
CREATE TABLE schema_metadata (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);
```

Required row:

- `key = 'schema_version'`
- `value = '1'`

## Core Tables

```sql
CREATE TABLE workspaces (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE TABLE graphs (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE
);

CREATE TABLE nodes (
  graph_id TEXT NOT NULL REFERENCES graphs(id) ON DELETE CASCADE,
  id TEXT NOT NULL,
  label TEXT NOT NULL,
  type TEXT NOT NULL,
  notes TEXT,
  metadata_json TEXT,
  PRIMARY KEY (graph_id, id)
);

CREATE TABLE edges (
  graph_id TEXT NOT NULL REFERENCES graphs(id) ON DELETE CASCADE,
  id TEXT NOT NULL,
  from_id TEXT NOT NULL,
  to_id TEXT NOT NULL,
  relation TEXT NOT NULL,
  label TEXT,
  notes TEXT,
  metadata_json TEXT,
  PRIMARY KEY (graph_id, id),
  FOREIGN KEY (graph_id, from_id) REFERENCES nodes(graph_id, id) ON DELETE RESTRICT,
  FOREIGN KEY (graph_id, to_id) REFERENCES nodes(graph_id, id) ON DELETE RESTRICT
);
```

## Overlay / Capture / Projection Tables

```sql
CREATE TABLE categories (
  workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  id TEXT NOT NULL,
  label TEXT NOT NULL,
  description TEXT NOT NULL,
  source TEXT NOT NULL,
  PRIMARY KEY (workspace_id, id)
);

CREATE TABLE category_assignments (
  workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  id TEXT NOT NULL,
  target_type TEXT NOT NULL,
  target_id TEXT NOT NULL,
  category_id TEXT NOT NULL,
  status TEXT NOT NULL,
  provenance TEXT NOT NULL,
  notes TEXT,
  PRIMARY KEY (workspace_id, id),
  FOREIGN KEY (workspace_id, category_id) REFERENCES categories(workspace_id, id) ON DELETE RESTRICT
);

CREATE TABLE capture_policies (
  workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  id TEXT NOT NULL,
  mode TEXT NOT NULL,
  rules_json TEXT,
  PRIMARY KEY (workspace_id, id)
);

CREATE TABLE feedback_events (
  workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  id TEXT NOT NULL,
  created_at TEXT NOT NULL,
  type TEXT NOT NULL,
  payload_json TEXT NOT NULL,
  projection_id TEXT,
  PRIMARY KEY (workspace_id, id)
);

CREATE TABLE proposals (
  workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  id TEXT NOT NULL,
  created_at TEXT NOT NULL,
  source_feedback_ids_json TEXT NOT NULL,
  graph_commands_json TEXT NOT NULL,
  explanation TEXT NOT NULL,
  risk_category_impact TEXT,
  status TEXT NOT NULL,
  PRIMARY KEY (workspace_id, id)
);

CREATE TABLE projections (
  workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  id TEXT NOT NULL,
  name TEXT NOT NULL,
  type TEXT NOT NULL,
  root_node_ids_json TEXT NOT NULL,
  visible_node_ids_json TEXT NOT NULL,
  visible_edge_ids_json TEXT NOT NULL,
  groups_json TEXT,
  layout_json TEXT,
  PRIMARY KEY (workspace_id, id)
);
```

## Snapshots

Snapshots are immutable review/demo evidence. They may store serialized graph and projection JSON because they preserve historical state rather than act as the live source of truth.

Snapshots are append-only at the API/runtime boundary. Updating or deleting historical snapshots requires an explicit future contract change.

```sql
CREATE TABLE snapshots (
  workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  id TEXT NOT NULL,
  created_at TEXT NOT NULL,
  projection_id TEXT,
  graph_json TEXT NOT NULL,
  projection_json TEXT NOT NULL,
  PRIMARY KEY (workspace_id, id)
);
```

## JSON Columns

JSON columns are allowed only where the source spec already defines dynamic structured data:

- node/edge metadata,
- capture policy rules,
- feedback payload,
- proposal command arrays/source feedback ids,
- projection id arrays/groups/layout,
- immutable snapshot payloads.

## Open Questions

- Migration policy.
- Import/export format.
