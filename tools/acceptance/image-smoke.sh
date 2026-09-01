#!/usr/bin/env bash
# Responsibility: Build one immutable local image and coordinate its auth, application, persistence, lifecycle, browser, and storage-failure acceptance checks.
# Must not: Push registries, deploy HiveForge projects, or reuse developer runtime state.
# Contract: Every check targets the same built image and one disposable HiveMap-owned volume.
set -euo pipefail

commit_sha="$(git rev-parse --short HEAD)"
image="${HIVEMAP_ACCEPTANCE_IMAGE:-hivemap:acceptance-${commit_sha}-${BASHPID}}"
token="acceptance-direct-token"
repository_url="https://github.com/octocat/Spoon-Knife.git"
repository_ref="d0dd1f61b33d64e29d8bc1372a94ef6a2fee76a9"
repository_query="forking"
name_suffix="${commit_sha}-${BASHPID}"
file_container="hivemap-acceptance-auth-file-${name_suffix}"
runtime_container="hivemap-acceptance-runtime-${name_suffix}"
restart_container="hivemap-acceptance-restart-${name_suffix}"
volume_name="hivemap-acceptance-data-${name_suffix}"
fixture_dir="$(mktemp -d)"
wait_file=""
outage_body=""

cleanup() {
  docker stop "${file_container}" "${runtime_container}" "${restart_container}" >/dev/null 2>&1 || true
  docker volume rm "${volume_name}" >/dev/null 2>&1 || true
  rm -f "${fixture_dir}/token" "${fixture_dir}/empty"
  if [[ -n "${wait_file}" ]]; then
    rm -f "${wait_file}"
  fi
  if [[ -n "${outage_body}" ]]; then
    rm -f "${outage_body}"
  fi
  rmdir "${fixture_dir}" >/dev/null 2>&1 || true
}
trap cleanup EXIT

wait_for_health() {
  local container_name="$1"
  local host_port="$2"
  for attempt in {1..60}; do
    if curl --fail --silent "http://127.0.0.1:${host_port}/health" >/dev/null; then
      return
    fi
    if [[ "${attempt}" -eq 60 ]]; then
      docker logs "${container_name}"
      return 1
    fi
    sleep 1
  done
}

start_runtime() {
  local container_name="$1"
  docker run \
    --rm \
    --name "${container_name}" \
    --env "HIVEMAP_AUTH_TOKEN=${token}" \
    --volume "${volume_name}:/var/lib/hivemap/postgres" \
    --publish 127.0.0.1::8787 \
    --detach \
    "${image}" >/dev/null
  local host_port
  host_port="$(docker port "${container_name}" 8787/tcp | sed 's/.*://')"
  wait_for_health "${container_name}" "${host_port}"
  printf '%s\n' "${host_port}"
}

if [[ "${image}" =~ :(latest|dev-latest)$ ]]; then
  printf 'HIVEMAP_ACCEPTANCE_IMAGE must be immutable: %s\n' "${image}" >&2
  exit 1
fi

docker build --pull --tag "${image}" .

printf '%s\n' 'acceptance-file-token' > "${fixture_dir}/token"
touch "${fixture_dir}/empty"

expect_failed_startup() {
  local expected="$1"
  shift
  local output
  local status
  set +e
  output="$(docker run --rm "$@" "${image}" 2>&1)"
  status=$?
  set -e
  if [[ "${status}" -eq 0 ]]; then
    printf 'Expected container startup to fail\n' >&2
    exit 1
  fi
  if [[ "${output}" != *"${expected}"* ]]; then
    printf 'Expected startup error to contain: %s\n' "${expected}" >&2
    printf '%s\n' "${output}" >&2
    exit 1
  fi
}

expect_failed_startup 'HIVEMAP_AUTH_TOKEN or HIVEMAP_AUTH_TOKEN_FILE must provide a bearer token'
expect_failed_startup 'HIVEMAP_AUTH_TOKEN or HIVEMAP_AUTH_TOKEN_FILE must provide a bearer token' \
  --env 'HIVEMAP_AUTH_TOKEN=   '
expect_failed_startup 'Set exactly one of HIVEMAP_AUTH_TOKEN or HIVEMAP_AUTH_TOKEN_FILE' \
  --env HIVEMAP_AUTH_TOKEN=direct --env HIVEMAP_AUTH_TOKEN_FILE=/run/token
expect_failed_startup 'HIVEMAP_AUTH_TOKEN_FILE is not readable' \
  --env HIVEMAP_AUTH_TOKEN_FILE=/run/missing
expect_failed_startup 'HIVEMAP_AUTH_TOKEN_FILE is empty' \
  --env HIVEMAP_AUTH_TOKEN_FILE=/run/token \
  --volume "${fixture_dir}/empty:/run/token:ro"

docker run \
  --rm \
  --name "${file_container}" \
  --env HIVEMAP_AUTH_TOKEN_FILE=/run/token \
  --volume "${fixture_dir}/token:/run/token:ro" \
  --publish 127.0.0.1::8787 \
  --detach \
  "${image}" >/dev/null
file_port="$(docker port "${file_container}" 8787/tcp | sed 's/.*://')"
wait_for_health "${file_container}" "${file_port}"
file_status="$(curl --silent --output /dev/null --write-out '%{http_code}' \
  --header 'Authorization: Bearer acceptance-file-token' \
  "http://127.0.0.1:${file_port}/workspaces")"
if [[ "${file_status}" != 200 ]]; then
  printf 'Token-file runtime returned HTTP %s\n' "${file_status}" >&2
  exit 1
fi
docker stop "${file_container}" >/dev/null

docker volume create "${volume_name}" >/dev/null
runtime_port="$(start_runtime "${runtime_container}")"

HIVEMAP_ACCEPTANCE_BASE_URL="http://127.0.0.1:${runtime_port}" \
HIVEMAP_ACCEPTANCE_AUTH_TOKEN="${token}" \
HIVEMAP_ACCEPTANCE_REPOSITORY_URL="${repository_url}" \
HIVEMAP_ACCEPTANCE_REPOSITORY_REF="${repository_ref}" \
HIVEMAP_ACCEPTANCE_REPOSITORY_QUERY="${repository_query}" \
node tools/acceptance/runtime-smoke.mjs

docker exec --user postgres "${runtime_container}" \
  psql --host 127.0.0.1 --dbname hivemap --set ON_ERROR_STOP=1 \
  --command "UPDATE repository_indexes SET stage = 'checking_out', completed_at = NULL, failure_code = NULL, failure_message = NULL WHERE workspace_id = 'acceptance-workspace' AND id = 'acceptance-interrupted-index'" \
  >/dev/null

interrupted_stage="$(docker exec --user postgres "${runtime_container}" \
  psql --host 127.0.0.1 --dbname hivemap --tuples-only --no-align \
  --command "SELECT stage FROM repository_indexes WHERE workspace_id = 'acceptance-workspace' AND id = 'acceptance-interrupted-index'")"
if [[ "${interrupted_stage}" != checking_out ]]; then
  printf 'Failed to create interrupted index fixture\n' >&2
  exit 1
fi

wait_file="$(mktemp)"
docker wait "${runtime_container}" > "${wait_file}" &
waiter_pid=$!
docker stop --signal TERM --time 20 "${runtime_container}" >/dev/null
wait "${waiter_pid}"
container_exit="$(<"${wait_file}")"
if [[ "${container_exit}" != 0 ]]; then
  printf 'SIGTERM produced container exit %s\n' "${container_exit}" >&2
  exit 1
fi
docker run --rm --entrypoint bash --volume "${volume_name}:/data:ro" "${image}" \
  -c 'test ! -e /data/postmaster.pid'

restart_port="$(start_runtime "${restart_container}")"
HIVEMAP_ACCEPTANCE_BASE_URL="http://127.0.0.1:${restart_port}" \
HIVEMAP_ACCEPTANCE_AUTH_TOKEN="${token}" \
node tools/acceptance/runtime-restart-smoke.mjs

docker exec --user postgres "${restart_container}" \
  pg_ctl -D /var/lib/hivemap/postgres -m fast -w stop >/dev/null
outage_body="$(mktemp)"
for attempt in {1..30}; do
  outage_status="$(curl --silent --output "${outage_body}" --write-out '%{http_code}' \
    "http://127.0.0.1:${restart_port}/health")"
  if [[ "${outage_status}" == 503 ]]; then
    break
  fi
  if [[ "${attempt}" -eq 30 ]]; then
    printf 'Health did not become unavailable; last HTTP %s\n' "${outage_status}" >&2
    exit 1
  fi
  sleep 1
done
jq -e '.error.code == "STORAGE_UNAVAILABLE" and .error.message == "HiveMap storage is unavailable"' \
  "${outage_body}" >/dev/null

rest_outage_status="$(curl --silent --output /dev/null --write-out '%{http_code}' \
  --header "Authorization: Bearer ${token}" \
  "http://127.0.0.1:${restart_port}/workspaces")"
if [[ "${rest_outage_status}" != 503 ]]; then
  printf 'REST during storage outage returned HTTP %s\n' "${rest_outage_status}" >&2
  exit 1
fi

docker exec --user postgres "${restart_container}" \
  pg_ctl -D /var/lib/hivemap/postgres \
  -o '-c listen_addresses=127.0.0.1 -c port=5432 -c unix_socket_directories=/tmp' \
  -w start >/dev/null
wait_for_health "${restart_container}" "${restart_port}"

HIVEMAP_ACCEPTANCE_BASE_URL="http://127.0.0.1:${restart_port}" \
HIVEMAP_ACCEPTANCE_AUTH_TOKEN="${token}" \
node tools/acceptance/browser-smoke.mjs

printf 'image-smoke=passed image=%s\n' "${image}"
