# Commands — HiveMap

Canonical commands for the repository.

## Current State

The first 1.0 package workspace exists at the repository root. The POC remains runnable under `poc/`.

## Root Install

```bash
npm ci
```

## Root Checks

```bash
npm run verify
```

This is the same test, typecheck, and build sequence used by GitHub Actions.

## Local Runtime

These commands describe the current local Postgres-first runtime. A working single-image local Docker runtime now exists for the API, built web UI, and bundled Postgres.

```bash
HIVEMAP_POSTGRES_URL='postgres://postgres:postgres@127.0.0.1:5432/hivemap' npm run dev:api -- --port 8787
```

API: `http://127.0.0.1:8787`

Optional provider-backed concept embeddings via local Ollama:

```bash
HIVEMAP_OLLAMA_BASE_URL='http://127.0.0.1:11434'
```

Use explicit `provider:model` refs such as `ollama:nomic-embed-text` through the REST or MCP embedding refresh/backfill commands. Graph writes do not silently regenerate embeddings.

```bash
npm run dev:web
```

Web: `http://127.0.0.1:5175`

Single-image container path:

```bash
docker compose up --build
```

That container path is validated for workspace create, graph mutation, projection create/read, and ZIP export/import. Plugin bundling and local model-serving dependencies remain follow-up work on the same container track.

Legacy local MCP adapter only when explicitly needed:

```bash
npm run build -w @hivemap/mcp
npm exec -w @hivemap/mcp -- hivemap-mcp --postgres-url 'postgres://postgres:postgres@127.0.0.1:5432/hivemap'
```

For an MCP client configuration, run the already-built `apps/mcp/dist/stdio.js` entry point directly as documented in the root `README.md`. This avoids npm lifecycle output on the stdio transport. The stdio adapter is transitional and not the target local runtime shape.

HiveForge scaffold smoke for the local adapter profiles:

```bash
ANSIBLE_LOCAL_TEMP=/tmp/ansible-local \
ANSIBLE_REMOTE_TEMP=/tmp/ansible-remote \
HIVEFORGE_PROFILE=docker-single \
HIVEMAP_IMAGE=ghcr.io/sepa79/hivemap:test \
ansible-playbook deploy/hiveforge/components/stack/ansible/deploy.yml -e hiveforge_root=/tmp/hf

docker compose -f /tmp/hf/stacks/compose.yml config
```

Current HiveForge environment note:

- Trusted-LAN Forgejo is `http://192.168.88.50:3001/`.
- Shared HiveForge environment is `swarm`, so remote deploy validation should use the `docker-swarm` project profile, not `docker-single`.
- The shared stack playbooks now accept both `docker-single` and `docker-swarm`.
- For `docker-swarm`, prefer `HIVEMAP_DATA_BIND_SOURCE` as the exact local persistence path on the swarm node, for example `/opt/pockethive-data/hivemap/data`.
- For `docker-swarm`, also require `HIVEMAP_SWARM_PLACEMENT_CONSTRAINT`, for example `node.hostname == docker-swarm-mgr-1`, so HiveMap cannot move away from its node-local Postgres bind mount.
- `HIVEFORGE_BIND_SOURCE_DIR` remains as a legacy fallback and renders to `<dir>/state/postgres/data`.
- The current `.50` development setup intentionally reuses `/opt/pockethive-data/hivemap/data` as a temporary local path while HiveMap is still being iterated in the shared swarm. Treat that as disposable test infrastructure, not the final hosting contract.
- The current `swarm` environment advertises non-NFS local bind roots under `/opt/pockethive-data/*`; if HiveMap uses its own dedicated local path such as `/opt/pockethive-data/hivemap/data`, that path must exist and be allowed by the HiveForge environment policy before deployment.

Local Forgejo/HiveForge dev snapshot loop:

```bash
npm run dev:hiveforge
```

That command:

- snapshots the current working tree into a temporary clone under `/tmp/hivemap-hiveforge-dev-loop`,
- force-pushes the stable Forgejo branch `hivemap-dev-loop`,
- builds and pushes both `192.168.88.50:3001/hiveforge/hivemap:dev-latest` and an immutable timestamped tag,
- prints the exact `gitRef` and image values to feed into the next HiveForge deploy/update action.

Current boundary:

- the repo-local command does not yet call the HiveForge API itself because this environment does not expose local CLI/auth for that API;
- after the one-time HiveForge runtime env is pinned to `...:dev-latest`, the remaining action is a normal HiveForge `deploy` or `update` for `projectId=hivemap-development`, `profile=docker-swarm`, `component=stack`, `gitRef=hivemap-dev-loop`.

Bundle import helper for a running HiveMap API:

```bash
tools/import-workspace-bundle.sh \
  --api-base-url http://127.0.0.1:8787 \
  --mode new \
  .hivemap/exports/caravanworld-supervised-regional-goal-current-2026-08-05T0010Z.hivemap.zip
```

If a live deployment still rejects a legacy `formatVersion=1` CaravanWorld ZIP with `storageSchemaVersion=2`, rewrite the manifest bridge first and import the rewritten file:

```bash
node tools/rewrite-legacy-bundle-schema.mjs \
  .hivemap/exports/caravanworld-supervised-regional-goal-current-2026-08-05T0010Z.hivemap.zip \
  /tmp/caravanworld-schema4.hivemap.zip

tools/import-workspace-bundle.sh \
  --api-base-url http://127.0.0.1:8787 \
  --mode new \
  /tmp/caravanworld-schema4.hivemap.zip
```

## POC Install

```bash
cd poc
npm install
```

## POC Run

```bash
cd poc
npm run dev
```

UI: `http://localhost:5173/`

API: `http://localhost:8787/api/graph`

## POC Checks

```bash
cd poc
npm test
npm run typecheck
npm run build
```

## Package Checks

```bash
npm test -w @hivemap/api-contracts
npm test -w @hivemap/graph-core
npm test -w @hivemap/categories
npm test -w @hivemap/capture
npm test -w @hivemap/projections
npm test -w @hivemap/scans
npm test -w @hivemap/runtime
npm test -w @hivemap/storage
HIVEMAP_TEST_POSTGRES_URL=postgres://... npm test -w @hivemap/storage
HIVEMAP_TEST_POSTGRES_URL=postgres://... npm test -w @hivemap/runtime
npm test -w @hivemap/api
HIVEMAP_TEST_POSTGRES_URL=postgres://... npm test -w @hivemap/api
npm test -w @hivemap/mcp
HIVEMAP_TEST_POSTGRES_URL=postgres://... npm test -w @hivemap/mcp
npm test -w @hivemap/web
npm run typecheck -w @hivemap/api-contracts
npm run typecheck -w @hivemap/graph-core
npm run typecheck -w @hivemap/categories
npm run typecheck -w @hivemap/capture
npm run typecheck -w @hivemap/projections
npm run typecheck -w @hivemap/scans
npm run typecheck -w @hivemap/runtime
npm run typecheck -w @hivemap/storage
npm run typecheck -w @hivemap/api
npm run typecheck -w @hivemap/mcp
npm run typecheck -w @hivemap/web
npm run build -w @hivemap/api-contracts
npm run build -w @hivemap/graph-core
npm run build -w @hivemap/categories
npm run build -w @hivemap/capture
npm run build -w @hivemap/projections
npm run build -w @hivemap/scans
npm run build -w @hivemap/runtime
npm run build -w @hivemap/storage
npm run build -w @hivemap/api
npm run build -w @hivemap/mcp
npm run build -w @hivemap/web
```
