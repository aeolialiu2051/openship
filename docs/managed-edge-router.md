# Managed deployment edge router

Managed deployments use `{slug}-{8-char-base36}.vibrail.app`. Cloudflare KV is
the short-lived routing projection; the database remains authoritative.

## Request path

`*.vibrail.app` → Router Worker → `server-{routingId}.vibrail.app:8443` →
the server's single official `traefik:v3.6` container → application.

The server does not run a Vibrail-built edge image or a second authentication
gateway. Public/custom-domain HTTPS remains on Traefik's `:443` entrypoint.
Cloudflare origin traffic uses a separate `:8443` entrypoint on that same
container and requires a valid Cloudflare Authenticated Origin Pull certificate.

## Cloudflare bootstrap

1. Create KV namespace `vibrail-routing-production` and bind it as `ROUTING`.
2. Create proxied `*.vibrail.app` and deploy `apps/router-worker` on its route.
3. Let server provisioning create each proxied
   `server-{routingId}.vibrail.app` A record and exact Worker exclusion route.
4. In the `http_request_origin` phase, add an Origin Rule matching
   `server-*.vibrail.app` and override the destination port to `8443`.
5. After the upgraded Traefik has been provisioned on every server, enable
   zone-level Authenticated Origin Pulls for `vibrail.app`.

Do not enable step 5 before step 4 and the server rollout are complete. AOP is
an mTLS handshake: Cloudflare must present its client certificate and Traefik
must already trust the corresponding CA.

## Traefik lifecycle

Vibrail pulls the public `traefik:v3.6` image, creates only the `vibrail-edge`
container, and mounts its generated dynamic configuration read-only. The
configuration contains Cloudflare's public Origin Pull CA and a TLS option with
`RequireAndVerifyClientCert` for the `cloudflare-origin` entrypoint.

The two entrypoints intentionally serve different trust boundaries:

- `websecure` (`:443`): normal HTTPS for public and user-owned custom domains.
- `cloudflare-origin` (`:8443`): the same routers and services, but mTLS is
  mandatory and Cloudflare's client certificate is verified.

The configuration-version label causes Vibrail to replace older managed proxy
containers while preserving the named ACME volume. Existing user-managed
Traefik instances remain read-only and are never replaced.

## Rollout verification

1. Deploy the API containing the new edge configuration.
2. Reconcile or redeploy one canary server so its managed Traefik is recreated.
3. Confirm `:443` still serves a custom-domain route.
4. Confirm `:8443` rejects a client without the Cloudflare certificate.
5. Enable the Cloudflare Origin Rule, then AOP, and test a managed URL through
   the Worker before rolling the remaining servers.

Custom domains keep their existing verification, DNS, and certificate lifecycle.
