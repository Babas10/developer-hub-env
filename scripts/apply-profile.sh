#!/usr/bin/env bash
# apply-profile.sh — Apply cluster-profile.yaml app switches to the cluster.
#
# Usage:
#   ./scripts/apply-profile.sh               # apply
#   ./scripts/apply-profile.sh --dry-run     # preview without changing anything
#
# Requirements:
#   oc (logged in to the target cluster)
#   python3

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="${SCRIPT_DIR}/.."
PROFILE="${REPO_ROOT}/cluster-profile.yaml"
APPS_DIR="${REPO_ROOT}/k8s/apps"
ARGOCD_NS="openshift-gitops"
DRY_RUN=false

for arg in "$@"; do
  [[ "$arg" == "--dry-run" ]] && DRY_RUN=true
done

$DRY_RUN && echo "[DRY-RUN] No changes will be applied." || true

# Parse cluster-profile.yaml using python3 (no yq dependency required)
declare -A APP_STATE
while IFS='= ' read -r app state; do
  [[ -z "$app" || "$app" == "#"* ]] && continue
  app="${app//[[:space:]]/}"
  state="${state//[[:space:]]/}"
  [[ -z "$app" || -z "$state" ]] && continue
  APP_STATE["$app"]="$state"
done < <(python3 - <<'PYEOF'
import yaml, sys
with open(sys.argv[1]) as f:
    data = yaml.safe_load(f)
for app, enabled in (data.get('apps') or {}).items():
    print(f"{app} = {'true' if enabled else 'false'}")
PYEOF
"$PROFILE")

echo ""
echo "==> Cluster profile: ${PROFILE}"
echo ""

ENABLED=()
DISABLED=()

for app in "${!APP_STATE[@]}"; do
  if [[ "${APP_STATE[$app]}" == "true" ]]; then
    ENABLED+=("$app")
  else
    DISABLED+=("$app")
  fi
done

# Sort for consistent output
IFS=$'\n' ENABLED=($(sort <<<"${ENABLED[*]}")); unset IFS
IFS=$'\n' DISABLED=($(sort <<<"${DISABLED[*]}")); unset IFS

# ── Enable apps ────────────────────────────────────────────────────────────
echo "==> Enabling (${#ENABLED[@]} apps):"
for app in "${ENABLED[@]}"; do
  APP_FILE="${APPS_DIR}/${app}.yaml"
  if [[ ! -f "$APP_FILE" ]]; then
    echo "  [SKIP]  ${app}  (no file at k8s/apps/${app}.yaml)"
    continue
  fi
  if $DRY_RUN; then
    echo "  [DRY]   would apply: ${app}"
  else
    oc apply -f "$APP_FILE" -n "$ARGOCD_NS" &>/dev/null && \
      echo "  [ON]    ${app}" || \
      echo "  [FAIL]  ${app}"
  fi
done

echo ""

# ── Disable apps ───────────────────────────────────────────────────────────
echo "==> Disabling (${#DISABLED[@]} apps):"
for app in "${DISABLED[@]}"; do
  EXISTS=$(oc get application "$app" -n "$ARGOCD_NS" --no-headers 2>/dev/null | wc -l)
  if [[ "$EXISTS" -eq 0 ]]; then
    echo "  [SKIP]  ${app}  (not deployed)"
    continue
  fi
  if $DRY_RUN; then
    echo "  [DRY]   would delete: ${app}"
  else
    oc delete application "$app" -n "$ARGOCD_NS" &>/dev/null && \
      echo "  [OFF]   ${app}" || \
      echo "  [FAIL]  ${app}"
  fi
done

echo ""
echo "==> Done."
