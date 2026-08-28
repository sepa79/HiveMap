/**
 * Responsibility: Produce a credential-free description of a Postgres connection target.
 * Must not: Open connections, expose usernames/passwords/query values, or accept non-Postgres URLs.
 * Contract: Returns only host, effective port, and database name for operational logs.
 */
export function describePostgresTarget(connectionString: string): string {
  const url = new URL(connectionString);
  if ((url.protocol !== "postgres:" && url.protocol !== "postgresql:") || url.hostname.length === 0) {
    throw new Error("Expected an explicit postgres:// or postgresql:// connection URL");
  }
  const port = url.port.length === 0 ? "5432" : url.port;
  const database = url.pathname.slice(1);
  if (database.length === 0) {
    throw new Error("Expected the Postgres connection URL to name a database");
  }
  return `Postgres at ${url.hostname}:${port}/${database}`;
}
