/**
 * Responsibility: Publish the canonical Postgres runtime schema version.
 * Must not: Execute migrations, infer compatibility, or validate stored records.
 * Contract: docs/specs/storage-format.md defines version 1 as the first released schema and owns future migration policy.
 */
export const POSTGRES_STORAGE_SCHEMA_VERSION = "1";
