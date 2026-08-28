# Deferred Ollama And Embedding Provider Archive

This directory preserves the removed provider-backed embedding and bundled Ollama implementation as inactive restoration evidence.

It is not part of the HiveMap runtime, build, API, MCP contract, or documentation source of truth.

## Why It Was Archived

On 2026-08-26 the human confirmed that the current delivery plan is about the built-in repository indexing and scan tools. The product does not currently use bundled Ollama, provider-generated concept embeddings, or a runtime plugin system.

The active base container therefore contains HiveMap, its built-in scan/index handlers, the web application, and Postgres only. Caller-supplied concept embeddings and read-only similarity remain separate explicit functionality; provider-backed refresh/backfill is deferred.

## Restore Points

- `b45a1ce8b31dbdd27acd1123450c8fe8699b04a9`: complete repository state immediately before this deferral.
- `da26ab6eaed259404fbf9689cc65ae334030e021`: bundled Ollama and shared-state container experiment.
- `9d85b4c87c82f0ed11d477ccff0464b0f5d3c82f`: provider-backed concept embedding refresh/backfill introduction.

## Contents

- `provider-runtime.patch`: reverse patch that restores the removed provider types, runtime methods, REST/MCP commands, and tests onto the 2026-08-26 post-deferral baseline.
- `container-model-serving.patch`: reverse patch that restores the bundled Ollama and shared-state container/HiveForge experiment onto the same baseline.
- `EMBEDDING_BENCHMARK_PROBES.json`: the deferred live-model benchmark probes.

## Restoration Procedure

1. Confirm a new product decision that identifies the actual model-serving use case.
2. Apply only the required patch with `git apply --check` first.
3. Resolve drift deliberately; do not replace newer shared files wholesale from an old commit.
4. Move the benchmark probes back under active AI documentation only if live provider comparison is again supported.
5. Update the active ADR, specs, API/MCP contracts, container contract, and tests in the same change.
6. Run the full repository verification and Docker/HiveForge validation matrix.

The patches are historical evidence, not maintained compatibility contracts. Later architectural changes may require a fresh implementation instead of direct restoration.
