/**
 * Responsibility: Expose the canonical public storage contracts, adapters, deterministic serialization, and schema versions.
 * Must not: Implement adapters, validation, migrations, or runtime behavior.
 * Contract: Re-exports each storage concern from its single owning module.
 */
export { stableJson } from "./stable-json.js";
export type {
  ConceptEmbeddingRecord,
  HiveMapStore,
  HiveMapStoreRuntimeConfig,
  RepositoryChunkRecord,
  RepositoryDependencyRecord,
  RepositoryFileRecord,
  RepositoryIndexMode,
  RepositoryIndexRecord,
  RepositoryIndexStage,
  RepositoryReferenceRecord,
  RepositorySearchMatchRecord,
  RepositorySymbolRecord,
  SimilarConceptMatchRecord,
  WorkspaceRecord,
  WorkspaceState,
} from "./contracts.js";
export { InMemoryHiveMapStore } from "./in-memory-store.js";
export { describePostgresTarget } from "./postgres-target.js";
export { PostgresHiveMapStore, openHiveMapStore } from "./postgres-store.js";
export { POSTGRES_STORAGE_SCHEMA_VERSION } from "./schema.js";
export { StorageError } from "./storage-error.js";
export { validateWorkspaceState } from "./store-support.js";
