# Specs / Contracts

This directory is the canonical home for HiveMap contracts.

## Required Specs

Create or update a spec before implementing the corresponding behavior:

- Graph model.
- Graph commands.
- Capture policy.
- Feedback events.
- Category catalog and assignments.
- Projection/view model.
- Snapshot format.
- MCP tools.
- REST API.
- Storage format.

## Rules

- One canonical spec per contract.
- Implementation follows the spec.
- Generated/shared types must point back to the source spec.
- Do not duplicate validators or DTOs for the same concern.
- Breaking changes must be explicit.

## Initial Spec List

- `graph-model.md`
- `capture-policy.md`
- `feedback-events.md`
- `category-overlay.md`
- `projection-model.md`
- `mcp-tools.md`
- `storage-format.md`
