/**
 * Responsibility: Rehydrate immutable finding evidence as a semantic graph finding node.
 * Must not: Validate findings, mutate graphs, persist evidence, or own scan lifecycle rules.
 * Contract: Preserves the finding-node evidence mapping in docs/specs/repository-scan.md.
 */
import type { GraphNode } from "@hivemap/graph-core";

import type { FindingEvidence } from "./finding-validation.js";

export function evidenceToNode(evidence: FindingEvidence): GraphNode {
  return {
    id: evidence.nodeId,
    label: evidence.label,
    type: "finding",
    notes: evidence.notes,
    metadata: { sourceRefs: evidence.sourceRefs, finding: evidence.finding },
  };
}
