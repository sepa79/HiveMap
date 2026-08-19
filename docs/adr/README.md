# Architecture Decision Records

Use this directory for durable architecture decisions that are too stable or too cross-cutting to leave only in chat, commits, or temporary planning notes.

For HiveMap:

- product invariants stay in `AGENTS.md` and `docs/product/vision.md`
- contract details stay in `docs/specs/*`
- architecture direction stays in `docs/architecture.md`
- ADRs capture explicit decisions that change or clarify those sources

Keep ADRs short, decision-oriented, and dateable. Prefer one decision per file.

Naming:

- start with the next zero-padded number, for example `0002-...`
- keep the title short and technical

Current repo history starts with `0001-alpha-product-direction.md`.

## ADR template

```markdown
# ADR-000 — Decision title

## Status

Proposed | Accepted | Rejected | Superseded

## Context

TODO

## Decision

TODO

## Consequences

TODO

## Alternatives considered

TODO
```
