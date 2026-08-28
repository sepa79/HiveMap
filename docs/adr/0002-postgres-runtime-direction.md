# ADR 0002 — Postgres Runtime Direction

## Status

Accepted

## Context

HiveMap alpha currently runs as a local SQLite-backed runtime shared between the REST API and MCP process. That shape was acceptable for local evaluation, but it hard-codes a storage contract and process model that do not fit the next delivery goal:

- one container-friendly runtime,
- local Docker validation,
- HiveForge deployment,
- a later hosted MCP work unit, now implemented as protected stateless `/mcp` in the shared HTTP runtime.

The project also already has a portable ZIP export/import contract, which is a cleaner migration boundary than a live database upgrade path.

Vector-assisted features remain interesting for HiveMap, but provider choice, embedding generation, and similarity UX are not required to complete the base runtime/container track.

## Decision

HiveMap 1.0 runtime direction moves to Postgres as the only supported runtime database backend.

`pgvector` remains part of the target backend direction, but embedding generation and vector-assisted product behavior are deferred from the current execution track.

The migration boundary between the current SQLite alpha and the future Postgres runtime is the existing canonical ZIP export/import contract. HiveMap will not implement a direct live SQLite-to-Postgres migration path.

The near-term local runtime target is one self-contained container that bundles the HiveMap API, built web assets, Postgres, and the built-in repository indexing and scan handlers. These handlers are normal application capabilities, not a runtime plugin system. Optional persistence may come from a mounted filesystem path for Postgres data, but the default user experience should be: run one container and HiveMap works.

The container owns the bundled Postgres lifecycle. Its PID 1 supervisor must
forward termination to the API, wait for the API to exit, stop Postgres with
`pg_ctl`, and return the API exit status. Container stop is not allowed to
replace the supervisor with the Node process or abandon Postgres to an unclean
shutdown.

HiveForge supplies the shared REST/MCP bearer credential as the external Docker
secret `hivemap-auth-token`, exposed to the application through
`HIVEMAP_AUTH_TOKEN_FILE`. Repository-local development may use
`HIVEMAP_AUTH_TOKEN`; the two sources are mutually exclusive. Rendered stack
files must contain only the secret name and mount path, never its value.

Bundled model-serving, provider-backed embedding generation, and a general runtime plugin system are not part of the current base contract. The removed experiment is preserved as inactive, restorable evidence under `archive/deferred-ollama-embedding-provider/`; restoring it requires a new explicit decision and contract review.

That local runtime must not require the user to configure separate database URLs or database file paths. The container boundary replaces the current `--db` and `.hivemap/local.sqlite` setup.

ZIP export remains a normal download flow.

Local `stdio` MCP is not part of the target runtime shape for this track.

The runtime/storage refactor must introduce an explicit storage interface so runtime, REST, and MCP logic stop depending on a SQLite-specific concrete store type.

## Consequences

- SQLite stops being a supported runtime destination instead of remaining a parallel backend.
- Storage and runtime docs must stop presenting SQLite as the intended end state.
- ZIP import/export portability becomes part of the runtime migration contract, not just a sharing feature.
- The repository needs explicit container startup, initialization, and healthcheck behavior before HiveForge work.
- Local runtime packaging prioritizes one self-contained container over user-managed multi-service local setup.
- Repository indexing and scan handlers ship as built-in HiveMap capabilities without a plugin-loading contract.
- Model-serving and provider-backed embedding generation do not add runtime processes or configuration to the base image.
- Local `stdio` MCP should not be preserved as part of the new base runtime contract.
- The current whole-workspace read/modify/write model becomes a design risk that must be addressed explicitly during the Postgres implementation slice.

## Alternatives Considered

### Keep SQLite and add Postgres later

Rejected because it preserves duplicate runtime paths and slows the container/HiveForge path with extra compatibility surface.

### Build a direct database migration path

Rejected because the repo already has a portable, validated ZIP contract that preserves semantic state without coupling migration to one physical schema.

### Pull embeddings into the base runtime track

Rejected for now because provider selection and embedding lifecycle work would delay the core storage/container upgrade.
