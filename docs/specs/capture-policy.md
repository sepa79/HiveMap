# Capture Policy

Capture policy controls what information may enter HiveMap.

## Modes

- `approved`: save only human-approved information.
- `delegated`: the agent chooses what is worth saving. This is the alpha default.
- `proposed`: the agent suggests graph changes before applying them.
- `custom`: project-defined policy with explicit rules.

## Rule

Agent capture must always be explainable as a policy-bound graph command.

No automatic transcript ingestion by default.
