# Project Knowledge Map

Project Knowledge Maps correlate stable product concepts with their owning documentation, implementation, verification, visual evidence, and decision history.

## Purpose

The map answers:

- what concepts exist,
- how they relate,
- which source currently defines each concern,
- where the concept is implemented and verified,
- which decisions, learnings, risks, or open questions affect it,
- whether a source correlation may be stale.

It is not a replacement for detailed specifications, code, tests, assets, or HiveMind history.

## Source Of Truth Ownership

| Concern | Owning source |
|---|---|
| Concept identity and semantic relationships | HiveMap semantic graph |
| Current contract or detailed behavior | Referenced canonical spec/document |
| Product or visual direction | Referenced direction document or ADR |
| Executable behavior | Referenced code symbol/module |
| Proof | Referenced test, screenshot, build, or demo artifact |
| Decision rationale and durable learning | Referenced HiveMind decision/learning |
| Open risk, issue, or question | Referenced HiveMind entry/issue |

The same detailed statement must not be maintained independently in HiveMap and a canonical source. Graph notes provide a bounded orientation summary and must point to the owning source.

## Source Reference

```ts
type ProjectSourceRole =
  | "defines"
  | "implements"
  | "verifies"
  | "illustrates"
  | "decides"
  | "discusses"
  | "tracks";

type ProjectSourceType =
  | "repo-doc"
  | "code"
  | "test"
  | "asset"
  | "hivemind";

type ProjectSourceRef = {
  role: ProjectSourceRole;
  source: ProjectSourceType;
  target: string;
  anchor?: string;
  revision?: string;
  label?: string;
};
```

`target` is explicit:

- repository-relative path for repo documents, code, tests, and assets;
- stable entry, learning, issue, or decision id for HiveMind.

`anchor` identifies a document heading or code symbol when the whole artifact is too broad. `revision` records the correlated source revision or digest when freshness matters.

Source references live under `GraphNode.metadata.sourceRefs`.

## Semantic Shape

Use one stable concept node per product concept. Connect concepts to smaller concepts, rules, decisions, risks, components, and evidence with explicit relations such as:

- `contains`
- `depends_on`
- `constrained_by`
- `produces`
- `consumes`
- `implemented_by`
- `verified_by`
- `affected_by`
- `contradicts`

Do not create a graph node for every paragraph or file. Create an evidence node only when the artifact participates meaningfully in the readable projection; otherwise attach a source reference directly to the concept.

## Projections

A knowledge workspace should provide:

1. `Game Concepts` or equivalent bounded overview.
2. Named deep dives for concepts with multiple inputs, outputs, owners, or risks.
3. Risk/evidence views when review work benefits from them.

Deep dives are curated project-map projections over the same semantic graph. They do not create separate semantic truth.

## HiveMind Correlation

HiveMind is the history and evidence channel, not the current product contract.

- Link decisions, learnings, risks, issues, and open threads by stable id.
- Preserve lifecycle and importance in the referenced HiveMind record.
- Do not import raw transcripts.
- Do not infer that an old discussion overrides the current canonical spec.
- When HiveMind and a canonical document appear to conflict, mark the graph item `unknown` or `risk` and request review.

## Freshness And Drift

A correlation is stale when its recorded revision no longer matches its source. Staleness must be visible; it must not silently fall back to an older summary.

Initial manually curated maps may omit `revision`, but they must be categorized as `inferred` until reviewed. Automated refresh requires explicit source revisions or digests.

Revision scope must match correlation scope:

- use a commit id or whole-file digest only when the correlation covers the whole artifact;
- use an anchor plus a section or symbol digest when the correlation covers a bounded document section or code symbol;
- use a content digest for dirty working-tree evidence because the repository commit does not identify that content.

A whole-file mismatch is a refresh candidate, not proof that every concept referencing the file is stale. The refresh agent must inspect the bounded semantic diff and update only affected correlations. Materially changed projections receive a new version; if a frozen before-state matters, preserve it as immutable evidence and mark the prior projection stale or superseded rather than silently rewriting it.

## Validation

- Source role, source type, and target are required and must use known values.
- Optional anchor, revision, and label must be non-empty when present.
- Detailed contract text must remain in its owning source.
- Future direction must not be presented as implemented behavior.
- Agent-derived maps remain `inferred` until human review.
