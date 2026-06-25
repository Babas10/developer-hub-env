# developer-hub-env

Red Hat Developer Hub deployed on OpenShift via GitOps.

Ansible bootstraps OpenShift GitOps (ArgoCD), then ArgoCD manages everything else:
Sealed Secrets → Developer Hub Operator → Developer Hub instance + plugins.

## Bootstrap

```bash
export OCP_API=https://api.ocp.<id>.sandbox<n>.opentlc.com:6443
export OCP_USER=admin
export OCP_PASS=<password>

ansible-playbook ansible/playbooks/bootstrap.yml \
  --ask-vault-pass \
  -e ocp_api_url=$OCP_API \
  -e ocp_username=$OCP_USER \
  -e ocp_password=$OCP_PASS
```

See `docs/bootstrap.md` for full details.
