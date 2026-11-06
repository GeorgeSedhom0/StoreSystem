#!/usr/bin/env bash
#
# One-shot deploy for the StoreSystem web UI, meant to run ON the TrueNAS server.
#
#   ./deploy-web.sh
#
# It does everything end to end with no Node.js installed on the host:
#   1. Builds the React frontend inside a throwaway Node container, emitting a
#      plain SPA into server/static/.
#   2. Builds & (re)starts the Docker stack, which serves that SPA at "/" and
#      the API on the same origin (port 8000).
#
# After it finishes, phone/desktop clients on the network (e.g. via Tailscale)
# open  https://<server-ip>:8000/  and get the app.
#
set -euo pipefail

# Repo root = the directory this script lives in.
REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
COMPOSE_FILE="${COMPOSE_FILE:-server/docker-compose.truenas.yml}"
NODE_IMAGE="${NODE_IMAGE:-node:20-bookworm}"
# Pinned: pnpm@latest jumped majors and stopped honouring .npmrc / the
# package.json "pnpm" settings, which broke the build. Bump deliberately.
PNPM_VERSION="${PNPM_VERSION:-10.4.1}"

cd "$REPO_ROOT"

echo "==> [1/2] Building web frontend in $NODE_IMAGE ..."
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
    pnpm install --ignore-scripts --no-frozen-lockfile --config.confirmModulesPurge=false
    pnpm run build:web
  "

echo "==> Frontend built into server/static/"

echo "==> [2/2] Building & starting Docker stack ..."
docker compose -f "$COMPOSE_FILE" up -d --build

echo ""
echo "==> Done."
echo "    The app is now served at:  https://<this-server-ip>:8000/"
echo "    (self-signed cert — accept the browser warning once per device)"
