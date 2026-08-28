/**
 * Responsibility: Render and coordinate the operator token save/clear controls.
 * Must not: Persist tokens directly, call semantic graph operations, or own workspace state.
 * Contract: Delegates token lifecycle to auth-token and notifies the parent after save or clear.
 */
import { FormEvent, useState } from "react";

import { clearAuthToken, getAuthToken, setAuthToken } from "./auth-token.js";

export type AuthTokenPanelProps = {
  onTokenChanged: (hasToken: boolean) => void | Promise<void>;
};

export function AuthTokenPanel({ onTokenChanged }: AuthTokenPanelProps) {
  const [storedToken, setStoredToken] = useState(getAuthToken());
  const [tokenInput, setTokenInput] = useState(storedToken);

  function handleSubmit(event: FormEvent<HTMLFormElement>): void {
    event.preventDefault();
    setAuthToken(tokenInput);
    setStoredToken(tokenInput.trim());
    void onTokenChanged(true);
  }

  function handleClear(): void {
    clearAuthToken();
    setStoredToken("");
    setTokenInput("");
    void onTokenChanged(false);
  }

  return (
    <form className="panel auth-panel" onSubmit={handleSubmit}>
      <label>
        API / MCP token
        <input
          aria-label="API / MCP token"
          type="password"
          autoComplete="current-password"
          value={tokenInput}
          onChange={(event) => setTokenInput(event.currentTarget.value)}
          placeholder="HIVEMAP_AUTH_TOKEN"
        />
      </label>
      <div className="button-row">
        <button type="submit">Set token</button>
        <button type="button" onClick={handleClear} disabled={storedToken.length === 0}>
          Clear token
        </button>
      </div>
      <small>Stored only for this browser tab.</small>
    </form>
  );
}
