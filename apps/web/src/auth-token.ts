/**
 * Responsibility: Own the browser-tab lifecycle of the single operator bearer token.
 * Must not: Send network requests, render UI, or persist credentials beyond the current tab.
 * Contract: Stores one trimmed token in sessionStorage and clears it explicitly on request.
 */
const AUTH_TOKEN_KEY = "HIVEMAP_UI_TOKEN";

let authToken = sessionStorage.getItem(AUTH_TOKEN_KEY) ?? "";

export function getAuthToken(): string {
  return authToken;
}

export function setAuthToken(token: string): void {
  const normalized = token.trim();
  if (normalized.length === 0) {
    throw new Error("API / MCP token must not be empty");
  }
  authToken = normalized;
  sessionStorage.setItem(AUTH_TOKEN_KEY, authToken);
}

export function clearAuthToken(): void {
  authToken = "";
  sessionStorage.removeItem(AUTH_TOKEN_KEY);
}
