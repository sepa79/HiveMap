# Engineering Rules

## Purpose

This document defines mandatory implementation rules for HiveMap 1.0.

It complements the product and architecture contracts. It does not replace
them, and it must not become a second source of truth for domain behavior.

The goal is to prevent the production codebase from accumulating POC-shaped
coupling as new runtime, storage, scan, API, MCP, and UI behavior is added.

## Core Rule

Every file and module must own one coherent responsibility.

The default shape is:

- one class per file,
- one module concern per file,
- one explicit boundary per adapter,
- no kitchen-sink files that combine unrelated orchestration, validation, IO,
  domain mutation, and presentation behavior.

This rule applies prospectively. Untouched legacy or POC files do not require a
standalone cleanup, but a materially changed mixed-responsibility production
file must be split as part of the change.

## Local Responsibility Header

Every new or materially changed runtime coordinator, storage adapter,
transport adapter, boundary parser or validator, projection builder, repository
scan coordinator, and subsystem controller begins with a concise header:

```ts
/**
 * Responsibility: <one owned concern>.
 * Must not: <adjacent concerns owned elsewhere>.
 * Contract: <closest durable contract document>.
 */
```

The header is a local ownership contract. It is not a substitute for
`docs/specs/*`, `docs/architecture.md`, or `docs/product/vision.md`.

Do not broaden a header to excuse a second responsibility. Update the durable
contract when the boundary changes, then extract a module if the new behavior
belongs elsewhere.

Responsibility headers are not required for:

- tests,
- generated files,
- package barrel exports,
- files containing only tightly related types or constants,
- trivial application bootstrap files that only compose dependencies.

## File Shape

### One Class Per File

If a class exists, it gets its own file.

Tiny value objects may share a file only when they are meaningless apart from
each other and the file still owns one responsibility. This exception must
remain rare.

### One Responsibility Per File

A production file may own one coherent concern, for example:

- one graph command validator,
- one projection builder,
- one capture-policy evaluator,
- one scan-profile validator,
- one persistence adapter,
- one REST or MCP transport adapter,
- one UI component or controller,
- one narrowly scoped utility.

A file must not simultaneously own combinations such as:

- transport routing and graph invariants,
- storage IO and domain policy,
- repository crawling and scan-finding validation,
- projection layout and semantic graph mutation,
- UI rendering and direct persistence writes,
- authentication policy and unrelated application orchestration.

Do not create vague dumping grounds such as `utils.ts`, `helpers.ts`,
`misc.ts`, or `common.ts`. Name files after the responsibility they own.

## Contracts First

When behavior, architecture, persistence, or a public boundary changes, update
the owning documentation or typed contract before or in the same change. Code
is not complete while its durable contract describes different behavior.

Public and durable boundaries belong in their owning source of truth:

- product intent in `docs/product/vision.md`,
- architecture and dependency direction in `docs/architecture.md`,
- REST, MCP, storage, graph, projection, category, capture, and scan behavior in
  `docs/specs/*`,
- engineering shape in this document.

Do not use comments, tests, implementation details, chat, or HiveMind as the
only definition of a durable contract.

## Dependency Direction

Dependencies must be explicit and acyclic at subsystem boundaries.

The preferred direction is:

```text
typed contracts and domain invariants
  -> projections, categories, capture, and scan validation
  -> storage and repository-IO adapters
  -> runtime orchestration
  -> REST, MCP, and UI boundaries
```

Adapters may depend inward on contracts. Domain modules must not depend outward
on HTTP, MCP, browser, filesystem, process, or database implementations.

If two modules require each other directly, stop and correct the boundary. Do
not hide the cycle behind a shared singleton, dynamic import, callback registry,
or incidental initialization order.

## No Hidden Coupling

Modules must not depend on:

- implicit global mutable state,
- incidental import or startup order,
- DOM queries reaching into unrelated UI ownership,
- hidden writes into another subsystem's state,
- process environment reads outside application or adapter boundaries,
- duplicated REST and MCP business logic,
- storage representations leaking into semantic graph contracts.

Dependencies, side effects, and authority changes must be visible in types and
module composition.

## HiveMap Authority Rules

### Semantic Graph

- The semantic graph owns confirmed concepts and relations.
- Projections consume graph data and derive views; they do not become semantic
  authority.
- Layout, selection, viewport, and other UI state must not mutate graph meaning.
- Human gestures produce typed feedback or intent. They do not bypass graph
  commands and validation.

### Runtime And Transports

- Runtime commands own application orchestration.
- REST and MCP translate transport input into the same typed runtime operations.
- Transport adapters validate their boundary and do not reimplement graph,
  capture, category, projection, or scan rules.
- Authentication and transport lifecycle remain boundary concerns, separate
  from domain behavior.

### Storage And IO

- Storage modules persist and hydrate explicit domain shapes; they do not invent
  missing semantic data or repair invalid records silently.
- Repository discovery, filesystem access, network access, and database access
  remain at IO boundaries.
- Scan modules own profile, coverage, evidence, finding, and comparison
  validation. They do not crawl repositories or perform hidden IO.

### UI

- UI modules render projections and emit typed intent or feedback.
- UI convenience state is not a second graph store.
- Direct manual graph mutation remains explicit emergency tooling and must not
  become the default interaction path.

## TypeScript Rules

- Keep types close to the boundary they describe.
- Do not duplicate a contract shape across packages; import or generate it from
  its canonical owner.
- Prefer named types for public and cross-module data.
- Parse and normalize untyped input once at the boundary, then use typed values
  internally.
- Keep validation explicit and exhaustive. Invalid variants fail fast.
- Keep side-effect-free transformations separate from IO orchestration.

## Growth Rule

Before adding behavior, ask:

1. Which module owns it?
2. Which durable contract defines it?
3. Does it fit the target file's responsibility header unchanged?
4. Would the change mix domain, IO, transport, or presentation concerns?
5. Does it introduce an outward dependency into a lower-level module?

If the behavior does not fit cleanly, create or extract the appropriate module
before continuing.

## Verification Rule

Meaningful changes require verification evidence matched to the changed
surface:

- contract and domain changes need focused tests,
- storage changes need real Postgres coverage when persistence behavior matters,
- REST/MCP changes need boundary-level transport tests,
- container and deployment changes need built-image or rendered-stack checks,
- UI behavior changes need relevant automated checks and visual inspection when
  appearance or interaction changed.

State unverified areas explicitly. A passing unrelated suite is not evidence
for the changed boundary.

## Review Rejection Rules

Reject a change when it introduces:

- mixed responsibilities in one production file,
- a missing or inaccurate required responsibility header,
- undocumented durable behavior or boundary changes,
- duplicated contract or business logic,
- hidden cross-subsystem mutation,
- bidirectional subsystem coupling,
- projection or UI authority over semantic truth,
- domain policy inside storage or transport adapters,
- scan IO inside scan-validation modules,
- verification evidence that does not exercise the changed path.

When in doubt, keep the boundary explicit, split the responsibility earlier,
and accept a few focused files instead of one convenient mixed module.
