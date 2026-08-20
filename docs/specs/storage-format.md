# Storage Format

## Direction

Use Postgres as the supported runtime persistence backend, behind explicit storage interfaces.

The canonical workspace ZIP format stays storage-backend-independent. It is the supported portability and migration boundary between runtime backends.

## Scope

This spec is the source of truth for:

- persisted logical workspace state,
- storage rules and invariants,
- ZIP import/export portability boundaries,
- the concrete Postgres runtime schema.

This file is the intended long-term source of truth for the concrete Postgres runtime schema.

The SQL below is the target Postgres schema contract. The current SQLite alpha implementation remains reference evidence only and is summarized at the end of this file.

## Required Stores

- workspaces,
- graphs,
- nodes,
- repository indexes,
- repository files,
- repository chunks,
- concept embeddings,
- edges,
- categories,
- category assignments,
- capture policies,
- feedback events,
- proposals,
- projections,
- scan profiles,
- scan runs.

## Rules

- Storage schema follows graph/capture/category/projection specs.
- Storage failure must be visible.
- No duplicate JSON shadow stores unless explicitly documented.
- No hidden migration/fallback paths.
- SQLite is not a parallel supported runtime backend for 1.0.
- Storage initialization must create the schema explicitly.
- Unknown schema versions are invalid.
- Snapshots are not part of the current HiveMap runtime contract.
- Use portable ZIP export/import for frozen evidence until a separate read-only clone contract exists.
- ZIP import/export is the intended portability boundary and must use an explicit logical bundle-compatibility contract instead of runtime-adapter schema-version checks.
- This spec defines the persisted logical state, import/export boundaries, and the target concrete Postgres DDL.

## Postgres Conventions

- Stable domain ids remain external `TEXT` values. HiveMap must not replace them with opaque database-generated ids for graph, projection, workspace, feedback, proposal, or scan identities.
- Timestamps use `TIMESTAMPTZ`.
- Optional free-form structured payloads use `JSONB`.
- Ordered lists that the runtime round-trips as arrays use `TEXT[]`.
- Ordered row collections that must round-trip in stable list order use explicit zero-based `ordinal INTEGER` columns and load with `ORDER BY ordinal`.
- `pgvector` is part of the runtime schema for vector-assisted read models.
- Embeddings are runtime-derived suggestion state, not semantic source of truth.
- The first vector slice stores explicit `concept` embeddings only.
- Embedding refresh is explicit. HiveMap does not silently regenerate embeddings on graph mutation in this slice.
- ZIP export/import does not include embeddings in this slice; they are regenerable runtime state.
- The semantic graph remains the source of truth for findings. A finding is stored as a graph node with `type = 'finding'`, plus validated finding metadata inside `nodes.metadata`.
- Scan comparisons are derived from completed scan runs and finding evidence. They do not get a dedicated runtime table.

## Target Postgres Schema Version

The target Postgres runtime schema version is `10`.

The current SQLite alpha implementation uses schema version `4` and remains legacy import evidence only, not the ZIP compatibility contract for the Postgres runtime.

```sql
CREATE EXTENSION IF NOT EXISTS vector;

CREATE TABLE schema_metadata (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);
```

Required row for the Postgres runtime:

- `key = 'schema_version'`
- `value = '10'`

## Postgres Types

```sql
CREATE TYPE graph_node_type AS ENUM (
  'concept',
  'decision',
  'risk',
  'question',
  'evidence',
  'component',
  'system',
  'role',
  'pattern',
  'finding'
);

CREATE TYPE category_definition_source AS ENUM ('system', 'project');
CREATE TYPE category_target_type AS ENUM ('node', 'edge', 'projection');
CREATE TYPE category_assignment_status AS ENUM ('active', 'superseded');
CREATE TYPE category_provenance AS ENUM ('human', 'agent', 'system');
CREATE TYPE capture_policy_mode AS ENUM ('approved', 'delegated', 'proposed', 'custom');
CREATE TYPE feedback_event_type AS ENUM (
  'node_moved',
  'node_marked',
  'edge_marked',
  'map_comment',
  'group_requested',
  'dive_in_requested',
  'proposal_requested'
);
CREATE TYPE graph_proposal_status AS ENUM ('pending', 'approved', 'rejected', 'applied', 'superseded');
CREATE TYPE projection_type AS ENUM ('conversation-map', 'project-map', 'overview', 'dive-in');
CREATE TYPE scan_required_output AS ENUM ('document-inventory', 'concept-map', 'findings', 'coverage-report');
CREATE TYPE scan_run_status AS ENUM ('in_progress', 'completed');
CREATE TYPE repository_index_mode AS ENUM ('safe', 'deep');
CREATE TYPE repository_index_stage AS ENUM (
  'requested',
  'resolving_ref',
  'checking_out',
  'discovering',
  'indexing_syntax',
  'running_rules',
  'embedding_changed_chunks',
  'normalizing',
  'completed',
  'failed',
  'cancelled'
);
```

## Postgres Tables

```sql
CREATE TABLE workspaces (
  id TEXT PRIMARY KEY,
  slug TEXT UNIQUE,
  name TEXT NOT NULL,
  archived BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL,
  updated_at TIMESTAMPTZ,
  revision BIGINT NOT NULL DEFAULT 0,
  CHECK (btrim(id) <> ''),
  CHECK (slug IS NULL OR btrim(slug) <> ''),
  CHECK (btrim(name) <> ''),
  CHECK (revision >= 0)
);

CREATE TABLE graphs (
  workspace_id TEXT PRIMARY KEY REFERENCES workspaces(id) ON DELETE CASCADE,
  id TEXT NOT NULL UNIQUE,
  CHECK (btrim(id) <> '')
);

CREATE TABLE nodes (
  graph_id TEXT NOT NULL REFERENCES graphs(id) ON DELETE CASCADE,
  id TEXT NOT NULL,
  ordinal INTEGER NOT NULL,
  label TEXT NOT NULL,
  type graph_node_type NOT NULL,
  notes TEXT,
  metadata JSONB,
  PRIMARY KEY (graph_id, id),
  UNIQUE (graph_id, ordinal),
  CHECK (ordinal >= 0),
  CHECK (btrim(id) <> ''),
  CHECK (btrim(label) <> ''),
  CHECK (metadata IS NULL OR jsonb_typeof(metadata) = 'object')
);

CREATE TABLE node_embeddings (
  workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  node_id TEXT NOT NULL,
  model TEXT NOT NULL,
  content_digest TEXT NOT NULL,
  embedding vector NOT NULL,
  created_at TIMESTAMPTZ NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL,
  PRIMARY KEY (workspace_id, node_id, model),
  CHECK (btrim(node_id) <> ''),
  CHECK (btrim(model) <> ''),
  CHECK (btrim(content_digest) <> ''),
  CHECK (vector_dims(embedding) > 0)
);

CREATE TABLE edges (
  graph_id TEXT NOT NULL REFERENCES graphs(id) ON DELETE CASCADE,
  id TEXT NOT NULL,
  ordinal INTEGER NOT NULL,
  from_id TEXT NOT NULL,
  to_id TEXT NOT NULL,
  relation TEXT NOT NULL,
  label TEXT,
  notes TEXT,
  metadata JSONB,
  PRIMARY KEY (graph_id, id),
  UNIQUE (graph_id, ordinal),
  FOREIGN KEY (graph_id, from_id) REFERENCES nodes(graph_id, id) ON DELETE RESTRICT,
  FOREIGN KEY (graph_id, to_id) REFERENCES nodes(graph_id, id) ON DELETE RESTRICT,
  CHECK (ordinal >= 0),
  CHECK (btrim(id) <> ''),
  CHECK (btrim(from_id) <> ''),
  CHECK (btrim(to_id) <> ''),
  CHECK (btrim(relation) <> ''),
  CHECK (metadata IS NULL OR jsonb_typeof(metadata) = 'object')
);

CREATE TABLE categories (
  workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  id TEXT NOT NULL,
  ordinal INTEGER NOT NULL,
  label TEXT NOT NULL,
  description TEXT NOT NULL,
  source category_definition_source NOT NULL,
  PRIMARY KEY (workspace_id, id),
  UNIQUE (workspace_id, ordinal),
  CHECK (ordinal >= 0),
  CHECK (btrim(id) <> ''),
  CHECK (btrim(label) <> ''),
  CHECK (btrim(description) <> '')
);

CREATE TABLE category_assignments (
  workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  id TEXT NOT NULL,
  ordinal INTEGER NOT NULL,
  target_type category_target_type NOT NULL,
  target_id TEXT NOT NULL,
  category_id TEXT NOT NULL,
  status category_assignment_status NOT NULL,
  provenance category_provenance NOT NULL,
  notes TEXT,
  PRIMARY KEY (workspace_id, id),
  UNIQUE (workspace_id, ordinal),
  FOREIGN KEY (workspace_id, category_id) REFERENCES categories(workspace_id, id) ON DELETE RESTRICT,
  CHECK (ordinal >= 0),
  CHECK (btrim(id) <> ''),
  CHECK (btrim(target_id) <> ''),
  CHECK (btrim(category_id) <> '')
);

CREATE TABLE capture_policies (
  workspace_id TEXT PRIMARY KEY REFERENCES workspaces(id) ON DELETE CASCADE,
  id TEXT NOT NULL,
  mode capture_policy_mode NOT NULL,
  rules TEXT[],
  CHECK (btrim(id) <> ''),
  CHECK (
    mode <> 'custom'
    OR (
      rules IS NOT NULL
      AND cardinality(rules) > 0
    )
  )
);

CREATE TABLE proposals (
  workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  id TEXT NOT NULL,
  ordinal INTEGER NOT NULL,
  created_at TIMESTAMPTZ NOT NULL,
  source_feedback_ids TEXT[] NOT NULL,
  graph_commands JSONB NOT NULL,
  explanation TEXT NOT NULL,
  risk_category_impact TEXT,
  status graph_proposal_status NOT NULL,
  PRIMARY KEY (workspace_id, id),
  UNIQUE (workspace_id, ordinal),
  CHECK (ordinal >= 0),
  CHECK (btrim(id) <> ''),
  CHECK (jsonb_typeof(graph_commands) = 'array'),
  CHECK (jsonb_array_length(graph_commands) > 0),
  CHECK (btrim(explanation) <> '')
);

CREATE TABLE projections (
  workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  id TEXT NOT NULL,
  ordinal INTEGER NOT NULL,
  name TEXT NOT NULL,
  type projection_type NOT NULL,
  root_node_ids TEXT[] NOT NULL,
  visible_node_ids TEXT[] NOT NULL,
  visible_edge_ids TEXT[] NOT NULL,
  groups JSONB,
  layout JSONB,
  PRIMARY KEY (workspace_id, id),
  UNIQUE (workspace_id, ordinal),
  CHECK (ordinal >= 0),
  CHECK (btrim(id) <> ''),
  CHECK (btrim(name) <> ''),
  CHECK (groups IS NULL OR jsonb_typeof(groups) = 'array'),
  CHECK (layout IS NULL OR jsonb_typeof(layout) = 'object')
);

CREATE TABLE feedback_events (
  workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  id TEXT NOT NULL,
  ordinal INTEGER NOT NULL,
  created_at TIMESTAMPTZ NOT NULL,
  type feedback_event_type NOT NULL,
  payload JSONB NOT NULL,
  projection_id TEXT,
  PRIMARY KEY (workspace_id, id),
  UNIQUE (workspace_id, ordinal),
  FOREIGN KEY (workspace_id, projection_id) REFERENCES projections(workspace_id, id) ON DELETE SET NULL,
  CHECK (ordinal >= 0),
  CHECK (btrim(id) <> ''),
  CHECK (jsonb_typeof(payload) = 'object')
);

CREATE TABLE scan_profiles (
  workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  id TEXT NOT NULL,
  version INTEGER NOT NULL,
  ordinal INTEGER NOT NULL,
  name TEXT NOT NULL,
  description TEXT NOT NULL,
  instructions TEXT[] NOT NULL,
  scope_include TEXT[] NOT NULL,
  scope_exclude TEXT[] NOT NULL,
  source_types TEXT[] NOT NULL,
  criteria JSONB NOT NULL,
  ssot_order TEXT[] NOT NULL,
  required_outputs scan_required_output[] NOT NULL,
  PRIMARY KEY (workspace_id, id, version),
  UNIQUE (workspace_id, ordinal),
  CHECK (ordinal >= 0),
  CHECK (btrim(id) <> ''),
  CHECK (version > 0),
  CHECK (btrim(name) <> ''),
  CHECK (btrim(description) <> ''),
  CHECK (cardinality(instructions) > 0),
  CHECK (cardinality(scope_include) > 0),
  CHECK (cardinality(source_types) > 0),
  CHECK (cardinality(required_outputs) > 0),
  CHECK (jsonb_typeof(criteria) = 'array')
);

CREATE TABLE scan_runs (
  workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  id TEXT NOT NULL,
  ordinal INTEGER NOT NULL,
  profile_id TEXT NOT NULL,
  profile_version INTEGER NOT NULL,
  status scan_run_status NOT NULL,
  repository_index_id TEXT,
  repository_root TEXT NOT NULL,
  repository_url TEXT,
  repository_branch TEXT NOT NULL,
  repository_revision TEXT NOT NULL,
  repository_worktree_digest TEXT,
  actor_agent_id TEXT NOT NULL,
  actor_tool TEXT NOT NULL,
  started_at TIMESTAMPTZ NOT NULL,
  coverage JSONB,
  applied_criteria TEXT[] NOT NULL,
  declared_outputs scan_required_output[] NOT NULL,
  finding_node_ids TEXT[] NOT NULL,
  completed_at TIMESTAMPTZ,
  graph_digest TEXT,
  finding_evidence JSONB,
  PRIMARY KEY (workspace_id, id),
  UNIQUE (workspace_id, ordinal),
  FOREIGN KEY (workspace_id, profile_id, profile_version) REFERENCES scan_profiles(workspace_id, id, version) ON DELETE RESTRICT,
  FOREIGN KEY (workspace_id, repository_index_id) REFERENCES repository_indexes(workspace_id, id) ON DELETE RESTRICT,
  CHECK (ordinal >= 0),
  CHECK (btrim(id) <> ''),
  CHECK (btrim(profile_id) <> ''),
  CHECK (repository_index_id IS NULL OR btrim(repository_index_id) <> ''),
  CHECK (profile_version > 0),
  CHECK (btrim(repository_root) <> ''),
  CHECK (btrim(repository_branch) <> ''),
  CHECK (btrim(repository_revision) <> ''),
  CHECK (btrim(actor_agent_id) <> ''),
  CHECK (btrim(actor_tool) <> ''),
  CHECK (coverage IS NULL OR jsonb_typeof(coverage) = 'object'),
  CHECK (finding_evidence IS NULL OR jsonb_typeof(finding_evidence) = 'array'),
  CHECK (
    (status = 'in_progress' AND completed_at IS NULL AND graph_digest IS NULL AND finding_evidence IS NULL)
    OR
    (status = 'completed' AND completed_at IS NOT NULL AND graph_digest IS NOT NULL AND coverage IS NOT NULL AND finding_evidence IS NOT NULL)
  )
);

CREATE TABLE repository_indexes (
  workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  id TEXT NOT NULL,
  repository_url TEXT NOT NULL,
  requested_ref TEXT,
  resolved_commit TEXT,
  mode repository_index_mode NOT NULL,
  stage repository_index_stage NOT NULL,
  requested_at TIMESTAMPTZ NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL,
  completed_at TIMESTAMPTZ,
  actor_agent_id TEXT NOT NULL,
  actor_tool TEXT NOT NULL,
  failure_code TEXT,
  failure_message TEXT,
  stats_file_count INTEGER,
  stats_chunk_count INTEGER,
  stats_indexed_bytes BIGINT,
  PRIMARY KEY (workspace_id, id),
  CHECK (btrim(id) <> ''),
  CHECK (btrim(repository_url) <> ''),
  CHECK (requested_ref IS NULL OR btrim(requested_ref) <> ''),
  CHECK (resolved_commit IS NULL OR btrim(resolved_commit) <> ''),
  CHECK (btrim(actor_agent_id) <> ''),
  CHECK (btrim(actor_tool) <> ''),
  CHECK ((failure_code IS NULL) = (failure_message IS NULL)),
  CHECK ((stats_file_count IS NULL) = (stats_chunk_count IS NULL)),
  CHECK ((stats_file_count IS NULL) = (stats_indexed_bytes IS NULL)),
  CHECK (stats_file_count IS NULL OR stats_file_count >= 0),
  CHECK (stats_chunk_count IS NULL OR stats_chunk_count >= 0),
  CHECK (stats_indexed_bytes IS NULL OR stats_indexed_bytes >= 0),
  CHECK (
    (
      stage IN ('requested', 'resolving_ref', 'checking_out', 'discovering', 'indexing_syntax', 'running_rules', 'embedding_changed_chunks', 'normalizing')
      AND completed_at IS NULL
      AND failure_code IS NULL
    )
    OR
    (stage = 'completed' AND completed_at IS NOT NULL AND failure_code IS NULL)
    OR
    (stage = 'cancelled' AND completed_at IS NOT NULL AND failure_code IS NULL)
    OR
    (stage = 'failed' AND completed_at IS NOT NULL AND failure_code IS NOT NULL)
  )
);

CREATE TABLE repository_files (
  workspace_id TEXT NOT NULL,
  index_id TEXT NOT NULL,
  path TEXT NOT NULL,
  ordinal INTEGER NOT NULL,
  language TEXT NOT NULL,
  source_kind TEXT NOT NULL,
  content_hash TEXT NOT NULL,
  byte_size BIGINT NOT NULL,
  PRIMARY KEY (workspace_id, index_id, path),
  UNIQUE (workspace_id, index_id, ordinal),
  FOREIGN KEY (workspace_id, index_id) REFERENCES repository_indexes(workspace_id, id) ON DELETE CASCADE,
  CHECK (ordinal >= 0),
  CHECK (btrim(path) <> ''),
  CHECK (btrim(language) <> ''),
  CHECK (btrim(source_kind) <> ''),
  CHECK (btrim(content_hash) <> ''),
  CHECK (byte_size >= 0)
);

CREATE TABLE repository_chunks (
  workspace_id TEXT NOT NULL,
  index_id TEXT NOT NULL,
  id TEXT NOT NULL,
  ordinal INTEGER NOT NULL,
  file_path TEXT NOT NULL,
  language TEXT NOT NULL,
  source_kind TEXT NOT NULL,
  start_line INTEGER NOT NULL,
  end_line INTEGER NOT NULL,
  text TEXT NOT NULL,
  content_hash TEXT NOT NULL,
  PRIMARY KEY (workspace_id, index_id, id),
  UNIQUE (workspace_id, index_id, ordinal),
  FOREIGN KEY (workspace_id, index_id) REFERENCES repository_indexes(workspace_id, id) ON DELETE CASCADE,
  FOREIGN KEY (workspace_id, index_id, file_path) REFERENCES repository_files(workspace_id, index_id, path) ON DELETE CASCADE,
  CHECK (ordinal >= 0),
  CHECK (btrim(id) <> ''),
  CHECK (btrim(file_path) <> ''),
  CHECK (btrim(language) <> ''),
  CHECK (btrim(source_kind) <> ''),
  CHECK (start_line > 0),
  CHECK (end_line >= start_line),
  CHECK (btrim(text) <> ''),
  CHECK (btrim(content_hash) <> '')
);

CREATE TABLE repository_symbols (
  workspace_id TEXT NOT NULL,
  index_id TEXT NOT NULL,
  key TEXT NOT NULL,
  ordinal INTEGER NOT NULL,
  file_path TEXT NOT NULL,
  language TEXT NOT NULL,
  name TEXT NOT NULL,
  qualified_name TEXT NOT NULL,
  kind TEXT NOT NULL,
  parent_symbol_key TEXT,
  start_line INTEGER NOT NULL,
  start_column INTEGER NOT NULL,
  end_line INTEGER NOT NULL,
  end_column INTEGER NOT NULL,
  is_exported BOOLEAN NOT NULL,
  is_public BOOLEAN NOT NULL,
  producer_tool TEXT NOT NULL,
  producer_version TEXT NOT NULL,
  PRIMARY KEY (workspace_id, index_id, key),
  UNIQUE (workspace_id, index_id, ordinal),
  FOREIGN KEY (workspace_id, index_id) REFERENCES repository_indexes(workspace_id, id) ON DELETE CASCADE,
  FOREIGN KEY (workspace_id, index_id, file_path) REFERENCES repository_files(workspace_id, index_id, path) ON DELETE CASCADE,
  FOREIGN KEY (workspace_id, index_id, parent_symbol_key) REFERENCES repository_symbols(workspace_id, index_id, key) ON DELETE CASCADE,
  CHECK (ordinal >= 0),
  CHECK (btrim(key) <> ''),
  CHECK (btrim(file_path) <> ''),
  CHECK (btrim(language) <> ''),
  CHECK (btrim(name) <> ''),
  CHECK (btrim(qualified_name) <> ''),
  CHECK (btrim(kind) <> ''),
  CHECK (start_line > 0),
  CHECK (start_column >= 0),
  CHECK (end_line >= start_line),
  CHECK (end_column >= 0),
  CHECK (btrim(producer_tool) <> ''),
  CHECK (btrim(producer_version) <> '')
);
```

## Postgres Indexes

```sql
CREATE INDEX workspaces_name_lookup_idx ON workspaces (lower(name));
CREATE INDEX workspaces_slug_lookup_idx ON workspaces (lower(slug));
CREATE INDEX nodes_graph_type_idx ON nodes (graph_id, type, id);
CREATE INDEX node_embeddings_workspace_model_node_idx ON node_embeddings (workspace_id, model, node_id);
CREATE INDEX node_embeddings_workspace_model_updated_idx ON node_embeddings (workspace_id, model, updated_at DESC);
CREATE INDEX edges_graph_from_idx ON edges (graph_id, from_id);
CREATE INDEX edges_graph_to_idx ON edges (graph_id, to_id);
CREATE INDEX categories_workspace_source_idx ON categories (workspace_id, source, id);
CREATE INDEX category_assignments_workspace_target_idx ON category_assignments (workspace_id, target_type, target_id);
CREATE INDEX feedback_events_workspace_created_idx ON feedback_events (workspace_id, created_at, id);
CREATE INDEX proposals_workspace_status_created_idx ON proposals (workspace_id, status, created_at DESC);
CREATE INDEX projections_workspace_type_idx ON projections (workspace_id, type, id);
CREATE INDEX scan_profiles_workspace_ref_idx ON scan_profiles (workspace_id, id, version DESC);
CREATE INDEX scan_runs_workspace_status_started_idx ON scan_runs (workspace_id, status, started_at DESC);
CREATE INDEX scan_runs_workspace_profile_idx ON scan_runs (workspace_id, profile_id, profile_version, started_at DESC);
CREATE INDEX scan_runs_workspace_repository_index_idx ON scan_runs (workspace_id, repository_index_id, started_at DESC);
CREATE INDEX repository_indexes_workspace_stage_updated_idx ON repository_indexes (workspace_id, stage, updated_at DESC);
CREATE INDEX repository_indexes_workspace_repo_commit_idx ON repository_indexes (workspace_id, repository_url, resolved_commit);
CREATE INDEX repository_files_workspace_index_path_idx ON repository_files (workspace_id, index_id, path);
CREATE INDEX repository_chunks_workspace_index_file_idx ON repository_chunks (workspace_id, index_id, file_path, ordinal);
CREATE INDEX repository_chunks_text_search_idx ON repository_chunks USING GIN (to_tsvector('simple', text));
CREATE INDEX repository_symbols_workspace_index_file_idx ON repository_symbols (workspace_id, index_id, file_path, ordinal);
CREATE INDEX repository_symbols_workspace_index_name_idx ON repository_symbols (workspace_id, index_id, qualified_name, name);
CREATE INDEX nodes_finding_origin_scan_idx ON nodes ((metadata->'finding'->>'originScanId')) WHERE type = 'finding';
CREATE INDEX nodes_finding_fingerprint_idx ON nodes ((metadata->'finding'->>'fingerprint')) WHERE type = 'finding';
CREATE INDEX nodes_metadata_gin_idx ON nodes USING GIN (metadata);
CREATE INDEX edges_metadata_gin_idx ON edges USING GIN (metadata);
```

## Finding Storage

Findings do not get a separate runtime table.

Runtime finding state lives in the semantic graph:

- `nodes.type = 'finding'`
- `nodes.notes` stores the main finding explanation text
- `nodes.metadata->'finding'` stores the validated finding metadata object
- `nodes.metadata->'sourceRefs'` stores the bounded source references used by scan evidence

This preserves the product invariant that the semantic graph remains the source of truth. The dedicated Postgres indexes above exist to make finding-heavy review workflows queryable without duplicating finding ownership into a second table.

## Comparison Storage

Scan comparisons do not get a dedicated runtime table.

They are derived from:

- completed `scan_runs`,
- finding evidence stored on completed runs,
- current finding nodes in the semantic graph when needed.

Comparisons remain exportable evidence and repeat-scan artifacts, not a second mutable source of runtime truth.

## Repository Index Job Storage

Repository index jobs do get a dedicated operational table.

They are not semantic graph state and they are not part of the canonical ZIP contract in this phase.

`repository_indexes` stores:

- one explicit workspace-scoped repository indexing request or lifecycle record per `workspace_id` and `id`;
- the requested repository URL and optional requested ref;
- the current lifecycle stage for safe/deep indexing orchestration;
- agent/tool provenance for who requested the job;
- optional resolved commit and terminal failure details;
- optional persisted summary stats for completed file/chunk content.

`repository_indexes` is operational runtime state. Replacing or deleting a workspace may clear these rows; callers must treat them as rebuildable orchestration state rather than portable canonical content.

This does not remove the long-term portability requirement for completed repository indexes. The omitted piece in the current slice is only job/execution state, not the eventual ability to move a finished index between environments through the normal full-project export/import flow.

## Repository Index Content Storage

`repository_files`, `repository_chunks`, and `repository_symbols` store the currently implemented completed-index retrieval slice.

`repository_files` stores:

- one normalized repository-relative file record per `workspace_id`, `index_id`, and `path`;
- stable list order through `ordinal`;
- bounded language and source-kind classification;
- file content hash and byte size for reuse and invalidation.

`repository_chunks` stores:

- one bounded chunk record per `workspace_id`, `index_id`, and chunk `id`;
- the owning repository file path and stable list order through `ordinal`;
- line-bounded chunk text used for current repository search;
- a content hash for explicit reuse and invalidation.

`repository_symbols` stores:

- one bounded syntax-level symbol record per `workspace_id`, `index_id`, and stable symbol `key`;
- the owning repository file path and stable list order through `ordinal`;
- normalized language, symbol kind, display name, and qualified name;
- parent/container linkage when the parser can prove it;
- bounded source range plus deterministic visibility/export flags;
- explicit producer provenance for the parser adapter that generated the row.

In this slice these tables are persisted runtime evidence, not semantic graph truth, and they are still excluded from the canonical ZIP portability contract.

## Planned Structural Fact Storage

The following tables are the intended next repository-index storage slice, but they are not part of the current concrete schema yet:

- `repository_references`
- `repository_dependencies`
- `repository_diagnostics`

The implementation target for that slice is:

- one row remains scoped by `workspace_id` and `index_id`;
- every row references the owning repository file and bounded range when applicable;
- every row stores explicit producer provenance such as tool id, version, and configuration digest;
- facts remain retrieval/index evidence rather than semantic graph truth;
- these tables remain excluded from the ZIP contract until the completed-index portability phase defines how finished index facts move between environments.

## Transaction Model

- Every create, save, import, proposal apply, or scan mutation for one workspace must execute inside one database transaction.
- Writers must lock the owning workspace row before replacing child state so concurrent whole-workspace writes do not silently lose updates.
- Successful mutating transactions must increment `workspaces.revision`.
- `replace` ZIP import must delete and recreate the target workspace state inside one transaction so a failed import cannot partially destroy the previous workspace.
- Read operations may load the whole workspace state, but write behavior must be explicit about revision/concurrency handling instead of assuming SQLite-like single-writer behavior.

## Vector Storage And Query Rules

- `node_embeddings` stores one explicit embedding row per `workspace_id`, `node_id`, and `model`.
- The first vector slice is bounded to `concept` nodes only.
- Provider-backed refresh/backfill operations use canonical `model` refs in `provider:model` form such as `ollama:nomic-embed-text`.
- Low-level manual embedding upsert remains available for tests or controlled import/reference flows, but provider-backed generation is the intended runtime path.
- `content_digest` tracks the exact node text shape the embedding was computed from so stale embeddings can be rejected explicitly.
- The runtime computes concept embedding text from semantic concept content only; provider-backed generation must not read projection/layout state.
- Explicit refresh and backfill fail clearly when the requested provider prefix is not configured in the running process.
- The first similarity query is bounded to one workspace, one source concept node, and one model.
- The first similarity query uses exact cosine similarity ordering and returns read-only suggestions only.
- Approximate nearest-neighbor indexing is intentionally deferred until model and dimension strategy are stable enough to justify model-specific partial indexes.
- Embeddings are runtime-derived state and are intentionally omitted from the canonical ZIP portability contract in this slice.
- Repository index jobs are operational runtime state and are intentionally omitted from the canonical ZIP portability contract in this slice.
- Repository file/chunk/symbol retrieval tables are also intentionally omitted from the canonical ZIP portability contract in this slice.
- A future completed-index portability slice may include bounded retrieval-ready embedding payloads or may regenerate them on import, but that decision is still open.

This keeps vector suggestions useful without making them semantic truth or coupling the portability contract to one embedding provider.

## Portable ZIP

The ZIP format and import modes follow `repository-scan.md`. `workspace.json` is the only canonical archive entry. Every other file is checksummed generated evidence and import validates it against the canonical state.

The local UI downloads and uploads the same canonical bundle bytes through REST. Browser transport does not define a second archive format and does not expose server-side filesystem paths.

`replace` deletes and recreates the workspace inside one database transaction so a changed graph id cannot leave shadow graph state and a failed import cannot destroy the previous workspace.

Bundle manifest contract:

- `format = "hivemap-workspace"`
- `formatVersion = 2`
- `logicalStateVersion = 1`
- `storageSchemaVersion` is not part of the current canonical bundle contract

Compatibility rules:

- current runtimes must export format version `2` bundles only;
- current runtimes must import format version `2` bundles when `logicalStateVersion = 1`;
- current runtimes may import legacy format version `1` bundles only as a compatibility bridge for prior schema-version-coupled exports;
- the accepted legacy storage schema bridge currently includes historical schema versions `2` and `4`;
- runtime storage schema versions and bundle logical-state versions are distinct compatibility axes and must not be conflated.

Current scope note:

- the canonical workspace ZIP does not yet carry repository index operational rows or completed repository content tables such as `repository_files`, `repository_chunks`, and `repository_symbols`;
- long-term product direction does require the normal full-project export/import path to carry completed repository index data so scans can be reviewed in another environment without repository checkout;
- operational repository index job/execution rows remain excluded from that portable contract.

## Workspace Discovery Metadata

`workspaces.slug`, `workspaces.archived`, and `workspaces.updated_at` support lightweight workspace discovery without loading full graphs. They are metadata only; the semantic graph remains the source of truth for workspace contents.

## Current SQLite Alpha Reference

The current SQLite alpha implementation remains the runnable compatibility reference until the Postgres adapter lands in code.

Its concrete schema and migration behavior live in:

- `packages/storage/src/index.ts`
- `packages/storage/src/schema.ts`

That implementation uses schema version `4` and remains transitional evidence, including legacy ZIP import compatibility, not the target runtime destination.
