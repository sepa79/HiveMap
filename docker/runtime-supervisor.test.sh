#!/usr/bin/env bash
set -euo pipefail

TEST_ROOT="$(mktemp -d)"
trap 'rm -rf "${TEST_ROOT}"' EXIT
TEST_BIN="${TEST_ROOT}/bin"
TEST_LOG="${TEST_ROOT}/events.log"
mkdir -p "${TEST_BIN}"

cat >"${TEST_BIN}/pg_ctl" <<'SCRIPT'
#!/usr/bin/env bash
printf 'postgres-stop:%s\n' "$*" >>"${HIVEMAP_SUPERVISOR_TEST_LOG}"
SCRIPT

cat >"${TEST_BIN}/mock-api" <<'SCRIPT'
#!/usr/bin/env bash
trap 'printf "api-term\n" >>"${HIVEMAP_SUPERVISOR_TEST_LOG}"; exit 0' TERM
printf 'api-start\n' >>"${HIVEMAP_SUPERVISOR_TEST_LOG}"
while true; do
  sleep 1
done
SCRIPT

chmod +x "${TEST_BIN}/pg_ctl" "${TEST_BIN}/mock-api"
export PATH="${TEST_BIN}:${PATH}"
export HIVEMAP_SUPERVISOR_TEST_LOG="${TEST_LOG}"

# shellcheck source=runtime-supervisor.sh
source "$(dirname "$0")/runtime-supervisor.sh"

supervise_hivemap_runtime "/tmp/hivemap-supervisor-test-data" mock-api &
SUPERVISOR_PID=$!

for _ in {1..50}; do
  if [[ -f "${TEST_LOG}" ]] && grep -q '^api-start$' "${TEST_LOG}"; then
    break
  fi
  sleep 0.02
done

kill -TERM "${SUPERVISOR_PID}"
wait "${SUPERVISOR_PID}"

grep -q '^api-term$' "${TEST_LOG}"
grep -q '^postgres-stop:-D /tmp/hivemap-supervisor-test-data -m fast -w stop$' "${TEST_LOG}"
