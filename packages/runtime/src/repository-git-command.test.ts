import { beforeEach, describe, expect, it, vi } from "vitest";

const { execFileMock } = vi.hoisted(() => {
  const execFileMock = vi.fn();
  Object.defineProperty(execFileMock, Symbol.for("nodejs.util.promisify.custom"), { value: execFileMock, configurable: true });
  return { execFileMock };
});
vi.mock("node:child_process", () => ({ execFile: execFileMock }));

import { runRepositoryGit } from "./repository-git-command.js";

beforeEach(() => {
  execFileMock.mockReset();
});

describe("repository Git failures", () => {
  it.each([
    { properties: { code: 128, killed: false }, message: "Command failed\nfatal: bad revision", expected: ["code=128", "killed=false", "fatal: bad revision"] },
    { properties: { code: null, signal: "SIGTERM", killed: true }, message: "Command failed\nAuto packing the repository in background", expected: ["signal=SIGTERM", "killed=true", "Auto packing"] },
    { properties: { code: "ENOENT" }, message: "spawn prlimit ENOENT", expected: ["code=ENOENT", "spawn prlimit ENOENT"] },
  ])("preserves process diagnostics with $properties", async ({ properties, message, expected }) => {
    const failure = Object.assign(new Error(message), properties);
    execFileMock.mockRejectedValue(failure);

    const error = await runRepositoryGit("/tmp", "fetch", ["origin", "HEAD"]).catch((error: unknown) => error);

    expect(error).toMatchObject({ code: "GIT_COMMAND_FAILED" });
    expect((error as Error).message).toContain("Git fetch failed");
    expect((error as Error).message).toContain("wallLimitMs=120000");
    for (const detail of expected) expect((error as Error).message).toContain(detail);
  });
});
