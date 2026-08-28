/**
 * Responsibility: Represent MCP tool-name and argument boundary validation failures.
 * Must not: Invoke runtime commands, map HTTP responses, or persist state.
 * Contract: Invalid MCP boundary input is reported with a stable error class.
 */
export class McpToolValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "McpToolValidationError";
  }
}
