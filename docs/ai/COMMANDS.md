# Commands — HiveMap

Canonical commands for the repository.

## Current State

The only runnable app today is the POC under `poc/`.

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

## Future Root Commands

TODO: Add root workspace commands once 1.0 packages/apps exist.

Do not invent root commands before package tooling exists.
