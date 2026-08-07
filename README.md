# HiveMap

[![CI](https://github.com/sepa79/HiveMap/actions/workflows/ci.yml/badge.svg)](https://github.com/sepa79/HiveMap/actions/workflows/ci.yml)

HiveMap is a local, AI-assisted workspace for turning conversations, projects, ideas, decisions, and repository knowledge into a semantic graph with readable overview and deep-dive maps. A human communicates intent, an agent interprets and records explicit graph operations, and HiveMap keeps the semantic model separate from its visual projections.

Repository review is one supported workflow, not the definition of the product. In that workflow an agent scans a repository; HiveMap supplies repeatable scan instructions, validates evidence, stores findings, renders review projections, and exports the result as a portable ZIP. The same graph and projection model can also map an AI conversation, explore an idea, explain a system, or maintain a project knowledge map.

The current alpha is intended for local evaluation on real repositories. It is not a hosted multi-user service.

## What You Can Test

- capture the important concepts, questions, decisions, and relationships from an AI conversation;
- develop an idea through an overview map and focused deep dives;
- build a project map across product concepts, rules, architecture, dependencies, and implementation evidence;
- map project concepts to documentation, code, tests, assets, and external evidence;
- review documentation conflicts and implementation drift in priority columns;
- click a finding to inspect its evidence and affected concepts;
- export or import a complete `.hivemap.zip` workspace;
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

`npm run verify` runs the same tests, typecheck, and build used by CI. Node 22 may print an experimental warning for `node:sqlite`; HiveMap does not suppress it.

## Quick Start

HiveMap uses one local SQLite database shared by the REST API and MCP server.

Clone and build:

```bash
git clone https://github.com/sepa79/HiveMap.git
cd HiveMap
nvm use
npm ci
npm run build
mkdir -p .hivemap
```

Start the API in the first terminal:

```bash
npm run dev:api -- --db "$PWD/.hivemap/local.sqlite" --port 8787
```

Start the web UI in the second terminal:

```bash
npm run dev:web
```

Open `http://127.0.0.1:5175/`.

The server binds to `127.0.0.1` intentionally. Do not expose this alpha directly to a network: it has no authentication or authorization layer.

## Connect an Agent Through MCP

Build HiveMap first, then add a stdio MCP server to your agent configuration. Replace both example paths with absolute paths on your machine:

```json
{
  "mcpServers": {
    "hivemap": {
      "command": "node",
      "args": [
        "/absolute/path/to/HiveMap/apps/mcp/dist/stdio.js",
        "--db",
        "/absolute/path/to/HiveMap/.hivemap/local.sqlite"
      ]
    }
  }
}
```

Restart or reconnect the agent after changing its MCP configuration. The MCP process and REST API must point to the same SQLite file if you want agent changes to appear in the open UI.

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

## Share a Review

Select the workspace in the UI and click **Export ZIP**. The archive contains the canonical workspace plus checksummed scan evidence, coverage, resolved instructions, findings, comparisons, and a repeat-scan procedure.

Send the `.hivemap.zip` to another tester. They can start a clean HiveMap checkout, open the UI, choose whether the import creates a new workspace or explicitly replaces the same workspace, and click **Import ZIP**. Import never silently merges or rewrites workspace IDs.

Treat exported ZIPs as project data. They may contain repository paths, claims, findings, and evidence references; inspect them before sharing outside the intended group.

## Verify Documentation Fixes

After the documentation or code is changed:

1. import or load the baseline workspace;
2. ask the agent to repeat the same versioned scan profile against the current repository;
3. rediscover coverage instead of copying the old file list;
4. complete the new scan and call `scan_compare` against the baseline;
5. investigate every new, regressed, or unverifiable finding;
6. export the workspace again as completion evidence.

The resulting ZIP retains both immutable scan runs and their comparison.

## What Testers Should Report

When filing feedback, include:

- operating system, Node version, browser, and agent/client name;
- the selected scan profile and target repository revision;
- whether the failure occurred during setup, scan, map review, ZIP export/import, or verification;
- the exact visible error and the last MCP operation, without attaching confidential repository content unnecessarily;
- whether a fresh retry against the same revision reproduces the problem.

Do not report a scan as successful based only on an attractive map. Check the coverage inventory, finding evidence, priority, deep-dive navigation, and exported repeat-scan instructions.

GitHub offers a structured **HiveMap alpha test report** issue form with these fields.

## Common Commands

| Command | Purpose |
|---|---|
| `npm ci` | Install exactly the locked dependencies |
| `npm run verify` | Run tests, typecheck, and production builds |
| `npm run dev:api -- --db <path> --port 8787` | Build and start the local REST API |
| `npm run dev:web` | Start the UI on `127.0.0.1:5175` |
| `npm run start:mcp -- --db <path>` | Build and run the MCP server manually |

If port 5175 is already occupied, HiveMap fails instead of silently moving to another port. Stop the conflicting process and retry. If the UI is empty after an agent scan, verify that API and MCP use the exact same absolute database path.

## Project Structure

- `apps/api/`: local REST boundary used by the UI;
- `apps/mcp/`: stdio MCP boundary used by agents;
- `apps/web/`: React/React Flow review UI;
- `packages/graph-core/`: semantic graph and invariants;
- `packages/projections/`: overview and deep-dive view derivation;
- `packages/scans/`: scan profiles, lifecycle, evidence, and comparison;
- `packages/storage/`: SQLite persistence and portable ZIP bundles;
- `docs/specs/`: canonical contracts;
- `docs/ai/`: agent workflows, commands, and review checks;
- `poc/`: preserved proof-of-concept evidence, not the 1.0 architecture.

Read [AGENTS.md](AGENTS.md) before contributing. Product and architecture navigation starts in [docs/README.md](docs/README.md).

## License

HiveMap is licensed under `GPL-3.0-or-later`, matching PocketHive. See [LICENSE](LICENSE) for details.

## Alpha Boundaries

- local single-user runtime only;
- no authentication or authorization;
- no built-in repository crawler: scanning is agent-executed;
- no silent merge during ZIP import;
- manual graph editing is emergency tooling, not the primary workflow;
- semantic graph data is the source of truth; UI maps are projections.

CI runs a dependency audit and full verification on every pull request and every push to `main` using Node.js 22.
