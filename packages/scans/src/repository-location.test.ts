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

  it("allows SSH usernames without allowing URL passwords", () => {
    expect(normalizeRepositoryLocation("ssh://git@example.com/org/repo.git")).toBe(
      "ssh://git@example.com/org/repo.git",
    );
    expect(normalizeRepositoryLocation("git@example.com:org/repo.git")).toBe(
      "git@example.com:org/repo.git",
    );
    expect(() => normalizeRepositoryLocation("ssh://git:secret@example.com/org/repo.git")).toThrow(
      "repositoryUrl must not contain embedded credentials",
    );
  });

  it.each([
    "https://operator@example.com/org/repo.git",
    "https://example.com/org/repo.git?access_token=secret",
    "ssh://git@example.com/org/repo.git#secret",
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
