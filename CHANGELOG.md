# Changelog

## 0.2.0 - 2026-09-07

- Display the build's package version beside the HiveMap wordmark, including before authentication.
- Align root/workspace versions, internal dependency pins, and MCP server identity to `0.2.0`.
- Retain the single-operator scope and first released Postgres schema `1` from the alpha candidate below; this version change requires no database migration.
- See [0.2.0 acceptance evidence](docs/evidence/release-0.2.0-acceptance.md) for verification and the controlled HiveForge update.

## 0.2.0-alpha.1 - 2026-09-07

Single-operator alpha for local evaluation, packaged as one Postgres-backed container. See [local and HiveForge acceptance evidence](docs/evidence/release-0.2.0-alpha.1-acceptance.md) for the tested candidate; GitHub publication is a separate gate.

### Added

- A shared Postgres runtime for REST and stateless Streamable HTTP MCP, with built web assets and repository indexing in one Docker image.
- Required bearer authentication for REST/MCP, direct-token and token-file configuration, and tab-scoped browser token save/use/clear.
- Safe HTTPS repository indexing at explicit Git refs, persisted file/chunk/symbol/dependency evidence, bounded retrieval, and explicit interrupted-index recovery.
- Scan calibration decisions, repository boundary-map artifacts, profile overlays and suggestions, criterion evidence recipes, finding validation, and completed-run comparison.
- HiveForge Docker/Swarm profiles and a development loop using immutable image identity and an explicit Git lease.
- A repeatable acceptance gate covering real PostgreSQL, profile renders, built-image REST/MCP behavior, browser interactions, restart persistence, SIGTERM, and storage outage/recovery.

### Changed

- Refreshed the workspace UI with boundary inspection, compact scan status, saved-view overflow selection, and explicit confirmed scan deletion.
- Separated scan profile, overlay, coverage, boundary-map, run/state, comparison, and evidence responsibilities behind the unchanged package exports.
- Aligned active documentation with the delivered runtime and marked first-pass designs as historical context.

### Fixed

- Repository URL/ref validation, credential-bearing URL rejection, concurrent index execution, and interrupted index handling.
- Graph/proposal/finding integrity checks and opaque REST path identifiers.
- Selection-triggered viewport reset, keyboard focus visibility, and browser acceptance checks for actual rendered surfaces and toolbar overflow.
- Dependency audit findings through the updated lockfile.

### Removed / Compatibility

- SQLite runtime support, application schema migrations, and all workspace/project ZIP import/export surfaces.
- Bundled Ollama, runtime plugin loading, and provider-backed embedding generation. Explicit caller-supplied embeddings and bounded similarity queries remain; provider integration is deferred.
- Postgres schema `1` is the first released database version. Earlier development markers are not supported release schemas; initialize a fresh dedicated database for this release. Later versions may add explicit migrations. This release has neither a migration chain nor workspace/project import/export.
- Multi-user authorization and project portability are outside this alpha. A shared development deployment may use an explicitly public test token; private deployments must use a private token, with the external Docker secret required by the normal HiveForge profile.

## 0.1.0 - 2026-08-07

- Added HiveMap MCP workspace discovery tools: `workspace_list`, `workspace_get`, and `workspace_resolve`.
- Added canonical workspace resolution by `id`, `slug`, or exact `name`, with stable machine-readable errors for not-found and ambiguous matches.
- Extended workspace metadata with optional `slug`, `archived`, and `updatedAt` fields to support lightweight discovery without loading full graphs.
- Bumped the SQLite storage schema to version `3` and added explicit migration from schema version `2`.
- Updated MCP, storage, REST, README, and tests to document and verify the new workspace discovery flow.
