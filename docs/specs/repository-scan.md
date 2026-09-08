# Repository Scan Contract

Repository scans are agent-executed, auditable work units that populate a HiveMap semantic graph. HiveMap instructs, validates, persists, and compares scans; it does not silently crawl or interpret a repository.

## Ownership

- The repository indexer discovers repository files and derives bounded scan coverage from the selected completed repository index.
- The agent reads bounded scan sources/evidence packets, interprets criteria, and submits explicit graph and finding operations.
- The scan domain owns profiles, run lifecycle, coverage, finding metadata, and comparison semantics.
- The semantic graph owns active findings. A finding is a graph node with type `finding`.
- Completed scan evidence is immutable historical evidence, not a second active finding store.
- Storage owns database IO and persisted scan evidence.
- MCP/API validate every boundary and expose failures.
- Direct `scan_finding_create` graph mutation requires delegated capture. Other capture modes must use the existing proposal/approval flow.
- Finding-node lifecycle is scan-owned. Generic `graph_command` operations cannot create, update, or delete finding nodes. An approved proposal may create a finding only when applying it can atomically attach that node to its referenced in-progress scan; later changes use `finding_update`, and removal uses `scan_delete`.

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

An optional repository-local overlay may refine a built-in profile without changing the canonical workspace scan profile definition. In the current phase, the overlay path is `.hivemap/scan-profiles/<profile>.yaml`, where `<profile>` is the MCP-exposed overlay stem for the selected profile. The overlay appends repository-specific include and exclude globs to the built-in scope and may also replace repository-specific profile fields such as name, description, instructions, source types, criteria, SSOT order, required outputs, criterion-oriented evidence recipe fields, and boundary-map heuristics such as root-to-boundary rules, contract-doc markers, ignored match tokens, test-directory names, and entrypoint-detection suffix/path markers. Current examples of criterion-oriented recipe fields include duplicate-authority claim/topic selection, duplicate-responsibility symbol/path selection, missing-owner materiality markers, and stale-documentation currentness markers.

Boundary-map derivation treats a test file inside a configured test directory as part of a distinct test-suite boundary. A co-located file already classified as `test` belongs to the same structural boundary as the adjacent production code and is attached there as verifying evidence; it must not require a synthetic test-directory marker or create a second overlapping boundary root.

Only indexed `code` and `test` files seed structural boundaries. Documentation and configuration files may enrich an existing boundary, but placeholders and root configuration such as `.gitkeep`, package manifests, or compiler config must not create standalone structural boundaries.

Overlay rules are explicit:

- the overlay is resolved from the selected indexed repository revision, not from an untracked local working-tree file outside that revision;
- missing overlay means built-in profile defaults remain active;
- invalid overlay fails `scan.start` and `repository_evidence_candidates` clearly;
- when the overlay changes profile criteria or required outputs, the resolved effective profile is snapshotted onto the scan run so later validation uses the same immutable repository-index-backed contract;
- agents should discover the overlay contract through HiveMap MCP `scan_profile_overlay_help` instead of guessing file shape from repo docs.

Overlay tuning should also be repeatable:

- `scan_profile_overlay_help` should return a repository-agnostic overlay-build workflow that starts from `scan_start`, uses representative calibration evidence, applies the smallest field change that explains the mismatch, and restarts from the same completed repository index;
- `scan_profile_overlay_help` should also return symptom-to-field hints so the caller can choose between scope, SSOT, boundary-map, and criterion-oriented recipe changes deliberately instead of editing overlay YAML ad hoc;
- `scan_profile_overlay_suggest` should accept one in-progress scan plus one explicit calibration symptom and return the smallest repo-aware YAML scaffold for the matching overlay fields, seeded from the active effective profile and current boundary-map config instead of guessed values;
- the `boundary-map-heuristics` symptom must include test-directory configuration alongside contract and entrypoint fields, so an actual test-layout mismatch is not omitted from the suggested patch surface;
- the workflow should bias toward tuning recipe fields before broad include/exclude churn, and toward tuning SSOT precedence only after packet shape/currentness already look coherent.

## Scan Run Lifecycle

```text
scan.start
  -> resolve completed repository index + derive coverage
  -> in_progress run + resolved profile and instructions
  -> preliminary calibration gate
  -> optional repository_evidence_candidates retrieval per criterion
  -> optional scan_boundary_map_build review
  -> optional scan_finding_validate classification per suspected issue
  -> optional profile/overlay refinement or scan.record_coverage adjustment
  -> graph commands and scan.finding_create/update
  -> scan.complete validation
  -> immutable evidence snapshot
```

A run identifies the completed repository index when present, a synthetic runtime repository root, optional repository URL, requested branch/ref when known, source revision, optional dirty-worktree digest, agent, tool, and timestamps.

Start requires:

- one explicit completed `repositoryIndexId`;
- non-empty discovered and included source inventories derived from the selected repository index and effective profile rules.

Completion requires:

- non-empty discovered and included source inventories;
- every included and excluded source to exist in the discovered inventory;
- explicit reasons for exclusions and read failures;
- every profile criterion to appear in `appliedCriteria`;
- all required outputs to be declared;
- every declared typed artifact output to carry its matching validated artifact payload;
- every referenced finding to exist as a valid finding node originating in the run.
- for every run, `findingNodeIds` to equal exactly the active graph finding-node ids whose `originScanId` is that run id; neither side may contain an unlisted or differently owned finding.
- every active finding `affectedNodeIds` entry to resolve to an active non-finding node in the same semantic graph; commands and approved proposals that would leave a dangling reference or a finding-to-finding affected reference fail without persisting any part of the mutation.
- when a findings-bearing completion still has non-ready calibration, an explicit override reason recorded on the completed run.

Completed runs cannot be edited.

Any scan run may be removed explicitly with `scan_delete`. Deletion removes the run and atomically cascades through the semantic finding nodes owned by that run, their incident edges, affected projection membership, and category assignments targeting removed nodes, edges, or projections. A projection that had visible nodes and becomes empty, or that had root nodes and loses all of them through this cascade, is removed. The response reports every removed finding node, edge, and projection id. Deletion is never automatic and does not depend on an inferred age threshold.

## Preliminary Calibration Gate

The first repository-backed pass for a profile/revision pair is provisional until the agent confirms that the active profile shape matches the repository.

Before creating or completing findings, the agent should review:

- effective profile identity, criteria, required outputs, and overlay status from `scan_start`;
- coverage summary, included inventory shape, and calibration assessment from `scan_start`;
- decision guidance from `scan_start`, `repository_evidence_candidates`, or `scan_boundary_map_build`;
- bounded evidence candidates and their calibration assessment for representative criteria when they are available;
- candidate boundary-map output and its calibration assessment when the scan touches code/test/tool structure or when repository shape is unfamiliar.
- criterion-scoped `scan_finding_validate` output when the agent wants HiveMap to distinguish likely repository defects from remaining calibration gaps before creating a durable finding.

This gate exists to catch profile mismatches early, for example:

- fixture corpora or generated material treated as first-class product boundaries;
- root docs or CLI surfaces missing from the active profile scope;
- helper/test-only exports treated as public entrypoints;
- contract, tool, and test boundaries that are not being linked coherently.

If the preliminary pass shows that the repository shape is wrong, the agent must stop before filing final findings, refine the repository-local overlay or recorded coverage explicitly, delete the now-obsolete run when it has no review value, and restart the scan from the same completed repository index with a new scan id. Do not silently continue from a mis-scoped preliminary pass into `scan_complete`.

If a findings-bearing run is completed anyway while calibration remains `profile-gap`, `missing-evidence`, or `ambiguous-shape`, the completion must carry one explicit calibration override reason. The override is historical evidence that the run was frozen deliberately despite incomplete calibration; it is not a substitute for repository tuning.

MCP/API integrations should surface this as an explicit confirmation checkpoint between `scan_start` and final findings rather than assuming that derived coverage is automatically good enough on the first attempt.

The checkpoint is explicit:

- the caller records one calibration decision on the in-progress run: `continue`, `refine-overlay`, `correct-coverage`, `build-boundary-map`, or `restart-scan`;
- when the decision is `refine-overlay`, the preferred next step is `scan_profile_overlay_suggest` for one concrete symptom before editing repository-local YAML by hand;
- coverage correction should follow `correct-coverage`;
- boundary-map build should follow `build-boundary-map`;
- criterion-level finding validation should happen before `scan_finding_create` when the agent is still separating repository defects from calibration defects;
- findings and findings-bearing completion should follow `continue`, unless completion uses an explicit calibration override reason.

The returned calibration assessment should classify the current state as one of:

- `findings-ready`: calibration no longer indicates that the agent is looking at the wrong repository shape;
- `profile-gap`: profile, overlay, or explicit coverage still appears mis-scoped for the repository;
- `missing-evidence`: the calibrated run still lacks enough bounded evidence to support a durable finding;
- `ambiguous-shape`: repository structure remains too unclear to separate product defects from scan interpretation defects.

## Coverage

Coverage records discovered source targets, included source targets, excluded targets with reasons, and failed targets with reasons.

The next scan repeats profile discovery against the selected completed repository index. Prior coverage is evidence and a comparison baseline, not the current inventory.

When HiveMap can pre-select bounded evidence candidates for a criterion, the candidate packets are the preferred starting review unit. Coverage remains the bounded repository inventory, not a mandate that the agent must reread every included file on every run or a restriction to candidate packets alone.

`scan_start` and `repository_evidence_candidates` also return overlay resolution metadata and a coverage summary so the agent can tell whether built-in defaults or repository-local overrides were applied before interpreting results.

When a repository-backed code scan needs a first implementation boundary pass, `scan_boundary_map_build` should derive a candidate typed artifact from the current run coverage plus persisted repository facts. The agent reviews that candidate artifact and only then decides whether to submit it through `scan_complete`.

When the agent has one suspected bounded issue, `scan_finding_validate` should classify that criterion-level problem before durable finding creation. The returned state distinguishes:

- `likely-real-finding`: the calibrated run and bounded packets now look strong enough that the next step is human/agent judgment on the actual repository problem;
- `profile-gap`: the active profile, overlay, or explicit coverage still looks wrong for the repository, so the scan should be tuned instead of frozen into a finding;
- `missing-evidence`: the current calibrated scope still lacks bounded packets strong enough to support a durable finding for that criterion;
- `ambiguous-shape`: repository structure still looks too unclear to separate a real defect from scan interpretation noise.

## Automated Scan Limits And Agent Enrichment

Automated indexing, evidence selection, and boundary-map derivation provide a bounded starting point, not an exhaustive semantic review. Results depend on the indexed revision, supported syntax, profile scope, selection heuristics, and result limits. Empty candidate lists, `findings-ready` calibration, and successful scan completion do not prove that a repository has no defects or that its behavior works.

For example, Java syntax facts come from Tree-sitter. The current `duplicate-responsibility` selector groups allowed top-level exported/public symbols by normalized name across covered code files; dependency facts help rank and explain those groups. Differently named implementations of the same responsibility, private or nested implementations, and excluded sources can be missed. Repeated names also require interpretation before claiming duplicated ownership.

The agent may always perform its own repository analysis and enrich the map through explicit MCP operations, even when automated candidates exist or calibration is ready. It must investigate beyond candidate packets when user feedback, code, documentation, or its own reasoning raises doubts about completeness, ownership, duplication, or behavior. Compare implementations, callers, contracts, and relevant tests by responsibility and observed effects, not only symbol names.

Evidence added to a scan must match its recorded revision and explicit coverage. Correct coverage through the calibration workflow when needed; use a new index/run for a changed revision and a new run for a completed baseline. Broader map enrichment remains possible outside the current scan, with explicit source revisions and scope; do not silently count it as evidence covered by that run.

Use `graph_command` to enrich concepts, relationships, and source references under the active capture policy, or the proposal/approval flow where required. Findings follow `scan_finding_validate` and `scan_finding_create`. The current validator assesses criterion-level prepared packets; it does not accept agent-supplied evidence as input. If independent analysis remains `missing-evidence`, `profile-gap`, or `ambiguous-shape`, retain the bounded investigation as an open `question` with source references and the validation limitation, rather than bypassing finding validation or presenting a suspicion as confirmed. See [the operational workflow](../ai/REPOSITORY_SCAN_WORKFLOW.md#agent-led-analysis-and-map-enrichment).

Claims that behavior works require relevant executed tests or observed runtime effects, with their revision, scope, results, and remaining gaps stated explicitly. An index, map, test-source link, or completed scan alone is not execution evidence.

## Boundary Map Artifact

When a scan declares output `boundary-map`, the completed run may carry one typed boundary-map artifact.

The minimal typed artifact is evidence, not semantic graph truth. It contains:

- one or more boundaries with stable ids, human labels, generic kinds, owned repository paths, owned symbol keys, public entrypoints, contract source refs, test source refs, confidence, and optional open questions;
- zero or more relations between boundaries with stable ids, generic relation kinds, and bounded evidence source refs.

The first slice is intentionally product-agnostic. Boundary kinds, entrypoint kinds, and relation kinds stay generic enough to describe arbitrary repositories without encoding product-specific architecture vocabularies.

For tool boundaries, public entrypoints may come either from exported/public top-level symbols or from deterministic launcher files such as bounded `bin` or `cli` scripts when the tool surface is file-based rather than symbol-exported.

The current build workflow is explicit:

- start the scan from one completed repository index;
- adjust coverage only if the derived run inventory is materially wrong;
- call `scan_boundary_map_build` to derive candidate boundaries, public entrypoints, contract/test links, and inter-boundary relations from the current run coverage;
- review and, if acceptable, submit that typed artifact through `scan_complete(..., boundaryMap)`.

The build heuristics must stay product-agnostic and repo-overridable:

- built-in defaults are only a baseline for repositories that do not provide an overlay;
- repository-local overlay may also replace repository-specific profile recipe fields such as instructions, criteria, SSOT order, and required outputs;
- repository-local overlay fields replace, not merge with, the built-in boundary-map heuristics they target;
- boundary-map build must fail clearly when included coverage paths cannot be classified by the active root rules;
- repository-local overlays may reclassify repository-specific test families and contract markers without runtime code changes;
- repository-local overlays may also replace criterion-oriented evidence recipe fields such as duplicate-authority claim/topic selectors, duplicate-responsibility symbol kinds or ignored path globs, missing-owner materiality markers, or stale-documentation currentness markers without runtime code changes;
- repeated primary/default/canonical claims select different owners only when their normalized final subject clauses differ; prose preceding the final selection clause must not become part of the selected owner;
- a documentation path matched by an explicit non-implementation entry in `ssotOrder` is already an owning source for its bounded concern and must not be emitted as `missing-owner` solely because it omits an inline owner phrase;
- agent prompts and docs should point humans to the overlay contract instead of encoding one repository shape in code.
- agent prompts and docs should use `scan_profile_overlay_suggest` for symptom-scoped repo-aware patch scaffolds instead of hand-copying current profile values from unrelated responses.

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

The map header explains what the current projection contains and the next available interaction. Clicking a finding node selects it and opens its evidence in the fixed inspector without changing the projection. Opening its persisted dive-in is a separate explicit inspector action.

The findings overview and finding dive-in carry projection-owned orientation notes exposed as compact view help instead of large canvas nodes. An overview note explains what the review map is for, how priority columns and finding kinds differ, how to open evidence, and how to return. It is persisted with the workspace.

Workspace and projection ids are encoded in browser history. Explicitly opening a finding dive-in from the inspector pushes its URL; both the application Back button and browser Back restore the previous projection. A protected direct projection URL remains pending until the operator sets the tab-scoped token, then loads that exact workspace and projection. Direct projection URLs fail visibly when the workspace or projection does not exist.

A finding dive-in uses `affectedNodeIds` to show the finding beside the bounded project concepts it affects. Claims, owners, recommendations, and document/code references remain detail annotations. The UI must not duplicate them as semantic nodes or edges merely to obtain a convenient layout.

## Scan Comparison

Comparison matches finding evidence by fingerprint and reports `resolved`, `still_open`, `changed`, `new`, `regressed`, and `unverifiable` results.

Runs must use the same profile id. A profile version change remains visible in the comparison and prevents an unconditional pass verdict.

The MVP pass policy requires no still-open, regressed, or new high/critical findings, no unverifiable results, and equal profile versions.

## Portability Boundary

Workspace and scan import/export are not part of the current runtime. Completed scan evidence remains persisted and reviewable in its originating HiveMap environment.

The deferred direction is the versioned streaming NDJSON full-project snapshot defined at a high level in `storage-format.md`. It must carry both completed scan evidence and the completed repository retrieval facts needed to continue agent work without repeating the semantic scan. No ZIP or archive-path contract remains active.

## Repeatability

The persisted completed run includes the selected effective profile, original coverage, repository identity, applied scan criteria, declared outputs, and immutable evidence needed to compare a later run in the same environment. A repeat scan must resolve or create a completed repository index, derive coverage from that index during `scan_start`, and compare the new completed run with the existing baseline. Explicit coverage override remains available only when the derived inventory needs correction.
