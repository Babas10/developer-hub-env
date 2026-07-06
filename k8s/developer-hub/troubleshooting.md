# Developer Hub — Troubleshooting

## Login fails: "unable to resolve user identity"

The sign-in resolver looks up the authenticated user in the Backstage catalog. If the
Keycloak catalog sync has not run yet (or ran before users were created), there are no
User entities and login fails.

### Why this happens

The Keycloak org entity provider runs on a 30-minute schedule with a 30-second initial
delay. If the first sync fires before the post-install playbook has created users in
Keycloak, it commits 0 users. The next automatic sync is then 30 minutes away.

### Diagnostic steps

**1. Check if User entities exist in the catalog DB**

```bash
oc exec -n developer-hub backstage-psql-developer-hub-0 -- \
  psql -U postgres -d backstage_plugin_catalog -c \
  "SELECT entity_ref FROM refresh_state WHERE entity_ref LIKE 'user:%';"
```

Empty result → sync has not run or synced 0 users.

**2. Check the task scheduler state**

```bash
oc exec -n developer-hub backstage-psql-developer-hub-0 -- \
  psql -U postgres -d backstage_plugin_catalog -c \
  "SELECT id, next_run_start_at, current_run_started_at FROM backstage_backend_tasks__tasks WHERE id LIKE '%Keycloak%';"
```

- `current_run_started_at` populated → task is currently running
- `current_run_started_at` null, `next_run_start_at` far in the future → task already ran
  (possibly before users were created) and the next run is scheduled up to 30 min away

**3. Check RHDH logs for sync output**

```bash
oc logs -n developer-hub deployment/backstage-developer-hub | grep -i "KeycloakOrg\|Keycloak users"
```

A successful sync looks like:

```
Reading Keycloak users and groups
Prepared to ingest 3 users and 0 groups into the catalog from Keycloak
Committed 3 users and 0 groups in 0.0 seconds.
```

No output → sync never ran or errored silently.

**4. Force an immediate sync**

Instead of waiting up to 30 minutes, backdate the task in the DB so the scheduler picks
it up on its next check cycle (~a few seconds):

```bash
oc exec -n developer-hub backstage-psql-developer-hub-0 -- \
  psql -U postgres -d backstage_plugin_catalog -c \
  "UPDATE backstage_backend_tasks__tasks \
   SET next_run_start_at = NOW() - INTERVAL '1 second' \
   WHERE id = 'KeycloakOrgEntityProvider:default:refresh';"
```

Wait ~15 seconds, then re-run step 3 to confirm the sync completed. Login should work
immediately after the commit log appears.

### Prevention

Run the post-install playbook as soon as all ArgoCD waves are healthy, before the first
30-second sync window closes. If you miss the window, use step 4 to force an immediate
sync rather than waiting.
