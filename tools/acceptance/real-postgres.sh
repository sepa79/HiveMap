#!/usr/bin/env bash
# Responsibility: Run every PostgreSQL-gated workspace suite against isolated databases in one disposable pgvector container.
# Must not: Run unit-only verification, reuse developer databases, or retain test database state.
# Contract: All PostgreSQL-gated tests execute without skips or the script fails.
set -euo pipefail

container_name="hivemap-acceptance-postgres-${BASHPID}"

cleanup() {
  docker stop "${container_name}" >/dev/null 2>&1 || true
}
trap cleanup EXIT

docker run \
  --rm \
  --name "${container_name}" \
  --env POSTGRES_PASSWORD=acceptance \
  --publish 127.0.0.1::5432 \
  --detach \
  pgvector/pgvector:pg16-bookworm >/dev/null

for attempt in {1..60}; do
  if docker exec "${container_name}" pg_isready --username postgres >/dev/null 2>&1; then
    break
  fi
  if [[ "${attempt}" -eq 60 ]]; then
    docker logs "${container_name}"
    exit 1
  fi
  sleep 1
done

for database_name in hivemap_storage hivemap_runtime hivemap_api hivemap_mcp; do
  docker exec "${container_name}" createdb --username postgres "${database_name}"
done

host_port="$(docker port "${container_name}" 5432/tcp | sed 's/.*://')"

HIVEMAP_TEST_POSTGRES_URL="postgres://postgres:acceptance@127.0.0.1:${host_port}/hivemap_storage" \
  npm test -w @hivemap/storage
HIVEMAP_TEST_POSTGRES_URL="postgres://postgres:acceptance@127.0.0.1:${host_port}/hivemap_runtime" \
  npm test -w @hivemap/runtime
HIVEMAP_TEST_POSTGRES_URL="postgres://postgres:acceptance@127.0.0.1:${host_port}/hivemap_api" \
  npm test -w @hivemap/api
HIVEMAP_TEST_POSTGRES_URL="postgres://postgres:acceptance@127.0.0.1:${host_port}/hivemap_mcp" \
  npm test -w @hivemap/mcp

