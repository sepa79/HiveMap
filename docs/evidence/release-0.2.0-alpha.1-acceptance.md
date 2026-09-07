# 0.2.0-alpha.1 — Local and HiveForge Acceptance

Date: 2026-09-07.
Result: passed for the single-operator alpha candidate.
Postgres release schema: `1`.

## Candidate identity

- Forgejo repository: `http://192.168.88.50:3001/hiveforge/hivemap.git`.
- Ref: `hivemap-dev-loop`.
- Snapshot commit: `4cc7dd2af7d4530fe37dc97f239d26d25a200732`.
- Image: `192.168.88.50:3001/hiveforge/hivemap:hivemap-0.2.0-alpha.1-20260907-schema1@sha256:aa75cc90e1b98bd7aa89567b9397eca42dca464a2e88d0691d67988a35e3e041`.
- The image was built from that snapshot, including the scan-module extraction, updated lockfile, package versions, package-owned MCP server version, and schema `1`.
- This evidence file was added after verification; it is not part of the tested image. Final commit preparation must preserve the tested application/configuration files.
- Final preparation compared all 177 tracked runtime/configuration/acceptance files with the Forgejo snapshot byte-for-byte; they match. Only changelog/documentation evidence was added afterward.

## Local verification

- `npm run verify`: build, typecheck, container-script checks and 291 passing workspace tests. The 16 PostgreSQL-gated tests are covered by the next stage.
- `npm run verify:postgres`: all four storage/runtime/REST/MCP suites passed against isolated real PostgreSQL databases (28 + 85 + 35 + 24 tests, including tests also run in the default suite).
- `npm run verify:renders`: local Compose and both HiveForge profiles passed render validation and required-input/secret checks.
- `npm run verify:image`: direct-token and token-file startup, invalid auth configuration, UI/health, REST/MCP, repository indexing, concurrency, persistence, interrupted-index recovery, SIGTERM, PostgreSQL outage/recovery and Chromium passed.
- `npm audit --audit-level=high`: zero vulnerabilities.
- `git diff --check`: passed.
- Versions and internal dependency pins match `0.2.0-alpha.1` across the root, 11 workspaces and lockfile. Changed documentation relative links resolve.

The combined `npm run verify:acceptance` reached image build after the earlier stages passed, then failed on an external Docker Hub TLS handshake while resolving a base image. An explicit rerun of the unchanged `verify:image` stage passed. The Forgejo image build encountered the same transient error and succeeded when the same build command was repeated against the same snapshot. No test or TLS check was disabled.

The earlier run started before the schema-number correction was deliberately interrupted and is not acceptance evidence for this candidate.

## Controlled development deployment

Target: `hivemap-development`, `docker-swarm`, component `stack`, HiveForge `portainer-stack` executor, public ingress `http://192.168.88.50:8787`.

The old development database had zero workspaces. HiveForge removed the old service before its directory was preserved as `/opt/pockethive-data/hivemap/data.pre-release-20260907T1426Z`. A fresh directory at the existing HiveMap-owned bind source was then initialized by the new runtime. This is preparation of the first release database, not a migration or reinterpretation of an earlier schema marker.

| Step | Operation | Result |
|---|---|---|
| Requirements | `op-812f1129-d3fb-49c8-9e7e-e5ef93abbed9` | Valid, no issues |
| Stop pre-release runtime | `uiop-a756cc2e-544a-4f73-8c35-b4a35d5508b2` | Succeeded |
| Deploy schema 1 candidate | `uiop-9b2384d1-9dc3-41cb-a5a5-7c6f0de988db` / `op-988c9de6-6b41-40c2-a257-9c820045cdc9` | Succeeded |
| Same-image update | `uiop-c0c7220b-59f5-4995-b587-5df7c7d33177` / `op-e604140f-a894-474b-bbc8-c6599b985006` | Succeeded; did not replace the task |
| Persistence test stop | `uiop-2c075f46-836f-408f-9be3-3ab58d034702` | Succeeded; schema 1 data retained |
| Persistence test start | `uiop-0c30fc75-8bb7-4410-9ed1-e6de8a587626` / `op-81cba78e-41e0-4d91-af48-5054959f47e6` | Succeeded |

The actual persistence check used explicit HiveForge remove/deploy because an unchanged update did not restart Swarm. The task changed from `q30v4l7e0ym58aj7rassqcolu` to `v517l26k82bt5y1x51nv7qe58`; no data-directory operation occurred between these two candidate runs.

## Remote checks

- Actual PostgreSQL schema marker: `1`.
- MCP initialization: `name=hivemap`, `version=0.2.0-alpha.1`.
- Missing and incorrect credentials: REST/MCP return `401`.
- Authorized MCP mutation is visible through REST; workspace, graph and projections round-trip.
- HTTPS indexing of `octocat/Spoon-Knife` at `d0dd1f61b33d64e29d8bc1372a94ef6a2fee76a9` completes; invalid sources/refs fail, duplicate concurrent execution is rejected, retrieval and scan start pass.
- Chromium token save/use/reload/clear, keyboard focus, view selection and visible layout checks pass, including after the actual restart.
- Before/after responses for workspace state, graph, projection, completed repository index and scan list are deeply equal across the restart.
- Health returns `200` through all four routing-mesh addresses: `.50`, `.51`, `.52`, `.53`.
- Final service: `1/1` on `docker-swarm-mgr-1`, exact pinned image digest above.
- Final HiveForge diagnosis: `ok`, zero findings.
- Recorded Compose SHA-256: `88fd598b84f1a3c484660c79583f61c91bf1c8ddb2ce46402978b53e476ec602`; current artifact digest matches its journal record.

Remote scripts used the existing `tools/acceptance/runtime-smoke.mjs` and `browser-smoke.mjs` with the explicit public-test token documented in [COMMANDS.md](../ai/COMMANDS.md). Additional read-only probes checked MCP version, schema marker, wrong-token rejection, routing-mesh health and before/after REST state. Acceptance fixtures remain in `acceptance-workspace` for inspection.

## Review and limits

Reviewer/Jester: Green for this bounded alpha candidate. Schema initialization remains fail-fast, version ownership is explicit, the scan extraction preserves its public surface, and real storage/transport/container/browser boundaries were exercised.

This is a controlled development deployment with the documented public-test-token override. It is not production private-token acceptance or a multi-user release. Future schema migrations are allowed by the updated storage contract but are not implemented here. GitHub CI/publication is a separate gate; passing this evidence does not claim a tag or GitHub Release already exists.
