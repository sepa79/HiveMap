/**
 * Responsibility: Parse and validate API process configuration at the process boundary.
 * Must not: Start servers, open stores, log secrets, or implement REST/MCP behavior.
 * Contract: Returns one explicit, validated process configuration or throws before startup.
 */
import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import type { HiveMapStoreRuntimeConfig } from "@hivemap/storage";

export type ApiProcessConfig = {
  port: number;
  host: string;
  authToken: string;
  storeConfig: HiveMapStoreRuntimeConfig;
  staticRoot?: string;
};

export function readApiProcessConfig(argv: readonly string[], env: NodeJS.ProcessEnv): ApiProcessConfig {
  const portText = readRequiredValue(argv, env, "--port", "HIVEMAP_API_PORT");
  const port = Number(portText);
  const host = readOptionalValue(argv, env, "--host", "HIVEMAP_API_HOST") ?? "127.0.0.1";
  const authToken = readAuthToken(argv, env);
  const postgresUrl = readRequiredValue(argv, env, "--postgres-url", "HIVEMAP_POSTGRES_URL");
  validatePostgresUrl(postgresUrl);
  const staticRoot = readStaticRoot(argv, env);

  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error("HiveMap API requires a valid --port <1-65535> or HIVEMAP_API_PORT");
  }
  if (host.trim().length === 0) {
    throw new Error("HiveMap API requires a non-empty --host or HIVEMAP_API_HOST");
  }

  return {
    port,
    host,
    authToken,
    storeConfig: { backend: "postgres", connectionString: postgresUrl },
    ...(staticRoot === undefined ? {} : { staticRoot }),
  };
}

function readAuthToken(argv: readonly string[], env: NodeJS.ProcessEnv): string {
  const directToken = readExclusiveOptionalValue(argv, env, "--auth-token", "HIVEMAP_AUTH_TOKEN");
  const tokenFile = readExclusiveOptionalValue(argv, env, "--auth-token-file", "HIVEMAP_AUTH_TOKEN_FILE");

  if (directToken !== undefined && tokenFile !== undefined) {
    throw new Error("HiveMap API requires exactly one of HIVEMAP_AUTH_TOKEN or HIVEMAP_AUTH_TOKEN_FILE");
  }
  if (directToken !== undefined) {
    return directToken;
  }
  if (tokenFile === undefined) {
    throw new Error(
      "HiveMap API requires --auth-token, HIVEMAP_AUTH_TOKEN, --auth-token-file, or HIVEMAP_AUTH_TOKEN_FILE",
    );
  }

  let value: string;
  try {
    value = readFileSync(tokenFile, "utf8").trim();
  } catch (error) {
    throw new Error(`HiveMap API cannot read auth token file: ${tokenFile}`, { cause: error });
  }
  if (value.length === 0) {
    throw new Error(`HiveMap API auth token file is empty: ${tokenFile}`);
  }
  return value;
}

function readRequiredValue(
  argv: readonly string[],
  env: NodeJS.ProcessEnv,
  flagName: string,
  envName: string,
): string {
  const value = readOptionalValue(argv, env, flagName, envName);
  if (value === undefined) {
    throw new Error(`HiveMap API requires ${flagName} <value> or ${envName}`);
  }
  return value;
}

function readExclusiveOptionalValue(
  argv: readonly string[],
  env: NodeJS.ProcessEnv,
  flagName: string,
  envName: string,
): string | undefined {
  const flagValue = readFlagValue(argv, flagName);
  const envValue = readEnvironmentValue(env, envName);
  if (flagValue !== undefined && envValue !== undefined) {
    throw new Error(`HiveMap API received both ${flagName} and ${envName}`);
  }
  return flagValue ?? envValue;
}

function readOptionalValue(
  argv: readonly string[],
  env: NodeJS.ProcessEnv,
  flagName: string,
  envName: string,
): string | undefined {
  return readFlagValue(argv, flagName) ?? readEnvironmentValue(env, envName);
}

function readFlagValue(argv: readonly string[], flagName: string): string | undefined {
  const flagIndex = argv.indexOf(flagName);
  if (flagIndex === -1) {
    return undefined;
  }
  const value = argv[flagIndex + 1];
  if (value === undefined || value.trim().length === 0) {
    throw new Error(`${flagName} requires a non-empty value`);
  }
  return value;
}

function readEnvironmentValue(env: NodeJS.ProcessEnv, envName: string): string | undefined {
  const value = env[envName];
  if (value === undefined) {
    return undefined;
  }
  if (value.trim().length === 0) {
    throw new Error(`${envName} requires a non-empty value`);
  }
  return value;
}

function validatePostgresUrl(value: string): void {
  const url = new URL(value);
  if ((url.protocol !== "postgres:" && url.protocol !== "postgresql:") || url.hostname.length === 0) {
    throw new Error("HiveMap API requires an explicit postgres:// or postgresql:// connection URL");
  }
  if (url.pathname.length <= 1) {
    throw new Error("HiveMap API Postgres URL must name a database");
  }
}

function readStaticRoot(argv: readonly string[], env: NodeJS.ProcessEnv): string | undefined {
  const explicit = readOptionalValue(argv, env, "--web-dist", "HIVEMAP_WEB_DIST");
  if (explicit !== undefined) {
    const resolved = resolve(explicit);
    if (!existsSync(resolved)) {
      throw new Error(`HiveMap API static web root does not exist: ${resolved}`);
    }
    return resolved;
  }

  const defaultDist = resolve(dirname(fileURLToPath(import.meta.url)), "../../web/dist");
  return existsSync(defaultDist) ? defaultDist : undefined;
}
