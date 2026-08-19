# PR Preparation

Before preparing a PR or final change summary:

## Required hats

- Reviewer Hat
- Jester Hat

## Add when relevant

- Architect Hat for architecture/contracts/boundaries/deployment.
- Tester Hat for test strategy or bug fixes.
- Debugger Hat for incidents/flaky behavior.
- Refactor Hat for structure-only changes.

## Checklist

- Scope stayed inside the task.
- Relevant docs were read.
- Relevant specs/contracts were updated.
- Relevant tests were added or updated.
- Commands were run from `docs/ai/COMMANDS.md`.
- Evidence was captured; for scan work that includes coverage/findings/comparison proof.
- Risks and TODOs are explicit.
- No secrets were added.
- No forbidden git actions were performed.
- HiveMind was updated if product/architecture learnings changed.
- Export/import, scan, or projection changes did not silently change IDs or semantics.

## Summary format

```text
Summary:
- ...

Tests:
- ...

Risks/TODOs:
- ...

Hats applied:
- Reviewer
- Jester
```
