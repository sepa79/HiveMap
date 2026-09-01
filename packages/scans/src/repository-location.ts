/**
 * Responsibility: Parse and validate the canonical repository-location identifier shared by scan, storage, and API boundaries.
 * Must not: Apply runtime source policy, access repositories, execute Git, or persist records.
 * Contract: Implements the repository-location invariant in docs/specs/repository-indexing.md.
 */

const URL_SOURCE_PATTERN = /^[a-z][a-z0-9+.-]*:\/\//i;
const FORBIDDEN_PORTABLE_TEXT_PATTERN = /[\u0000-\u001f\u007f`]/u;
const SCP_STYLE_SSH_PATTERN = /^[^/\\\s@:]+@[^/\\\s:]+:.+/u;
const SSH_PROTOCOLS = new Set(["ssh:", "git+ssh:", "ssh+git:"]);

export class RepositoryLocationValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "RepositoryLocationValidationError";
  }
}

export function normalizeRepositoryLocation(repositoryLocation: string, label = "repositoryUrl"): string {
  if (FORBIDDEN_PORTABLE_TEXT_PATTERN.test(repositoryLocation)) {
    throw new RepositoryLocationValidationError(`${label} must not contain ASCII control characters or backticks`);
  }

  const normalizedWhitespace = repositoryLocation.trim();
  if (normalizedWhitespace.length === 0) {
    throw new RepositoryLocationValidationError(`${label} must be non-empty`);
  }
  if (normalizedWhitespace.includes("?") || normalizedWhitespace.includes("#")) {
    throw new RepositoryLocationValidationError(`${label} must not contain query parameters or fragments`);
  }

  if (SCP_STYLE_SSH_PATTERN.test(normalizedWhitespace)) {
    throw new RepositoryLocationValidationError(`${label} must use HTTPS for remote repositories`);
  }
  if (!URL_SOURCE_PATTERN.test(normalizedWhitespace)) {
    return normalizedWhitespace;
  }

  let parsed: URL;
  try {
    parsed = new URL(normalizedWhitespace);
  } catch {
    throw new RepositoryLocationValidationError(`${label} must be a valid repository URL`);
  }

  if (SSH_PROTOCOLS.has(parsed.protocol)) {
    throw new RepositoryLocationValidationError(`${label} must use HTTPS for remote repositories`);
  }

  if (parsed.password.length > 0 || (parsed.username.length > 0 && (parsed.protocol === "http:" || parsed.protocol === "https:"))) {
    throw new RepositoryLocationValidationError(`${label} must not contain embedded credentials`);
  }

  return parsed.href;
}

export function assertCanonicalRepositoryLocation(repositoryLocation: string, label = "repositoryUrl"): void {
  if (normalizeRepositoryLocation(repositoryLocation, label) !== repositoryLocation) {
    throw new RepositoryLocationValidationError(`${label} must be canonical`);
  }
}
