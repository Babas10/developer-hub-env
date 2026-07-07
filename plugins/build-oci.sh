#!/usr/bin/env bash
# build-oci.sh — Export, build, and push both metering plugins as OCI images.
#
# Usage:
#   ./plugins/build-oci.sh [--registry quay.io/myorg] [--tag 0.1.0]
#
# Defaults:
#   --registry  quay.io/edubois10
#   --tag       value of "version" in metering-backend/package.json
#
# Prerequisites:
#   - podman logged in to the target registry (podman login quay.io)
#   - corepack enabled (corepack enable)
#   - @red-hat-developer-hub/cli available via npx
#   - The quay.io repositories must be set to PUBLIC so RHDH can pull without
#     cluster-level image pull secrets.

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# ── defaults ────────────────────────────────────────────────────────────────
REGISTRY="quay.io/edubois10"
TAG=$(node -p "require('${SCRIPT_DIR}/metering-backend/package.json').version")

# ── argument parsing ─────────────────────────────────────────────────────────
while [[ $# -gt 0 ]]; do
  case "$1" in
    --registry) REGISTRY="$2"; shift 2 ;;
    --tag)      TAG="$2";      shift 2 ;;
    *) echo "Unknown argument: $1"; exit 1 ;;
  esac
done

BACKEND_IMAGE="${REGISTRY}/rhdh-plugin-metering-backend:${TAG}"
FRONTEND_IMAGE="${REGISTRY}/rhdh-plugin-metering:${TAG}"

echo "Registry : ${REGISTRY}"
echo "Tag      : ${TAG}"
echo "Backend  : ${BACKEND_IMAGE}"
echo "Frontend : ${FRONTEND_IMAGE}"
echo ""

# ── Story 5.1 — export backend plugin ────────────────────────────────────────
echo "==> [5.1] Exporting metering-backend..."
(
  cd "${SCRIPT_DIR}/metering-backend"
  npx @red-hat-developer-hub/cli@1.10 plugin export --clean
)
echo ""

# ── Story 5.2 — export frontend plugin ───────────────────────────────────────
echo "==> [5.2] Exporting metering (frontend)..."
(
  cd "${SCRIPT_DIR}/metering"
  npx @red-hat-developer-hub/cli@1.10 plugin export --clean
)
echo ""

# ── Story 5.3 — build OCI images ─────────────────────────────────────────────
echo "==> [5.3] Building backend OCI image: ${BACKEND_IMAGE}"
podman build \
  -f "${SCRIPT_DIR}/metering-backend/Dockerfile.oci" \
  -t "${BACKEND_IMAGE}" \
  "${SCRIPT_DIR}/metering-backend/dist-dynamic"
echo ""

echo "==> [5.3] Building frontend OCI image: ${FRONTEND_IMAGE}"
podman build \
  -f "${SCRIPT_DIR}/metering/Dockerfile.oci" \
  -t "${FRONTEND_IMAGE}" \
  "${SCRIPT_DIR}/metering/dist-dynamic"
echo ""

# ── Story 5.3 — push OCI images ──────────────────────────────────────────────
echo "==> [5.3] Pushing backend image..."
podman push "${BACKEND_IMAGE}"
echo ""

echo "==> [5.3] Pushing frontend image..."
podman push "${FRONTEND_IMAGE}"
echo ""

echo "==> Done."
echo ""
echo "Next step (Story 5.4): update k8s/developer-hub/instance/dynamic-plugins.yaml"
echo "  backend  → ${BACKEND_IMAGE}"
echo "  frontend → ${FRONTEND_IMAGE}"
echo "  Set disabled: false for both entries."
