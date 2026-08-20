#!/usr/bin/env bash
set -euo pipefail

usage() {
  cat <<'EOF'
Usage: tools/import-workspace-bundle.sh [options] <bundle-path>

Import one .hivemap.zip bundle through the public HiveMap REST API.

Options:
  --api-base-url <url>   API base URL. Default: http://127.0.0.1:8787
  --mode <new|replace>   Import mode. Default: new
  --help                 Show this help.
EOF
}

api_base_url="http://127.0.0.1:8787"
mode="new"

while [[ $# -gt 0 ]]; do
  case "$1" in
    --api-base-url)
      api_base_url="$2"
      shift 2
      ;;
    --mode)
      mode="$2"
      shift 2
      ;;
    --help)
      usage
      exit 0
      ;;
    --*)
      echo "Unknown option: $1" >&2
      usage >&2
      exit 1
      ;;
    *)
      break
      ;;
  esac
done

if [[ $# -ne 1 ]]; then
  usage >&2
  exit 1
fi

bundle_path="$1"

if [[ ! -f "${bundle_path}" ]]; then
  echo "Bundle not found: ${bundle_path}" >&2
  exit 1
fi

if [[ "${mode}" != "new" && "${mode}" != "replace" ]]; then
  echo "--mode must be new or replace" >&2
  exit 1
fi

curl \
  --fail \
  --silent \
  --show-error \
  -X POST \
  -H "content-type: application/zip" \
  --data-binary "@${bundle_path}" \
  "${api_base_url%/}/workspace-import-bundles?mode=${mode}"
echo
