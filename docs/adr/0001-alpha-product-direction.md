# ADR 0001 — Alpha Product Direction

## Status

Accepted

## Context

The POC proved that HiveMap works as a visual companion to AI conversation. It also showed that flat maps become noisy, direct manual editing breaks the intended information flow, and categories matter once a conversation becomes project reasoning.

## Decision

HiveMap alpha will start as a Conversation Map.

When the conversation is about a project, the same graph naturally becomes a Project Map through additional categories and projections. Project Map is not a separate product at this stage.

Default capture policy is `delegated`.

MCP is the primary agent interface.

SQLite is the first real persistence layer.

Implementation starts with core packages and TDD before API/UI:

- `graph-core`
- `categories`
- `capture`
- `projections`

Categories use stable semantic ids such as `confirmed`, `inferred`, `risk`, and `unknown`. Playful names/icons such as Banana, Opera, and Jester are deferred to an icon/display theme.

## Consequences

- The first slice must make delegated capture reliable and inspectable.
- REST, if added, must share command handlers with MCP.
- Storage design targets local-first SQLite.
- UI work should wait until core graph/category/capture/projection behavior is tested.
- Category display can be expressive later without contaminating core data ids.
