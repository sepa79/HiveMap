#!/usr/bin/env bash
# Responsibility: Validate local Compose and HiveForge single/swarm render contracts, including fail-fast input cases.
# Must not: Deploy stacks, inspect runtime secrets, or mutate HiveForge project state.
# Contract: Rendered configuration uses an immutable image, one explicit auth source, and profile-specific persistence constraints.
set -euo pipefail

image="${HIVEMAP_ACCEPTANCE_IMAGE:-hivemap:acceptance-local}"
ansible_local_temp="$(mktemp -d)"
ansible_remote_temp="$(mktemp -d)"
render_root="$(mktemp -d)"
single_root="${render_root}/docker-single"
swarm_root="${render_root}/docker-swarm"
public_test_root="${render_root}/docker-swarm-public-test"

cleanup() {
  rm -rf -- "${ansible_local_temp}" "${ansible_remote_temp}" "${render_root}"
}
trap cleanup EXIT

if [[ "${image}" =~ :(latest|dev-latest)$ ]]; then
  printf 'HIVEMAP_ACCEPTANCE_IMAGE must be immutable: %s\n' "${image}" >&2
  exit 1
fi

HIVEMAP_AUTH_TOKEN=acceptance-direct-token docker compose config >/dev/null
if HIVEMAP_AUTH_TOKEN= docker compose config >/dev/null 2>&1; then
  printf 'Local Compose unexpectedly accepted a missing token\n' >&2
  exit 1
fi

ANSIBLE_LOCAL_TEMP="${ansible_local_temp}" ANSIBLE_REMOTE_TEMP="${ansible_remote_temp}" \
HIVEFORGE_PROFILE=docker-single HIVEMAP_IMAGE="${image}" \
ansible-playbook deploy/hiveforge/components/stack/ansible/deploy.yml \
  -e "hiveforge_root=${single_root}" >/dev/null

ANSIBLE_LOCAL_TEMP="${ansible_local_temp}" ANSIBLE_REMOTE_TEMP="${ansible_remote_temp}" \
HIVEFORGE_PROFILE=docker-swarm HIVEMAP_IMAGE="${image}" \
HIVEMAP_DATA_BIND_SOURCE=/opt/hivemap-acceptance/postgres \
HIVEMAP_SWARM_PLACEMENT_CONSTRAINT='node.hostname == hivemap-test-node' \
ansible-playbook deploy/hiveforge/components/stack/ansible/deploy.yml \
  -e "hiveforge_root=${swarm_root}" >/dev/null

ANSIBLE_LOCAL_TEMP="${ansible_local_temp}" ANSIBLE_REMOTE_TEMP="${ansible_remote_temp}" \
HIVEFORGE_PROFILE=docker-swarm HIVEMAP_IMAGE="${image}" \
HIVEMAP_DATA_BIND_SOURCE=/opt/hivemap-acceptance/postgres \
HIVEMAP_SWARM_PLACEMENT_CONSTRAINT='node.hostname == hivemap-test-node' \
HIVEMAP_PUBLIC_TEST_AUTH_TOKEN='hivemap-public-acceptance-token' \
ansible-playbook deploy/hiveforge/components/stack/ansible/deploy.yml \
  -e "hiveforge_root=${public_test_root}" >/dev/null

expect_render_failure() {
  local expected="$1"
  shift
  local output
  local status
  set +e
  output="$(env \
    ANSIBLE_LOCAL_TEMP="${ansible_local_temp}" \
    ANSIBLE_REMOTE_TEMP="${ansible_remote_temp}" \
    "$@" \
    ansible-playbook deploy/hiveforge/components/stack/ansible/deploy.yml \
      -e "hiveforge_root=${render_root}/rejected" 2>&1)"
  status=$?
  set -e
  if [[ "${status}" -eq 0 ]]; then
    printf 'Expected render validation to fail: %s\n' "${expected}" >&2
    exit 1
  fi
  if [[ "${output}" != *"${expected}"* ]]; then
    printf 'Expected render error to contain: %s\n' "${expected}" >&2
    printf '%s\n' "${output}" >&2
    exit 1
  fi
}

expect_render_failure 'HIVEFORGE_PROFILE must be set explicitly' \
  HIVEFORGE_PROFILE= HIVEMAP_IMAGE="${image}"
expect_render_failure 'HIVEMAP_IMAGE must be set explicitly' \
  HIVEFORGE_PROFILE=docker-single HIVEMAP_IMAGE=
expect_render_failure 'HIVEMAP_DATA_BIND_SOURCE' \
  HIVEFORGE_PROFILE=docker-swarm HIVEMAP_IMAGE="${image}" \
  HIVEMAP_SWARM_PLACEMENT_CONSTRAINT='node.hostname == hivemap-test-node'
expect_render_failure 'HIVEMAP_SWARM_PLACEMENT_CONSTRAINT' \
  HIVEFORGE_PROFILE=docker-swarm HIVEMAP_IMAGE="${image}" \
  HIVEMAP_DATA_BIND_SOURCE=/opt/hivemap-acceptance/postgres

single_json="$(docker compose -f "${single_root}/stacks/compose.yml" config --format json)"
swarm_json="$(docker compose -f "${swarm_root}/stacks/compose.yml" config --format json)"
public_test_json="$(docker compose -f "${public_test_root}/stacks/compose.yml" config --format json)"

jq -e --arg image "${image}" '
  .services.hivemap.image == $image and
  .services.hivemap.environment.HIVEMAP_AUTH_TOKEN_FILE == "/run/secrets/hivemap-auth-token" and
  (.services.hivemap.environment | has("HIVEMAP_AUTH_TOKEN") | not) and
  .secrets["hivemap-auth-token"].external == true
' <<<"${single_json}" >/dev/null

jq -e --arg image "${image}" '
  .services.hivemap.image == $image and
  .services.hivemap.environment.HIVEMAP_AUTH_TOKEN_FILE == "/run/secrets/hivemap-auth-token" and
  (.services.hivemap.environment | has("HIVEMAP_AUTH_TOKEN") | not) and
  .services.hivemap.volumes[0].source == "/opt/hivemap-acceptance/postgres" and
  .services.hivemap.volumes[0].target == "/var/lib/hivemap/postgres" and
  .services.hivemap.deploy.placement.constraints == ["node.hostname == hivemap-test-node"] and
  .secrets["hivemap-auth-token"].external == true
' <<<"${swarm_json}" >/dev/null

jq -e --arg image "${image}" --arg token 'hivemap-public-acceptance-token' '
  .services.hivemap.image == $image and
  .services.hivemap.environment.HIVEMAP_AUTH_TOKEN == $token and
  (.services.hivemap.environment | has("HIVEMAP_AUTH_TOKEN_FILE") | not) and
  (.services.hivemap | has("secrets") | not) and
  (has("secrets") | not)
' <<<"${public_test_json}" >/dev/null

printf 'render-smoke=passed\n'
