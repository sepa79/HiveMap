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

```bash
npm run dev:api -- --db "$PWD/.hivemap/local.sqlite" --port 8787
```

API: `http://127.0.0.1:8787`

```bash
npm run dev:web
```

Web: `http://127.0.0.1:5175`

```bash
npm run start:mcp -- --db "$PWD/.hivemap/local.sqlite"
```

For an MCP client configuration, run the already-built `apps/mcp/dist/stdio.js` entry point directly as documented in the root `README.md`. This avoids npm lifecycle output on the stdio transport.

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
npm test -w @hivemap/api
npm test -w @hivemap/mcp
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
