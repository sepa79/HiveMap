import { describe, expect, it } from "vitest";

import { createFindingNode } from "@hivemap/scans";

import { readFindingMetadata } from "./finding-metadata.js";

describe("finding metadata refinement", () => {
  it("returns canonical metadata only after validating a finding node", () => {
    const findingNode = createFindingNode("scan-a", {
      id: "finding-a",
      label: "Finding",
      notes: "Validated finding evidence.",
      fingerprint: "finding-a",
      kind: "quality-problem",
      severity: "normal",
      confidence: "high",
      criterionIds: ["quality"],
      sources: [{
        sourceRef: { role: "verifies", source: "test", target: "tests/finding.test.ts" },
        claim: "The test demonstrates the finding.",
      }],
      affectedNodeIds: [],
    });

    expect(readFindingMetadata(findingNode)?.fingerprint).toBe("finding-a");
    expect(readFindingMetadata({ id: "concept-a", label: "Concept", type: "concept" })).toBeUndefined();
    expect(() => readFindingMetadata({ id: "invalid-finding", label: "Invalid", type: "finding" })).toThrow();
  });
});
