/**
 * Responsibility: Normalize repository paths and evaluate the scan-profile glob subset.
 * Must not: Access the filesystem, select scan evidence, or interpret semantic graph state.
 * Contract: Applies deterministic POSIX-like path normalization and *, **, ? segment matching.
 */
export function normalizeRepositoryPath(value: string): string {
  return value.replace(/\\/g, "/");
}

export function matchesAnyGlob(path: string, patterns: readonly string[]): boolean {
  return patterns.some((pattern) => matchesGlob(normalizeRepositoryPath(path), normalizeRepositoryPath(pattern)));
}

export function matchesGlob(path: string, pattern: string): boolean {
  return matchGlobSegments(path.split("/"), pattern.split("/"), 0, 0);
}

function matchGlobSegments(pathSegments: readonly string[], patternSegments: readonly string[], pathIndex: number, patternIndex: number): boolean {
  if (patternIndex >= patternSegments.length) {
    return pathIndex >= pathSegments.length;
  }
  const patternSegment = patternSegments[patternIndex] ?? "";
  if (patternSegment === "**") {
    if (patternIndex === patternSegments.length - 1) {
      return true;
    }
    for (let nextPathIndex = pathIndex; nextPathIndex <= pathSegments.length; nextPathIndex += 1) {
      if (matchGlobSegments(pathSegments, patternSegments, nextPathIndex, patternIndex + 1)) {
        return true;
      }
    }
    return false;
  }
  if (pathIndex >= pathSegments.length) {
    return false;
  }
  if (!matchesGlobSegment(pathSegments[pathIndex] ?? "", patternSegment)) {
    return false;
  }
  return matchGlobSegments(pathSegments, patternSegments, pathIndex + 1, patternIndex + 1);
}

function matchesGlobSegment(value: string, pattern: string): boolean {
  return matchGlobSegmentChars(value, pattern, 0, 0);
}

function matchGlobSegmentChars(value: string, pattern: string, valueIndex: number, patternIndex: number): boolean {
  if (patternIndex >= pattern.length) {
    return valueIndex >= value.length;
  }
  const patternChar = pattern[patternIndex] ?? "";
  if (patternChar === "*") {
    for (let nextValueIndex = valueIndex; nextValueIndex <= value.length; nextValueIndex += 1) {
      if (matchGlobSegmentChars(value, pattern, nextValueIndex, patternIndex + 1)) {
        return true;
      }
    }
    return false;
  }
  if (valueIndex >= value.length) {
    return false;
  }
  if (patternChar !== "?" && patternChar !== value[valueIndex]) {
    return false;
  }
  return matchGlobSegmentChars(value, pattern, valueIndex + 1, patternIndex + 1);
}
