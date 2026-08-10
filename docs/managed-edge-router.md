# Managed deployment edge router

Managed deployments use `{slug}-{8-char-base36}.vibrail.app`. The database is
authoritative; Cloudflare KV is a short-lived routing projection. Custom domains
retain the existing verification, DNS, and certificate flow.

## Request path

`*.vibrail.app` → Router Worker → KV `route:<hostname>` →
`server-{routingId}.vibrail.app` → authenticated `vibrail-edge` → app.

The Worker derives the origin hostname from validated `server_id`; KV never
contains an origin URL or secret. Managed projects create no DNS or certificates.

## Cloudflare bootstrap

1. Create KV namespace `vibrail-routing-production` and bind it as `ROUTING`.
2. Create the proxied `*.vibrail.app` entry required by the Worker custom domain.
3. Deploy `apps/router-worker`, set `VIBRAIL_ROUTER_MASTER_SECRET` with
   `wrangler secret put`, and bind `*.vibrail.app/*` to `vibrail-router`.
4. Give the API a separate minimum-permission token: KV read/write for this
   namespace plus DNS and Workers Routes edit for the `vibrail.app` zone. It
   does not need Worker script deployment or secret access.

Server provisioning creates one proxied A record and exact exclusion
`server-{routingId}.vibrail.app/*` with `script: null`. This exact pattern wins
over `*.vibrail.app/*`; do not use unsupported `server-*.vibrail.app` patterns.

## Configuration

```dotenv
VIBRAIL_SITE_DOMAIN=vibrail.com
VIBRAIL_MANAGED_DOMAIN=vibrail.app
VIBRAIL_CLOUDFLARE_ACCOUNT_ID=replace-me
VIBRAIL_CLOUDFLARE_ZONE_ID=replace-me
VIBRAIL_CLOUDFLARE_API_TOKEN=replace-me
VIBRAIL_ROUTING_KV_NAMESPACE_ID=replace-me
VIBRAIL_ROUTING_KV_API_TOKEN=replace-me
VIBRAIL_ROUTER_WORKER_NAME=vibrail-router
VIBRAIL_ROUTE_CACHE_TTL=30
VIBRAIL_ROUTE_NEGATIVE_CACHE_TTL=10
VIBRAIL_ORIGIN_TIMESTAMP_SKEW=60
```

Never supply Worker/Edge secrets to apps or KV.

## Single-container edge and firewall

Derive `serverSecret = HMAC-SHA256(masterSecret, "v1:" + routingId)` offline and
install only that server's current/previous derived secret. Public 443 terminates
at the single `vibrail-edge` container. Its in-process Traefik middleware verifies
the signature, timestamp, nonce and route authority before Traefik forwards the
request to the application. Application containers bind only to the private edge
network. Restrict 443 to Cloudflare's official IP ranges in production. Direct
IP/server-host traffic has no valid route header/signature and is rejected.

Build the Edge from the repository root:

```bash
docker build -f apps/edge/Dockerfile \
  -t registry.example/vibrail-edge:0.4.12 .
```

Install the secret files with mode `0600`. The runtime mounts them and the route
authority directory read-only into the Edge:

```bash
sudo install -d -m 0700 /etc/vibrail/edge /etc/vibrail/edge-routes
sudo install -m 0600 ./server-secret /etc/vibrail/edge/server-secret

docker run -d --name vibrail-edge --restart unless-stopped \
  --network host \
  -v /var/run/docker.sock:/var/run/docker.sock:ro \
  -v /etc/vibrail/edge:/etc/vibrail/edge:ro \
  -v /etc/vibrail/edge-routes:/etc/vibrail/edge-routes:ro \
  -v vibrail-edge-acme:/letsencrypt \
  registry.example/vibrail-edge:0.4.12
```

Never place the server secret in Compose YAML, Docker labels or shell history.
During rotation, install the old value as
`/etc/vibrail/edge/previous-server-secret`, replace `server-secret`, wait beyond
the timestamp/cache TTLs, then remove the previous file. Install the idempotent
firewall updater:

Traefik obtains one certificate for the exact `server-{routingId}.vibrail.app`
origin hostname. Managed application hostnames are selected by the signed
`x-vibrail-hostname` header, so platform wildcard private keys are never copied
to user servers. Use Cloudflare Full (strict) mode in production.

```bash
sudo install -m 0755 apps/edge/deploy/update-cloudflare-firewall.sh /usr/local/lib/vibrail/
sudo install -m 0644 apps/edge/deploy/vibrail-cloudflare-firewall.{service,timer} /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable --now vibrail-cloudflare-firewall.timer
sudo systemctl start vibrail-cloudflare-firewall.service
```

It validates Cloudflare's HTTPS lists, validates the nftables transaction, and
atomically owns only `table inet vibrail_cloudflare`. It restricts TCP 443 and
does not touch SSH or other firewall tables. Test from a second administrative
session before enabling it. The environment opt-in prevents accidental use in
development and test environments.

The API writes one authority document per hostname to
`/etc/vibrail/edge-routes/{lowercase-hostname}.json`. Ensure the API's remote
executor can create that directory while the Edge has read-only access.

## Lifecycle

- Deploy: health-check workload, ensure the single Edge, publish its authenticated
  route and authority manifest, publish KV, then mark active.
- Migrate: keep old workload, start/check new, increment version, update KV,
  wait longer than the 30-second cache TTL, then remove old. Rollback publishes
  a newer version pointing back; never reuse a lower version.
- Delete: remove Edge authority and publish `enabled:false`, wait for a full
  cache window, remove KV, then remove Traefik/workload and DB state.

Edge accepts current/previous keys. Deploy the pair, rotate Worker master,
wait beyond timestamp/cache TTLs, then remove the previous key.

The reconciler repairs missing, disabled, stale, and wrong-server projections.
It never overwrites a KV version higher than DB; investigate that alert.

## Legacy cutover and rollback

Only `domain_type='free'` rows are eligible; never rewrite custom/platform
hostnames. Dry-run and review collision output before apply. Where the old edge
is available, retain a 308 redirect and update OAuth, webhooks, CORS/CSP/CSRF,
cookies, WebSockets, and saved URLs. Otherwise schedule an explicit cutover.

For rollback, stop publication, restore the previous Worker route/script,
publish a higher version to the old server, wait one cache TTL, and then revert
application code. Leave additive DB columns in place.

Run the data migration before enabling the wildcard Worker. It also reports and
backfills deterministic routing IDs for legacy server rows. The default is a
read-only dry run:

```bash
bun run --cwd packages/db db:migrate-managed-domains
bun run --cwd packages/db db:migrate-managed-domains --apply
```

Archive the JSON report with the release. Re-running after apply is idempotent.
Migration 0087 performs the same server-ID backfill for normal schema upgrades;
the explicit command remains useful for reviewing hostname changes.

## Production order

1. Apply additive DB migrations and review the managed-domain dry-run report.
2. Create KV, wildcard DNS, Worker secret, and wildcard Worker route.
3. Deploy `vibrail-edge` to every server, derive and install its current secret,
   mount the authority directory, then enable the Cloudflare firewall timer.
4. Let server provisioning create each exact exclusion and proxied A record;
   verify unsigned requests return 403/404 before publishing routes.
5. Deploy API/reconciler, apply the managed-domain migration, then deploy
   Dashboard/CLI. Verify a canary through Worker → `vibrail-edge` → app.

Rollback is forward-only: stop new publications, install source authority,
publish a higher KV version pointing to the source, retain both workloads for
longer than the route TTL, then remove target authority/runtime. Do not roll
back migration 0087 or reuse an older KV version. Custom domains remain on the
existing verification/certificate lifecycle throughout.
