# CLAUDE.md — developer-hub-env

## Project Overview

Red Hat Developer Hub (RHDH) environment deployed on OpenShift using GitOps.
Ansible bootstraps OpenShift GitOps, then ArgoCD owns everything via the App of Apps pattern.

Owner: Red Hat employee (Etienne Dubois). Clusters are ephemeral sandbox environments from RHDP (opentlc).

---

## Image Policy — CRITICAL

**Never use Docker Hub or community images (docker.io, bitnami, quay.io/bitnami, etc.).**
All container images must come from the Red Hat registry:

| Use case | Image |
|----------|-------|
| PostgreSQL 15 | `registry.redhat.io/rhel9/postgresql-15:latest` |
| PostgreSQL 16 | `registry.redhat.io/rhel9/postgresql-16:latest` |

Red Hat PostgreSQL images use:
- Env vars: `POSTGRESQL_USER`, `POSTGRESQL_PASSWORD`, `POSTGRESQL_DATABASE`
- Data directory: `/var/lib/pgsql/data`

When in doubt, search `registry.redhat.io` for the appropriate Red Hat supported image.

---

## Architecture

```
1. Ansible bootstrap.yml
   └── Installs OpenShift GitOps operator (Subscription CR)
       └── Operator auto-creates default ArgoCD instance in openshift-gitops namespace

2. Ansible bootstrap.yml (continued)
   └── Pre-creates Sealed Secrets signing key (same key pair as devops-ai-agentic)
   └── Applies the "App of Apps" ArgoCD Application CR pointing to this repo

3. ArgoCD (owns everything from here)
   ├── Wave 1 — Sealed Secrets        (Bitnami Helm chart via external repo)
   ├── Wave 2 — Developer Hub Operator (Subscription + OperatorGroup CRs)
   └── Wave 3 — Developer Hub Instance (Backstage CR + app-config + plugins)
```

### Install method per component

| Component | Method |
|-----------|--------|
| OpenShift GitOps (ArgoCD) | Ansible `Subscription` CR → operator auto-creates default ArgoCD instance |
| Sealed Secrets | ArgoCD `Application` → Bitnami Helm chart (external repo) |
| Developer Hub Operator | ArgoCD `Application` → `Subscription` + `OperatorGroup` CRs |
| Developer Hub Instance | ArgoCD `Application` → `Backstage` CR + ConfigMaps |

---

## Repository Structure

```
developer-hub-env/
├── CLAUDE.md
├── README.md
├── .gitignore
├── ansible.cfg
├── ansible/
│   ├── inventory/
│   │   ├── localhost.yml
│   │   └── group_vars/
│   │       └── all/
│   │           ├── all.yml              # Non-sensitive defaults
│   │           ├── vault.yml            # Ansible Vault encrypted (sealed secrets key)
│   │           └── vault.yml.example    # Template showing expected structure
│   ├── playbooks/
│   │   └── bootstrap.yml               # Bootstrap: GitOps operator + sealed key + app-of-apps
│   └── requirements.yml
├── k8s/
│   ├── argocd/
│   │   └── app-of-apps.yaml            # Root ArgoCD Application
│   ├── apps/
│   │   ├── sealed-secrets.yaml         # ArgoCD App — wave 1
│   │   ├── developer-hub-operator.yaml # ArgoCD App — wave 2
│   │   └── developer-hub-instance.yaml # ArgoCD App — wave 3
│   └── developer-hub/
│       ├── operator/                   # Operator namespace + OG + subscription
│       └── instance/                   # Backstage CR + app-config + plugins + secrets
└── docs/
    └── bootstrap.md
```

---

## Security Rules — CRITICAL

**Never commit to git:**
- OpenShift credentials (username/password, kubeadmin tokens)
- SealedSecrets private keys (only the public key may be committed)
- Any `*.kubeconfig` or `kubeconfig` files
- Ansible vault passwords or plain-text vault files
- Any file matching patterns in `.gitignore`

**Credential handling pattern:**
- Cluster API URL, username, and password are passed at runtime via env vars or Ansible extra-vars
- Use `ansible-vault` for secrets that must live in the repo (encrypted blobs only)
- SealedSecrets private key is the **same key pair** used in devops-ai-agentic — stored in Ansible vault
- Sealed application secrets (GitHub token, backend secret, etc.) are committed as `SealedSecret` CRs

---

## Sealed Secrets Key

This project reuses the same Sealed Secrets TLS key pair as `devops-ai-agentic`.
The key is stored in `ansible/inventory/group_vars/all/vault.yml` (encrypted).

To seal a new secret:
```bash
# Get the public cert (from a running cluster or from vault.yml)
kubeseal --fetch-cert \
  --controller-name=sealed-secrets-controller \
  --controller-namespace=sealed-secrets \
  > /tmp/sealed-secrets.crt

# Seal a secret
kubectl create secret generic my-secret \
  --from-literal=key=value \
  --dry-run=client -o yaml | \
  kubeseal --cert /tmp/sealed-secrets.crt \
  --format yaml > k8s/developer-hub/instance/my-secret-sealed.yaml
```

---

## Key Tools & Versions

- Ansible + `kubernetes.core` collection
- `kubeseal` CLI (for SealedSecrets)
- `oc` CLI (OpenShift client)
- OpenShift 4.x (RHDP sandbox)
- Red Hat Developer Hub (RHDH) operator — channel `fast`
- OpenShift GitOps (ArgoCD) operator — default instance in `openshift-gitops` namespace
- Bitnami Sealed Secrets (deployed via ArgoCD Helm, external repo)

---

## Development Conventions

- Ansible bootstrap is minimal — only what ArgoCD cannot install itself
- Playbooks are idempotent — safe to re-run
- ArgoCD uses the App of Apps pattern: one root Application manages all child Applications
- Sync waves: 1=Sealed Secrets, 2=Operator, 3=Instance
- Secrets in the repo use SealedSecrets (encrypted with the shared key) or Ansible Vault
- Keep `ansible/` and `k8s/` concerns separate — Ansible bootstraps, ArgoCD owns ongoing state
