import { describe, expect, it } from "vitest";

import { createRepositorySymbols } from "./repository-syntax.js";

describe("createRepositorySymbols", () => {
  it("extracts top-level and member symbols from TypeScript and TSX syntax", () => {
    const symbols = createRepositorySymbols({
      workspaceId: "workspace-a",
      indexId: "repo-index-a",
      filePath: "src/example.tsx",
      language: "tsx",
      text: [
        "export class ApiClient {",
        "  baseUrl: string;",
        "  request(path: string) { return path; }",
        "}",
        "export function renderView() { return <div>Hello</div>; }",
        "const localValue = 1;",
      ].join("\n"),
    });

    expect(symbols).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          filePath: "src/example.tsx",
          kind: "class",
          name: "ApiClient",
          qualifiedName: "ApiClient",
          isExported: true,
        }),
        expect.objectContaining({
          kind: "field",
          name: "baseUrl",
          qualifiedName: "ApiClient.baseUrl",
        }),
        expect.objectContaining({
          kind: "method",
          name: "request",
          qualifiedName: "ApiClient.request",
        }),
        expect.objectContaining({
          kind: "function",
          name: "renderView",
          qualifiedName: "renderView",
          isExported: true,
        }),
        expect.objectContaining({
          kind: "variable",
          name: "localValue",
          qualifiedName: "localValue",
          isExported: false,
        }),
      ]),
    );
  });

  it("extracts package, class, field, method, and constructor symbols from Java syntax", () => {
    const symbols = createRepositorySymbols({
      workspaceId: "workspace-a",
      indexId: "repo-index-a",
      filePath: "src/main/java/com/example/ApiClient.java",
      language: "java",
      text: [
        "package com.example;",
        "public class ApiClient {",
        "  private int retries;",
        "  public ApiClient() {}",
        "  public void execute(String path) {}",
        "}",
      ].join("\n"),
    });

    expect(symbols).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          kind: "package",
          name: "com.example",
          qualifiedName: "com.example",
        }),
        expect.objectContaining({
          kind: "class",
          name: "ApiClient",
          qualifiedName: "com.example.ApiClient",
          isPublic: true,
        }),
        expect.objectContaining({
          kind: "field",
          name: "retries",
          qualifiedName: "com.example.ApiClient.retries",
        }),
        expect.objectContaining({
          kind: "constructor",
          name: "ApiClient",
          qualifiedName: "com.example.ApiClient.ApiClient",
          isPublic: true,
        }),
        expect.objectContaining({
          kind: "method",
          name: "execute",
          qualifiedName: "com.example.ApiClient.execute",
          isPublic: true,
        }),
      ]),
    );
  });
});
