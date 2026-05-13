# Commands — HiveMap POC

This file contains canonical commands for humans and AI agents.

Agents must prefer these commands over ad-hoc guesses.

## Requirements

Node.js 22+ and npm.

## Install / bootstrap

```bash
npm install
```

## Build

```bash
npm run build
```

## Test

```bash
npm test
```

## Focused test

```bash
npm test -- --run server/graph-store.test.ts
```

## Lint / format / static checks

```bash
npm run lint
npm run typecheck
```

## Run locally

```bash
npm run dev
```

## Debug / inspect

```bash
curl http://localhost:8787/api/graph
tail -f data/events.jsonl
```

## Package / release

```bash
No package/release command for the throwaway POC.
```

## Deployment

```bash
No deployment command for the throwaway POC.
```

## Known command caveats

- The API runs on port `8787`.
- The Vite UI runs on port `5173`.

## Agent command rules

- Do not invent commands when this file is incomplete.
- If a command is missing, inspect the repo and add a `TODO:` with likely location.
- Capture command output in evidence when preparing PRs or reviews.
