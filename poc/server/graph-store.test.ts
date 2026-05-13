import { describe, expect, it } from "vitest";

import { nodeTypes } from "./types";

describe("graph types", () => {
  it("keeps node vocabulary explicit", () => {
    expect(nodeTypes).toEqual(["concept", "decision", "risk", "question", "evidence"]);
  });
});
