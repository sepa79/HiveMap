# AGENTS.md — HiveMap

This repository contains HiveMap and the throwaway POC that validated the concept.

## Core Rules

- Keep the semantic graph as the source of truth.
- Keep UI projections separate from graph semantics.
- Treat human gestures as feedback for the agent, not direct semantic mutations.
- Keep capture intentional and controlled by user intent.
- Do not turn POC shortcuts into 1.0 architecture without recording the learning and decision.
- No silent fallbacks.
- One SSOT per contract, schema, and runtime concern.

## Repository Layout

- `poc/`: delivered throwaway proof of concept.
- `docs/`: product and architecture notes for the next implementation.
- `apps/`: future runnable applications.
- `packages/`: future shared packages.

## Working Rules

- Read `docs/README.md` and relevant POC learnings before implementation.
- Record durable learnings in HiveMind when available.
- Keep POC artifacts intact unless explicitly replacing them.
- Do not commit generated build output or dependency directories.
