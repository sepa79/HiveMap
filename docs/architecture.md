# HiveMap Architecture

This is the architecture direction for HiveMap 1.0. The POC is evidence, not a blueprint.

## Purpose

HiveMap turns intentional conversation capture into a persistent semantic graph and human-readable visual projections.

## Core Principle

The semantic graph is the source of truth. Everything visual is a projection.

```text
capture policy + human/agent intent
  -> validated graph command
  -> semantic graph
  -> projection/view model
  -> UI
  -> feedback event
  -> agent interpretation
  -> next graph command
```

## Main Components

| Component | Responsibility | Must not do |
|---|---|---|
| Graph Core | Node/edge model, validation, graph mutation commands | Store UI layout or agent guesses as truth |
| Capture | Capture policy, feedback events, agent intent events | Parse every message automatically by default |
| Categories | Category catalog and category assignment validation | Replace core node types |
| Projections | Overview concepts, dive-in views, and project map views | Mutate graph semantics |
| API/MCP | Explicit operations for agents and clients | Auto-switch protocols or hide failures |
| UI | Render projections and emit feedback | Become the semantic editor by default |
| Storage | Persist graph, views, feedback, proposals, scans, and repository-index evidence | Invent duplicate schemas |
| Scans | Profile agent scans, validate coverage/findings, compare immutable run evidence | Crawl repositories or replace agent interpretation |

## Data Model Direction

Core graph:

- `GraphNode`: stable id, label, node type, optional notes, metadata references.
- `GraphEdge`: stable id, source, target, relation type/label, optional notes.
- `CategoryAssignment`: graph item id, category id, provenance, status.
- `CapturePolicy`: approved, delegated, proposed, or project-specific policy.
- `FeedbackEvent`: user gesture/comment/selection signal for agent interpretation.
- `Projection`: named view over a graph, including overview and dive-in views.

Node type answers “what kind of graph object is this?”

Category answers “how should humans read/trust/react to this?”

## Projection Direction

Flat graphs are not the product.

HiveMap should default to:

1. Overview concepts.
2. Dive-in views for focused detail.
3. Category overlays for trust/risk/uncertainty/urgency.
4. Saved views for demos, history, and review.

## Integration Direction

HiveMap should remain independent from HiveMind.

- HiveMap stores concept graph and projections.
- HiveMind stores durable learnings, decisions, evidence, and workflow memory.
- They may reference each other through explicit ids or links.

No implicit coupling.

## Runtime Direction

Near-term engineering direction is:

1. run the runtime backend on Postgres,
2. package one self-contained local runtime container,
3. validate that runtime through HiveForge,
4. expose protected stateless Streamable HTTP MCP from the same HTTP runtime.

Workspace import/export is not part of the current runtime. HiveMap should not carry SQLite forward as a supported 1.0 runtime backend and does not provide an application-level migration bridge from the historical SQLite alpha.

The first released Postgres schema is `1`. Earlier development markers are not supported release versions. Future schema versions may add explicit migrations under `docs/specs/storage-format.md`; the first release has no migration chain.

The deferred portability direction is one versioned, incrementally validated NDJSON stream rather than an archive. A future full-project snapshot must carry canonical workspace state plus completed repository-index retrieval facts needed to continue agent work without repeating the semantic scan. Operational job state remains non-portable, and the editable repository checkout remains Git-owned: a receiving environment fetches the recorded immutable commit or receives a standard Git bundle through an explicit Git workflow.

`pgvector` remains part of the target backend direction, but embedding generation and vector-powered product behavior are a deferred workstream rather than a blocker for the base runtime/container slice.

For local operation, the intended user experience is one container that bundles the HiveMap REST API, stateless Streamable HTTP MCP endpoint, built web assets, Postgres, and the built-in repository indexing and scan handlers. REST and MCP share one process-owned runtime/store and one required bearer token. UI assets and health are public; semantic operations are protected. Those handlers are application capabilities, not a runtime plugin system. Optional persistence may come from a mounted filesystem path for Postgres data, but the default local workflow should not require separate database URLs, database file paths, or multi-service manual wiring. Model-serving and provider-backed embedding generation are deferred from this base runtime.

The single-process runtime uses one keyed operation coordinator. Every mutation owned by one workspace shares that workspace key, so concurrent REST and HTTP MCP requests cannot overwrite snapshots or race a workspace replacement against operational index state. Repository-index execution additionally acquires one process-global execution key, allowing at most one checkout/index operation across all workspaces while preserving workspace mutation ordering. A duplicate call for the same live execution fails explicitly; an explicit execute call against an active stage left by a prior process restarts that interrupted attempt. The installed topology remains one replica. Any future multi-process or multi-replica topology must add storage-visible compare-and-swap or lease contracts and deployment resource policy before it is supported.

Local `stdio` MCP is not part of the target runtime shape for this slice.

## Open Architecture Questions

- How should category assignment provenance be represented?
- What is the minimal projection schema for overview and dive-in views?
- How should agent proposals be reviewed before graph mutation?
