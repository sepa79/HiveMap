#!/usr/bin/env bash
set -euo pipefail

STATE_DIR="${HIVEMAP_STATE_DIR:-/var/lib/hivemap}"
DATA_DIR="${HIVEMAP_DATA_DIR:-${STATE_DIR}/postgres}"
POSTGRES_DB="${HIVEMAP_POSTGRES_DB:-hivemap}"
POSTGRES_PORT="${HIVEMAP_POSTGRES_PORT:-5432}"
API_HOST="${HIVEMAP_API_HOST:-0.0.0.0}"
API_PORT="${HIVEMAP_API_PORT:-8787}"
OLLAMA_ENABLED="${HIVEMAP_OLLAMA_ENABLED:-0}"
OLLAMA_HOST="${HIVEMAP_OLLAMA_HOST:-127.0.0.1:11434}"
OLLAMA_MODELS_DIR="${HIVEMAP_OLLAMA_MODELS_DIR:-${STATE_DIR}/ollama}"
OLLAMA_PULL_MODELS="${HIVEMAP_OLLAMA_PULL_MODELS:-}"
WEB_DIST="${HIVEMAP_WEB_DIST:-/app/apps/web/dist}"
OLLAMA_PID=""

if [[ ! "${POSTGRES_DB}" =~ ^[A-Za-z_][A-Za-z0-9_]*$ ]]; then
  echo "HIVEMAP_POSTGRES_DB must match ^[A-Za-z_][A-Za-z0-9_]*$" >&2
  exit 1
fi

if [[ "${OLLAMA_ENABLED}" != "0" && "${OLLAMA_ENABLED}" != "1" ]]; then
  echo "HIVEMAP_OLLAMA_ENABLED must be 0 or 1" >&2
  exit 1
fi

if [[ "$(id -u)" == "0" ]]; then
  mkdir -p "${DATA_DIR}" "${OLLAMA_MODELS_DIR}"
  chown -R postgres:postgres "${STATE_DIR}"
  exec gosu postgres "$0" "$@"
fi

mkdir -p "${DATA_DIR}" "${OLLAMA_MODELS_DIR}"

if [[ ! -s "${DATA_DIR}/PG_VERSION" ]]; then
  initdb --auth=trust --username=postgres -D "${DATA_DIR}" >/dev/null
fi

cleanup() {
  if [[ -n "${OLLAMA_PID}" ]]; then
    kill "${OLLAMA_PID}" >/dev/null 2>&1 || true
  fi
  pg_ctl -D "${DATA_DIR}" -m fast stop >/dev/null 2>&1 || true
}

trap cleanup EXIT INT TERM

if [[ -f "${DATA_DIR}/postmaster.pid" ]] && ! pg_ctl -D "${DATA_DIR}" status >/dev/null 2>&1; then
  rm -f "${DATA_DIR}/postmaster.pid"
fi

if ! pg_ctl -D "${DATA_DIR}" status >/dev/null 2>&1; then
  pg_ctl -D "${DATA_DIR}" -o "-c listen_addresses=127.0.0.1 -c port=${POSTGRES_PORT} -c unix_socket_directories=/tmp" -w start >/dev/null
fi

if [[ "$(psql --host 127.0.0.1 --port "${POSTGRES_PORT}" --username postgres --dbname postgres -tAc "SELECT 1 FROM pg_database WHERE datname = '${POSTGRES_DB}'")" != "1" ]]; then
  createdb --host 127.0.0.1 --port "${POSTGRES_PORT}" --username postgres "${POSTGRES_DB}"
fi

if [[ "${OLLAMA_ENABLED}" == "1" ]]; then
  LOCAL_OLLAMA_BASE_URL="http://${OLLAMA_HOST}"
  if [[ -n "${HIVEMAP_OLLAMA_BASE_URL:-}" && "${HIVEMAP_OLLAMA_BASE_URL}" != "${LOCAL_OLLAMA_BASE_URL}" ]]; then
    echo "HIVEMAP_OLLAMA_BASE_URL must be ${LOCAL_OLLAMA_BASE_URL} when HIVEMAP_OLLAMA_ENABLED=1" >&2
    exit 1
  fi

  export OLLAMA_HOST
  export OLLAMA_MODELS="${OLLAMA_MODELS_DIR}"
  export HIVEMAP_OLLAMA_BASE_URL="${LOCAL_OLLAMA_BASE_URL}"

  ollama serve >/tmp/hivemap-ollama.log 2>&1 &
  OLLAMA_PID="$!"

  for _ in $(seq 1 60); do
    if curl -fsS "${LOCAL_OLLAMA_BASE_URL}/api/tags" >/dev/null 2>&1; then
      break
    fi
    sleep 1
  done

  if ! curl -fsS "${LOCAL_OLLAMA_BASE_URL}/api/tags" >/dev/null 2>&1; then
    echo "Bundled Ollama did not become ready at ${LOCAL_OLLAMA_BASE_URL}" >&2
    exit 1
  fi

  if [[ -n "${OLLAMA_PULL_MODELS}" ]]; then
    OLD_IFS="${IFS}"
    IFS=','
    read -r -a OLLAMA_MODELS_TO_PULL <<< "${OLLAMA_PULL_MODELS}"
    IFS="${OLD_IFS}"
    for MODEL in "${OLLAMA_MODELS_TO_PULL[@]}"; do
      TRIMMED_MODEL="$(echo "${MODEL}" | xargs)"
      if [[ -z "${TRIMMED_MODEL}" ]]; then
        echo "HIVEMAP_OLLAMA_PULL_MODELS must not contain empty model entries" >&2
        exit 1
      fi
      ollama pull "${TRIMMED_MODEL}"
    done
  fi
fi

exec node /app/apps/api/dist/server.js \
  --host "${API_HOST}" \
  --port "${API_PORT}" \
  --postgres-url "postgresql://postgres@127.0.0.1:${POSTGRES_PORT}/${POSTGRES_DB}" \
  --web-dist "${WEB_DIST}"
