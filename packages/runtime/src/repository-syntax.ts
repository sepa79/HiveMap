import { createHash } from "node:crypto";
import { createRequire } from "node:module";

import Parser from "tree-sitter";

import type { RepositorySymbolRecord } from "@hivemap/storage";

const require = createRequire(import.meta.url);
const TypeScript = require("tree-sitter-typescript") as {
  typescript: Parser.Language;
  tsx: Parser.Language;
};
const Java = require("tree-sitter-java") as Parser.Language;

const PRODUCER_TOOL = "tree-sitter";
const PRODUCER_VERSION = "tree-sitter@0.25.0/typescript@0.23.2/java@0.23.5";

type SupportedSyntaxLanguage = "typescript" | "tsx" | "java";

export function createRepositorySymbols(options: {
  workspaceId: string;
  indexId: string;
  filePath: string;
  language: string;
  text: string;
}): RepositorySymbolRecord[] {
  const syntaxLanguage = resolveSyntaxLanguage(options.language);
  if (syntaxLanguage === undefined) {
    return [];
  }

  const parser = new Parser();
  parser.setLanguage(selectTreeSitterLanguage(syntaxLanguage));
  const tree = parser.parse(options.text);

  switch (syntaxLanguage) {
    case "typescript":
    case "tsx":
      return extractTypeScriptSymbols(options, tree.rootNode);
    case "java":
      return extractJavaSymbols(options, tree.rootNode);
    default:
      return [];
  }
}

function resolveSyntaxLanguage(language: string): SupportedSyntaxLanguage | undefined {
  switch (language) {
    case "typescript":
      return "typescript";
    case "tsx":
    case "javascript":
    case "jsx":
      return "tsx";
    case "java":
      return "java";
    default:
      return undefined;
  }
}

function selectTreeSitterLanguage(language: SupportedSyntaxLanguage): Parser.Language {
  switch (language) {
    case "typescript":
      return TypeScript.typescript;
    case "tsx":
      return TypeScript.tsx;
    case "java":
      return Java;
  }
}

function extractTypeScriptSymbols(
  options: {
    workspaceId: string;
    indexId: string;
    filePath: string;
    language: string;
  },
  rootNode: Parser.SyntaxNode,
): RepositorySymbolRecord[] {
  const symbols: RepositorySymbolRecord[] = [];
  for (const node of rootNode.namedChildren) {
    collectTypeScriptNodeSymbols({
      ...options,
      node,
      exported: false,
      parents: [],
      symbols,
    });
  }
  return symbols;
}

function collectTypeScriptNodeSymbols(options: {
  workspaceId: string;
  indexId: string;
  filePath: string;
  language: string;
  node: Parser.SyntaxNode;
  exported: boolean;
  parents: RepositorySymbolRecord[];
  symbols: RepositorySymbolRecord[];
}): void {
  const { node } = options;
  if (node.type === "export_statement") {
    const declaration = node.childForFieldName("declaration");
    if (declaration !== null) {
      collectTypeScriptNodeSymbols({ ...options, node: declaration, exported: true });
    }
    return;
  }

  if (node.type === "class_declaration") {
    const symbol = createSymbolRecord(options, node, "class", getNodeText(node.childForFieldName("name")));
    if (symbol === undefined) {
      return;
    }
    options.symbols.push(symbol);
    const body = node.childForFieldName("body");
    if (body !== null) {
      for (const member of body.namedChildren) {
        const kind = resolveTypeScriptMemberKind(member.type);
        if (kind === undefined) {
          continue;
        }
        const memberSymbol = createSymbolRecord(
          { ...options, parents: [...options.parents, symbol], exported: false },
          member,
          kind,
          getNodeText(member.childForFieldName("name")),
        );
        if (memberSymbol !== undefined) {
          options.symbols.push(memberSymbol);
        }
      }
    }
    return;
  }

  if (
    node.type === "function_declaration" ||
    node.type === "interface_declaration" ||
    node.type === "enum_declaration" ||
    node.type === "type_alias_declaration"
  ) {
    const kind = TYPE_SCRIPT_DECLARATION_KINDS[node.type];
    if (kind === undefined) {
      return;
    }
    const name = getNodeText(node.childForFieldName("name"));
    const symbol = createSymbolRecord(options, node, kind, name);
    if (symbol === undefined) {
      return;
    }
    options.symbols.push(symbol);

    if (node.type === "interface_declaration") {
      const body = node.childForFieldName("body");
      if (body !== null) {
        for (const member of body.namedChildren) {
          const kind = resolveTypeScriptMemberKind(member.type);
          if (kind === undefined) {
            continue;
          }
          const memberSymbol = createSymbolRecord(
            { ...options, parents: [...options.parents, symbol], exported: false },
            member,
            kind,
            getNodeText(member.childForFieldName("name")),
          );
          if (memberSymbol !== undefined) {
            options.symbols.push(memberSymbol);
          }
        }
      }
    }
    return;
  }

  if (node.type === "lexical_declaration" || node.type === "variable_declaration") {
    for (const declarator of node.namedChildren.filter((child) => child.type === "variable_declarator")) {
      const nameNode = declarator.childForFieldName("name");
      const name = extractSimpleIdentifier(nameNode);
      const symbol = createSymbolRecord(options, declarator, "variable", name);
      if (symbol !== undefined) {
        options.symbols.push(symbol);
      }
    }
  }
}

function extractJavaSymbols(
  options: {
    workspaceId: string;
    indexId: string;
    filePath: string;
    language: string;
  },
  rootNode: Parser.SyntaxNode,
): RepositorySymbolRecord[] {
  const symbols: RepositorySymbolRecord[] = [];
  const packageNode = rootNode.namedChildren.find((node) => node.type === "package_declaration");
  let packageSymbol: RepositorySymbolRecord | undefined;
  if (packageNode !== undefined) {
    const packageName = normalizeJavaQualifiedName(packageNode.text.replace(/^package\s+/u, "").replace(/;$/u, "").trim());
    packageSymbol = createSymbolRecord(
      { ...options, exported: false, parents: [] },
      packageNode,
      "package",
      packageName,
      packageName,
    );
    if (packageSymbol !== undefined) {
      symbols.push(packageSymbol);
    }
  }

  for (const node of rootNode.namedChildren) {
    if (!JAVA_DECLARATION_KINDS[node.type]) {
      continue;
    }
    collectJavaDeclarationSymbols({
      ...options,
      node,
      parents: packageSymbol === undefined ? [] : [packageSymbol],
      symbols,
    });
  }

  return symbols;
}

function collectJavaDeclarationSymbols(options: {
  workspaceId: string;
  indexId: string;
  filePath: string;
  language: string;
  node: Parser.SyntaxNode;
  parents: RepositorySymbolRecord[];
  symbols: RepositorySymbolRecord[];
}): void {
  const kind = JAVA_DECLARATION_KINDS[options.node.type];
  if (kind === undefined) {
    return;
  }
  const name = getNodeText(options.node.childForFieldName("name"));
  const symbol = createSymbolRecord({ ...options, exported: false }, options.node, kind, name);
  if (symbol === undefined) {
    return;
  }
  options.symbols.push(symbol);

  const body = options.node.childForFieldName("body");
  if (body === null) {
    return;
  }

  for (const member of body.namedChildren) {
    if (JAVA_DECLARATION_KINDS[member.type] !== undefined) {
      collectJavaDeclarationSymbols({ ...options, node: member, parents: [...options.parents, symbol] });
      continue;
    }
    if (member.type === "field_declaration" || member.type === "constant_declaration") {
      for (const declarator of findNamedChildren(member, "variable_declarator")) {
        const fieldSymbol = createSymbolRecord(
          { ...options, parents: [...options.parents, symbol], exported: false },
          declarator,
          "field",
          getNodeText(declarator.childForFieldName("name")),
        );
        if (fieldSymbol !== undefined) {
          options.symbols.push(fieldSymbol);
        }
      }
      continue;
    }
    if (member.type === "method_declaration" || member.type === "constructor_declaration") {
      const memberSymbol = createSymbolRecord(
        { ...options, parents: [...options.parents, symbol], exported: false },
        member,
        member.type === "constructor_declaration" ? "constructor" : "method",
        getNodeText(member.childForFieldName("name")),
      );
      if (memberSymbol !== undefined) {
        options.symbols.push(memberSymbol);
      }
    }
  }
}

function createSymbolRecord(
  options: {
    workspaceId: string;
    indexId: string;
    filePath: string;
    language: string;
    parents: RepositorySymbolRecord[];
    exported: boolean;
  },
  node: Parser.SyntaxNode,
  kind: string,
  name?: string,
  explicitQualifiedName?: string,
): RepositorySymbolRecord | undefined {
  const normalizedName = normalizeSymbolName(name);
  if (normalizedName === undefined) {
    return undefined;
  }
  const qualifiedName =
    explicitQualifiedName ??
    [...options.parents.map((parent) => parent.name), normalizedName]
      .filter((part) => part.length > 0)
      .join(".");
  const parentSymbolKey = options.parents.at(-1)?.key;
  const key = createHash("sha256")
    .update([options.filePath, kind, qualifiedName, String(node.startIndex), String(node.endIndex)].join("::"))
    .digest("hex")
    .slice(0, 24);
  return {
    workspaceId: options.workspaceId,
    indexId: options.indexId,
    key,
    filePath: options.filePath,
    language: options.language,
    name: normalizedName,
    qualifiedName,
    kind,
    ...(parentSymbolKey === undefined ? {} : { parentSymbolKey }),
    startLine: node.startPosition.row + 1,
    startColumn: node.startPosition.column,
    endLine: node.endPosition.row + 1,
    endColumn: node.endPosition.column,
    isExported: options.exported,
    isPublic: options.exported || hasPublicModifier(node),
    producerTool: PRODUCER_TOOL,
    producerVersion: PRODUCER_VERSION,
  };
}

function getNodeText(node: Parser.SyntaxNode | null): string | undefined {
  return node?.text.trim() || undefined;
}

function extractSimpleIdentifier(node: Parser.SyntaxNode | null): string | undefined {
  if (node === null) {
    return undefined;
  }
  if (node.type === "identifier" || node.type === "property_identifier" || node.type === "type_identifier") {
    return node.text;
  }
  return undefined;
}

function normalizeSymbolName(value?: string): string | undefined {
  if (value === undefined) {
    return undefined;
  }
  const normalized = value.trim();
  return normalized.length === 0 ? undefined : normalized;
}

function normalizeJavaQualifiedName(value: string): string {
  return value.replace(/\s+/gu, "");
}

function hasPublicModifier(node: Parser.SyntaxNode): boolean {
  const modifiers = node.childForFieldName("modifiers") ?? node.namedChildren.find((child) => child.type === "modifiers");
  if (modifiers !== undefined && modifiers !== null) {
    return modifiers.text.includes("public");
  }
  return node.text.trimStart().startsWith("public ");
}

function findNamedChildren(node: Parser.SyntaxNode, type: string): Parser.SyntaxNode[] {
  const matches: Parser.SyntaxNode[] = [];
  for (const child of node.namedChildren) {
    if (child.type === type) {
      matches.push(child);
    }
    matches.push(...findNamedChildren(child, type));
  }
  return matches;
}

function resolveTypeScriptMemberKind(type: string): string | undefined {
  switch (type) {
    case "public_field_definition":
    case "property_signature":
      return "field";
    case "method_definition":
    case "method_signature":
    case "abstract_method_signature":
      return "method";
    default:
      return undefined;
  }
}

const TYPE_SCRIPT_DECLARATION_KINDS: Record<string, string> = {
  function_declaration: "function",
  interface_declaration: "interface",
  enum_declaration: "enum",
  type_alias_declaration: "type_alias",
};

const JAVA_DECLARATION_KINDS: Record<string, string> = {
  class_declaration: "class",
  interface_declaration: "interface",
  enum_declaration: "enum",
  record_declaration: "record",
};
