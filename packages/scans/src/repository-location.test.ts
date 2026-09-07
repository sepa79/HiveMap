import { describe, expect, it } from "vitest";

import {
  assertCanonicalRepositoryLocation,
  normalizeRepositoryLocation,
  RepositoryLocationValidationError,
} from "./repository-location.js";

describe("repository location", () => {
  it("normalizes boundary whitespace and URL casing", () => {
    expect(normalizeRepositoryLocation("  HTTPS://EXAMPLE.COM/org/repo.git  ")).toBe(
      "https://example.com/org/repo.git",
    );
  });

  it.each([
    "ssh://git@example.com/org/repo.git",
    "git@example.com:org/repo.git",
    "deploy@example.com:org/repo.git",
    "git+ssh://git@example.com/org/repo.git",
    "ssh+git://git@example.com/org/repo.git",
  ])("rejects unsupported SSH repository location %s", (repositoryLocation) => {
    expect(() => normalizeRepositoryLocation(repositoryLocation)).toThrow(
      "repositoryUrl must use HTTPS for remote repositories",
    );
  });

  it.each([
    "https://operator@example.com/org/repo.git",
    "https://example.com/org/repo.git?access_token=secret",
    "https://example.com/org/repo.git#fragment",
    "https://example.com/org/repo.git`",
    "https://example.com/org/repo.git\nInjected",
  ])("rejects unsafe portable repository location %s", (repositoryLocation) => {
    expect(() => normalizeRepositoryLocation(repositoryLocation)).toThrow(RepositoryLocationValidationError);
  });

  it("requires stored values to already be canonical", () => {
    expect(() => assertCanonicalRepositoryLocation(" https://example.com/org/repo.git ")).toThrow(
      "repositoryUrl must be canonical",
    );
  });
});
