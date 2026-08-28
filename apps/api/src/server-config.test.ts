import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";
import { describePostgresTarget } from "@hivemap/storage";

import { readApiProcessConfig } from "./server-config.js";

const temporaryDirectories: string[] = [];

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) {
    rmSync(directory, { recursive: true, force: true });
  }
});

describe("API process configuration", () => {
  it("reads the auth token from an explicit secret file", () => {
    const directory = mkdtempSync(join(tmpdir(), "hivemap-api-config-"));
    temporaryDirectories.push(directory);
    const tokenFile = join(directory, "auth-token");
    writeFileSync(tokenFile, "file-backed-token\n", { mode: 0o600 });

    const config = readApiProcessConfig(
      ["node", "server.js"],
      {
        HIVEMAP_API_PORT: "8787",
        HIVEMAP_AUTH_TOKEN_FILE: tokenFile,
        HIVEMAP_POSTGRES_URL: "postgresql://postgres:secret@database.internal:5433/hivemap",
      },
    );

    expect(config.authToken).toBe("file-backed-token");
  });

  it("rejects ambiguous direct and file-backed token sources", () => {
    expect(() =>
      readApiProcessConfig(
        ["node", "server.js"],
        {
          HIVEMAP_API_PORT: "8787",
          HIVEMAP_AUTH_TOKEN: "direct-token",
          HIVEMAP_AUTH_TOKEN_FILE: "/run/secrets/hivemap-auth-token",
          HIVEMAP_POSTGRES_URL: "postgresql://postgres@database.internal/hivemap",
        },
      ),
    ).toThrow("exactly one");
  });

  it("rejects empty token files", () => {
    const directory = mkdtempSync(join(tmpdir(), "hivemap-api-config-"));
    temporaryDirectories.push(directory);
    const tokenFile = join(directory, "auth-token");
    writeFileSync(tokenFile, " \n", { mode: 0o600 });

    expect(() =>
      readApiProcessConfig(
        ["node", "server.js"],
        {
          HIVEMAP_API_PORT: "8787",
          HIVEMAP_AUTH_TOKEN_FILE: tokenFile,
          HIVEMAP_POSTGRES_URL: "postgresql://postgres@database.internal/hivemap",
        },
      ),
    ).toThrow("auth token file is empty");
  });

  it("describes Postgres without credentials or query parameters", () => {
    const description = describePostgresTarget(
      "postgresql://operator:super-secret@database.internal:5433/hivemap?sslmode=require",
    );

    expect(description).toBe("Postgres at database.internal:5433/hivemap");
    expect(description).not.toContain("operator");
    expect(description).not.toContain("super-secret");
    expect(description).not.toContain("sslmode");
  });

  it("lets explicit non-secret process flags override image defaults", () => {
    const config = readApiProcessConfig(
      ["node", "server.js", "--port", "9876", "--host", "0.0.0.0"],
      {
        HIVEMAP_API_PORT: "8787",
        HIVEMAP_API_HOST: "127.0.0.1",
        HIVEMAP_AUTH_TOKEN: "test-token",
        HIVEMAP_POSTGRES_URL: "postgresql://postgres@database.internal/hivemap",
      },
    );

    expect(config.port).toBe(9876);
    expect(config.host).toBe("0.0.0.0");
  });
});
