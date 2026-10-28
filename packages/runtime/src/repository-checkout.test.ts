import { execFile } from "node:child_process";
import { chmod, mkdir, mkdtemp, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { delimiter, join } from "node:path";
import { pathToFileURL } from "node:url";
import { promisify } from "node:util";

import { afterEach, describe, expect, it, vi } from "vitest";

import { withSafeRepositoryCheckout } from "./repository-checkout.js";

const execFileAsync = promisify(execFile);
const temporaryPaths: string[] = [];

afterEach(async () => {
  vi.unstubAllEnvs();
  await Promise.all(temporaryPaths.splice(0).map((path) => rm(path, { recursive: true, force: true })));
});

describe("safe repository acquisition", () => {
  it("can inventory and read every blob after the remote disappears following the initial fetch", async () => {
    const root = await mkdtemp(join(tmpdir(), "hivemap-acquisition-test-"));
    temporaryPaths.push(root);
    const origin = join(root, "origin");
    const offline = join(root, "offline");
    const bin = join(root, "bin");
    await mkdir(origin);
    await mkdir(bin);
    const files = Array.from({ length: 24 }, (_, index) => ({
      path: `source-${index}.txt`,
      text: `Unique tracked content ${index}\n`,
    }));
    await Promise.all(files.map((file) => writeFile(join(origin, file.path), file.text)));
    await execFileAsync("git", ["init", "--quiet", origin]);
    await execFileAsync("git", ["-C", origin, "-c", "user.name=HiveMap Test", "-c", "user.email=test@example.invalid", "add", "."]);
    await execFileAsync("git", ["-C", origin, "-c", "user.name=HiveMap Test", "-c", "user.email=test@example.invalid", "commit", "--quiet", "-m", "fixture"]);
    await execFileAsync("git", ["-C", origin, "config", "uploadpack.allowFilter", "true"]);
    const { stdout: revision } = await execFileAsync("git", ["-C", origin, "rev-parse", "HEAD"]);
    const { stdout: prlimitPath } = await execFileAsync("which", ["prlimit"]);

    // Drop this controlled file:// remote after its first successful fetch.
    // Any lazy blob acquisition during inventory or checkout must then fail.
    await writeFile(join(bin, "prlimit"), [
      `#!${process.execPath}`,
      'const { spawnSync } = require("node:child_process");',
      'const { renameSync } = require("node:fs");',
      'const args = process.argv.slice(2);',
      `const result = spawnSync(${JSON.stringify(prlimitPath.trim())}, args, { stdio: "inherit" });`,
      'if (result.error) throw result.error;',
      'if (result.status === null) throw new Error(`Git fixture terminated with ${result.signal}`);',
      `if (result.status === 0 && args.includes("fetch")) renameSync(${JSON.stringify(origin)}, ${JSON.stringify(offline)});`,
      'process.exit(result.status);',
      '',
    ].join("\n"));
    await chmod(join(bin, "prlimit"), 0o755);
    vi.stubEnv("PATH", `${bin}${delimiter}${process.env.PATH}`);

    const indexed = await withSafeRepositoryCheckout({
      repositoryUrl: pathToFileURL(origin).href,
      sourcePolicy: "local-allowed",
      requestedRef: revision.trim(),
    }, async (checkout) => ({
      revision: checkout.resolvedCommit,
      files: await Promise.all(checkout.trackedFiles.map(async (path) => ({
        path,
        text: (await checkout.readTrackedFile(path)).toString("utf8"),
      }))),
    }));

    expect(indexed.revision).toBe(revision.trim());
    expect(indexed.files).toEqual([...files].sort((left, right) => left.path.localeCompare(right.path, "en")));
    await expect(stat(origin)).rejects.toMatchObject({ code: "ENOENT" });
  });
});
