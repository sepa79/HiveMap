import { createHash } from "node:crypto";
import { createRequire } from "node:module";
import { posix as pathPosix } from "node:path";

import Parser from "tree-sitter";

import type {
  RepositoryDependencyRecord,
  RepositoryFileRecord,
  RepositoryReferenceRecord,
  RepositorySymbolRecord,
} from "@hivemap/storage";

const require = createRequire(import.meta.url);
const TypeScript = require("tree-sitter-typescript") as {
  typescript: Parser.Language;
  tsx: Parser.Language;
};
const Java = require("tree-sitter-java") as Parser.Language;

const PRODUCER_TOOL = "tree-sitter";
const PRODUCER_VERSION = "tree-sitter@0.25.0/typescript@0.23.2/java@0.23.5";

type SupportedSyntaxLanguage = "typescript" | "tsx" | "java";

export function createRepositorySyntaxFacts(options: {
  workspaceId: string;
  indexId: string;
  filePath: string;
  language: string;
  sourceKind: string;
  text: string;
}): {
  symbols: RepositorySymbolRecord[];
  references: RepositoryReferenceRecord[];
} {
  const syntaxLanguage = resolveSyntaxLanguage(options.language);
  if (syntaxLanguage === undefined) {
    return { symbols: [], references: [] };
  }

  const parser = new Parser();
  parser.setLanguage(selectTreeSitterLanguage(syntaxLanguage));
  const tree = parser.parse(options.text);

  switch (syntaxLanguage) {
    case "typescript":
    case "tsx":
      return extractTypeScriptFacts(options, tree.rootNode);
    case "java":
      return extractJavaFacts(options, tree.rootNode);
    default:
      return { symbols: [], references: [] };
  }
}

export function createRepositorySymbols(options: {
  workspaceId: string;
  indexId: string;
  filePath: string;
  language: string;
  text: string;
}): RepositorySymbolRecord[] {
  return createRepositorySyntaxFacts({ ...options, sourceKind: "code" }).symbols;
}

export function createRepositoryReferences(options: {
  workspaceId: string;
  indexId: string;
  filePath: string;
  language: string;
  sourceKind: string;
  text: string;
}): RepositoryReferenceRecord[] {
  return createRepositorySyntaxFacts(options).references;
}

export function createRepositoryDependencies(options: {
  files: readonly RepositoryFileRecord[];
  symbols: readonly RepositorySymbolRecord[];
  references: readonly RepositoryReferenceRecord[];
}): RepositoryDependencyRecord[] {
  const importTargetIndex = createImportTargetIndex(options.files);
  const symbolsByKey = new Map(options.symbols.map((symbol) => [symbol.key, symbol]));
  const symbolLookup = createReferenceSymbolIndex(options.symbols);

  return dedupeDependencies(
    options.references.map((reference) =>
      createDependencyRecord(reference, resolveDependencyTarget(reference, symbolsByKey, symbolLookup, importTargetIndex)),
    ),
  );
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

function extractTypeScriptFacts(
  options: {
    workspaceId: string;
    indexId: string;
    filePath: string;
    language: string;
    sourceKind: string;
  },
  rootNode: Parser.SyntaxNode,
): { symbols: RepositorySymbolRecord[]; references: RepositoryReferenceRecord[] } {
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
  return {
    symbols,
    references: extractTypeScriptReferences(options, rootNode, symbols),
  };
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

function extractJavaFacts(
  options: {
    workspaceId: string;
    indexId: string;
    filePath: string;
    language: string;
    sourceKind: string;
  },
  rootNode: Parser.SyntaxNode,
): { symbols: RepositorySymbolRecord[]; references: RepositoryReferenceRecord[] } {
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

  return {
    symbols,
    references: extractJavaReferences(options, rootNode, symbols),
  };
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

function extractTypeScriptReferences(
  options: {
    workspaceId: string;
    indexId: string;
    filePath: string;
    language: string;
    sourceKind: string;
  },
  rootNode: Parser.SyntaxNode,
  symbols: readonly RepositorySymbolRecord[],
): RepositoryReferenceRecord[] {
  const references: RepositoryReferenceRecord[] = [];
  const symbolIndex = createReferenceSymbolIndex(symbols);

  for (const node of rootNode.namedChildren) {
    if (node.type === "import_statement") {
      const sourceNode = node.namedChildren.find((child) => child.type === "string");
      const sourceText = sourceNode?.text.replace(/^['"]|['"]$/gu, "").trim();
      if (sourceNode !== undefined && sourceText !== undefined && sourceText.length > 0) {
        references.push(createReferenceRecord(options, sourceNode, "import", sourceText, symbolIndex));
      }
      continue;
    }
    collectTypeScriptNodeReferences(options, node, symbolIndex, references);
  }

  return dedupeReferences(references);
}

function collectTypeScriptNodeReferences(
  options: {
    workspaceId: string;
    indexId: string;
    filePath: string;
    language: string;
    sourceKind: string;
  },
  node: Parser.SyntaxNode,
  symbolIndex: Map<string, RepositorySymbolRecord>,
  references: RepositoryReferenceRecord[],
): void {
  if (node.type === "class_declaration") {
    const heritage = node.namedChildren.find((child) => child.type === "class_heritage");
    if (heritage !== undefined) {
      for (const clause of heritage.namedChildren) {
        if (clause.type === "extends_clause") {
          const targetNode = clause.namedChildren.find((child) => child.type === "identifier" || child.type === "type_identifier");
          if (targetNode !== undefined) {
            references.push(createReferenceRecord(options, targetNode, "extends", targetNode.text, symbolIndex));
          }
          continue;
        }
        if (clause.type === "implements_clause") {
          for (const targetNode of clause.namedChildren.filter((child) => child.type === "identifier" || child.type === "type_identifier")) {
            references.push(createReferenceRecord(options, targetNode, "implements", targetNode.text, symbolIndex));
          }
        }
      }
    }
  }

  if (node.type === "new_expression") {
    const constructorNode = node.namedChildren.find((child) => child.type === "identifier" || child.type === "type_identifier");
    if (constructorNode !== undefined) {
      references.push(createReferenceRecord(options, constructorNode, "instantiation", constructorNode.text, symbolIndex));
    }
  }

  if (node.type === "call_expression") {
    const functionNode = node.childForFieldName("function") ?? node.namedChildren[0];
    const targetText = extractCallableTargetText(functionNode);
    if (functionNode !== undefined && targetText !== undefined) {
      references.push(createReferenceRecord(options, functionNode, "call", targetText, symbolIndex));
    }
  }

  for (const child of node.namedChildren) {
    collectTypeScriptNodeReferences(options, child, symbolIndex, references);
  }
}

function extractJavaReferences(
  options: {
    workspaceId: string;
    indexId: string;
    filePath: string;
    language: string;
    sourceKind: string;
  },
  rootNode: Parser.SyntaxNode,
  symbols: readonly RepositorySymbolRecord[],
): RepositoryReferenceRecord[] {
  const references: RepositoryReferenceRecord[] = [];
  const symbolIndex = createReferenceSymbolIndex(symbols);

  for (const node of rootNode.namedChildren) {
    if (node.type === "import_declaration") {
      const targetNode = node.namedChildren.find((child) => child.type === "scoped_identifier" || child.type === "identifier");
      if (targetNode !== undefined) {
        references.push(createReferenceRecord(options, targetNode, "import", normalizeJavaQualifiedName(targetNode.text), symbolIndex));
      }
      continue;
    }
    collectJavaNodeReferences(options, node, symbolIndex, references);
  }

  return dedupeReferences(references);
}

function collectJavaNodeReferences(
  options: {
    workspaceId: string;
    indexId: string;
    filePath: string;
    language: string;
    sourceKind: string;
  },
  node: Parser.SyntaxNode,
  symbolIndex: Map<string, RepositorySymbolRecord>,
  references: RepositoryReferenceRecord[],
): void {
  if (node.type === "class_declaration" || node.type === "interface_declaration" || node.type === "record_declaration" || node.type === "enum_declaration") {
    const superclass = node.namedChildren.find((child) => child.type === "superclass");
    const superInterfaces = node.namedChildren.find((child) => child.type === "super_interfaces");
    const superType = superclass?.namedChildren.find((child) => child.type === "type_identifier");
    if (superType !== undefined) {
      references.push(createReferenceRecord(options, superType, "extends", superType.text, symbolIndex));
    }
    if (superInterfaces !== undefined) {
      for (const targetNode of findNamedChildren(superInterfaces, "type_identifier")) {
        references.push(createReferenceRecord(options, targetNode, "implements", targetNode.text, symbolIndex));
      }
    }
  }

  if (node.type === "object_creation_expression") {
    const typeNode = node.namedChildren.find((child) => child.type === "type_identifier");
    if (typeNode !== undefined) {
      references.push(createReferenceRecord(options, typeNode, "instantiation", typeNode.text, symbolIndex));
    }
  }

  if (node.type === "method_invocation") {
    const targetText = extractJavaMethodInvocationTarget(node);
    if (targetText !== undefined) {
      references.push(createReferenceRecord(options, node, "call", targetText, symbolIndex));
    }
  }

  for (const child of node.namedChildren) {
    collectJavaNodeReferences(options, child, symbolIndex, references);
  }
}

function createReferenceSymbolIndex(symbols: readonly RepositorySymbolRecord[]): Map<string, RepositorySymbolRecord> {
  const counts = new Map<string, number>();
  for (const symbol of symbols) {
    for (const lookup of new Set([symbol.name, symbol.qualifiedName])) {
      counts.set(lookup, (counts.get(lookup) ?? 0) + 1);
    }
  }

  const index = new Map<string, RepositorySymbolRecord>();
  for (const symbol of symbols) {
    for (const lookup of new Set([symbol.name, symbol.qualifiedName])) {
      if ((counts.get(lookup) ?? 0) === 1) {
        index.set(lookup, symbol);
      }
    }
  }
  return index;
}

function createReferenceRecord(
  options: {
    workspaceId: string;
    indexId: string;
    filePath: string;
    language: string;
    sourceKind: string;
  },
  node: Parser.SyntaxNode,
  kind: string,
  targetText: string,
  symbolIndex: Map<string, RepositorySymbolRecord>,
): RepositoryReferenceRecord {
  const normalizedTargetText = targetText.trim();
  const resolvedSymbolKey = symbolIndex.get(normalizedTargetText)?.key;
  const key = createHash("sha256")
    .update([options.filePath, kind, normalizedTargetText, String(node.startIndex), String(node.endIndex)].join("::"))
    .digest("hex")
    .slice(0, 24);
  return {
    workspaceId: options.workspaceId,
    indexId: options.indexId,
    key,
    filePath: options.filePath,
    language: options.language,
    sourceKind: options.sourceKind,
    kind,
    targetText: normalizedTargetText,
    ...(resolvedSymbolKey === undefined ? {} : { resolvedSymbolKey }),
    startLine: node.startPosition.row + 1,
    startColumn: node.startPosition.column,
    endLine: node.endPosition.row + 1,
    endColumn: node.endPosition.column,
    resolutionConfidence: resolvedSymbolKey === undefined ? "low" : "high",
    producerTool: PRODUCER_TOOL,
    producerVersion: PRODUCER_VERSION,
  };
}

function createDependencyRecord(
  reference: RepositoryReferenceRecord,
  resolution: {
    targetFilePath?: string;
    targetSymbolKey?: string;
    resolutionConfidence: string;
  },
): RepositoryDependencyRecord {
  const key = createHash("sha256")
    .update(
      [
        reference.filePath,
        reference.kind,
        reference.targetText,
        resolution.targetFilePath ?? "",
        resolution.targetSymbolKey ?? "",
        String(reference.startLine),
        String(reference.startColumn),
        String(reference.endLine),
        String(reference.endColumn),
      ].join("::"),
    )
    .digest("hex")
    .slice(0, 24);
  return {
    workspaceId: reference.workspaceId,
    indexId: reference.indexId,
    key,
    filePath: reference.filePath,
    language: reference.language,
    sourceKind: reference.sourceKind,
    kind: reference.kind,
    targetText: reference.targetText,
    ...(resolution.targetFilePath === undefined ? {} : { targetFilePath: resolution.targetFilePath }),
    ...(resolution.targetSymbolKey === undefined ? {} : { targetSymbolKey: resolution.targetSymbolKey }),
    startLine: reference.startLine,
    startColumn: reference.startColumn,
    endLine: reference.endLine,
    endColumn: reference.endColumn,
    resolutionConfidence: resolution.resolutionConfidence,
    producerTool: reference.producerTool,
    producerVersion: reference.producerVersion,
  };
}

function resolveDependencyTarget(
  reference: RepositoryReferenceRecord,
  symbolsByKey: Map<string, RepositorySymbolRecord>,
  symbolLookup: Map<string, RepositorySymbolRecord>,
  importTargetIndex: Map<string, string>,
): {
  targetFilePath?: string;
  targetSymbolKey?: string;
  resolutionConfidence: string;
} {
  const directSymbol = reference.resolvedSymbolKey === undefined ? undefined : symbolsByKey.get(reference.resolvedSymbolKey);
  if (directSymbol !== undefined) {
    return {
      targetFilePath: directSymbol.filePath,
      targetSymbolKey: directSymbol.key,
      resolutionConfidence: "high",
    };
  }

  if (reference.kind === "import") {
    const targetFilePath = resolveImportTargetFilePath(reference.filePath, reference.targetText, importTargetIndex);
    if (targetFilePath !== undefined) {
      return { targetFilePath, resolutionConfidence: "high" };
    }
  }

  for (const lookupKey of createDependencyLookupKeys(reference.targetText)) {
    const symbol = symbolLookup.get(lookupKey);
    if (symbol !== undefined) {
      return {
        targetFilePath: symbol.filePath,
        targetSymbolKey: symbol.key,
        resolutionConfidence: "high",
      };
    }
  }

  return { resolutionConfidence: "low" };
}

function createDependencyLookupKeys(targetText: string): string[] {
  const normalized = targetText.trim();
  if (normalized.length === 0) {
    return [];
  }
  const lookups = [normalized];
  if (normalized.includes(".")) {
    const trailingSegment = normalized.split(".").at(-1)?.trim();
    if (trailingSegment !== undefined && trailingSegment.length > 0 && trailingSegment !== normalized) {
      lookups.push(trailingSegment);
    }
  }
  return lookups;
}

function createImportTargetIndex(files: readonly RepositoryFileRecord[]): Map<string, string> {
  const counts = new Map<string, number>();
  const aliases = new Map<string, string>();

  for (const file of files) {
    const normalizedPath = normalizeRepositoryPath(file.path);
    for (const alias of createImportAliases(normalizedPath)) {
      counts.set(alias, (counts.get(alias) ?? 0) + 1);
      aliases.set(alias, normalizedPath);
    }
  }

  const unique = new Map<string, string>();
  for (const [alias, filePath] of aliases.entries()) {
    if ((counts.get(alias) ?? 0) === 1) {
      unique.set(alias, filePath);
    }
  }
  return unique;
}

function createImportAliases(filePath: string): string[] {
  const strippedExtension = stripRepositoryModuleExtension(filePath);
  const aliases = [strippedExtension];
  const parentDirectory = pathPosix.dirname(strippedExtension);
  if (pathPosix.basename(strippedExtension) === "index" && parentDirectory !== ".") {
    aliases.push(parentDirectory);
  }
  return aliases;
}

function resolveImportTargetFilePath(sourceFilePath: string, targetText: string, importTargetIndex: Map<string, string>): string | undefined {
  if (!targetText.startsWith(".")) {
    return importTargetIndex.get(targetText.trim());
  }
  const resolved = normalizeRepositoryPath(pathPosix.join(pathPosix.dirname(normalizeRepositoryPath(sourceFilePath)), targetText.trim()));
  return importTargetIndex.get(resolved);
}

function stripRepositoryModuleExtension(filePath: string): string {
  return filePath.replace(/(?:\.d)?\.(?:ts|tsx|js|jsx|mjs|cjs|mts|cts|java)$/u, "");
}

function normalizeRepositoryPath(filePath: string): string {
  const normalized = pathPosix.normalize(filePath.replace(/\\/gu, "/"));
  return normalized.startsWith("./") ? normalized.slice(2) : normalized;
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

function extractCallableTargetText(node: Parser.SyntaxNode | null | undefined): string | undefined {
  if (node === null || node === undefined) {
    return undefined;
  }
  if (node.type === "identifier" || node.type === "type_identifier" || node.type === "property_identifier") {
    return node.text;
  }
  if (node.type === "member_expression") {
    return node.text;
  }
  return undefined;
}

function extractJavaMethodInvocationTarget(node: Parser.SyntaxNode): string | undefined {
  const target = node.namedChildren
    .filter((child) => child.type !== "argument_list")
    .map((child) => child.text)
    .join(".");
    return target.trim().length === 0 ? undefined : target;
}

function dedupeReferences(references: readonly RepositoryReferenceRecord[]): RepositoryReferenceRecord[] {
  const seen = new Set<string>();
  const deduped: RepositoryReferenceRecord[] = [];
  for (const reference of references) {
    const fingerprint = [
      reference.filePath,
      reference.kind,
      reference.targetText,
      reference.startLine,
      reference.startColumn,
      reference.endLine,
      reference.endColumn,
    ].join("::");
    if (seen.has(fingerprint)) {
      continue;
    }
    seen.add(fingerprint);
    deduped.push(reference);
  }
  return deduped;
}

function dedupeDependencies(dependencies: readonly RepositoryDependencyRecord[]): RepositoryDependencyRecord[] {
  const seen = new Set<string>();
  const deduped: RepositoryDependencyRecord[] = [];
  for (const dependency of dependencies) {
    const fingerprint = [
      dependency.filePath,
      dependency.kind,
      dependency.targetText,
      dependency.targetFilePath ?? "",
      dependency.targetSymbolKey ?? "",
      dependency.startLine,
      dependency.startColumn,
      dependency.endLine,
      dependency.endColumn,
    ].join("::");
    if (seen.has(fingerprint)) {
      continue;
    }
    seen.add(fingerprint);
    deduped.push(dependency);
  }
  return deduped;
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
