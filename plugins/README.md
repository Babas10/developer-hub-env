# Metering Plugin for Red Hat Developer Hub

A two-package dynamic plugin that estimates the running cost of a catalog
component based on live CPU/memory usage pulled from Prometheus.

- `metering-backend/` — Backstage backend plugin: queries Prometheus,
  applies a configurable cost model, exposes a REST API, and persists
  hourly cost snapshots to the RHDH database.
- `metering/` — Backstage frontend plugin (New Frontend System): renders a
  compact cost summary card on the entity Overview tab, and a full-detail
  "Metering" tab (side-by-side cost KPIs, resource efficiency, and
  daily/weekly/monthly usage averages) — following the same
  card-on-overview-plus-dedicated-tab pattern as the Kubernetes and ArgoCD
  plugins.

## Annotation Guide

Add the standard Kubernetes plugin annotations to any `Component` entity you
want metered:

```yaml
metadata:
  annotations:
    backstage.io/kubernetes-namespace: "my-app-namespace"
    backstage.io/kubernetes-id: "my-deployment" # optional, falls back to entity name
```

If `backstage.io/kubernetes-namespace` is missing, both the Overview summary
card and the Metering tab show a guidance message (via Backstage's standard
`MissingAnnotationEmptyState`) instead of cost data.

## Config Reference

Add a `metering` block to `app-config.yaml` (see
[`k8s/developer-hub/instance/app-config.yaml`](../k8s/developer-hub/instance/app-config.yaml)
for the deployed example):

| Key | Type | Default | Description |
|---|---|---|---|
| `metering.prometheusUrl` | string (required) | — | Base URL of the Prometheus instance |
| `metering.windowHours` | number | `24` | Lookback window for live cost queries |
| `metering.retentionDays` | number | `90` | How long cost snapshots are kept in the DB |
| `metering.costModel.cpuCostPerCorePerHour` | number (required) | — | USD cost per CPU core per hour |
| `metering.costModel.memoryCostPerGBPerHour` | number (required) | — | USD cost per GiB of memory per hour |
| `metering.bearerToken` | string (secret, optional) | — | Explicit bearer token for Prometheus. Only needed when the pod's own service-account token isn't available (e.g. local dev against a port-forwarded cluster Prometheus) — see below |

The backend also requires cluster RBAC to read OpenShift monitoring metrics
— see
[`k8s/developer-hub/instance/metering-rbac.yaml`](../k8s/developer-hub/instance/metering-rbac.yaml).

## Local Development Setup (RHDH Local)

```bash
# 1. Clone rhdh-local alongside this repo (one-time)
git clone https://github.com/redhat-developer/rhdh-local.git ../rhdh-local

# 2. Install workspace dependencies
cd plugins
yarn install

# 3. Build + export both plugins into rhdh-local/local-plugins/
./export-dev.sh

# 4. (Optional) Port-forward OpenShift Prometheus for real metrics
oc port-forward -n openshift-monitoring svc/prometheus-k8s 9091:9091

# 5. Start rhdh-local — run these SEQUENTIALLY, not combined in one `up -d`.
#    Starting them together races the installer against rhdh reading the
#    same dynamic-plugins-root volume mid-(re)install, which silently breaks
#    frontend plugin loading (scalprum manifest 404s).
cd ../rhdh-local
podman compose run --rm install-dynamic-plugins   # wait for this to fully exit
podman compose up rhdh
```

Re-run `./export-dev.sh` after any source change, then repeat step 5
(installer fully to completion, then `rhdh`) to pick up the new build.

### Testing against real Prometheus data

OpenShift's `prometheus-k8s` service is HTTPS-only (fronted by oauth-proxy
with a cluster-internal, self-signed cert) and requires a bearer token even
over a port-forward — the pod's own in-cluster service-account token (used
automatically in production) isn't available inside the local podman
container. To test with real metrics:

1. Set `prometheusUrl: https://host.containers.internal:9091` (not `http://`)
   in `rhdh-local/configs/app-config/app-config.local.yaml`.
2. Put a token in the gitignored `rhdh-local/.env`:
   ```
   METERING_PROMETHEUS_TOKEN=<output of `oc whoami --show-token`>
   ```
   (any identity with the `cluster-monitoring-view` cluster role works), and
   reference it from `app-config.local.yaml` as `bearerToken: ${METERING_PROMETHEUS_TOKEN}`.
3. Add a dev-only `NODE_TLS_REJECT_UNAUTHORIZED: "0"` environment override
   for the `rhdh` service in `compose.override.yaml` — needed to trust the
   cluster's self-signed cert from outside the cluster. **Never use this
   against a real deployment.**
4. Annotate a catalog entity for a real, running Deployment (see
   `rhdh-local/configs/catalog-entities/components.override.yaml` for an
   example mirroring a real app) and view it in the Metering tab.

## Testing

```bash
cd plugins
yarn test:all      # run all unit tests (backend + frontend)
yarn tsc:all        # type-check all packages
```

## Deployment to OpenShift

```bash
npx @red-hat-developer-hub/cli@1.10 plugin export
npx @red-hat-developer-hub/cli@1.10 plugin package \
  --tag quay.io/<your-org>/rhdh-plugin-metering:1.0.0
podman push quay.io/<your-org>/rhdh-plugin-metering:1.0.0
```

See the [`Containerfile`](../Containerfile) for an alternative OCI packaging
approach, and update
[`dynamic-plugins.yaml`](../k8s/developer-hub/instance/dynamic-plugins.yaml)
with the pushed image references. ArgoCD (wave 3) picks up the change
automatically once committed.
