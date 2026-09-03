# Repository Boundary UI Redesign Acceptance

Date: 2026-09-02

The redesigned web workspace was checked at 1600×1000 against `repository-boundary-ui-redesign-mock.png` using the persisted `hivemap-release-scan-20260901` workspace and `hivemap-release-boundaries` projection.

The built-image browser check was repeated on 2026-09-03 after tightening the acceptance instrumentation. It now computes body, Map-context, and toolbar overflow independently. It also verifies that the rail, Map context, scan summary, saved view, toolbar, canvas, and inspector have non-zero rendered boxes, visible computed styles, and bounds fully contained by the 1600×1000 viewport; DOM presence alone does not satisfy this check.

## Verified outcome

- the deployed projection renders all 11 persisted repository boundaries;
- the body, default Map context, and projection toolbar do not overflow their viewport bounds;
- the primary rail, compact scan status, saved view, horizontal application/package map, and selected-node inspector remain visible together;
- selecting a boundary shows its real responsibility, entrypoints, dependencies, source files, confidence, and categories without creating a projection;
- token save, authenticated use, same-tab reload, explicit clear, URL clearing, and absence of protected requests after clear pass in a real browser;
- the native workspace selector uses the dark browser color scheme and an explicit high-contrast option palette verified in Firefox and Chromium;
- the default Map context renders at most five saved-view buttons and exposes all remaining views through a compact picker;
- every scan card, including a completed run, exposes an explicit destructive action with a confirmation that all findings owned by the scan will also be removed;
- live deletion was exercised through the UI in both Firefox and Chromium, while REST and MCP transport coverage verified the same canonical operation;
- the four obsolete empty drafts were removed from the shared test deployment and the completed `hivemap-code-boundaries-release-v3` run remained intact;
- the Docker Swarm service runs `1/1` on immutable image `192.168.88.50:3001/hiveforge/hivemap:hivemap-dev-loop-20260902-114659`.

## Verification

```text
npm run verify
HIVEMAP_ACCEPTANCE_BASE_URL=http://192.168.88.50:8787 \
HIVEMAP_ACCEPTANCE_AUTH_TOKEN=<public-test-token> \
HIVEMAP_ACCEPTANCE_PROJECTION_COUNT=1 \
node tools/acceptance/browser-smoke.mjs

browser-smoke=passed
disposable-built-image saved views: 8 total, 5 direct, 3 in picker
viewport: bodyScroll=false, contextScroll=false, toolbarScroll=false
surfaces: canvas=true, inspector=true, mapContext=true, rail=true, savedView=true, scanSummary=true, toolbar=true
scan-delete: chromium=passed, firefox=passed, REST=passed, MCP=passed
runtime: docker-swarm service 1/1
```

The public test token value is intentionally omitted from this evidence file; its non-secret test-only configuration remains documented in `docs/ai/COMMANDS.md`.
