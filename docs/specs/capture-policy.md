# Capture Policy

Capture policy controls what information may enter HiveMap.

## Modes

- `approved`: save only human-approved information.
- `delegated`: the agent chooses what is worth saving. This is the alpha default.
- `proposed`: the agent suggests graph changes before applying them.
- `custom`: project-defined policy with explicit rules.

## Policy Shape

```ts
type CapturePolicy = {
  id: string;
  mode: "approved" | "delegated" | "proposed" | "custom";
  rules?: string[];
};
```

`delegated` is the default alpha policy.

`custom` policies must include at least one explicit rule.

## Rule

Agent capture must always be explainable as a policy-bound graph command.

No automatic transcript ingestion by default.

## Policy Decision

Given interpreted agent intent and proposed graph commands:

- `delegated` may apply valid graph commands directly.
- `approved` and `proposed` must create a proposal before mutation.
- `custom` must follow its explicit rules; if rules cannot be evaluated by the caller, create a proposal.
