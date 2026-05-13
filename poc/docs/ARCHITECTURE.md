# Architecture — HiveMap POC

This file is the starting SSOT for architecture.

Keep it concise. Link to deeper docs/specs when needed.

## Purpose

Validate intentional AI-assisted capture into a visual concept graph.

## Architecture principles

- Keep boundaries explicit.
- Keep contracts/specs as SSOT.
- Prefer simple, observable flows.
- Prefer explicit configuration over hidden defaults.
- Avoid hidden synchronous dependencies.
- Avoid fallback chains that hide real failures.
- Design retries with idempotency, backoff, limits, and visibility.
- Make recovery and debugging possible.

## System overview

```text
AI agent/human
  -> HTTP API
  -> graph.json/view.json/events.jsonl
  -> React Flow UI
  -> feedback events
  -> AI agent interprets feedback and updates graph
```

## Main components

| Component | Responsibility | Notes |
|---|---|---|
| API server | Validate requests and persist graph/view/feedback | Express, local-only |
| Graph store | Read/write JSON files | One store module owns file IO |
| UI | Display graph and emit feedback events | React Flow |
| Data files | POC persistence | Not production storage |

## Boundaries

- `server/graph-store.ts`: storage side effects and validation.
- `server/index.ts`: HTTP boundary.
- `src/`: browser UI and API client.

## Data model

The semantic graph is independent from view state.

- Graph nodes and edges describe meaning.
- View nodes describe canvas position.
- Feedback events describe user gestures for later agent interpretation.

## APIs / contracts / specs

Canonical specs live under:

- `docs/specs/`

Do not create duplicate contract definitions without documenting why.

## Runtime / deployment

Local development only.

## Observability

Console logs and `data/events.jsonl` are enough for the POC.

## Failure modes

- Invalid graph data should fail clearly.
- Missing required data should fail clearly.
- UI layout changes must not directly mutate graph semantics.

## Open architecture questions

- Which feedback gestures are useful enough for 1.0?
- Does React Flow remain the right surface once feedback is agent-mediated?
- Is REST enough for POC, or should 1.0 expose MCP first?
