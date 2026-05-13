# Interaction Model

HiveMap is controlled through intent.

The human should not need to maintain the graph manually. The agent should not mutate the graph invisibly.

## Core Loop

```text
conversation
  -> capture policy
  -> agent proposal or graph command
  -> semantic graph update
  -> projection refresh
  -> human feedback
  -> agent interpretation
```

## Human Actions

| Action | Meaning | Direct graph mutation? |
|---|---|---|
| Move node | Spatial feedback/grouping hint | No |
| Mark unclear | Human cannot understand current item | No |
| Mark wrong | Human rejects current item/relationship | No |
| Mark important | Human wants attention preserved | No |
| Confirm | Human approves item as true | Category/proposal depending policy |
| Challenge | Human asks for critique | Category/proposal depending policy |
| Dive in | Human wants more detail | Projection command |
| Group | Human wants higher-level overview | Projection/proposal |
| Comment | Human gives natural-language feedback | No |
| Emergency edit | Human directly changes graph | Yes, secondary tooling |

## Agent Actions

| Action | Requirement |
|---|---|
| Add node | Must include reason and capture policy context |
| Add edge | Must reference existing nodes or create them explicitly |
| Assign category | Must include provenance |
| Create projection | Must reference graph ids |
| Interpret feedback | Must preserve original feedback event |
| Apply proposal | Must be distinguishable from proposal creation |

## Capture Modes

### Approved

The agent may prepare proposals. Human approval is required before graph mutation.

Use when correctness matters more than speed.

### Delegated

The agent may apply graph changes under the current task intent.

Use for exploratory sessions and POCs.

### Proposed

The agent produces a batch of proposed changes with explanations.

Use when the user wants to review the shape before saving.

### Custom

Project-defined policy.

Examples:

- capture only decisions and risks,
- capture only Banana/Law/Siren items,
- capture everything tagged with a project category,
- never apply agent inference without Opera category.

## Feedback Interpretation

Feedback events are evidence, not edits.

Examples:

- `node_moved` near another node can suggest a relation or grouping.
- `node_marked: unclear` can suggest better label, notes, or a dive-in view.
- `edge_marked: wrong` can propose edge deletion or relation change.
- `map_comment` can create a proposal batch.
- `group_requested` can create an overview concept.

## Proposal Review

A proposal should contain:

- id,
- created time,
- source feedback ids,
- proposed graph commands,
- explanation,
- risk/category impact,
- status.

Statuses:

- `pending`
- `approved`
- `rejected`
- `applied`
- `superseded`

## UI Principles

- Show few overview concepts first.
- Make categories visible without dominating the map.
- Put detail behind dive-in.
- Keep emergency edit out of the main path.
- Show provenance where trust matters.
- Show agent speculation as speculation.
- Make wrong/unclear feedback cheap.
