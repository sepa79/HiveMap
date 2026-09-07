# 0.2.0 — UI Version and HiveForge Update Acceptance

Date: 2026-09-07. Result: passed for the bounded version/UI change.

This closes the requirement that the deployed header visibly show `0.2.0`. Root/workspace metadata, internal dependency pins and MCP identity also use `0.2.0`. Postgres schema remains `1`; the existing schema-1 data directory was retained throughout the update.

## Candidate identity

- Forgejo repository: `http://192.168.88.50:3001/hiveforge/hivemap.git`, ref `hivemap-dev-loop`.
- Snapshot: `dc9974cc6a95163561406c6a264a92f63ef8801a`.
- Image: `192.168.88.50:3001/hiveforge/hivemap:hivemap-0.2.0-20260907-ui-version@sha256:312ab0444fcd48053fda37e7d2ddba7b7e3cb078c437fa9d65efbc6760a5478e`.
- Target: `hivemap-development`, profile `docker-swarm`, component `stack`, ingress `http://192.168.88.50:8787`.
- Requirements operation: `op-60f47c2d-ae83-4780-abb1-b70df12dae93`, valid with no issues.
- HiveForge update: `uiop-4ed5b20d-47e3-40ca-b48d-088a5f67ac1b` / `op-3d08ec99-2555-4aa5-8437-6d3e966c5156`, succeeded.
- Swarm task changed from `v517l26k82bt5y1x51nv7qe58` to `f374ih3amuirqh89u6j5dx6u9`; final replicas `1/1` on `docker-swarm-mgr-1`.
- Recorded Compose SHA-256: `61afc24c356be2e538075022234437a0fa4b6198e23d658ac27534554d684337`; current artifact matches its journal record. HiveForge diagnosis: `ok`, no findings.

## Verification

- `npm run verify`: build, typecheck, container-script checks and 291 workspace tests passed; 16 PostgreSQL-gated tests skipped in this default command.
- All 12 root/workspace manifests and their lockfile records agree on `0.2.0`, including internal dependency pins.
- The unchanged Dockerfile built successfully from the snapshot and the resulting immutable image was pushed to the local registry and deployed through HiveForge.
- Remote `tools/acceptance/browser-smoke.mjs` passed token save/use/reload/clear, saved views, selection/viewport preservation, focus and visible-surface/overflow checks at 1600×1000.
- Additional Chromium checks verified visible exact version `0.2.0` before authentication, after workspace load and after reload; the version does not overlap workspace context at widths 1600 or 1280. No browser page errors occurred.
- Visual inspection confirmed the version beside the wordmark in the [deployed UI screenshot](release-0.2.0-ui.png).
- MCP initialization returned `serverInfo.version=0.2.0`; missing/wrong tokens were rejected with `401` at REST/MCP boundaries.
- Five before/after REST responses were deeply equal: workspace, graph, saved projection, completed repository index and scan list.
- Direct PostgreSQL inspection over its configured TCP listener returned schema marker `1`.
- Health returned `200` through `.50`, `.51`, `.52` and `.53`.
- Final runtime/configuration/acceptance files match the tested Forgejo snapshot byte-for-byte. This evidence and screenshot were added after the build.
- `git diff --check` and changed-document link checks passed.

The Docker Hub Node metadata request failed with a TLS handshake error on the initial build and two explicit retries; a separate pull failed the same way. The existing `node:22-bookworm-slim` image was transferred from `.50` with `docker save/load`. Its image identity matched at both ends: `sha256:d649c27dae7ba0137b3cef5dd75baa422c08dc3d9e3fc0c23dfb172dc3cc6436`. The same Dockerfile/build command then succeeded using that cached base. TLS checks and the Dockerfile were not changed.

## Review and scope

Review/Jester: Green. The header imports its own package metadata at build time; no separate UI version literal, runtime fetch, domain dependency or graph mutation was introduced. The owning [UI specification](../specs/web-workspace-ui.md) defines version ownership.

Full PostgreSQL, indexing, outage/recovery, token-file startup and lifecycle acceptance for the preceding candidate is recorded in [alpha acceptance evidence](release-0.2.0-alpha.1-acceptance.md). Those broader suites were not rerun for this version-label change; the new built image was exercised through the deployed browser, REST, MCP and persistence checks above.

Single-operator scope and the documented public-test-token deployment remain in effect. This work prepares staged changes for the user's commit/push to existing GitHub PR #1; the earlier green GitHub CI run covers commit `44cc375`, not these new changes. Updated CI must run after the user pushes. No merge, tag or GitHub Release is claimed.
