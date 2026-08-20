# Project Knowledge Map Workflow

Use this workflow when creating or refreshing a map that correlates product concepts with documentation, code, tests, assets, and HiveMind.

## Required Inputs

- target repository and project id,
- repository rules and SSOT order,
- canonical architecture/product/spec documents,
- relevant implementation and tests,
- bounded HiveMind project context,
- explicit map scope.

## Workflow

### 1. Warm Start

1. Read the target repository `AGENTS.md` and its canonical docs.
2. Resolve the project in HiveMind; never guess the project id.
3. Read current rules, decisions, learnings, risks, and open threads relevant to the map scope.
4. Inspect implementation and tests before asserting that a documented direction exists in code.

### 2. Define Concept Scope

Choose a bounded overview such as `Game Concepts`, `Runtime`, or `Visual Direction`.

For each candidate concept record:

- stable id and short label,
- bounded orientation note,
- current status: implemented, direction, risk, unknown, or stale,
- owning canonical source,
- implementation and verification references when present,
- relevant HiveMind evidence ids.

Do not map every file. Map concepts that help a developer decide where to read or change the system.

### 3. Correlate Sources

Attach typed `ProjectSourceRef` entries using the roles `defines`, `implements`, `verifies`, `illustrates`, `decides`, `discusses`, or `tracks`.

Use this precedence when claims conflict:

1. target repository rules,
2. canonical specs/contracts,
3. architecture/product direction,
4. implementation,
5. tests and artifacts,
6. HiveMind history.

Do not silently resolve a conflict. Represent it as a risk or unknown and link both sources.

### 4. Mutate Through Explicit Operations

Create or update the semantic graph only through typed graph commands. Assign categories explicitly. Agent-created correlations use `inferred` provenance until reviewed.

Create projections after the graph mutation:

- bounded overview first,
- curated deep dives for complex concepts,
- optional evidence/risk projections.

### 5. Review

Check:

- every detailed claim has one owning source,
- future direction is distinct from current implementation,
- code references identify real modules or symbols,
- tests cited as proof actually cover the concept boundary,
- HiveMind references use stable ids and do not copy transcripts,
- overview remains readable,
- deep dives reveal useful inputs, outputs, constraints, owners, and risks.

Apply the repository review and Jester checks.

### 6. Verify And Capture Evidence

Load every created projection through the public HiveMap boundary. Capture a screenshot when visual readability matters. Export a ZIP when the initial reviewed state needs frozen evidence.

Record durable learnings in:

- the target project's HiveMind context when the map captures project knowledge;
- HiveMap's HiveMind context when dogfooding changes map/product direction.

Close both contexts.

### 7. Refresh An Existing Map

1. Index current `sourceRefs` by repository target and anchor.
2. Detect changed targets from the working tree and recorded revisions. A dirty working tree uses a content digest, not the last commit id.
3. For anchored documentation references, compare the referenced section or symbol. A whole-file digest is only a candidate signal because an unrelated edit in the same file does not make every correlated concept stale.
4. Read the semantic diff and classify each affected concept as unchanged, changed, added, contradicted, or removed.
5. Update only correlations and concept notes whose bounded source changed. Do not advance a revision for an unrelated section merely to silence drift detection.
6. Apply graph changes through explicit commands, then create a new version of any materially changed projection. Preserve prior exported evidence when a frozen before-state matters and visibly mark the old projection stale until a projection-supersession contract exists.
7. Load the refreshed overview and every affected deep dive through the public boundary. Check concept details and capture visual evidence when readability changed.
8. Record the refresh result and any detector false positives in the target project and HiveMap HiveMind contexts.

Refresh is successful when a new agent can distinguish new product direction from current implementation and can identify exactly which source scope justified each changed concept.

## Handoff For The Next Agent

The next agent should be able to start with:

1. Load the named HiveMap workspace.
2. Open the concepts overview.
3. Select the affected concept and read its notes/source references.
4. Open the relevant deep dive.
5. Follow `defines` before changing behavior, `implements` before editing code, and `verifies` before selecting tests.
6. Read linked HiveMind decisions/risks for rationale and unresolved context.
7. Refresh correlations explicitly when referenced sources changed.

The map accelerates orientation. It never grants permission to skip the target repository rules or canonical sources.
