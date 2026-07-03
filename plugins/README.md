# Metering Plugin for Red Hat Developer Hub

A two-package dynamic plugin that estimates the running cost of a catalog
component based on live CPU/memory usage pulled from Prometheus.

- `metering-backend/` — Backstage backend plugin: queries Prometheus,
  applies a configurable cost model, exposes a REST API, and persists
  hourly cost snapshots to the RHDH database.
- `metering/` — Backstage frontend plugin (New Frontend System): renders a
  cost card with CPU/memory charts on the entity overview page.

## Annotation Guide

Add the standard Kubernetes plugin annotations to any `Component` entity you
want metered:

```yaml
metadata:
  annotations:
    backstage.io/kubernetes-namespace: "my-app-namespace"
    backstage.io/kubernetes-id: "my-deployment" # optional, falls back to entity name
```

If `backstage.io/kubernetes-namespace` is missing, the `MeteringCard` shows a
guidance message instead of cost data.

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

# 5. Start rhdh-local
cd ../rhdh-local
podman compose run install-dynamic-plugins
podman compose up rhdh
```

Re-run `./export-dev.sh` after any source change, then restart the
`rhdh` container to pick up the new build.

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
