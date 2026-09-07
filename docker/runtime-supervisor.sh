#!/usr/bin/env bash
# Responsibility: Supervise the API child and bundled Postgres lifecycle as container PID 1.
# Must not: Initialize databases, parse application config, or hide child/Postgres failures.
# Contract: Forward INT/TERM, wait for the API, stop Postgres fast, and return the API status.

supervise_hivemap_runtime() {
  local data_dir="$1"
  shift
  local api_pid=""

  stop_postgres() {
    pg_ctl -D "${data_dir}" -m fast -w stop >/dev/null
  }

  terminate_runtime() {
    trap - INT TERM
    if [[ -n "${api_pid}" ]] && kill -0 "${api_pid}" 2>/dev/null; then
      kill -TERM "${api_pid}"
    fi
    set +e
    wait "${api_pid}"
    local api_status=$?
    set -e
    stop_postgres
    return "${api_status}"
  }

  trap 'terminate_runtime; exit $?' INT TERM

  "$@" &
  api_pid=$!

  set +e
  wait "${api_pid}"
  local api_status=$?
  set -e
  trap - INT TERM
  stop_postgres
  return "${api_status}"
}
