# Managed deployment edge router

Managed deployments use `{label}-{8-char-project-key}.vibrail.app`. Cloudflare
KV is an eventually-consistent routing projection; PostgreSQL remains the
authority and the reconciliation job repairs drift.

## Request and trust path

`*.vibrail.app` → Router Worker →
`server-{routingId}.vibrail.app:443` → managed `vibrail-edge` Traefik → app.

Every managed-origin request must pass the `vibrail-origin-auth` middleware,
which verifies the Worker HMAC, timestamp, one-time nonce, server identity, and
the current on-server route manifest. The HMAC proves that the request was
created by this Vibrail router; internal `x-vibrail-*` headers are stripped
before the application receives it.

Managed-origin routers share Traefik's standard `websecure` entrypoint but match
only the reserved server hostname plus the intended managed-host header. A
direct request that forges that header still fails closed at the HMAC
middleware. Direct and custom domains retain their ordinary routers.

## Cloudflare bootstrap

1. Create the production routing KV namespace and put its ID in
   `apps/router-worker/wrangler.jsonc` (or the deployment-specific generated
   config). Bind it to the Worker as `ROUTING`.
2. Set `VIBRAIL_ROUTER_MASTER_SECRET` as the same 32+ character secret in the
   API and Worker secret stores. Never put it in `vars` or a workload env file.
3. Deploy `apps/router-worker` on the wildcard `*.vibrail.app/*` route.
4. Configure the API's Cloudflare token with Zone DNS, Worker Routes, and KV
   permissions. Server provisioning creates one proxied `server-{routingId}` A
   record and one exact no-script Worker exclusion. If exclusion creation
   fails, provisioning removes a new DNS
   record or restores the complete pre-existing record before returning the
   error.

The Worker uses standard HTTPS port 443. No zone-wide Origin Rule or
Authenticated Origin Pulls setting is required.

## Server lifecycle

Before creating or upgrading the edge, the API derives
`HMAC-SHA256(master, "v1:" + routingId)` and writes only that derived value to
`/etc/vibrail/edge/server-secret` with mode 0600. The master secret never leaves
the control plane.

For rotation, deploy the new master to the API first and reconcile/redeploy
servers. Before replacing each derived secret, the API retains its old value as
`previous-server-secret`, which the plugin also accepts. After all servers have
both generations, deploy the new master to the Worker. A later reconciliation
may retire the previous generation after the maximum request-skew window.

Vibrail pulls the version-matched `vibrail-edge` image. It is Traefik 3.6 plus
the local verification middleware. The container mounts the secret, route
manifest directory, Docker socket, and persistent ACME volume read-only where
applicable. Config version 10 replaces older managed edge containers, forces a
fresh image pull during replacement, and retains the ACME volume.

Managed Worker traffic and direct/custom-domain traffic enter through
`websecure` (`:443`) and are separated by exact router rules. Only managed
routers attach the mandatory HMAC middleware.

## Route publication and deletion

Publication order is fail-closed:

1. install the local authority manifest;
2. write the versioned KV projection;
3. wait until the Worker reports the same route version;
4. mark the database route active.

Disable removes local authority before changing KV, so a stale Worker cache can
only receive a 404. Final deletion writes a monotonic KV tombstone before
removing the route key, preventing delayed older jobs from resurrecting it.

## Release verification

Before rollout:

1. build and publish multi-architecture `vibrail-edge` with the same release tag
   as the API;
2. deploy the Worker and run its dry-run build/type checks;
3. redeploy one canary app and confirm a request to the reserved origin hostname
   with forged internal headers but no valid HMAC returns 403;
4. confirm a correctly signed managed URL succeeds through the Worker;
5. confirm direct-IP requests on 443 cannot bypass the managed HMAC middleware;
6. confirm a custom domain still works on 80/443;
7. run the route reconciliation sweep and verify no `ahead` or `failed` rows.
