---
name: vibrail-deploy
description: Deploy source-code projects to Vibrail Cloud or inspect and deploy to a connected Vibrail user server. Use when the user asks to deploy, publish, host, redeploy, or verify a project on Vibrail.
---

# Vibrail Deployment Skill

Use this guide when the user asks you to deploy the current project to Vibrail.

Vibrail supports static sites, web services, Dockerfiles, Docker Compose, monorepos, and common application stacks. A deployment can run on Vibrail Cloud or, when the account enables user-owned servers, on a server connected to the user's Vibrail organization.

Your job is to inspect the source, protect local secrets, confirm the deployment target, use the official Vibrail CLI, wait for the deployment to settle, verify the result, and report the real project, deployment, target, and public URL.

## Operating principles

- Adapt to the repository. Do not assume its framework, package manager, port, output directory, runtime, domain, or deployment target.
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
dashboardUrl: https://vibrail.warpgateapi.com
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
  --dashboard-url https://vibrail.warpgateapi.com
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

If the application cannot run as written, make only the smallest necessary deployment-readiness fix and test it in proportion to risk. If a secret, domain, paid resource, external database, or deployment target decision is missing, stop and ask instead of inventing a value.

## Choose and verify the deployment target

Determine whether the user requested Vibrail Cloud or a connected user-owned server. If the target is ambiguous and choosing one would materially change cost, location, capacity, or data placement, ask before deploying.

### Vibrail Cloud

Confirm `vibrail status` reports a healthy Cloud context. Do not attach an unrelated `serverId` to a Cloud deployment.

### Connected user server

Hosted Vibrail accounts expose this capability as:

```text
User servers  enabled
```

List servers and resolve the requested name to exactly one ID:

```bash
vibrail --json server list
vibrail server show <server-id>
vibrail server reachability <server-id>
```

Do not deploy when the server name is ambiguous or reachability is false.

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
- The existing project's target matches the confirmed Cloud/server choice.

Deploy and wait:

```bash
vibrail deploy --watch
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

This path is currently suitable for Vibrail Cloud or for an existing project whose stored deployment target is already correct. Do not use it for a new selected-server deployment until the CLI supports target flags.

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
- Deployment target: Vibrail Cloud or the exact server name and ID
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
