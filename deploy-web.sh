#!/usr/bin/env bash
#
# Builds the StoreSystem web UI (the phone client), meant to run ON the server.
#
#   ./deploy-web.sh
#
# Builds the React frontend inside a throwaway Node container (no Node.js on
# the host) into server/static/. It does NOT touch the Docker stack: the
# running backend serves server/static/ from disk on every request, so the new
# build is live as soon as this finishes - no restart needed. (Only the very
# first build on a server needs one backend restart, because the backend
# decides at startup whether a web build exists.)
#
# Clients open  https://<server-ip>:8000/  and reload the page.
#
set -euo pipefail

# Repo root = the directory this script lives in.
REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
NODE_IMAGE="${NODE_IMAGE:-node:20-bookworm}"
# Pinned: pnpm@latest jumped majors and stopped honouring .npmrc / the
# package.json "pnpm" settings, which broke the build. Bump deliberately.
PNPM_VERSION="${PNPM_VERSION:-10.4.1}"

cd "$REPO_ROOT"

echo "==> Building web frontend in $NODE_IMAGE ..."
docker run --rm \
  -v "$REPO_ROOT":/repo \
  -w /repo \
  -e CI=1 \
  "$NODE_IMAGE" \
  bash -c "
    set -e
    # npm, not corepack: corepack's bundled signing keys can reject older
    # pnpm releases (error: Cannot find matching keyid).
    npm install -g --silent pnpm@${PNPM_VERSION}
    # --ignore-scripts skips the Electron binary postinstall (not needed for a web build).
    # No --frozen-lockfile: the lockfile may be absent on a synced checkout.
    # confirmModulesPurge=false: rebuild node_modules without a prompt if it
    # was made by a different pnpm version.
    # hardlink: on ZFS (TrueNAS) pnpm's parallel copyfile fails with EAGAIN;
    # the store and node_modules share the bind mount, so link instead of copy.
    pnpm install --ignore-scripts --no-frozen-lockfile --config.confirmModulesPurge=false --package-import-method=hardlink
    pnpm run build:web
  "

echo "==> Done: web UI built into server/static/"
echo "    Live now at https://<this-server-ip>:8000/ (reload the page on phones)."
