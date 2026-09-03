/**
 * Responsibility: Own the exact Postgres bootstrap schema for a fresh dedicated database.
 * Must not: Execute SQL, migrate prior schemas, hydrate records, or recover incompatible databases.
 * Contract: Exposes the current immutable bootstrap statement consumed transactionally by PostgresHiveMapStore.
 */
export const POSTGRES_SCHEMA_SQL = `
CREATE EXTENSION IF NOT EXISTS vector;

DO $$
BEGIN
  CREATE TYPE graph_node_type AS ENUM ('concept', 'decision', 'risk', 'question', 'evidence', 'component', 'system', 'role', 'pattern', 'finding');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END
$$;

DO $$
BEGIN
  CREATE TYPE category_definition_source AS ENUM ('system', 'project');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END
$$;

DO $$
BEGIN
  CREATE TYPE category_target_type AS ENUM ('node', 'edge', 'projection');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END
$$;

DO $$
BEGIN
  CREATE TYPE category_assignment_status AS ENUM ('active', 'superseded');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END
$$;

DO $$
BEGIN
  CREATE TYPE category_provenance AS ENUM ('human', 'agent', 'system');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END
$$;

DO $$
BEGIN
  CREATE TYPE capture_policy_mode AS ENUM ('approved', 'delegated', 'proposed', 'custom');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END
$$;

DO $$
BEGIN
  CREATE TYPE feedback_event_type AS ENUM ('node_moved', 'node_marked', 'edge_marked', 'map_comment', 'group_requested', 'dive_in_requested', 'proposal_requested');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END
$$;

DO $$
BEGIN
  CREATE TYPE graph_proposal_status AS ENUM ('pending', 'approved', 'rejected', 'applied', 'superseded');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END
$$;

DO $$
BEGIN
  CREATE TYPE projection_type AS ENUM ('conversation-map', 'project-map', 'overview', 'dive-in');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END
$$;

DO $$
BEGIN
  CREATE TYPE scan_required_output AS ENUM ('document-inventory', 'concept-map', 'findings', 'coverage-report', 'boundary-map');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END
$$;

DO $$
BEGIN
  CREATE TYPE scan_run_status AS ENUM ('in_progress', 'completed');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END
$$;

DO $$
BEGIN
  CREATE TYPE repository_index_mode AS ENUM ('safe', 'deep');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END
$$;

DO $$
BEGIN
  CREATE TYPE repository_index_stage AS ENUM ('requested', 'resolving_ref', 'checking_out', 'discovering', 'indexing_syntax', 'running_rules', 'embedding_changed_chunks', 'normalizing', 'completed', 'failed', 'cancelled');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END
$$;

CREATE TABLE IF NOT EXISTS schema_metadata (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS workspaces (
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

CREATE TABLE IF NOT EXISTS graphs (
  workspace_id TEXT PRIMARY KEY REFERENCES workspaces(id) ON DELETE CASCADE,
  id TEXT NOT NULL UNIQUE,
  CHECK (btrim(id) <> '')
);

CREATE TABLE IF NOT EXISTS nodes (
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

CREATE TABLE IF NOT EXISTS node_embeddings (
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

CREATE TABLE IF NOT EXISTS edges (
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

CREATE TABLE IF NOT EXISTS categories (
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

CREATE TABLE IF NOT EXISTS category_assignments (
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

CREATE TABLE IF NOT EXISTS capture_policies (
  workspace_id TEXT PRIMARY KEY REFERENCES workspaces(id) ON DELETE CASCADE,
  id TEXT NOT NULL,
  mode capture_policy_mode NOT NULL,
  rules TEXT[],
  CHECK (btrim(id) <> ''),
  CHECK (mode <> 'custom' OR (rules IS NOT NULL AND cardinality(rules) > 0))
);

CREATE TABLE IF NOT EXISTS proposals (
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

CREATE TABLE IF NOT EXISTS projections (
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

CREATE TABLE IF NOT EXISTS feedback_events (
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

CREATE TABLE IF NOT EXISTS scan_profiles (
  workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  id TEXT NOT NULL,
  version INTEGER NOT NULL,
  ordinal INTEGER NOT NULL,
  name TEXT NOT NULL,
  description TEXT NOT NULL,
  overlay_stem TEXT,
  instructions TEXT[] NOT NULL,
  scope_include TEXT[] NOT NULL,
  scope_exclude TEXT[] NOT NULL,
  source_types TEXT[] NOT NULL,
  criteria JSONB NOT NULL,
  profile_recipe JSONB NOT NULL,
  ssot_order TEXT[] NOT NULL,
  required_outputs scan_required_output[] NOT NULL,
  PRIMARY KEY (workspace_id, id, version),
  UNIQUE (workspace_id, ordinal),
  CHECK (ordinal >= 0),
  CHECK (btrim(id) <> ''),
  CHECK (version > 0),
  CHECK (btrim(name) <> ''),
  CHECK (btrim(description) <> ''),
  CHECK (overlay_stem IS NULL OR btrim(overlay_stem) <> ''),
  CHECK (cardinality(instructions) > 0),
  CHECK (cardinality(scope_include) > 0),
  CHECK (cardinality(source_types) > 0),
  CHECK (cardinality(required_outputs) > 0),
  CHECK (jsonb_typeof(criteria) = 'array'),
  CHECK (jsonb_typeof(profile_recipe) = 'object')
);

CREATE TABLE IF NOT EXISTS repository_indexes (
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

CREATE TABLE IF NOT EXISTS scan_runs (
  workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  id TEXT NOT NULL,
  ordinal INTEGER NOT NULL,
  profile_id TEXT NOT NULL,
  profile_version INTEGER NOT NULL,
  effective_profile JSONB,
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
  calibration_decisions JSONB NOT NULL DEFAULT '[]'::jsonb,
  completed_at TIMESTAMPTZ,
  graph_digest TEXT,
  finding_evidence JSONB,
  boundary_map JSONB,
  calibration_override_reason TEXT,
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
  CHECK (effective_profile IS NULL OR jsonb_typeof(effective_profile) = 'object'),
  CHECK (coverage IS NULL OR jsonb_typeof(coverage) = 'object'),
  CHECK (jsonb_typeof(calibration_decisions) = 'array'),
  CHECK (finding_evidence IS NULL OR jsonb_typeof(finding_evidence) = 'array'),
  CHECK (boundary_map IS NULL OR jsonb_typeof(boundary_map) = 'object'),
  CHECK (calibration_override_reason IS NULL OR btrim(calibration_override_reason) <> ''),
  CHECK (
    (status = 'in_progress' AND completed_at IS NULL AND graph_digest IS NULL AND finding_evidence IS NULL)
    OR
    (status = 'completed' AND completed_at IS NOT NULL AND graph_digest IS NOT NULL AND coverage IS NOT NULL AND finding_evidence IS NOT NULL)
  )
);

CREATE TABLE IF NOT EXISTS repository_files (
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

CREATE TABLE IF NOT EXISTS repository_chunks (
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

CREATE TABLE IF NOT EXISTS repository_symbols (
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
  CHECK (ordinal >= 0),
  CHECK (btrim(key) <> ''),
  CHECK (btrim(file_path) <> ''),
  CHECK (btrim(language) <> ''),
  CHECK (btrim(name) <> ''),
  CHECK (btrim(qualified_name) <> ''),
  CHECK (btrim(kind) <> ''),
  CHECK (parent_symbol_key IS NULL OR btrim(parent_symbol_key) <> ''),
  CHECK (start_line > 0),
  CHECK (start_column >= 0),
  CHECK (end_line >= start_line),
  CHECK (end_column >= 0),
  CHECK (btrim(producer_tool) <> ''),
  CHECK (btrim(producer_version) <> '')
);

CREATE TABLE IF NOT EXISTS repository_references (
  workspace_id TEXT NOT NULL,
  index_id TEXT NOT NULL,
  key TEXT NOT NULL,
  ordinal INTEGER NOT NULL,
  file_path TEXT NOT NULL,
  language TEXT NOT NULL,
  source_kind TEXT NOT NULL,
  kind TEXT NOT NULL,
  target_text TEXT NOT NULL,
  resolved_symbol_key TEXT,
  start_line INTEGER NOT NULL,
  start_column INTEGER NOT NULL,
  end_line INTEGER NOT NULL,
  end_column INTEGER NOT NULL,
  resolution_confidence TEXT NOT NULL,
  producer_tool TEXT NOT NULL,
  producer_version TEXT NOT NULL,
  PRIMARY KEY (workspace_id, index_id, key),
  UNIQUE (workspace_id, index_id, ordinal),
  FOREIGN KEY (workspace_id, index_id) REFERENCES repository_indexes(workspace_id, id) ON DELETE CASCADE,
  FOREIGN KEY (workspace_id, index_id, file_path) REFERENCES repository_files(workspace_id, index_id, path) ON DELETE CASCADE,
  CHECK (ordinal >= 0),
  CHECK (btrim(key) <> ''),
  CHECK (btrim(file_path) <> ''),
  CHECK (btrim(language) <> ''),
  CHECK (btrim(source_kind) <> ''),
  CHECK (btrim(kind) <> ''),
  CHECK (btrim(target_text) <> ''),
  CHECK (resolved_symbol_key IS NULL OR btrim(resolved_symbol_key) <> ''),
  CHECK (start_line > 0),
  CHECK (start_column >= 0),
  CHECK (end_line >= start_line),
  CHECK (end_column >= 0),
  CHECK (btrim(resolution_confidence) <> ''),
  CHECK (btrim(producer_tool) <> ''),
  CHECK (btrim(producer_version) <> '')
);

CREATE TABLE IF NOT EXISTS repository_dependencies (
  workspace_id TEXT NOT NULL,
  index_id TEXT NOT NULL,
  key TEXT NOT NULL,
  ordinal INTEGER NOT NULL,
  file_path TEXT NOT NULL,
  language TEXT NOT NULL,
  source_kind TEXT NOT NULL,
  kind TEXT NOT NULL,
  target_text TEXT NOT NULL,
  target_file_path TEXT,
  target_symbol_key TEXT,
  start_line INTEGER NOT NULL,
  start_column INTEGER NOT NULL,
  end_line INTEGER NOT NULL,
  end_column INTEGER NOT NULL,
  resolution_confidence TEXT NOT NULL,
  producer_tool TEXT NOT NULL,
  producer_version TEXT NOT NULL,
  PRIMARY KEY (workspace_id, index_id, key),
  UNIQUE (workspace_id, index_id, ordinal),
  FOREIGN KEY (workspace_id, index_id) REFERENCES repository_indexes(workspace_id, id) ON DELETE CASCADE,
  FOREIGN KEY (workspace_id, index_id, file_path) REFERENCES repository_files(workspace_id, index_id, path) ON DELETE CASCADE,
  FOREIGN KEY (workspace_id, index_id, target_file_path) REFERENCES repository_files(workspace_id, index_id, path) ON DELETE CASCADE,
  CHECK (ordinal >= 0),
  CHECK (btrim(key) <> ''),
  CHECK (btrim(file_path) <> ''),
  CHECK (btrim(language) <> ''),
  CHECK (btrim(source_kind) <> ''),
  CHECK (btrim(kind) <> ''),
  CHECK (btrim(target_text) <> ''),
  CHECK (target_file_path IS NULL OR btrim(target_file_path) <> ''),
  CHECK (target_symbol_key IS NULL OR btrim(target_symbol_key) <> ''),
  CHECK (start_line > 0),
  CHECK (start_column >= 0),
  CHECK (end_line >= start_line),
  CHECK (end_column >= 0),
  CHECK (btrim(resolution_confidence) <> ''),
  CHECK (btrim(producer_tool) <> ''),
  CHECK (btrim(producer_version) <> '')
);

CREATE INDEX IF NOT EXISTS workspaces_name_lookup_idx ON workspaces (lower(name));
CREATE INDEX IF NOT EXISTS workspaces_slug_lookup_idx ON workspaces (lower(slug));
CREATE INDEX IF NOT EXISTS nodes_graph_type_idx ON nodes (graph_id, type, id);
CREATE INDEX IF NOT EXISTS node_embeddings_workspace_model_node_idx ON node_embeddings (workspace_id, model, node_id);
CREATE INDEX IF NOT EXISTS node_embeddings_workspace_model_updated_idx ON node_embeddings (workspace_id, model, updated_at DESC);
CREATE INDEX IF NOT EXISTS edges_graph_from_idx ON edges (graph_id, from_id);
CREATE INDEX IF NOT EXISTS edges_graph_to_idx ON edges (graph_id, to_id);
CREATE INDEX IF NOT EXISTS categories_workspace_source_idx ON categories (workspace_id, source, id);
CREATE INDEX IF NOT EXISTS category_assignments_workspace_target_idx ON category_assignments (workspace_id, target_type, target_id);
CREATE INDEX IF NOT EXISTS feedback_events_workspace_created_idx ON feedback_events (workspace_id, created_at, id);
CREATE INDEX IF NOT EXISTS proposals_workspace_status_created_idx ON proposals (workspace_id, status, created_at DESC);
CREATE INDEX IF NOT EXISTS projections_workspace_type_idx ON projections (workspace_id, type, id);
CREATE INDEX IF NOT EXISTS scan_profiles_workspace_ref_idx ON scan_profiles (workspace_id, id, version DESC);
CREATE INDEX IF NOT EXISTS scan_runs_workspace_status_started_idx ON scan_runs (workspace_id, status, started_at DESC);
CREATE INDEX IF NOT EXISTS scan_runs_workspace_profile_idx ON scan_runs (workspace_id, profile_id, profile_version, started_at DESC);
CREATE INDEX IF NOT EXISTS repository_indexes_workspace_stage_updated_idx ON repository_indexes (workspace_id, stage, updated_at DESC);
CREATE INDEX IF NOT EXISTS repository_indexes_workspace_repo_commit_idx ON repository_indexes (workspace_id, repository_url, resolved_commit);
CREATE INDEX IF NOT EXISTS repository_files_workspace_index_path_idx ON repository_files (workspace_id, index_id, path);
CREATE INDEX IF NOT EXISTS repository_chunks_workspace_index_file_idx ON repository_chunks (workspace_id, index_id, file_path, ordinal);
CREATE INDEX IF NOT EXISTS repository_chunks_text_search_idx ON repository_chunks USING GIN (to_tsvector('simple', text));
CREATE INDEX IF NOT EXISTS repository_symbols_workspace_index_file_idx ON repository_symbols (workspace_id, index_id, file_path, ordinal);
CREATE INDEX IF NOT EXISTS repository_symbols_workspace_index_name_idx ON repository_symbols (workspace_id, index_id, qualified_name);
CREATE INDEX IF NOT EXISTS repository_references_workspace_index_file_idx ON repository_references (workspace_id, index_id, file_path, ordinal);
CREATE INDEX IF NOT EXISTS repository_references_workspace_index_target_idx ON repository_references (workspace_id, index_id, target_text);
CREATE INDEX IF NOT EXISTS repository_dependencies_workspace_index_file_idx ON repository_dependencies (workspace_id, index_id, file_path, ordinal);
CREATE INDEX IF NOT EXISTS repository_dependencies_workspace_index_target_idx ON repository_dependencies (workspace_id, index_id, target_text);
CREATE INDEX IF NOT EXISTS repository_dependencies_workspace_index_target_file_idx ON repository_dependencies (workspace_id, index_id, target_file_path);
CREATE INDEX IF NOT EXISTS nodes_finding_origin_scan_idx ON nodes ((metadata->'finding'->>'originScanId')) WHERE type = 'finding';
CREATE INDEX IF NOT EXISTS nodes_finding_fingerprint_idx ON nodes ((metadata->'finding'->>'fingerprint')) WHERE type = 'finding';
CREATE INDEX IF NOT EXISTS nodes_metadata_gin_idx ON nodes USING GIN (metadata);
CREATE INDEX IF NOT EXISTS edges_metadata_gin_idx ON edges USING GIN (metadata);
`;
