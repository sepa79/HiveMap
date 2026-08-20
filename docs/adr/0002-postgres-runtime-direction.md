# ADR 0002 — Postgres Runtime Direction

## Status

Accepted

## Context

HiveMap alpha currently runs as a local SQLite-backed runtime shared between the REST API and MCP process. That shape was acceptable for local evaluation, but it hard-codes a storage contract and process model that do not fit the next delivery goal:

- one container-friendly runtime,
- local Docker validation,
- HiveForge deployment,
- later hosted MCP work.

The project also already has a portable ZIP export/import contract, which is a cleaner migration boundary than a live database upgrade path.

Vector-assisted features remain interesting for HiveMap, but provider choice, embedding generation, and similarity UX are not required to complete the base runtime/container track.

## Decision

HiveMap 1.0 runtime direction moves to Postgres as the only supported runtime database backend.

`pgvector` remains part of the target backend direction, but embedding generation and vector-assisted product behavior are deferred from the current execution track.

The migration boundary between the current SQLite alpha and the future Postgres runtime is the existing canonical ZIP export/import contract. HiveMap will not implement a direct live SQLite-to-Postgres migration path.

The near-term local runtime target is one self-contained container that bundles HiveMap, Postgres, plugins, and local model-serving dependencies such as Ollama plus `nomic-embed-text`. Optional persistence may come from a mounted filesystem path for Postgres data, but the default user experience should be: run one container and HiveMap works.

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
- Local `stdio` MCP should not be preserved as part of the new base runtime contract.
- The current whole-workspace read/modify/write model becomes a design risk that must be addressed explicitly during the Postgres implementation slice.

## Alternatives Considered

### Keep SQLite and add Postgres later

Rejected because it preserves duplicate runtime paths and slows the container/HiveForge path with extra compatibility surface.

### Build a direct database migration path

Rejected because the repo already has a portable, validated ZIP contract that preserves semantic state without coupling migration to one physical schema.

### Pull embeddings into the base runtime track

Rejected for now because provider selection and embedding lifecycle work would delay the core storage/container upgrade.
