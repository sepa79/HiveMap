#!/usr/bin/env bash
set -euo pipefail

# shellcheck source=runtime-supervisor.sh
source /usr/local/lib/hivemap/runtime-supervisor.sh

DATA_DIR="${HIVEMAP_DATA_DIR:-/var/lib/hivemap/postgres}"
POSTGRES_DB="${HIVEMAP_POSTGRES_DB:-hivemap}"
POSTGRES_PORT="${HIVEMAP_POSTGRES_PORT:-5432}"
API_HOST="${HIVEMAP_API_HOST:-0.0.0.0}"
API_PORT="${HIVEMAP_API_PORT:-8787}"
WEB_DIST="${HIVEMAP_WEB_DIST:-/app/apps/web/dist}"
AUTH_TOKEN="${HIVEMAP_AUTH_TOKEN:-}"
AUTH_TOKEN_FILE="${HIVEMAP_AUTH_TOKEN_FILE:-}"

if [[ "${AUTH_TOKEN}" =~ [^[:space:]] ]] && [[ "${AUTH_TOKEN_FILE}" =~ [^[:space:]] ]]; then
  echo "Set exactly one of HIVEMAP_AUTH_TOKEN or HIVEMAP_AUTH_TOKEN_FILE" >&2
  exit 1
fi

if [[ ! "${AUTH_TOKEN}" =~ [^[:space:]] ]] && [[ ! "${AUTH_TOKEN_FILE}" =~ [^[:space:]] ]]; then
  echo "HIVEMAP_AUTH_TOKEN or HIVEMAP_AUTH_TOKEN_FILE must provide a bearer token" >&2
  exit 1
fi

if [[ "${AUTH_TOKEN_FILE}" =~ [^[:space:]] ]]; then
  if [[ ! -r "${AUTH_TOKEN_FILE}" ]]; then
    echo "HIVEMAP_AUTH_TOKEN_FILE is not readable: ${AUTH_TOKEN_FILE}" >&2
    exit 1
  fi
  if [[ ! "$(<"${AUTH_TOKEN_FILE}")" =~ [^[:space:]] ]]; then
    echo "HIVEMAP_AUTH_TOKEN_FILE is empty: ${AUTH_TOKEN_FILE}" >&2
    exit 1
  fi
fi

if [[ ! "${POSTGRES_DB}" =~ ^[A-Za-z_][A-Za-z0-9_]*$ ]]; then
  echo "HIVEMAP_POSTGRES_DB must match ^[A-Za-z_][A-Za-z0-9_]*$" >&2
  exit 1
fi

if [[ "$(id -u)" == "0" ]]; then
  mkdir -p "${DATA_DIR}"
  chown -R postgres:postgres "${DATA_DIR}"
  exec gosu postgres "$0" "$@"
fi

mkdir -p "${DATA_DIR}"

if [[ ! -s "${DATA_DIR}/PG_VERSION" ]]; then
  initdb --auth=trust --username=postgres -D "${DATA_DIR}" >/dev/null
fi

if [[ -f "${DATA_DIR}/postmaster.pid" ]] && ! pg_ctl -D "${DATA_DIR}" status >/dev/null 2>&1; then
  rm -f "${DATA_DIR}/postmaster.pid"
fi

if ! pg_ctl -D "${DATA_DIR}" status >/dev/null 2>&1; then
  pg_ctl -D "${DATA_DIR}" -o "-c listen_addresses=127.0.0.1 -c port=${POSTGRES_PORT} -c unix_socket_directories=/tmp" -w start >/dev/null
fi

if [[ "$(psql --host 127.0.0.1 --port "${POSTGRES_PORT}" --username postgres --dbname postgres -tAc "SELECT 1 FROM pg_database WHERE datname = '${POSTGRES_DB}'")" != "1" ]]; then
  createdb --host 127.0.0.1 --port "${POSTGRES_PORT}" --username postgres "${POSTGRES_DB}"
fi

supervise_hivemap_runtime "${DATA_DIR}" node /app/apps/api/dist/server.js \
  --host "${API_HOST}" \
  --port "${API_PORT}" \
  --postgres-url "postgresql://postgres@127.0.0.1:${POSTGRES_PORT}/${POSTGRES_DB}" \
  --web-dist "${WEB_DIST}"
