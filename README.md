# HiveMap

[![CI](https://github.com/sepa79/HiveMap/actions/workflows/ci.yml/badge.svg)](https://github.com/sepa79/HiveMap/actions/workflows/ci.yml)

HiveMap is a local, AI-assisted workspace for turning conversations, projects, ideas, decisions, and repository knowledge into a semantic graph with readable overview and deep-dive maps. A human communicates intent, an agent interprets and records explicit graph operations, and HiveMap keeps the semantic model separate from its visual projections.

Repository review is one supported workflow, not the definition of the product. In that workflow an agent scans a repository; HiveMap supplies repeatable scan instructions, validates evidence, stores findings, and renders review projections. The same graph and projection model can also map an AI conversation, explore an idea, explain a system, or maintain a project knowledge map.

Version `0.2.0` is intended for local, single-operator evaluation on real repositories. It is not a hosted multi-user service. See [CHANGELOG.md](CHANGELOG.md) for changes and compatibility limits.

The base runtime is implemented and validated locally in Docker and through HiveForge: one image contains Postgres, the API, protected Streamable HTTP MCP, the built web UI, and repository indexing/scan handlers. REST and MCP share the same typed runtime operations.

The local container starts its bundled database; a mounted data directory preserves state across restarts. The next feature track focuses on scan calibration, repository understanding, and repeatable finding validation.

## What You Can Test

- capture the important concepts, questions, decisions, and relationships from an AI conversation;
- develop an idea through an overview map and focused deep dives;
- build a project map across product concepts, rules, architecture, dependencies, and implementation evidence;
- map project concepts to documentation, code, tests, assets, and external evidence;
- review documentation conflicts and implementation drift in priority columns;
- click a finding to inspect its evidence and affected concepts;
- repeat a scan after fixes and compare the new result with the baseline;
- run HiveMap through both a browser UI and an MCP-connected coding agent.

## Requirements

- Node.js 22 and npm 10;
- a local MCP-capable coding agent for repository scans;
- Chrome or Firefox for the UI.

The repository includes `.nvmrc`. With `nvm` installed:

```bash
nvm use
npm ci
npm run verify
```

`npm run verify` runs the same tests, typecheck, and build used by CI.

## Quick Start

HiveMap now runs locally against Postgres. You can either use the direct dev flow with an explicit Postgres connection string or the bundled local Docker runtime.

Clone and build:

```bash
git clone https://github.com/sepa79/HiveMap.git
cd HiveMap
nvm use
npm ci
npm run build
```

Start the API in the first terminal:

```bash
HIVEMAP_AUTH_TOKEN='replace-with-a-long-random-token' \
HIVEMAP_POSTGRES_URL='postgres://postgres:postgres@127.0.0.1:5432/hivemap' \
npm run dev:api -- --port 8787
```

Start the web UI in the second terminal:

```bash
npm run dev:web
```

Open `http://127.0.0.1:5175/`.

If you want one HTTP process to serve both API and built frontend, build the web app first and then start the API:

```bash
npm run build -w @hivemap/web
HIVEMAP_AUTH_TOKEN='replace-with-a-long-random-token' \
HIVEMAP_POSTGRES_URL='postgres://postgres:postgres@127.0.0.1:5432/hivemap' \
npm run dev:api -- --port 8787
```

With `apps/web/dist` present, the API now auto-serves that build on the same port.

A working single-image Docker path exists as well:

```bash
HIVEMAP_AUTH_TOKEN='replace-with-a-long-random-token' docker compose up --build
```

That path bundles Postgres with the REST API, stateless Streamable HTTP MCP endpoint, built web assets, and HiveMap's built-in repository indexing and scan handlers in one container, with optional Postgres persistence mounted at `./.local/hivemap-postgres`. Open `http://127.0.0.1:8787/` and enter the same token in the UI. The UI keeps it only for the current tab in `sessionStorage` and offers an explicit clear action. REST and MCP use `Authorization: Bearer <token>`; the public surface is limited to the UI assets and `GET /health`. The MCP endpoint is `http://127.0.0.1:8787/mcp`.

This release starts the supported Postgres schema history at version `1`. Start with a fresh dedicated database, or reuse a database already on schema `1`. Earlier development databases are not supported migration sources. Future schema versions may add explicit migrations; none are needed or implemented for this first release. See [the storage contract](docs/specs/storage-format.md).

The HTTP runtime accepts exactly one bearer-token source. Local commands and repository Compose use direct `HIVEMAP_AUTH_TOKEN` (or `--auth-token`); installed secret mounts use `HIVEMAP_AUTH_TOKEN_FILE` (or `--auth-token-file`). Supplying both sources, or an unreadable or empty token file, fails startup.

For the current Forgejo-backed development loop on `192.168.88.50`, the repo also carries:

```bash
npm run dev:hiveforge
```

That command snapshots the current working tree into a temporary clone, force-pushes the stable Forgejo branch `hivemap-dev-loop` with an explicit remote-SHA lease, and pushes both a moving `dev-latest` convenience tag and an immutable timestamped tag to the local registry. It prints the exact `gitRef` and immutable `HIVEMAP_IMAGE` value required for the next HiveForge deploy/update step on the shared `swarm` environment. Deployments use the immutable tag because Portainer/Swarm may retain the previously resolved digest when the same moving tag is reused.

For the `docker-swarm` profile, provision the external Docker secret
`hivemap-auth-token` in the HiveForge target environment, then set:

```bash
HIVEMAP_DATA_BIND_SOURCE=/opt/hivemap/postgres
HIVEMAP_SWARM_PLACEMENT_CONSTRAINT='node.hostname == docker-swarm-mgr-1'
```

The bind source is an explicit HiveMap-owned Postgres data path on the swarm node. The placement constraint is required because that path is node-local; without it, Swarm can reschedule HiveMap onto a different node and break persistence. Paths used by unrelated local test stacks are not part of the HiveMap deployment contract.

Run the complete disposable local acceptance matrix with:

```bash
npm run verify:acceptance
```

It includes the normal repository checks, all real-Postgres suites, both deployment renders, built-image lifecycle and failure tests, pinned HTTPS repository indexing, and a real Chromium save/use/reload/clear token flow. See `docs/ai/COMMANDS.md` for stage commands and prerequisites.

Direct development binds to `127.0.0.1` by default. Container profiles bind to all container interfaces and require the shared bearer token before startup. This is coarse single-operator protection, not multi-user authorization.

HiveForge declares `hivemap-auth-token` through `requirements.secrets` and
mounts it read-only at `/run/secrets/hivemap-auth-token`. The rendered Compose
file contains only that external secret reference, never the credential value.
An explicitly disposable test environment may instead set the non-secret
`HIVEMAP_PUBLIC_TEST_AUTH_TOKEN`; the renderer then passes that public value as
`HIVEMAP_AUTH_TOKEN` and omits the secret mount. Never use this override for a
private or production credential.

The active vector slice accepts explicit caller-supplied concept embeddings and supports bounded read-only similarity queries. HiveMap does not generate embeddings or bundle model-serving in the base runtime. The removed provider experiment is preserved as inactive, restorable evidence under `archive/deferred-ollama-embedding-provider/`.

## Legacy Local MCP Adapter

The repo retains a legacy stdio MCP adapter for explicitly selected local development workflows. The installed runtime uses Streamable HTTP at `/mcp`; stdio is transitional. Replace the example path with an absolute path on your machine:

```json
{
  "mcpServers": {
    "hivemap": {
      "command": "node",
      "args": [
        "/absolute/path/to/HiveMap/apps/mcp/dist/stdio.js",
        "--postgres-url",
        "postgres://postgres:postgres@127.0.0.1:5432/hivemap"
      ]
    }
  }
}
```

Restart or reconnect the agent after changing its MCP configuration. The MCP adapter and REST API must point at the same Postgres database if you want agent changes to appear in the open UI.

New container/client integrations should use the protected Streamable HTTP endpoint at `/mcp`; the stdio adapter remains only for explicit local development cases.

HiveMap does not scan files by itself. The connected agent reads the target repository, follows the selected HiveMap scan profile, and submits explicit coverage, graph, projection, and finding operations through MCP.

When the agent does not already know the canonical `workspaceId`, the intended discovery flow is:

1. call `workspace_list` with an optional search query;
2. call `workspace_resolve` with the selected id, slug, or exact name;
3. use the returned canonical `workspaceId` for `graph_get`, scan tools, and the rest of the session.

## Run a Documentation Review

The following is a concrete repository-review use case. It is the most fully documented alpha workflow, but it is only one way to use HiveMap.

Open the coding agent in the repository you want to inspect. Its filesystem permissions must include that repository. A useful first request is:

```text
Use the HiveMap MCP server to review this repository.

Create a workspace named <project> — Documentation Review, or load the existing
workspace if I supplied one. Use documentation-conflicts@1. Read the repository
rules first, start the scan, rediscover files from the profile criteria, record
complete coverage, and map bounded documentation conflicts or implementation drift.

Create a findings-first overview with Critical, High, Medium, and Low columns,
finding-kind tags, an orientation note, and clickable deep dives. Complete the scan
only after every criterion and required output is accounted for. Do not modify the
target repository.
```

For technical repository reviews, use the same workflow with `code-quality-review@1`. That profile supports finding kinds such as `architecture-risk`, `runtime-risk`, `authority-gap`, `test-gap`, and `deployment-risk` in addition to documentation-oriented conflict and drift kinds.

Expected workflow:

1. The agent calls `workspace_list` and `workspace_resolve` if the workspace is not already known.
2. It calls `project_create` or uses the resolved existing workspace.
3. It selects a versioned profile with `scan_profile_list`.
4. `scan_start` returns the exact discovery rules and completion checklist.
5. The agent reads the repository and records coverage and evidence-backed findings.
6. The agent creates readable overview and deep-dive projections.
7. `scan_complete` rejects incomplete coverage, criteria, or outputs.
8. Refresh or load the workspace in the UI to review the map.

The canonical agent procedure is [Repository Scan Workflow](docs/ai/REPOSITORY_SCAN_WORKFLOW.md). The underlying contract is [Repository Scan Contract](docs/specs/repository-scan.md).

## Portability Status

The current runtime does not expose workspace or project import/export. The recorded future direction is one versioned streaming NDJSON full-project snapshot carrying canonical workspace state plus completed repository-index retrieval facts. It is intentionally not implemented in this phase. Editable source code remains Git-owned and must be fetched at the scan's recorded immutable commit.

## Verify Documentation Fixes

After the documentation or code is changed:

1. load the baseline workspace in the same HiveMap environment;
2. ask the agent to repeat the same versioned scan profile against the current repository;
3. rediscover coverage instead of copying the old file list;
4. complete the new scan and call `scan_compare` against the baseline;
5. investigate every new, regressed, or unverifiable finding;
6. retain both immutable scan runs and their comparison in the workspace as completion evidence.

## What Testers Should Report

When filing feedback, include:

- operating system, Node version, browser, and agent/client name;
- the selected scan profile and target repository revision;
- whether the failure occurred during setup, scan, map review, or verification;
- the exact visible error and the last MCP operation, without attaching confidential repository content unnecessarily;
- whether a fresh retry against the same revision reproduces the problem.

Do not report a scan as successful based only on an attractive map. Check the coverage inventory, finding evidence, priority, deep-dive navigation, and persisted repeat-scan instructions.

GitHub offers a structured **HiveMap alpha test report** issue form with these fields.

## Common Commands

| Command | Purpose |
|---|---|
| `npm ci` | Install exactly the locked dependencies |
| `npm run verify` | Run tests, typecheck, and production builds |
| `HIVEMAP_AUTH_TOKEN=... HIVEMAP_POSTGRES_URL=... npm run dev:api -- --port 8787` | Build and start protected REST plus Streamable HTTP MCP |
| `npm run dev:web` | Start the UI on `127.0.0.1:5175` |
| `npm run dev:hiveforge` | Snapshot the current tree to local Forgejo and push dev image tags for HiveForge |

If port 5175 is already occupied, HiveMap fails instead of silently moving to another port. Stop the conflicting process and retry. If the UI is empty after an agent scan, verify that API and MCP use the exact same Postgres database.

If you explicitly need the legacy local MCP adapter, run it directly instead of using a root shortcut:

```bash
npm run build -w @hivemap/mcp
npm exec -w @hivemap/mcp -- hivemap-mcp --postgres-url 'postgres://postgres:postgres@127.0.0.1:5432/hivemap'
```

## Project Structure

- `apps/api/`: HTTP host for the UI, protected REST API, and `/mcp` transport;
- `apps/mcp/`: shared MCP tool server plus Streamable HTTP and legacy stdio transport wiring;
- `apps/web/`: React/React Flow review UI;
- `packages/graph-core/`: semantic graph and invariants;
- `packages/projections/`: overview and deep-dive view derivation;
- `packages/scans/`: scan profiles, lifecycle, evidence, and comparison;
- `packages/storage/`: Postgres runtime persistence and backend-neutral storage contracts;
- `docs/specs/`: canonical contracts;
- `docs/ai/`: agent workflows, commands, and review checks;
- `poc/`: preserved proof-of-concept evidence, not the 1.0 architecture.

Read [AGENTS.md](AGENTS.md) before contributing. Product and architecture navigation starts in [docs/README.md](docs/README.md).

## License

HiveMap is licensed under `GPL-3.0-or-later`, matching PocketHive. See [LICENSE](LICENSE) for details.

## Alpha Boundaries

- local single-user runtime only;
- one required shared bearer token for REST and MCP, without users or roles;
- no built-in repository crawler: scanning is agent-executed;
- no workspace or project import/export surface in the current runtime;
- manual graph editing is emergency tooling, not the primary workflow;
- semantic graph data is the source of truth; UI maps are projections.

## Next Runtime Direction

Planned next steps for the runtime are:

1. finish validating the Postgres-backed container and its built-in repository indexing/scan handlers through HiveForge,
2. complete repeated deploy and end-to-end scan loops against that runtime,
3. exercise protected REST and Streamable HTTP MCP through repeated deploy and end-to-end scan loops.

Embeddings and vector-assisted features are intentionally deferred from that base runtime track.

CI runs a dependency audit and full verification on every pull request and every push to `main` using Node.js 22.
