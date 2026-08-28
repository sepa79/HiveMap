/**
 * Responsibility: Refine canonical graph nodes into validated scan finding metadata for presentation.
 * Must not: Define finding DTOs, mutate graph state, or recover invalid finding nodes.
 * Contract: docs/specs/repository-scan.md#finding-node
 */
import type { GraphNode } from "@hivemap/graph-core";
import { validateFindingNode, type FindingMetadata } from "@hivemap/scans";

export function readFindingMetadata(node: GraphNode): FindingMetadata | undefined {
  if (node.type !== "finding") return undefined;
  validateFindingNode(node);
  return node.metadata?.finding as FindingMetadata;
}
