#!/usr/bin/env bash
set -euo pipefail

usage() {
  cat <<'EOF'
Usage: tools/hiveforge-dev-loop.sh [options]

Snapshot the current working tree into a temporary clone, force-push a stable
Forgejo development branch, and build/push dev image tags for HiveForge.

Options:
  --branch <name>         Forgejo branch to update. Default: hivemap-dev-loop
  --image-tag <tag>       Immutable image tag. Default: <branch-slug>-<utc-stamp>
  --floating-tag <tag>    Moving image tag for repeated deploys. Default: dev-latest
  --repo <url>            Forgejo git remote. Default: http://192.168.88.50:3001/hiveforge/hivemap.git
  --image-repo <name>     Registry image repo. Default: 192.168.88.50:3001/hiveforge/hivemap
  --temp-root <path>      Parent temp dir. Default: /tmp/hivemap-hiveforge-dev-loop
  --skip-build            Skip docker buildx build/push.
  --help                  Show this help.
EOF
}

branch="hivemap-dev-loop"
forgejo_repo="http://192.168.88.50:3001/hiveforge/hivemap.git"
image_repo="192.168.88.50:3001/hiveforge/hivemap"
temp_root="/tmp/hivemap-hiveforge-dev-loop"
floating_tag="dev-latest"
image_tag=""
skip_build=0

while [[ $# -gt 0 ]]; do
  case "$1" in
    --branch)
      branch="$2"
      shift 2
      ;;
    --image-tag)
      image_tag="$2"
      shift 2
      ;;
    --floating-tag)
      floating_tag="$2"
      shift 2
      ;;
    --repo)
      forgejo_repo="$2"
      shift 2
      ;;
    --image-repo)
      image_repo="$2"
      shift 2
      ;;
    --temp-root)
      temp_root="$2"
      shift 2
      ;;
    --skip-build)
      skip_build=1
      shift
      ;;
    --help)
      usage
      exit 0
      ;;
    *)
      echo "Unknown option: $1" >&2
      usage >&2
      exit 1
      ;;
  esac
done

repo_root="$(git rev-parse --show-toplevel)"
branch_slug="$(printf '%s' "${branch}" | tr '/:@' '---')"
timestamp_utc="$(date -u +%Y%m%d-%H%M%S)"

if [[ -z "${image_tag}" ]]; then
  image_tag="${branch_slug}-${timestamp_utc}"
fi

mkdir -p "${temp_root}"
temp_repo="$(mktemp -d "${temp_root}/run.XXXXXX")"

git clone "${repo_root}" "${temp_repo}" >/dev/null
cd "${temp_repo}"

git checkout -B "${branch}" >/dev/null

if git config user.name >/dev/null 2>&1; then
  git_user_name="$(git config user.name)"
else
  git_user_name="hivemap-dev-loop"
fi

if git config user.email >/dev/null 2>&1; then
  git_user_email="$(git config user.email)"
else
  git_user_email="hivemap-dev-loop@local"
fi

git config user.name "${git_user_name}"
git config user.email "${git_user_email}"

rsync -a \
  --delete \
  --exclude '.git' \
  --exclude '.local' \
  --exclude '.hivemap' \
  --exclude '.playwright-mcp' \
  --exclude 'node_modules' \
  --exclude 'apps/*/node_modules' \
  --exclude 'packages/*/node_modules' \
  --exclude 'poc/node_modules' \
  --exclude 'apps/*/dist' \
  --exclude 'packages/*/dist' \
  --exclude 'poc/dist' \
  --exclude 'coverage' \
  --exclude '*.log' \
  "${repo_root}/" "${temp_repo}/"

git add -A

if git diff --cached --quiet; then
  snapshot_commit="$(git rev-parse HEAD)"
else
  git commit -m "WIP: HiveForge dev loop snapshot ${timestamp_utc}" >/dev/null
  snapshot_commit="$(git rev-parse HEAD)"
fi

if git remote get-url forgejo >/dev/null 2>&1; then
  git remote set-url forgejo "${forgejo_repo}"
else
  git remote add forgejo "${forgejo_repo}"
fi

git push --force-with-lease forgejo "${branch}" >/dev/null

floating_image="${image_repo}:${floating_tag}"
immutable_image="${image_repo}:${image_tag}"

if [[ "${skip_build}" -eq 0 ]]; then
  docker buildx build \
    --platform linux/amd64 \
    --tag "${floating_image}" \
    --tag "${immutable_image}" \
    --output type=image,push=true,registry.insecure=true \
    "${temp_repo}"
fi

metadata_file="${temp_repo}/.hiveforge-dev-loop.json"
cat > "${metadata_file}" <<EOF
{
  "forgejoRepository": "${forgejo_repo}",
  "gitRef": "${branch}",
  "snapshotCommit": "${snapshot_commit}",
  "imageRepository": "${image_repo}",
  "floatingImage": "${floating_image}",
  "immutableImage": "${immutable_image}",
  "tempRepo": "${temp_repo}",
  "projectId": "hivemap-development",
  "profile": "docker-swarm",
  "component": "stack",
  "nextStep": "Trigger HiveForge deploy/update with gitRef ${branch}. If the runtime env is not already pinned to ${floating_image}, update HIVEMAP_IMAGE first."
}
EOF

echo "HiveForge dev snapshot is ready."
echo "  forgejo branch: ${branch}"
echo "  snapshot commit: ${snapshot_commit}"
echo "  floating image: ${floating_image}"
echo "  immutable image: ${immutable_image}"
echo "  temp repo: ${temp_repo}"
echo "  metadata: ${metadata_file}"
echo
echo "Next HiveForge action inputs:"
echo "  projectId: hivemap-development"
echo "  profile: docker-swarm"
echo "  component: stack"
echo "  gitRef: ${branch}"
echo "  HIVEMAP_IMAGE: ${floating_image}"
echo
echo "If HiveForge still points at an older tag, update runtime env once to ${floating_image},"
echo "then run deploy/update for gitRef ${branch}."
