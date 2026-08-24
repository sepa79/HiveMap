# Repository Indexing Concept

Status: approved phased implementation spec. This document tracks the repository-indexing execution path. The minimal safe-mode execute/search slice now exists, but this spec does not yet replace the repository scan contract.

Current prioritization is driven by two near-term use cases without turning the contracts product-specific:

1. generic documentation/SSOT governance scans that can keep fast-moving repositories under control;
2. generic structural understanding of large Java/Cucumber-style test systems so monolithic frameworks can be decomposed into smaller abstractions.

Those use cases set implementation order only. Repository-indexing contracts, scan flows, and stored facts remain product-agnostic and language/tooling capabilities must be modeled in reusable terms.

## Locked Direction

- [x] Repository indexing and repository scan runs are separate artifacts.
- [x] `safe mode` is the current implementation track and runs inside the main HiveMap runtime/container.
- [x] `deep mode` is deferred and will use a separate executor boundary rather than expanding main-runtime privileges.
- [x] Repository index jobs are operational records, not semantic graph truth.
- [x] The first implementation slice is persisted safe-mode job records plus shared API/MCP contracts.
- [x] The current implemented slice also includes in-process safe-mode execution, bounded file/chunk persistence, and bounded repository search.
- [x] Long-term, a completed repository index must be exportable and importable so teams can analyze the indexed result without re-running checkout/scan in the target environment.

## Execution Tracker

### Phase 0: Boundary And SSOT

- [x] Approve repository-index versus scan-run separation.
- [x] Record the current runtime boundary in this spec instead of opening a separate ADR/plan file.
- [x] Align the target surface on explicit `repository_index_start`, `repository_index_execute`, `repository_index_list`, `repository_index_get`, and `repository_search` contracts for the first slice.

### Phase 1: Persisted Job Records

- [x] Add repository index job contracts to shared API/MCP types.
- [x] Add repository index job storage to the Postgres schema and storage adapters.
- [x] Expose start/list/get through the shared runtime plus REST/MCP transport adapters.
- [x] Expose execute/search through the shared runtime plus REST/MCP transport adapters.
- [x] Implement immutable ref resolution and checkout execution for safe mode.
- [x] Add stage progression beyond the initial `requested` state.

### Phase 2: Safe Repository Inventory

- [ ] Implement URL validation and normalization policy for repository remotes.
- [x] Implement immutable Git checkout.
- [x] Implement file inventory, content hashes, byte counts, and basic language/source-kind detection.
- [x] Implement profile glob coverage derivation for current scan-start integration.
- [x] Persist bounded stats/count updates on repository index jobs.

### Phase 3: Product-Agnostic Scan Value

- [x] Add normalized repository files and chunks for completed indexes.
- [x] Add bounded repository search on top of completed indexes.
- [x] Add first evidence-candidate retrieval on top of completed indexes.
- [x] Repository-backed scan start now derives bounded coverage from the completed index instead of requiring live repository discovery.
- [x] Keep agent input bounded to criterion-scoped evidence packets instead of full-repository discovery when the profile/index can supply them.
- [x] Add first product-agnostic documentation/SSOT signals on top of completed indexes: broken references, duplicate authority claims, and missing owner hints.

### Phase 4: Structural Code Facts

- [ ] Add normalized symbols, references, dependencies, and diagnostics.
- [~] Land a safe-mode Phase 4A syntax package built around `tree-sitter` parsing plus `ast-grep` structural queries before any compiler-backed adapters.
- [~] Add product-agnostic Java structural facts for packages, types, methods, imports, and module boundaries.
- [ ] Add product-agnostic Gherkin/Cucumber structural facts for feature files, step definitions, and step-binding relationships.
- [ ] Keep structural fact extraction usable for repository understanding and rewrite planning without forcing compiler-backed deep mode.

### Phase 5: Portable Completed Index Export

- [ ] Define a portable export/import contract for completed repository indexes.
- [ ] Support analysis in a target environment without repository checkout when a completed index artifact was imported.
- [ ] Keep operational job rows separate from the portable completed-index artifact.
- [x] Completed-index portability extends the normal full project export instead of using a separate companion artifact.

## Purpose

HiveMap repository scans should not spend agent tokens on deterministic work. Repository checkout, inventory, parsing, dependency extraction, rule execution, chunking, and index maintenance should be performed by code inside the hosted HiveMap stack.

The agent should receive bounded evidence packets and remain responsible only for semantic interpretation that deterministic tools cannot resolve reliably.

## Target Outcome

A user supplies a repository URL and optional branch, tag, or commit. HiveMap resolves the exact revision, checks it out inside the hosted runtime boundary for safe mode, builds a reusable repository index, and exposes that index to repository scan profiles through MCP/API.

The user does not need Git, Node, Java, Docker, scanners, or language toolchains on their computer.

~~~text
repository URL + requested ref
  -> resolve immutable commit
  -> safe-mode repository index job in main runtime
  -> inventory + syntax + rules + optional semantic index
  -> Postgres facts, chunks, diagnostics, and provenance
  -> local full-text/vector retrieval
  -> bounded evidence candidates
  -> optional agent interpretation
  -> HiveMap findings and scan evidence
~~~

## Principles

1. Code performs every deterministic step before an agent is involved.
2. A repository index and a HiveMap scan run are separate artifacts.
3. One immutable repository index may serve many scan profiles and agent sessions.
4. Every index is tied to an exact commit and toolchain/configuration digest.
5. The default indexing path does not execute code supplied by the repository.
6. The architecture is language-neutral; Java and TypeScript are initial adapters.
7. Extracted facts remain evidence and do not silently become semantic graph truth.
8. Every fact records its producing tool, version, configuration, source range, and revision.
9. Embeddings assist retrieval and clustering; they do not independently prove a finding.
10. The complete runtime is hosted/containerized and has no workstation dependencies.
11. A completed repository index should be portable across environments when the human intentionally exports it.

## Boundary With Repository Scans

The current repository scan contract assigns discovery and source reading to the agent. That boundary should change.

| Concern | Owner |
|---|---|
| Checkout and immutable revision resolution | Repository indexer |
| File discovery and profile glob evaluation | Repository indexer |
| File hashes, language detection, and change detection | Repository indexer |
| Syntax, symbols, imports, dependencies, and machine diagnostics | Language adapters and deterministic tools |
| Coverage inventory construction | Repository indexer |
| Coverage and scan lifecycle validation | HiveMap scans domain |
| Candidate retrieval and evidence packet construction | Repository index/query service |
| Semantic conflict/risk interpretation | Agent when required |
| Active finding graph nodes | HiveMap semantic graph |
| Immutable completed-run evidence | HiveMap scans/storage |

The repository scan contract and workflow must be updated when this direction becomes an approved implementation decision. Until then, this document describes the intended evolution rather than silently changing existing behavior.

## Repository Index Identity

The logical index key is:

~~~text
repository identity
+ resolved commit SHA
+ indexer version
+ indexing configuration digest
+ enabled adapter/tool versions
~~~

Branch names are input references, not index identity. The resolved commit is recorded before indexing starts.

Two jobs with the same index key should reuse the existing completed index. A changed commit should reuse content-addressed facts and embeddings for unchanged files.

## Indexing Modes

### Safe Mode

Safe mode is the default for untrusted repositories.

It may:

- clone or fetch the repository;
- read tracked source files;
- inspect Git metadata;
- parse source and documentation;
- run syntax-aware queries and HiveMap-owned static rules;
- generate local embeddings;
- write normalized index facts to HiveMap storage.

It must not:

- run npm, Maven, Gradle, Bazel, or repository scripts;
- install dependencies declared by the repository;
- execute binaries from the checkout;
- load executable configuration from the checkout;
- access the Docker socket, host filesystem, unrelated repositories, or runtime secrets.

### Deep Mode

Deep mode is optional and explicit. It enables compiler/build-aware indexers that may require project dependency resolution or compilation, including accurate SCIP-compatible Java and TypeScript indexes.

Deep mode runs in a separate, more restricted executor with:

- an explicit user or policy decision;
- no reusable application secrets;
- strict CPU, memory, disk, process, and wall-clock limits;
- controlled network access for dependency retrieval;
- isolated caches scoped to an organization or workspace;
- explicit provenance identifying deep-mode output;
- no access to the main application filesystem or Docker socket.

Running a build in a container is still execution of repository-controlled code. Containerization alone is not the security boundary.

## Multi-Language Tooling Strategy

### Language-Neutral Base

The safe base image should provide:

- Git for revision resolution, inventory, history, and diffs;
- ripgrep for fast text discovery and bounded source retrieval;
- Tree-sitter or ast-grep for robust multi-language syntax extraction;
- a Markdown parser for headings, links, code references, and bounded chunks;
- a local link checker for deterministic broken-reference evidence;
- optional Semgrep execution with HiveMap-owned local rules;
- an Ollama-compatible provider for local chunk embeddings.

This layer works without project dependency installation and provides useful partial results even when source files are incomplete or do not compile.

### TypeScript And JavaScript Adapter

Safe mode:

- detect TypeScript/JavaScript projects and workspaces;
- extract declarations, exports, signatures, imports, and source ranges;
- parse package and workspace metadata as data;
- produce dependency facts without executing repository code;
- optionally run dependency-cruiser with HiveMap-owned configuration.

Deep mode:

- resolve installed dependencies;
- produce compiler-aware symbol, reference, and type information;
- optionally import SCIP TypeScript output.

### Java Adapter

Safe mode:

- extract packages, types, interfaces, methods, fields, annotations, and imports;
- extract declared inheritance and implementation relationships;
- parse Maven/Gradle module metadata without executing builds;
- produce source ranges and structural diagnostics.

Deep mode:

- resolve dependencies and compiler-backed symbols/references;
- optionally import SCIP Java output;
- run Maven/Gradle compilation inside the deep executor.

### Additional Languages

New languages begin with the language-neutral syntax adapter. A compiler-aware adapter is added only when the product needs resolution accuracy that syntax extraction cannot provide.

SCIP is a candidate interchange format for language-specific semantic indexes. HiveMap should normalize imported SCIP data into its own stable fact model and retain SCIP/tool provenance rather than exposing indexer-specific schemas to the rest of the product.

## Phase 4A Safe Syntax Package

The next concrete implementation package should stay inside safe mode and should not require dependency installation or repository-provided execution.

### Tool Order

Implement in this order:

1. `tree-sitter` parsers for Java, TypeScript/JavaScript, Gherkin, JSON, YAML, and Markdown-adjacent code-reference extraction.
2. `ast-grep` queries owned by HiveMap for language-specific structural captures and bounded pattern diagnostics.
3. Existing Markdown/link extraction remains active and should start correlating code/symbol-like references with syntax facts when possible.
4. Optional Semgrep stays after the syntax base and should only run HiveMap-owned local rules.
5. `dependency-cruiser`-style or package-manager metadata parsing can follow for TypeScript/JavaScript dependency facts without executing repository code.
6. Compiler-backed `javac`, `tsc`, and SCIP import remain later phases or deep-mode work, not the first safe-mode package.

### Scan-Profile Overlay Discovery

Repository indexing must keep the optional repository-local scan-profile overlays visible to the scan layer rather than treating them as hidden repo trivia. In the current phase:

- `.hivemap/scan-profiles/<profile>.yaml` is part of the completed repository index when present;
- the overlay only participates when it exists in the indexed Git revision; an untracked local working-tree file outside that revision is invisible to safe-mode indexing;
- `scan_start` and `repository_evidence_candidates` resolve that indexed overlay into an effective profile before deriving coverage or structural candidates;
- missing overlays keep built-in profile defaults active;
- invalid overlays fail clearly and are surfaced through MCP with guidance to `scan_profile_overlay_help`.

### Facts To Generate First

Phase 4A should generate only deterministic, syntax-level facts:

- `RepositorySymbol` for packages, modules, classes, interfaces, enums, records, methods, functions, fields, constants, exported declarations, and Gherkin features/scenarios/steps when the parser can see them directly;
- `RepositoryReference` for imports, extends/implements/use-site references, step-definition bindings detected by syntax/pattern rules, and documentation code/symbol references when they can be normalized deterministically;
- `RepositoryDependency` for file-to-file, module-to-module, package-to-package, and feature-to-step-definition edges inferred from syntax and manifest data only;
- `RepositoryDiagnostic` for parser failures, duplicate declaration surfaces, missing step bindings detected by HiveMap-owned structural rules, and other machine-proven safe-mode findings;
- chunk-to-symbol and file-to-symbol context so repository search and evidence candidate builders can retrieve around a symbol boundary instead of plain text alone.

Do not attempt type resolution, build graph execution, generated-source expansion, or dependency installation in this package.

Current concrete slice status:

- implemented now: persisted `RepositorySymbol` extraction for TypeScript, TSX, JavaScript/JSX via the TSX grammar, and Java;
- implemented now: package/type/member/function/export visibility facts where the parser can see them directly;
- implemented now: persisted `RepositoryReference` extraction for TypeScript/JavaScript and Java imports, extends/implements relationships, constructor calls, and direct call-site targets when the parser can see them deterministically;
- implemented now: persisted `RepositoryDependency` edges derived deterministically from normalized syntax references, with resolved target files/symbols when relative imports or unique symbol matches make that possible;
- implemented now: `duplicate-responsibility` candidate ranking prefers repeated top-level symbols whose peer modules share dependency topology;
- not implemented yet: `RepositoryDiagnostic`, Gherkin/Cucumber facts, documentation code/symbol references, and `ast-grep` correlation rules;
- not implemented yet: compiler-backed resolution, dependency installation, or repository-provided execution.

### Storage Boundary

Store the new facts as workspace/index-scoped runtime evidence beside the current `repository_files` and `repository_chunks` tables:

- `repository_symbols`
- `repository_references`
- `repository_dependencies`
- `repository_diagnostics`

Each row should:

- reference the owning `workspace_id` and `index_id`;
- carry explicit producer provenance such as tool id, parser/query version, and configuration digest;
- point back to the owning file and bounded line/range information;
- remain operational retrieval/index evidence rather than semantic graph truth;
- stay outside the ZIP portability contract until the completed-index portability phase lands.

### Retrieval Surfaces To Add After The Facts Exist

Once Phase 4A facts are persisted, add them to retrieval in this order:

1. extend `repository_search` so callers can search symbols, qualified names, imports, and diagnostics as first-class hits;
2. add evidence-candidate builders that consume structural facts for code-quality and Java/Cucumber rewrite scans;
3. add bounded structural drill-down surfaces only if the existing search/evidence contracts become too lossy.

Avoid inventing a large new query API before proving the first scan/review workflows on top of the normalized facts.

### Why This Package First

This package gives HiveMap materially better repository understanding for both target use cases:

- PocketHive governance scans can correlate docs, contracts, and code symbols without asking the agent to rediscover structure manually.
- Java/Cucumber rewrite work gets package/type/method/step surfaces and module boundaries early, without blocking on buildable projects or deep-mode compilers.

## Normalized Fact Model

The storage/API model must be independent from any individual parser.

### RepositoryIndex

- repository id and sanitized repository URL;
- requested ref and resolved commit SHA;
- branch when known;
- indexer version and configuration digest;
- enabled tools/adapters and versions;
- safe or deep mode;
- lifecycle status, timestamps, counts, and failure summary.

### RepositoryFile

- normalized repository-relative path;
- language and source kind;
- content hash and byte size;
- included, excluded, or failed status and reason;
- generated, vendor, test, or documentation classification;
- last indexed revision.

### RepositorySymbol

- stable index-local symbol key;
- language, name, qualified name, and kind;
- owning file and bounded source range;
- parent/container symbol;
- visibility and exported/public flags when deterministically available;
- producer provenance.
- current Phase 4A slice persists these rows in runtime storage for completed indexes.

### RepositoryReference

- source file and range;
- reference kind and textual target;
- resolved symbol key when available;
- resolution confidence and producer provenance.

### RepositoryDependency

- source module, package, or file;
- target module, package, file, or unresolved target;
- dependency kind;
- source range and producer provenance.

### RepositoryChunk

- stable chunk id derived from repository, file content hash, and bounded range;
- file, heading/symbol context, and line range;
- text and content hash;
- chunking strategy/version;
- optional embedding model reference and vector.

### RepositoryDiagnostic

- stable semantic fingerprint;
- tool/rule id and version;
- severity and message;
- bounded source locations;
- deterministic or heuristic classification;
- raw tool payload where useful for audit.

### EvidenceCandidate

- criterion/profile id;
- selected bounded facts and claims;
- related graph concept ids when retrieval finds candidates;
- retrieval/ranking explanation;
- source revision and index id;
- machine-proven or requires-interpretation status.

Only machine-proven diagnostics should be eligible for automatic finding creation under an explicit policy. Semantic candidates should go through agent interpretation or the existing proposal/approval flow.

## Storage And Caching

Postgres owns repository index metadata, normalized facts, job state, and source provenance.

- facts are content-addressed where practical;
- unchanged file facts are reused across revisions;
- embeddings are generated only for new or changed chunks;
- full-text search covers paths, headings, symbols, and chunk text;
- pgvector supports bounded semantic retrieval;
- every query is restricted by workspace, repository, and revision;
- raw checkout directories remain ephemeral;
- deleting a linked repository schedules deletion of private facts and embeddings according to retention policy.

Repository facts are a navigation/evidence index, not a second semantic graph. Concepts and accepted findings remain in the HiveMap graph.

Long-term, completed repository facts also need an explicit portability path so a workspace plus its finished index can move between environments without repeating checkout and indexing.

That portability should use the same normal full-project export/import flow rather than a second export artifact.

## Job Lifecycle

~~~text
requested
  -> resolving_ref
  -> checking_out
  -> discovering
  -> indexing_syntax
  -> running_rules
  -> embedding_changed_chunks
  -> normalizing
  -> completed | failed | cancelled
~~~

Each stage reports bounded progress, counts, tool versions, and explicit failures. A partial adapter failure must not be silently reported as complete coverage.

## Proposed MCP/API Surface

Names are aligned with the current shared API contract surface.

### repository_index_start

Starts an index job for a workspace, repository URL/id, optional ref, mode, and adapter/rule profile.

### repository_index_execute

Runs one explicit persisted repository index request.

Current safe-mode behavior:

- resolve one immutable commit for the requested ref;
- perform a detached checkout into an ephemeral local worktree;
- inventory tracked files;
- derive bounded normalized file and chunk records;
- allow explicit re-runs of the same completed or failed index record by clearing prior terminal metadata and replacing prior persisted file/chunk content;
- persist index stats and complete or fail the job explicitly.

### repository_index_list

Lists persisted repository index job records for one workspace.

### repository_index_get

Returns one repository index job record, including current stage, terminal failure details when present, and resolved commit once known.

In Phase 1 this is the current status surface. A separate `repository_index_status` operation is not needed unless later execution semantics force a distinction.

### repository_search

Supports bounded searches against one explicit repository index.

Current implemented retrieval is intentionally narrow:

- repository-relative path matching;
- file-name search hits;
- full-text search over persisted chunk text.

Symbol, dependency, diagnostic, and semantic/vector retrieval remain later phases.

### repository_evidence_candidates

Produces bounded evidence packets for a selected scan profile/criterion. It exposes why each source was selected and distinguishes deterministic evidence from interpretation candidates.

The currently implemented slices are:

- `documentation-conflicts@1` criteria derived from persisted files/chunks:

  - `contradictory-claims`
  - `broken-references`
  - `duplicate-authority`
  - `stale-documentation`
  - `missing-owner`

- `code-quality-review@1` structural candidate retrieval derived from persisted files plus `repository_symbols`:

  - `duplicate-responsibility`

Current quality constraints for that first slice:

- `contradictory-claims` currently emits interpretation candidates only for explicit status/support/membership conflicts about the same normalized subject/context, plus conflicting primary/default/canonical selections for the same concern;
- `broken-references` includes missing repository-relative files and missing Markdown heading fragments;
- `duplicate-authority` only emits interpretation candidates when authority-style claims overlap on a shared topic rather than pairing every authority phrase in the repository;
- `stale-documentation` currently reuses contradiction-style claims plus SSOT precedence and only flags lower-precedence, current-looking docs when they conflict with stronger sources such as `AGENTS.md`, `docs/specs/*`, or other higher-ranked SSOT entries;
- `missing-owner` is intentionally limited to material documentation sources such as architecture, design, spec, policy, workflow, guide, runbook, and similar operational/contract docs, not generic glossaries or history pages.
- `duplicate-responsibility` is currently limited to repeated top-level `public` or `exported` code symbols under scan coverage and intentionally ignores test/doc files, nested members, and clearly non-current/supporting code paths such as archive, legacy, generated, fixture, example, mock, and storybook surfaces to keep the first structural signal bounded.

### repository_index_delete

Explicitly removes or schedules removal of an index and its derived private data subject to retention rules. It must not silently delete active scan evidence that references the index.

## Integration With Existing Scan Lifecycle

1. Resolve or create a completed repository index for the target commit.
2. Start a scan with an explicit profile and repository index id.
3. Derive discovered, included, excluded, and failed coverage from the index and profile during scan start.
4. Record or adjust coverage through the scans domain only when an explicit override is needed.
5. Run deterministic profile rules against the index.
6. Materialize machine-proven diagnostics according to capture policy.
7. Retrieve bounded evidence candidates for semantic criteria.
8. Invoke an agent only for candidates marked requires-interpretation.
9. Create or update findings with exact source claims and index provenance.
10. Complete, compare, and export through the existing immutable evidence workflow.

No agent should need to enumerate or read the repository from scratch.

When a completed repository index was imported from another environment, the same scan/review flow should work against that imported index without requiring local checkout of the original repository.

## Container Topology

~~~text
hivemap main runtime
  -> Postgres + pgvector
  -> repository-index job records / queue
  -> in-process safe-mode indexer modules
  -> internal embedding service
~~~

Safe mode currently lives inside the main runtime/container so local Docker and HiveForge iteration stay simple.

Deep mode later uses a separate ephemeral executor image or job class rather than expanding the privileges and attack surface of the default main runtime.

The embedding service is internal-only. During model evaluation it may support an explicit configured set of models. Production hardening may later pin model artifacts and restrict runtime model selection.

## Security Requirements

- validate and normalize repository URLs;
- use short-lived, repository-scoped credentials;
- never store credentials in graph notes, exports, logs, or clone URLs;
- control redirects and alternate Git transports;
- run checkouts as an isolated non-root user;
- prevent checkout paths from escaping the job workspace;
- expose no host mounts beyond explicit scratch/cache volumes;
- expose no Docker socket or public indexer/embedding port;
- define explicit policies for archives, symlinks, submodules, and Git LFS;
- enforce file count, file size, repository size, process, CPU, memory, disk, and wall-clock limits;
- prohibit dependency installation and repository code execution in safe mode;
- make network egress stage-specific;
- prohibit cross-tenant caches and semantic searches;
- record model, parser, indexer, and rule versions with results.

## Delivery Plan

### Phase 0: Contract Alignment

- approve the repository-index versus scan-run separation;
- update repository scan ownership language;
- define repository/index ids and lifecycle contracts in this spec;
- avoid a second tracker/ADR unless the boundary changes again.

### Phase 1: Safe Repository Inventory

- add repository/index/job storage contracts;
- implement URL validation and immutable Git checkout;
- implement inventory, hashes, language detection, and profile glob coverage;
- expose start, execute, list, get, and bounded search operations;
- test public and private repository fixtures.

### Phase 2: Product-Agnostic Scan Value

- extend deterministic evidence beyond the current minimal file/chunk search slice;
- add evidence-candidate construction for documentation, SSOT, authority, drift, and broken-reference style scans;
- derive scan coverage from a completed repository index;
- connect machine-proven findings to capture policy;
- limit agent input to bounded interpretation packets;
- compare cost and quality with the current agent-executed workflow.

### Phase 3: Structural Code Facts

- add the shared fact schema;
- implement TypeScript/JavaScript safe adapter;
- implement Java safe adapter;
- add Gherkin/Cucumber feature, step-definition, and step-binding extraction;
- normalize symbols, references, dependencies, and diagnostics;
- prove deterministic repeat results for the same commit/toolchain.

### Phase 4: Portable Index Bundles

- define how completed repository index data is embedded into the normal full-project export/import format;
- include normalized facts, provenance, revision identity, and any required bounded retrieval data;
- support import into another HiveMap environment without repository checkout;
- decide whether embeddings are regenerated on import or included as an optional payload;
- preserve the boundary that job execution state is not itself the portable artifact.

### Phase 5: Retrieval And Local Embeddings

- reuse the existing Ollama-compatible provider;
- add content-addressed embedding reuse;
- widen repository search beyond path/text retrieval where deterministic evidence needs it;
- validate Java, TypeScript, and mixed-language repositories;
- keep embeddings and vector retrieval subordinate to scan value rather than making them the first proof point.

### Phase 6: Optional Deep Indexing

- prototype SCIP TypeScript and SCIP Java adapters;
- implement the separate deep executor boundary;
- measure accuracy gain, execution risk, resource use, and operational cost;
- enable only for profiles that materially benefit from compiler-aware resolution.

## MVP Acceptance Criteria

- a user supplies a Git URL and optional ref through HiveMap;
- the hosted stack indexes it without workstation dependencies;
- the index records an immutable commit and complete toolchain provenance;
- safe mode executes no repository-provided code;
- documentation/SSOT-oriented scans can obtain bounded coverage and evidence candidates without agent-driven repository discovery;
- Java, TypeScript, and Gherkin/Cucumber fixtures can grow into reusable structural facts for rewrite and boundary analysis without product-specific contracts;
- rerunning the same index key reuses the completed index;
- a changed commit reprocesses only changed content where safe;
- repository search returns bounded revision-specific evidence;
- one scan profile obtains coverage without agent discovery;
- the agent receives bounded evidence candidates rather than the full repository;
- failures remain visible and completion cannot claim missing coverage;
- a completed index can later be exported and imported for offline analysis in another environment.

## Benchmark Plan

Measure:

- clone/fetch and inventory time;
- files and source bytes per second;
- syntax indexing time by language;
- changed-file incremental time;
- normalized fact count and storage size;
- changed-chunk embedding throughput;
- Postgres storage per thousand files;
- repository search latency;
- evidence candidate precision/recall on curated cases;
- agent tokens and wall-clock time before and after index integration;
- safe versus deep accuracy and cost.

Test with:

- HiveMap as a TypeScript monorepo;
- a representative Maven or Gradle Java repository;
- a mixed documentation/code repository;
- an intentionally malformed or unbuildable repository;
- a repository containing submodules, symlinks, generated files, and oversized artifacts.

## Open Decisions

- indexer as a monorepo app package or separately versioned image;
- exact parser library and grammar distribution strategy;
- SCIP as imported interchange data or retained raw evidence;
- private repository authentication;
- submodule and Git LFS behavior;
- deterministic diagnostics eligible for automatic findings;
- cache tenancy and retention;
- external-link checks during indexing or a separate network-enabled job;
- default repository and resource limits;
- safe repository-specific indexing hints.
