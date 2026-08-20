#!/usr/bin/env node
import { readFileSync, writeFileSync } from "node:fs";

import { strFromU8, strToU8, unzipSync, zipSync } from "fflate";

function usage() {
  console.error(`Usage: node tools/rewrite-legacy-bundle-schema.mjs <input.zip> <output.zip>

Rewrite one legacy HiveMap formatVersion=1 bundle from storageSchemaVersion=2 to
storageSchemaVersion=4. This is a compatibility bridge for older live deployments
that still reject schema 2 legacy manifests.`);
}

const [, , inputPath, outputPath] = process.argv;
if (inputPath === undefined || outputPath === undefined) {
  usage();
  process.exit(1);
}

const archive = unzipSync(readFileSync(inputPath));
const manifestEntry = archive["manifest.json"];
if (manifestEntry === undefined) {
  throw new Error("manifest.json is missing from the bundle");
}

const manifest = JSON.parse(strFromU8(manifestEntry));
if (manifest.formatVersion !== 1) {
  throw new Error(`Expected legacy formatVersion=1, got ${String(manifest.formatVersion)}`);
}
if (manifest.storageSchemaVersion !== "2") {
  throw new Error(`Expected storageSchemaVersion=2, got ${String(manifest.storageSchemaVersion)}`);
}

manifest.storageSchemaVersion = "4";
archive["manifest.json"] = strToU8(`${JSON.stringify(manifest, null, 2)}\n`);
writeFileSync(outputPath, zipSync(archive, { level: 9 }));

console.error(`Rewrote legacy bundle schema 2 -> 4: ${inputPath} -> ${outputPath}`);
