/**
 * Responsibility: Publish canonical logical and Postgres storage schema versions.
 * Must not: Execute migrations, infer compatibility, or validate stored records.
 * Contract: Version changes accompany explicit storage-format docs and migration behavior.
 */
export const STORAGE_SCHEMA_VERSION = "4";
export const POSTGRES_STORAGE_SCHEMA_VERSION = "16";
