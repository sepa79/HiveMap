/**
 * Responsibility: Represent explicit runtime command and orchestration failures.
 * Must not: Map errors to transports, persist state, or recover invalid commands.
 * Contract: Carries a stable code and optional details across REST and MCP adapters.
 */
export class RuntimeError extends Error {
  readonly code: string;
  readonly details?: unknown;

  constructor(message: string, options?: { code?: string; details?: unknown }) {
    super(message);
    this.name = "RuntimeError";
    this.code = options?.code ?? "RUNTIME_ERROR";
    this.details = options?.details;
  }
}
