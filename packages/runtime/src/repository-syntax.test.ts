import { describe, expect, it } from "vitest";

import {
  createRepositoryDependencies,
  createRepositoryReferences,
  createRepositorySymbols,
  createRepositorySyntaxFacts,
} from "./repository-syntax.js";

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

  it("extracts deterministic TypeScript references for imports, heritage, instantiation, and calls", () => {
    const references = createRepositoryReferences({
      workspaceId: "workspace-a",
      indexId: "repo-index-a",
      filePath: "src/example.tsx",
      language: "tsx",
      sourceKind: "code",
      text: [
        "import { Foo as Bar } from './foo';",
        "class Base {}",
        "export class Baz extends Base implements One, Two {",
        "  render(){ return new Widget(Factory.build(arg)); }",
        "}",
        "const x = helper(bar);",
      ].join("\n"),
    });

    expect(references).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ kind: "import", targetText: "./foo" }),
        expect.objectContaining({ kind: "extends", targetText: "Base", resolutionConfidence: "high" }),
        expect.objectContaining({ kind: "implements", targetText: "One", resolutionConfidence: "low" }),
        expect.objectContaining({ kind: "implements", targetText: "Two", resolutionConfidence: "low" }),
        expect.objectContaining({ kind: "instantiation", targetText: "Widget" }),
        expect.objectContaining({ kind: "call", targetText: "Factory.build" }),
        expect.objectContaining({ kind: "call", targetText: "helper" }),
      ]),
    );
  });

  it("extracts deterministic Java references for imports, heritage, instantiation, and calls", () => {
    const facts = createRepositorySyntaxFacts({
      workspaceId: "workspace-a",
      indexId: "repo-index-a",
      filePath: "src/main/java/com/example/ApiClient.java",
      language: "java",
      sourceKind: "code",
      text: [
        "package com.example;",
        "import java.util.List;",
        "class BaseClient {}",
        "public class ApiClient extends BaseClient implements Runnable, Closeable {",
        "  public void run(){ helper.execute(request); new Worker().start(); }",
        "}",
      ].join("\n"),
    });

    expect(facts.references).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ kind: "import", targetText: "java.util.List" }),
        expect.objectContaining({ kind: "extends", targetText: "BaseClient", resolutionConfidence: "high" }),
        expect.objectContaining({ kind: "implements", targetText: "Runnable" }),
        expect.objectContaining({ kind: "implements", targetText: "Closeable" }),
        expect.objectContaining({ kind: "call", targetText: "helper.execute" }),
        expect.objectContaining({ kind: "instantiation", targetText: "Worker" }),
        expect.objectContaining({ kind: "call", targetText: "new Worker().start" }),
      ]),
    );
  });

  it("derives repository dependencies with resolved target files where deterministic", () => {
    const sourceFacts = createRepositorySyntaxFacts({
      workspaceId: "workspace-a",
      indexId: "repo-index-a",
      filePath: "src/example.tsx",
      language: "tsx",
      sourceKind: "code",
      text: [
        "import { Foo } from './foo';",
        "export class Baz extends Base {",
        "  render(){ return new Widget(Factory.build(arg)); }",
        "}",
        "const x = helper(bar);",
      ].join("\n"),
    });
    const baseSymbols = createRepositorySymbols({
      workspaceId: "workspace-a",
      indexId: "repo-index-a",
      filePath: "src/base.ts",
      language: "typescript",
      text: "export class Base {}",
    });
    const widgetSymbols = createRepositorySymbols({
      workspaceId: "workspace-a",
      indexId: "repo-index-a",
      filePath: "src/widgets/Widget.tsx",
      language: "tsx",
      text: "export class Widget {}",
    });
    const helperSymbols = createRepositorySymbols({
      workspaceId: "workspace-a",
      indexId: "repo-index-a",
      filePath: "src/helper.ts",
      language: "typescript",
      text: "export function helper() { return 1; }",
    });

    const dependencies = createRepositoryDependencies({
      files: [
        {
          workspaceId: "workspace-a",
          indexId: "repo-index-a",
          path: "src/example.tsx",
          language: "tsx",
          sourceKind: "code",
          contentHash: "hash-example",
          byteSize: 150,
        },
        {
          workspaceId: "workspace-a",
          indexId: "repo-index-a",
          path: "src/foo.ts",
          language: "typescript",
          sourceKind: "code",
          contentHash: "hash-foo",
          byteSize: 50,
        },
        {
          workspaceId: "workspace-a",
          indexId: "repo-index-a",
          path: "src/base.ts",
          language: "typescript",
          sourceKind: "code",
          contentHash: "hash-base",
          byteSize: 50,
        },
        {
          workspaceId: "workspace-a",
          indexId: "repo-index-a",
          path: "src/widgets/Widget.tsx",
          language: "tsx",
          sourceKind: "code",
          contentHash: "hash-widget",
          byteSize: 50,
        },
        {
          workspaceId: "workspace-a",
          indexId: "repo-index-a",
          path: "src/helper.ts",
          language: "typescript",
          sourceKind: "code",
          contentHash: "hash-helper",
          byteSize: 50,
        },
      ],
      symbols: [...sourceFacts.symbols, ...baseSymbols, ...widgetSymbols, ...helperSymbols],
      references: sourceFacts.references,
    });

    expect(dependencies).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ kind: "import", targetText: "./foo", targetFilePath: "src/foo.ts", resolutionConfidence: "high" }),
        expect.objectContaining({ kind: "extends", targetText: "Base", targetFilePath: "src/base.ts", resolutionConfidence: "high" }),
        expect.objectContaining({
          kind: "instantiation",
          targetText: "Widget",
          targetFilePath: "src/widgets/Widget.tsx",
          resolutionConfidence: "high",
        }),
        expect.objectContaining({ kind: "call", targetText: "helper", targetFilePath: "src/helper.ts", resolutionConfidence: "high" }),
        expect.objectContaining({ kind: "call", targetText: "Factory.build", resolutionConfidence: "low" }),
      ]),
    );
  });
});
