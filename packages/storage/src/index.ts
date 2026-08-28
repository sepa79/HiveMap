/**
 * Responsibility: Expose the canonical public storage contracts, adapters, bundle API, and schema versions.
 * Must not: Implement adapters, validation, migrations, or runtime behavior.
 * Contract: Re-exports each storage concern from its single owning module.
 */
export {
  BundleValidationError,
  HIVEMAP_BUNDLE_FORMAT_VERSION,
  HIVEMAP_LOGICAL_STATE_VERSION,
  createWorkspaceBundle,
  parseWorkspaceBundle,
  readWorkspaceBundle,
  stableJson,
  writeWorkspaceBundle,
  type BundleManifest,
  type WorkspaceBundle,
} from "./bundle.js";
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
export { POSTGRES_STORAGE_SCHEMA_VERSION, STORAGE_SCHEMA_VERSION } from "./schema.js";
export { StorageError } from "./storage-error.js";
export { validateWorkspaceState } from "./store-support.js";
