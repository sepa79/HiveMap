import { describe, expect, it } from "vitest";

import { slugifyNodeId } from "./ids.js";

describe("slugifyNodeId", () => {
  it("creates stable node ids from labels", () => {
    expect(slugifyNodeId("Alpha Decision")).toBe("node-alpha-decision");
  });

  it("rejects labels without letters or numbers", () => {
    expect(() => slugifyNodeId(" - ")).toThrow("Node label must contain at least one letter or number");
  });
});
