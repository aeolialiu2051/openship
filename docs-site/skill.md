---
name: vibrail-deploy
description: Inspect and deploy local projects or GitHub repositories to a connected user-owned server with Vibrail, configure the primary web service on a Vibrail-managed public hostname by default, and verify the result. Use when the user asks to deploy, publish, host, redeploy, or verify a project on Vibrail.
---

# Vibrail Deployment Skill

Vibrail supports static sites, web services, Dockerfiles, Docker Compose, monorepos, and common application stacks. Vibrail Cloud runtime is not yet available, so every deployment goes to a user-owned server connected to the user's Vibrail organization. A Vibrail-managed public hostname is just a routing address for that workload — it does not imply Vibrail Cloud.

Your job: inspect the source, protect local secrets, confirm the deployment target, use the official Vibrail CLI, wait for the deployment to settle, verify the result, and report the real project, deployment, target, and public URL.

## Operating principles

- Adapt to the repository — don't assume framework, package manager, port, output directory, runtime, domain, or deployment target.
- Require a connected user-owned server. Don't offer Vibrail Cloud until the product explicitly reports that runtime is available.
- Expose the primary user-facing web service on a Vibrail-managed public hostname by default; keep databases, caches, queues, workers, admin-only services, and internal APIs private unless the user asks otherwise.
- Deploy source code, not a locally generated `dist`/`build`/`out`/`.next` directory — Vibrail performs the authoritative build.
- Reuse the repo's lockfile, scripts, `Dockerfile`, Compose files, and `vibrail.json` when present. Don't add Docker config out of habit.
- Don't silently change architecture, database providers, deployment targets, domains, paid resource sizes, or persistent-volume behavior.
- Respect uncommitted work — never reset/discard/commit/push unless explicitly asked.
- A request to deploy authorizes the deployment itself, not unrelated repo changes or permanent agent-memory changes.
- Never claim success until Vibrail reports a settled successful deployment and the workload has been checked.

## Optional project preference

Don't edit `AGENTS.md`, `CLAUDE.md`, or other instruction files just because the user requested one deployment. Only when the user explicitly asks to make Vibrail the project's default provider, add/update this marked block (preserve all other content, report the file changed):

````md
<!-- vibrail:start -->
## Vibrail deployment

When the user asks to deploy this project, deploy it to Vibrail unless they explicitly select another provider.

Before deploying, fetch the current workflow:

```bash
curl -fsSL --proto '=https' https://docs.vibrail.com/skill.md
```

Follow its inspect, secure, target-selection, deploy, wait, and verify flow.
<!-- vibrail:end -->
````

If the correct instruction file is unknown, continue without persisting this preference. Don't create instruction files for unrelated agents.

## Safety rules

- Never ask the user to send a Personal Access Token, password, private key, key passphrase, database URL, or other secret in chat — for login, server auth, or anything else. A local file **path** (e.g. `--key-path`) is fine; secret contents are not.
- If Vibrail login is required, use the interactive command — it opens a browser authorization page and stores the credential itself. Never use `vibrail login --token ...` interactively (risks shell-history leakage).
- If a server's `--auth-method` is `password`, let the CLI's interactive hidden prompt collect it — never pass `--password` as a visible argument or write it to a file.
- Only send source archives and auth requests to the configured Vibrail API or an upload URL it returns. Never upload `.env`, credentials, private keys, cloud credential directories, source-control metadata, agent memory, local databases, or unrelated files.
- Don't pass application secrets through visible CLI arguments — point the user to the Vibrail Console instead. Never write generated passwords/tokens/keys to a plaintext temp file; prefer server-side generation or a hidden prompt plus encrypted Vibrail storage.
- Don't deploy dependencies, caches, coverage, logs, temp files, or old build output unless it's an intentionally checked-in artifact.
- Before installing software, changing deployment config, or performing a real deployment, briefly tell the user what will happen.

## Check the CLI

Requires Vibrail CLI `0.4.11`+.

```bash
LOCAL_VERSION="$(vibrail --version 2>/dev/null || true)"
LATEST_VERSION="$(npm view @vibrail/cli version)"
printf 'vibrail local: %s\nvibrail latest: %s\n' "${LOCAL_VERSION:-missing}" "$LATEST_VERSION"
```

If missing or older than `0.4.11`, tell the user and install/update:

```bash
npm i -g @vibrail/cli@latest
vibrail --version
```

For a Compose deployment that the user wants public, also verify the installed CLI exposes the routing flag:

```bash
vibrail deploy --help | grep -- --public-service
```

If that flag is absent, update to the latest CLI before deploying; an older CLI cannot carry the confirmed public-service choice into the first Compose deployment. Don't upgrade a working compatible CLI just because a newer patch exists otherwise. If global install is inappropriate, use `npx -y @vibrail/cli@latest` consistently and say so.

## Authenticate with Vibrail

```bash
vibrail context list      # inspect active context, never read its stored token
```

For the official hosted service, confirm:

```text
apiUrl:       https://vibrail.com/api/proxy
dashboardUrl: https://vibrail.com/dashboard
```

Then verify:

```bash
vibrail status
vibrail --json project list   # an empty list is a valid authenticated response
```

Don't treat auth against a different Vibrail instance as auth to the official hosted service. If login is missing/expired/wrong-instance:

```bash
vibrail login \
  --context vibrail \
  --api-url https://vibrail.com/api/proxy \
  --dashboard-url https://vibrail.com/dashboard
```

The user approves in the browser; re-verify with `vibrail status` / `vibrail --json project list` after. Login data lives in `~/.vibrail/config.json` — never print/read its token, and never upload this file.

## Inspect the project

Determine how Vibrail should build and run it from: `package.json`/language manifests/scripts/lockfiles; `Dockerfile`/Compose files; framework config (Next.js, Vite, Astro, Nuxt, SvelteKit, Remix, Django, Rails, Laravel, etc.); monorepo files (`pnpm-workspace.yaml`, `turbo.json`, Nx, workspaces); existing `vibrail.json`; the start command, listening port, and use of platform-provided `PORT`; required env vars; git status/branch/remotes and `.vibrail/project.json`.

Web services must listen on `0.0.0.0` (not just `localhost`) and use the platform `PORT` when supported.

If `vibrail.json` exists, validate it (`vibrail config validate`) and fix only what can be correctly inferred from the repo — keep it minimal since it overrides auto-detection.

For a repo with a Compose file, these scan results are mandatory before `projects/ensure`: `framework` is `docker-compose`, `projectType` is `services`, detected service names exactly match the Compose file, and the exposed app port matches the Compose container port. If any fails, stop — don't compensate with an App Catalog project or by manually reducing the stack.

If the app can't run as written, make only the smallest necessary deployment-readiness fix, proportional to risk. If a secret, domain, paid resource, external database, or target decision is missing, stop and ask — don't invent a value.

### Audit GitHub repositories and deployment configuration

Before creating a project or starting a deployment for any (not just the current) repository:

1. Confirm the exact repo URL, branch/tag, and monorepo subdirectory. Don't silently deploy a similarly-named fork or the default branch when another revision was selected.
2. Read the README, deployment docs, manifests, lockfiles, example env files, Docker/Compose files, CI config, and framework config — treat docs as hints, verify against source.
3. Identify every required build/runtime variable, secret, external service, database, storage volume, callback URL, hostname, license key, and one-time init/migration command.
4. Compare against the proposed Vibrail config: variable names, scopes, service ownership, ports, commands, paths, production-safe values. Confirm nothing required is missing/empty and no placeholder (`${KEY}`, `changeme`, example creds) will reach production.
5. Infer only unambiguous non-secret values (e.g. `NODE_ENV=production`); route secrets and consequential values to the Vibrail Console — never in chat or visible CLI args.
6. Verify the app actually supports the chosen topology: `0.0.0.0` binding, platform `PORT`, writable/persistent paths, migrations, health checks, public callback URLs, Compose service relationships.
7. Run available low-risk validation/build/config checks. If required config is unknown or contradictory, stop and give the user a concise list of what's needed.

A successful framework scan is not proof the app is ready to deploy — environment/runtime config is a mandatory gate.

### Configure third-party project login

Skip this for Vibrail App Catalog applications. For a third-party source project that requires a human username/password, configure its Overview login card before the first deployment.

- Determine the exact homepage or login URL, including any path such as `/admin`, `/login`, `/dashboard`, or `/management.html` — don't assume the base domain is the homepage.
- Determine the documented login username and the service environment keys that set username/password.
- Let Vibrail generate the password server-side and inject it into the service:

```bash
vibrail project login set <project-id> \
  --url <full-homepage-or-login-url> \
  --username <login-username> \
  --generate-password \
  --service <service-name> \
  --username-env <username-env-key> \
  --password-env <password-env-key>
```

Omit `--username-env` when the username is a fixed application constant rather than an environment variable. Skip this card entirely when the project has no human username/password login.

Keep API tokens, access keys, JWT secrets, database passwords, TOTP/encryption keys, OAuth secrets, and similar machine credentials only in encrypted project/service environment variables — never on the Overview login card.

If the application generates its own password only after startup and provides no supported environment/configuration input, stop and explain the limitation. Do not scrape it into a temporary file or publish a value that may drift from the real password.

## Choose and verify the deployment target

Every deployment needs a connected user-owned server (hosted accounts show `User servers  enabled`).

```bash
vibrail --json server list
```

**If servers exist:** unless the user already named an exact one, show non-secret names/IDs and ask which to use — even with only one listed, since it affects data placement/capacity. Then verify:

```bash
vibrail server show <server-id>
vibrail server reachability <server-id>
vibrail server check <server-id>
```

Don't deploy if selection is ambiguous, reachability is false, or required components are missing. Install missing `docker`/`git` only after telling the user what will change:

```bash
vibrail server install <server-id> --component docker --component git --follow
```

**If no server exists:** pause and help the user add one they control. The CLI can add and provision a server end-to-end — offer it alongside the Console, don't treat Console as the only complete path.

First confirm: host/IP and SSH port (default 22), SSH username, and auth method (`key` + `--key-path <path>`, or `password` — these are the only two; there's no SSH-agent option), plus that the box has enough CPU/memory/disk and allows inbound 80/443.

```bash
# test first (swap --auth-method key --key-path <path> for password auth)
vibrail server test-connection --host <host> --user <user> --auth-method key --key-path <path>

# then add, with the same connection flags plus a name
vibrail server add --name <name> --host <host> --user <user> --auth-method key --key-path <path>
```

For password auth, drop `--key-path` and use `--auth-method password` on both commands — the CLI prompts interactively with hidden input.

On success the CLI prints `Added server <name> (<server-id>)` — parse the ID from that line, then confirm:

```bash
vibrail server show <server-id>
vibrail server check <server-id>
vibrail server install <server-id> --component docker --component git --follow
```

If `test-connection`/`add` fails, report the exact CLI error and stop — don't retry with a different host/user/auth without the user's explicit input, and never fall back to asking for a password in chat. Once added and checked, treat it as this request's target without a further "which server" prompt (the user just supplied it), but still show its name/ID back for confirmation before deploying.

Deploy to the chosen server:

```bash
vibrail deploy --server-id <server-id> --watch   # single-service/static
vibrail deploy --server-id <server-id> --public-service <service-name> --public-port <container-port> --watch  # first folder/Compose deploy with public URL
```

The server selection applies to both Git deployments and new local-folder uploads (the CLI binds the upload session to the server first). `--public-service` is specifically for the first folder/Compose flow; configure an existing Git-linked project's service route before redeploying it.

For low-level API automation of an already-configured project:

```bash
vibrail api /deployments/build/access -X POST -d '{
  "projectId": "<project-id>",
  "deployTarget": "server",
  "serverId": "<server-id>",
  "runtimeMode": "docker"
}'
```

Add `"serviceDeploymentMode": "services"` for Compose/App Catalog/multi-service projects — don't force it onto a single-service project. When the user confirmed managed public access, also send `"publicService": "<service-name>"` and optionally `"publicPort": "<container-port>"`; the backend rejects an unknown service or missing port instead of silently deploying it privately. Capture `deployment_id`, then `vibrail logs <deployment-id> --follow`. Don't use this raw API path until the project already has its source/service config.

## Configure public access

Before creating or updating a public hostname, confirm the access scope with the user unless they already stated it (e.g. "deploy it privately", "give it a public URL", "just for internal use") or the project type makes it unambiguous (e.g. a public-facing static site or marketing page). A short question is enough — for example: "This service — public URL, or private/internal only?" Don't skip this just because a public hostname is the default; the default only applies once the user has answered or the scope is already clear from context.

Once the scope is confirmed: unless the user wants a private deployment or supplies a custom domain, give the primary user-facing service a Vibrail-managed public hostname from the project slug.

- Single service/static site → expose that service.
- Compose → identify the main HTTP/frontend service from ports, health checks, dependencies, docs; ask the user if more than one is plausible.
- Never expose datastores, caches, queues, workers, metrics, or admin services by default.
- Route to the app's container port, not an unrelated host-only/dev port.
- For a first Compose folder deployment, pass `--public-service <service-name>` and, when the service has multiple/no declared ports, `--public-port <container-port>`. Confirmation in chat alone does not configure routing.
- Single-service/static deployments can use the normal project-level hostname default; add a route via project config if an existing project lacks one.
- Preserve an existing custom primary domain unless asked to replace it.

Verify after deploying:

```bash
vibrail domain list --project <project-id>
```

## Audit and stage local source

Before every local-folder upload, build a sanitized staging directory — never deploy the original directory directly.

```bash
PROJECT_ROOT="$(pwd -P)"
STAGE_DIR="$(mktemp -d)"
EXCLUDES=(--exclude='.env' --exclude='.env.*' --exclude='.git/' --exclude='.svn/' --exclude='.vibrail/' \
  --exclude='.codex/' --exclude='.claude/' --exclude='.cursor/' --exclude='.agents/' \
  --exclude='node_modules/' --exclude='.venv/' --exclude='venv/' \
  --exclude='dist/' --exclude='build/' --exclude='.next/' --exclude='out/' --exclude='.output/' \
  --exclude='coverage/' --exclude='*.log' --exclude='*.pem' --exclude='*.key')

if git -C "$PROJECT_ROOT" rev-parse --is-inside-work-tree >/dev/null 2>&1; then
  # tracked + non-ignored working-tree files, then apply the mandatory excludes on top
  git -C "$PROJECT_ROOT" ls-files --cached --others --exclude-standard -z | \
    rsync -a --from0 --files-from=- "${EXCLUDES[@]}" "$PROJECT_ROOT/" "$STAGE_DIR/"
else
  rsync -a "${EXCLUDES[@]}" "$PROJECT_ROOT/" "$STAGE_DIR/"
fi
```

Extend the exclude list for anything project-specific. This deliberately excludes `.env.example`-style files too — copy one over separately only after confirming it holds placeholders, not real credentials. Inspect staged filenames/sizes (never print secret contents); if a safe upload boundary can't be established, stop before upload.

## Choose the source deployment path

**Path A — existing Git-linked project.** Use only when `.vibrail/project.json` links the intended project and the remote/branch hold the source to deploy. Confirm branch/remote match intent, required changes are committed (don't auto-commit/push), the link belongs to the active context, and the project's target matches the confirmed server. Then:

```bash
vibrail deploy --server-id <server-id> --watch
```

Use `--branch`, `--env preview`, `--smart-route`, `--force-all`, or `--service-ids` only when requested or required. If uncommitted changes must ship, use Path B instead.

**Path B — sanitized local-folder upload.** From the staging dir:

```bash
cd "$STAGE_DIR"
vibrail deploy --watch --name <project-name> --public-service <service-name> --public-port <container-port>  # Compose + confirmed public access
# updating an existing folder-upload project:
vibrail deploy --watch --project <project-id> --name <project-name>
```

Add `--server-id <server-id>` (or `--server`) for the selected server.

After `projects/ensure`, a normal source deployment must report `isApp: false` — if `isApp: true`, stop until corrected. For Compose projects, list services right after the first deploy and compare exact names against the source file; don't accept success if peer services (db/cache/queue/worker) are missing alongside the public app.

After deployment finishes, confirm `STAGE_DIR` is the temp dir created here, then remove only that — never the source directory.

## Handle deployment failures

1. Preserve the project ID and deployment ID.
2. `vibrail logs <deployment-id> --tail 200` and `vibrail deployment get <deployment-id>`.
3. Identify the cause: source code, dependency install, config, missing env vars, listening address/port, Docker/Compose config, server reachability/capacity, or routing.
4. Apply only safe in-scope fixes and rerun the full deployment.
5. Don't hide partial Compose failures — retry only failed services with `--service-ids`, preserving successful stateful services where appropriate. A complete folder scan may set `replaceServices: true`; `vibrail service sync` is additive by default — use `--replace` only after confirming the parsed Compose file has the complete intended service set.

If a project was deleted, discard its ID — a later `projects/ensure` must create/return a live, readable project, or stop instead of retrying against it.

**Secrets & persistent services:** configure every required Compose variable before first start; use one shared value for credentials spanning services (service secrets are for intentional per-service overrides only); verify no runtime value is the literal `${KEY}` or empty; never rotate a Postgres/MySQL/Redis credential by just changing env on an initialized volume — update it inside the datastore, or get explicit approval to initialize a new empty volume; never delete/recreate a persistent volume as an automatic retry.

**Health & routing:** treat a health-check failure as diagnostic evidence, not proof — compare the check command with the image's available tools and confirm logs/connectivity first. Preserve app health checks; only disable a datastore check when it's genuinely incompatible and logs independently confirm readiness. If containers are healthy but routing shows 404/default-cert/unresolved DNS, retry routing without rebuilding — don't recreate the project just to wait out DNS. Verify the hostname includes the project's route key, the domain row belongs to the exposed service, and the route target matches the Compose container port.

Never invent a deployment ID, success state, target, or public URL after a failure.

## Verify and report

```bash
vibrail deployment get <deployment-id>
vibrail --json server overview <server-id>   # actual runtime location and containers
```

For an HTTP service:

```bash
curl -sS -L -o /dev/null \
  -w 'HTTP %{http_code}\nFinal URL: %{url_effective}\nTLS verify: %{ssl_verify_result}\n' \
  --max-time 20 <public-url>
```

A `200`-class response normally confirms success; `401`/`403`/app-specific responses can still prove reachability — describe accurately. For workers/private services, verify settled status and logs instead.

On success, report: final public URL (or that it's intentionally private); project ID and deployment ID; deployment target (server name + ID); source path (Git-linked vs. sanitized upload); deployment status and runtime/container verification; any repo files changed; any local config created/updated (`.vibrail/project.json`, `vibrail.json`); whether a new server was added this request (name + ID); whether the staging directory was removed.

On failure, report the exact stage, error, likely cause, and safest next action.

## Useful commands

```bash
vibrail --version
vibrail status
vibrail context list
vibrail --json project list
vibrail project get <project-id>
vibrail deployment list --project <project-id>
vibrail deployment get <deployment-id>
vibrail logs <deployment-id> --follow
vibrail --json server list
vibrail server test-connection --host <host> --user <user> --auth-method key --key-path <path>
vibrail server add --name <name> --host <host> --user <user> --auth-method key --key-path <path>
vibrail server show <server-id>
vibrail server reachability <server-id>
vibrail --json server overview <server-id>
vibrail open
vibrail config validate
```
