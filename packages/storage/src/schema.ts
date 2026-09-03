/**
 * Responsibility: Publish the canonical Postgres runtime schema version.
 * Must not: Execute migrations, infer compatibility, or validate stored records.
 * Contract: Version changes accompany explicit storage-format docs and require a clean database rather than migration.
 */
export const POSTGRES_STORAGE_SCHEMA_VERSION = "17";
