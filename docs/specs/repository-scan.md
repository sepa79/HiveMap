# Repository Scan Contract

Repository scans are agent-executed, auditable work units that populate a HiveMap semantic graph. HiveMap instructs, validates, persists, compares, imports, and exports scans; it does not silently crawl or interpret a repository.

## Ownership

- The agent discovers and reads repository sources, interprets criteria, and submits explicit graph and finding operations.
- The scan domain owns profiles, run lifecycle, coverage, finding metadata, and comparison semantics.
- The semantic graph owns active findings. A finding is a graph node with type `finding`.
- Completed scan evidence is immutable historical evidence, not a second active finding store.
- Storage owns ZIP and database IO.
- MCP/API validate every boundary and expose failures.
- Direct `scan_finding_create` graph mutation requires delegated capture. Other capture modes must use the existing proposal/approval flow.

## Scan Profile

A versioned `ScanProfile` contains:

- stable id, positive version, name, and description;
- ordered human/agent instructions;
- include and exclude glob criteria;
- source types the agent must consider;
- ordered scan criteria with stable ids and descriptions;
- SSOT precedence patterns;
- required output ids.

Profiles describe repeatable discovery rules. They must not freeze the file inventory from a previous run.

The MVP includes `documentation-conflicts@1` and `code-quality-review@1` profiles in every new workspace.

## Scan Run Lifecycle

```text
scan.start
  -> in_progress run + resolved profile and instructions
  -> scan.record_coverage
  -> graph commands and scan.finding_create/update
  -> scan.complete validation
  -> immutable evidence snapshot
```

A run identifies the repository root, optional repository URL, branch, source revision, optional dirty-worktree digest, agent, tool, and timestamps.

Completion requires:

- non-empty discovered and included source inventories;
- every included and excluded source to exist in the discovered inventory;
- explicit reasons for exclusions and read failures;
- every profile criterion to appear in `appliedCriteria`;
- all required outputs to be declared;
- every referenced finding to exist as a valid finding node originating in the run.

Completed runs cannot be modified.

## Coverage

Coverage records discovered source targets, included source targets, excluded targets with reasons, and failed targets with reasons.

The next scan repeats profile discovery against the current repository. Prior coverage is evidence and a comparison baseline, not the current inventory.

## Finding Node

A finding node uses graph node type `finding`. Its metadata contains a `finding` object with:

- stable semantic fingerprint;
- kind, severity, confidence, and lifecycle status;
- origin scan id and criterion ids;
- one or more bounded source claims;
- affected graph node ids;
- optional expected owner and recommended action;
- optional resolution evidence.

Conflict findings require at least two source claims. Marking a finding `resolved` requires non-empty resolution evidence. A later complete scan may also prove resolution by no longer producing the fingerprint under equivalent coverage and criteria.

Finding kind is the machine-readable problem family. Documentation-oriented scans may use `conflict`, `stale`, `missing`, `ambiguous`, `broken-reference`, `duplicate-authority`, `implementation-drift`, and `quality-problem`. Technical scans may also use:

- `architecture-risk`: a system shape, ownership boundary, coupling pattern, or module split is likely to cause defects or expensive change;
- `runtime-risk`: live execution, scheduling, state ownership, async behavior, or runtime lifecycle can drift from the contract or fail under realistic operation;
- `authority-gap`: command, permission, ownership, or trust boundaries are enforced in the wrong layer or are incomplete;
- `test-gap`: a material contract, failure mode, runtime path, or regression risk lacks direct verification;
- `deployment-risk`: packaging, environment, release, hosting, or operational configuration can fail or diverge from documented behavior.

Use the most specific kind that explains the required cleanup. Keep `implementation-drift` for observed code/contract mismatch, and use the risk kinds when the problem is primarily architectural or operational pressure that may not yet be a direct failing behavior.

## Finding Presentation

Repository-scan overview projections are findings-first. The primary canvas grouping is a set of explicit priority columns with large in-map headers: `Critical`, `High`, `Medium`, and `Low`. Their stable group ids are `severity-critical`, `severity-high`, `severity-medium`, and `severity-low`; the stored `normal` severity is presented to humans as `Medium`. Finding kind remains visible on each card and in details as the secondary answer to what kind of cleanup is required.

Finding cards render the human title separately from machine-oriented tags. The title uses reading typography; finding kind and human severity use distinct monospace pills with severity-aware emphasis. Do not concatenate title, kind, and severity into one undifferentiated label string.

The map header explains what the current projection contains and the next available interaction. Clicking a finding node opens its dive-in directly; selecting a raw node without changing the projection is not sufficient finding navigation.

The findings overview and finding dive-in carry projection-owned orientation notes rendered as large note nodes. An overview note explains what the review map is for, how priority columns and finding kinds differ, how to open evidence, and how to return. It is exported with the workspace.

Workspace and projection ids are encoded in browser history. Opening a finding pushes its dive-in URL; both the application Back button and browser Back restore the previous projection. Direct projection URLs fail visibly when the workspace or projection does not exist.

A finding dive-in uses `affectedNodeIds` to show the finding beside the bounded project concepts it affects. Claims, owners, recommendations, and document/code references remain detail annotations. The UI must not duplicate them as semantic nodes or edges merely to obtain a convenient layout.

## Scan Comparison

Comparison matches finding evidence by fingerprint and reports `resolved`, `still_open`, `changed`, `new`, `regressed`, and `unverifiable` results.

Runs must use the same profile id. A profile version change remains visible in the comparison and prevents an unconditional pass verdict.

The MVP pass policy requires no still-open, regressed, or new high/critical findings, no unverifiable results, and equal profile versions.

## ZIP Bundle

A `.hivemap.zip` contains:

```text
manifest.json
workspace.json
graph.json
findings.json
SUMMARY.md
comparisons/<before-scan-id>--<after-scan-id>.json
scans/<scan-id>/run.json
scans/<scan-id>/coverage.json
scans/<scan-id>/instructions.md
scans/<scan-id>/repeat-scan.md
```

`workspace.json` is canonical. Other JSON/Markdown files are declared generated projections. Import validates schema version, every checksum, the canonical workspace state, and generated graph/findings equality.

Import modes are explicit: `new` fails if the workspace exists; `replace` replaces a workspace with the same id. There is no silent merge or id rewriting.

## Repeatability

Every export includes the selected profile, original coverage, repository identity, scan criteria, and exact MCP operation sequence required to repeat the scan. The repeat scan must rediscover sources from profile rules and compare the new completed run with the imported baseline.
