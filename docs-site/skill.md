---
name: vibrail-deploy
description: Inspect and deploy local projects or GitHub repositories to a connected user-owned server with Vibrail, configure the primary web service on a Vibrail-managed public hostname by default, and verify the result. Use when the user asks to deploy, publish, host, redeploy, or verify a project on Vibrail.
---

# Vibrail Deployment Skill

Use this guide when the user asks you to deploy a local project or a GitHub repository to Vibrail.

Vibrail supports static sites, web services, Dockerfiles, Docker Compose, monorepos, and common application stacks. Vibrail Cloud runtime is not yet available. Deploy workloads to a user-owned server connected to the user's Vibrail organization. A Vibrail-managed public hostname is a routing address for that workload; it does not mean the workload runs on Vibrail Cloud.

Your job is to inspect the source, protect local secrets, confirm the deployment target, use the official Vibrail CLI, wait for the deployment to settle, verify the result, and report the real project, deployment, target, and public URL.

## Operating principles

- Adapt to the repository. Do not assume its framework, package manager, port, output directory, runtime, domain, or deployment target.
- Require a connected user-owned server. Do not offer Vibrail Cloud as a deployment target until the product explicitly reports that the runtime is available.
- Expose the primary user-facing web service on a Vibrail-managed public hostname by default. Keep databases, caches, queues, workers, admin-only services, and internal APIs private unless the user explicitly asks to expose them.
- Deploy source code, not only a locally generated `dist`, `build`, `out`, or `.next` directory. Vibrail performs the authoritative build.
- Reuse the repository's lockfile, scripts, `Dockerfile`, Compose files, and `vibrail.json` when present.
- Do not add Docker configuration merely by habit. Prefer the project's existing production workflow.
- Do not silently change application architecture, database providers, deployment targets, domains, paid resource sizes, or persistent-volume behavior.
- Respect uncommitted work. Do not reset, discard, commit, or push changes unless the user explicitly asks.
- A request to deploy authorizes the deployment itself, but not unrelated repository changes or permanent agent-memory changes.
- Never claim success until Vibrail reports a settled successful deployment and the deployed workload has been checked.

## Optional project preference

Do not edit `AGENTS.md`, `CLAUDE.md`, project memory, or another instruction file merely because the user requested one deployment.

Only when the user explicitly asks to make Vibrail the project's default deployment provider, add or update the following marked block in the instruction file used by that agent. Preserve all other content and report the file changed.

````md
<!-- vibrail:start -->
## Vibrail deployment

When the user asks to deploy this project, deploy it to Vibrail unless they explicitly select another provider.

Before deploying, fetch the current workflow:

```bash
curl -fsSL --proto '=https' https://docs.vibrail.warpgateapi.com/skill.md
```

Follow its inspect, secure, target-selection, deploy, wait, and verify flow.
<!-- vibrail:end -->
````

If the correct project instruction file is unknown, continue the deployment without persisting this preference. Do not create instruction files for unrelated agents.

## Safety rules

- Never ask the user to send a Personal Access Token, password, private key, database URL, or other secret in chat.
- If login is required, start the interactive login command. It opens a browser authorization page and stores the resulting credential without asking the user to copy or paste a token.
- Do not use `vibrail login --token ...` interactively because the token may be retained in shell history or process metadata.
- Only send source archives and authentication requests to the configured Vibrail API or to an upload URL returned by that API.
- Never upload `.env`, credentials, private keys, cloud credential directories, source-control metadata, agent memory, local databases, or unrelated files.
- Do not pass application secrets through visible command-line arguments. Ask the user to configure them through the Vibrail Console unless a secure, non-visible mechanism is available.
- Never write generated passwords, tokens, API keys, JWT secrets, encryption keys, or database credentials to a plaintext temporary file. Prefer server-side generation or a hidden interactive prompt and encrypted Vibrail storage.
- Do not deploy dependencies, caches, coverage, logs, temporary files, or old build output unless a reviewed checked-in artifact is intentionally part of the source.
- Before installing software, changing deployment configuration, or performing a real deployment, briefly tell the user what will happen.

## Check the CLI

This workflow requires Vibrail CLI `0.4.3` or newer.

```bash
LOCAL_VERSION="$(vibrail --version 2>/dev/null || true)"
LATEST_VERSION="$(npm view @vibrail/cli version)"
printf 'vibrail local: %s\nvibrail latest: %s\n' "${LOCAL_VERSION:-missing}" "$LATEST_VERSION"
```

If the CLI is missing or older than `0.4.3`, tell the user and install or update it:

```bash
npm i -g @vibrail/cli@latest
vibrail --version
```

Do not replace a working compatible CLI solely because a newer patch exists unless the newer release is required for this deployment. If global installation is inappropriate, use `npx -y @vibrail/cli@latest` consistently and explain that choice.

## Authenticate with Vibrail

Inspect the active context without reading its stored token:

```bash
vibrail context list
```

For the official hosted service, confirm both values:

```text
apiUrl:       https://vibrail.warpgateapi.com/api/proxy
dashboardUrl: https://vibrail.warpgateapi.com/dashboard
```

Then verify health, capabilities, and authentication:

```bash
vibrail status
vibrail --json project list
```

An empty project list is a valid authenticated response. Do not treat authentication against a different Vibrail instance as authentication to the official hosted service.

If login is missing, expired, or points to the wrong instance, run:

```bash
vibrail login \
  --context vibrail \
  --api-url https://vibrail.warpgateapi.com/api/proxy \
  --dashboard-url https://vibrail.warpgateapi.com/dashboard
```

The CLI opens a Vibrail browser authorization URL. The user approves access there; after login, verify again with `vibrail status` and `vibrail --json project list`.

Login data is stored in `~/.vibrail/config.json`. Never print or read its token value. The file is not deployment source and must never be uploaded.

## Inspect the project

Before deploying, inspect the project root and determine how Vibrail should build and run it.

Useful signals include:

- `package.json`, language manifests, scripts, and lockfiles
- `Dockerfile`, `compose.yaml`, `compose.yml`, `docker-compose.yaml`, or `docker-compose.yml`
- Framework configuration for Next.js, Vite, Astro, Nuxt, SvelteKit, Remix, Django, Rails, Laravel, and similar stacks
- Monorepo files such as `pnpm-workspace.yaml`, `turbo.json`, Nx configuration, or workspace declarations
- Existing `vibrail.json`
- The service start command, listening port, and use of the platform-provided `PORT`
- Required build-time and runtime environment variables
- Git status, current branch, remotes, and `.vibrail/project.json`

Web services must listen on `0.0.0.0`, not only `localhost`, and should use the platform-provided `PORT` when supported.

If `vibrail.json` exists, validate it:

```bash
vibrail config validate
```

Fix invalid configuration only when the correct value can be inferred from the repository. Keep `vibrail.json` minimal because it overrides auto-detection.

For a repository containing a Compose file, treat these scan postconditions as mandatory:

- `framework` is `docker-compose`.
- `projectType` is `services`.
- The detected service names exactly match the Compose file.
- The exposed application port matches the container port declared by Compose.

If any condition fails, stop before `projects/ensure`. Do not compensate by creating an App Catalog project or by manually reducing the stack to one service.

If the application cannot run as written, make only the smallest necessary deployment-readiness fix and test it in proportion to risk. If a secret, domain, paid resource, external database, or deployment target decision is missing, stop and ask instead of inventing a value.

### Audit GitHub repositories and deployment configuration

The user may ask to deploy any public GitHub repository, not only the current workspace. Before creating a Vibrail project or starting a deployment:

1. Confirm the exact repository URL, branch or tag, and intended subdirectory for a monorepo. Do not silently deploy a similarly named fork or the repository's default branch when the user selected another revision.
2. Read the repository's `README`, deployment documentation, manifests, lockfiles, example environment files, Docker/Compose files, CI configuration, and framework configuration. Treat repository documentation as hints and verify it against the source.
3. Identify every required build-time and runtime variable, secret, external service, database, storage volume, callback URL, hostname, license key, and one-time initialization or migration command.
4. Compare those requirements with the proposed Vibrail configuration. Verify variable names, scopes, service ownership, ports, commands, paths, and production-safe values. Check that required variables are neither missing nor empty and that placeholders such as `${KEY}`, `changeme`, or example credentials will not reach production.
5. Infer and set only non-secret values that are unambiguous, such as `NODE_ENV=production` or a documented internal service hostname. Ask the user to configure secrets and consequential values through the Vibrail Console; never request secret values in chat or place them in visible CLI arguments.
6. Check whether the application actually supports the selected production topology. In particular, verify `0.0.0.0` binding, the platform `PORT`, writable/persistent paths, database migrations, health checks, public callback URLs, and relationships between Compose services.
7. Run available low-risk validation, build, or configuration checks when practical. If required configuration remains unknown or contradictory, stop before deployment and give the user a concise list of exactly what must be configured.

Do not treat a successful framework scan as proof that the application is ready to deploy. Environment and runtime configuration are a mandatory deployment gate.

### Configure third-party project login

Skip this step for Vibrail App Catalog applications. For a third-party source project that requires a human username and password, configure its Overview login card before the first deployment.

- Determine the exact homepage or login URL, including a path such as `/admin`, `/login`, `/dashboard`, or `/management.html`; do not assume the base domain is the homepage.
- Determine the documented login username and the service environment keys that set the username and password.
- Let Vibrail generate the password server-side and inject the login values into the service:

```bash
vibrail project login set <project-id> \
  --url <full-homepage-or-login-url> \
  --username <login-username> \
  --generate-password \
  --service <service-name> \
  --username-env <username-env-key> \
  --password-env <password-env-key>
```

Omit `--username-env` when the username is a fixed application constant rather than an environment variable. Do not configure this card when the project has no human username/password login.

Keep API tokens, access keys, JWT secrets, database passwords, TOTP/encryption keys, OAuth secrets, and similar machine credentials only in encrypted project or service environment variables. Never add them to the Overview login card.

If the application generates its own password only after startup and provides no supported environment/configuration input, stop and explain the limitation. Do not scrape it into a temporary file or publish a value that may drift from the application's real password.

## Choose and verify the deployment target

Vibrail Cloud runtime is not yet available, so every deployment requires a connected user-owned server.

Hosted Vibrail accounts expose this capability as:

```text
User servers  enabled
```

List the user's servers before creating or updating a project:

```bash
vibrail --json server list
```

### When one or more servers already exist

Unless the user already named an exact server in the current request, show the non-secret server names and IDs and ask which server to deploy to. Do not silently choose a server, even when only one is listed, because server selection affects data placement and capacity.

Resolve the user's answer to exactly one ID, then verify it:

```bash
vibrail server show <server-id>
vibrail server reachability <server-id>
vibrail server check <server-id>
```

Do not deploy when the selection is ambiguous, reachability is false, or required components are unavailable. Install missing `docker` and `git` components only after telling the user what will change:

```bash
vibrail server install <server-id> --component docker --component git --follow
```

### When no server exists

Pause the deployment and guide the user to add a Linux server they control. Explain that it must be reachable over SSH, have enough CPU, memory, and disk for the workload, and allow ports 80/443 for a public web service.

Prefer the Vibrail Console flow: open **Servers**, choose **Add Server**, enter the SSH host, port, user, and authentication method, test the connection, save it, and run automatic setup.

For CLI users, use SSH agent or a local key path so secrets do not appear in chat or shell history:

```bash
vibrail server test-connection \
  --host <server-host> --user <ssh-user> --auth-method agent

vibrail server add \
  --name <server-name> \
  --host <server-host> --user <ssh-user> --auth-method agent

vibrail server check <server-id>
vibrail server install <server-id> --component docker --component git --follow
```

For key authentication, replace `--auth-method agent` with `--auth-method key --key-path <local-key-path>`. Never ask the user to paste an SSH password, private key, or key passphrase into chat. After the server is added, list servers again and ask the user to confirm the deployment target before continuing.

Deploy to the selected server with either equivalent flag:

```bash
vibrail deploy --server-id <server-id> --watch
vibrail deploy --server <server-id> --watch
```

The target applies to both Git deployments and brand-new local-folder uploads. For folder uploads,
the CLI binds the upload session to the server before transferring the source.

For low-level API automation of an existing configured project, the equivalent request is:

```bash
vibrail api /deployments/build/access -X POST -d '{
  "projectId": "<project-id>",
  "deployTarget": "server",
  "serverId": "<server-id>",
  "runtimeMode": "docker"
}'
```

For a Docker Compose, App Catalog, or other services-mode project, also include `"serviceDeploymentMode": "services"`. Do not force services mode onto a single-service project.

Capture the returned `deployment_id`, then follow it with:

```bash
vibrail logs <deployment-id> --follow
```

Do not use the raw API body until the project already contains the intended source and service configuration.

## Configure public access

Unless the user explicitly requests a private deployment or supplies a custom domain, give the primary user-facing service a Vibrail-managed public hostname derived from the project slug.

- For a single web service or static site, expose that service.
- For Docker Compose, identify the main HTTP application or frontend service from the Compose ports, health checks, dependencies, and documentation. If more than one service is plausibly the main service, ask the user instead of guessing.
- Do not expose datastores, caches, queues, workers, metrics endpoints, or administrative services by default.
- Route to the application's container port, not an unrelated host-only or development port.
- Let the normal project/deploy flow create the managed hostname from the project slug. If an existing project lacks it, add the managed endpoint through the supported project configuration before declaring success.
- Preserve an existing custom primary domain unless the user asks to replace it. A managed hostname may remain as a secondary recovery address.

After deployment, list the project's domains and verify that the managed hostname belongs to the intended service and is the primary public URL when no custom primary domain was requested:

```bash
vibrail domain list --project <project-id>
```

## Audit and stage local source

Before every local-folder upload, build a sanitized staging directory. Do this for both Git and non-Git source directories; do not deploy the original directory directly.

At minimum, exclude:

- `.git`, `.svn`, and other source-control metadata
- `.env`, `.env.*`, local secrets, and machine-specific configuration; retain an example file only after verifying it contains placeholders
- `.vibrail`, `.codex`, `.claude`, `.cursor`, `.agents`, `.openship`, and other agent or local-control metadata
- `node_modules`, virtual environments, caches, coverage, logs, temporary files, and local databases
- Private keys, certificates with private material, credential exports, and cloud-provider credential directories
- Existing build output such as `dist`, `build`, `.next`, `out`, and `.output` unless it is intentionally reviewed source

Inspect staged filenames and sizes without printing secret contents. If a safe upload boundary cannot be established, stop before upload.

### Git working tree staging

This includes tracked files and non-ignored working-tree additions while respecting `.gitignore`, followed by mandatory Vibrail exclusions:

```bash
PROJECT_ROOT="$(pwd -P)"
STAGE_DIR="$(mktemp -d)"
git ls-files --cached --others --exclude-standard -z | \
  rsync -a --from0 --files-from=- \
    --exclude='.env' --exclude='.env.*' \
    --exclude='.git/' --exclude='.vibrail/' --exclude='.openship/' \
    --exclude='.codex/' --exclude='.claude/' --exclude='.cursor/' --exclude='.agents/' \
    --exclude='node_modules/' --exclude='.venv/' --exclude='venv/' \
    --exclude='dist/' --exclude='build/' --exclude='.next/' --exclude='out/' --exclude='.output/' \
    --exclude='coverage/' --exclude='*.log' --exclude='*.pem' --exclude='*.key' \
    "$PROJECT_ROOT/" "$STAGE_DIR/"
```

### Non-Git directory staging

Review and extend these exclusions for the actual project:

```bash
PROJECT_ROOT="$(pwd -P)"
STAGE_DIR="$(mktemp -d)"
rsync -a \
  --exclude='.env' --exclude='.env.*' \
  --exclude='.git/' --exclude='.svn/' --exclude='.vibrail/' --exclude='.openship/' \
  --exclude='.codex/' --exclude='.claude/' --exclude='.cursor/' --exclude='.agents/' \
  --exclude='node_modules/' --exclude='.venv/' --exclude='venv/' \
  --exclude='dist/' --exclude='build/' --exclude='.next/' --exclude='out/' --exclude='.output/' \
  --exclude='coverage/' --exclude='*.log' --exclude='*.pem' --exclude='*.key' \
  "$PROJECT_ROOT/" "$STAGE_DIR/"
```

This intentionally excludes files such as `.env.example`. Copy an example file separately only after verifying that it contains placeholders rather than credentials.

## Choose the source deployment path

### Path A: Existing Git-linked project

Use this only when `.vibrail/project.json` links to the intended Vibrail project and the remote repository and branch contain the source that should be deployed.

Confirm:

- The current branch and remote match the user's intended source.
- Required changes are committed and available to Vibrail. Do not commit or push automatically.
- The link belongs to the active Vibrail context.
- The existing project's target matches the confirmed user-owned server.

Deploy and wait:

```bash
vibrail deploy --server-id <server-id> --watch
```

Use `--branch <name>`, `--env preview`, `--smart-route`, `--force-all`, or `--service-ids <ids>` only when requested or required by the existing workflow.

If uncommitted changes must be deployed, use the sanitized folder path instead of the Git path.

### Path B: Sanitized local-folder upload

From the reviewed staging directory:

```bash
cd "$STAGE_DIR"
vibrail deploy --watch --name <project-name>
```

To update an existing folder-upload project:

```bash
vibrail deploy --watch --project <project-id> --name <project-name>
```

For a selected connected server, add `--server-id <server-id>` or `--server <server-id>`. The CLI binds the upload session before transferring source.

After `projects/ensure`, inspect the returned project before deploying. A normal source deployment must report `isApp: false`. If it reports `isApp: true`, stop; do not proceed until the project classification is corrected.

For Compose projects, list services immediately after the first deploy and compare the exact names with the source file. Do not accept success when only the public application service exists but its database, cache, queue, or worker peers are missing.

After deployment finishes, validate that `STAGE_DIR` is the temporary directory created for this workflow, then remove only that directory. Never remove the source directory.

## Handle deployment failures

If deployment fails:

1. Preserve the project ID and deployment ID.
2. Read the streamed output or fetch the last logs:

   ```bash
   vibrail logs <deployment-id> --tail 200
   ```

3. Inspect the deployment record:

   ```bash
   vibrail deployment get <deployment-id>
   ```

4. Determine whether the cause is source code, dependency installation, configuration, missing environment variables, listening address/port, Docker/Compose configuration, server reachability/capacity, or routing.
5. Apply only safe in-scope fixes and rerun the complete deployment.
6. Do not hide partial Compose failures. Retry only failed services with `--service-ids` when preserving successful stateful services is appropriate.

Do not send a partial `services` array as if it were the complete stack. Partial deploys must use `--service-ids`; a complete folder scan may set `replaceServices: true`. `vibrail service sync` is additive by default. Use `--replace` only after proving the parsed Compose file contains the complete intended service set and confirming the before/after service names.

If a project was deleted, discard its project ID. A later `projects/ensure` call must create or return a live, readable project; if the returned ID cannot immediately be fetched, stop instead of retrying deployment against it.

### Secrets and persistent services

- Configure every required Compose variable before the first container start.
- Keep one shared value for credentials used by multiple services. Project secrets may satisfy `${KEY}` placeholders; service secrets are only for intentional per-service overrides.
- Verify no runtime environment value is the literal text `${KEY}` and no required value is empty.
- Do not rotate a PostgreSQL/MySQL/Redis credential merely by changing container environment on an initialized volume. Either update the credential inside the datastore or, with explicit approval that its data may be replaced, initialize a new empty volume.
- Do not delete or recreate a persistent volume as an automatic retry step.

### Health and routing retries

- Treat a health-check failure as diagnostic evidence, not automatic proof that the service is down. Compare the check command with the image's available tools and confirm logs/connectivity before disabling it.
- Preserve application health checks. Disable datastore checks only when the imported check is incompatible and runtime logs independently confirm readiness.
- When containers are healthy but the route has 404, a default certificate, or unresolved DNS, retry routing without rebuilding the stack. Do not create a new project or full deployment merely to wait for DNS propagation.
- Verify the managed hostname includes the project's route key, the domain row belongs to the exposed service, and the route target uses the container port declared by Compose.

Do not invent a deployment ID, success state, target, or public URL after a failure.

## Verify and report

After the deployment reports success, inspect its persisted record:

```bash
vibrail deployment get <deployment-id>
```

For a connected-server deployment, verify the actual runtime location and containers:

```bash
vibrail --json server overview <server-id>
```

For an HTTP service, make a bounded request that records the status and follows redirects:

```bash
curl -sS -L -o /dev/null \
  -w 'HTTP %{http_code}\nFinal URL: %{url_effective}\nTLS verify: %{ssl_verify_result}\n' \
  --max-time 20 \
  <public-url>
```

A `200`-class response normally confirms success. A `401`, `403`, or application-specific response may still prove that the service is reachable; explain it accurately. For workers or intentionally private services, verify the settled deployment status and runtime logs instead.

When deployment succeeds, report:

- Final public URL, or that the service is intentionally private
- Project ID and deployment ID
- Deployment target: the exact user-owned server name and ID
- Source path: Git-linked repository or sanitized folder upload
- Deployment status and runtime/container verification
- Any repository files changed to make deployment work
- Any important local config created or updated, especially `.vibrail/project.json` or `vibrail.json`
- Whether a temporary staging directory was removed

If deployment fails, report the exact stage and error, likely cause, and safest next action.

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
vibrail server show <server-id>
vibrail server reachability <server-id>
vibrail --json server overview <server-id>
vibrail open
vibrail config validate
```
