import { afterEach, describe, expect, it, vi } from "vitest";

afterEach(() => {
  vi.resetModules();
  vi.unstubAllGlobals();
});

describe("web API authentication", () => {
  it("keeps the operator token in the current tab and sends it as a bearer header", async () => {
    const values = new Map<string, string>();
    vi.stubGlobal("sessionStorage", {
      getItem: (key: string) => values.get(key) ?? null,
      setItem: (key: string, value: string) => values.set(key, value),
      removeItem: (key: string) => values.delete(key),
    });
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ workspaces: [] }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    const { setAuthToken } = await import("./auth-token.js");
    const api = await import("./api.js");
    setAuthToken("test-token");
    await api.listWorkspaces();

    expect(values.get("HIVEMAP_UI_TOKEN")).toBe("test-token");
    expect(fetchMock).toHaveBeenCalledWith(
      "http://127.0.0.1:8787/workspaces",
      expect.objectContaining({ headers: { authorization: "Bearer test-token" } }),
    );
  });

  it("percent-encodes workspace and scan ids used as REST path segments", async () => {
    vi.stubGlobal("sessionStorage", {
      getItem: () => null,
      setItem: () => undefined,
      removeItem: () => undefined,
    });
    const response = {
      deletedScanId: "scan/delete?draft#1",
      deletedFindingNodeIds: [],
      deletedEdgeIds: [],
      deletedProjectionIds: [],
    };
    const fetchMock = vi.fn(async () => new Response(JSON.stringify(response), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    const api = await import("./api.js");
    await expect(api.deleteScan("workspace/alpha", "scan/delete?draft#1")).resolves.toEqual(response);
    expect(fetchMock).toHaveBeenCalledWith(
      "http://127.0.0.1:8787/workspaces/workspace%2Falpha/scans/scan%2Fdelete%3Fdraft%231",
      expect.objectContaining({ method: "DELETE" }),
    );
  });
});
