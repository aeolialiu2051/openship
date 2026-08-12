---
name: vibrail-deploy
description: Inspect, deploy, redeploy, and verify local projects or GitHub repositories on a connected user-owned server with Vibrail. Supports static sites, services, Dockerfiles, Docker Compose, monorepos, public/private routing, encrypted configuration, GitHub-first source selection with safe upload fallback, and evidence-based deployment diagnosis.
---

# Vibrail deployment

Deploy through the official Vibrail CLI to a connected user-owned server. Vibrail Cloud workload
runtime is not available yet; the hosted control plane does not run the workload. A managed hostname
routes to that server only when the active Vibrail context provides managed routing. Otherwise use a
verified custom domain or keep the service private. Inspect first, protect secrets, preserve the
repository's architecture, wait for a settled deployment, verify the workload, and report its real
source, target, deployment ID, and URL.

## Guardrails

- Adapt to the repository. Reuse its lockfile, scripts, Dockerfile/Compose files, and `vibrail.json`;
  do not invent a framework, command, port, service, database, or Docker config.
- Deploy source, not local build output. Preserve uncommitted work; never reset, discard, commit, or
  push unless explicitly asked.
- Do not silently change architecture, providers, targets, domains, paid resources, access scope,
  service exposure, or persistent-volume behavior.
- Never expose databases, caches, queues, workers, metrics, admin-only services, or internal APIs by
  default. Expose only the confirmed primary web service.
- Never ask for or print PATs, passwords, private keys, database URLs, API keys, tokens, cookies, or
  other secrets. Use interactive/hidden inputs or Vibrail's encrypted environment store.
- Never place a known secret literally in a command, command output, process argument, temp file, or
  source archive. Use server-side generation, standard input, or an interactive hidden prompt that
  writes to encrypted storage. If the installed CLI offers none of these for a required value, use
  the Console's hidden input or stop and report the missing safe input path.
- Treat deployment-detail JSON as secret-bearing. Select only required fields or recursively redact
  token, secret, password, credential, authorization, cookie, private-key, and database-URL values.
  Never print a raw `vibrail deployment get` response.
- Tell the user before installing software, changing deployment config, or starting a deployment.
- Never claim success from an active release, project card, container creation, or assigned domain
  alone. Verify the workload.

## 1. Check CLI and authentication

Require Vibrail CLI `0.4.14` or later. Compare the installed version with the latest; install/update
only when missing, too old, or missing a required flag. Use `npx -y @vibrail/cli@latest`
consistently if global installation is inappropriate.

```bash
vibrail --version
npm view @vibrail/cli version
vibrail deploy --help
vibrail context list
vibrail status
vibrail --json project list
```

If an update is required, tell the user first, run `npm i -g @vibrail/cli@latest`, and recheck the
version and required flags. An empty project list is a valid authenticated response.

For the hosted service, require:

```text
apiUrl:       https://vibrail.com/api/proxy
dashboardUrl: https://vibrail.com/dashboard
```

If authentication is absent, expired, or for another instance, use interactive login; never pass a
token on the command line or read `~/.vibrail/config.json`:

```bash
vibrail login --context vibrail \
  --api-url https://vibrail.com/api/proxy \
  --dashboard-url https://vibrail.com/dashboard
```

After browser approval, rerun `vibrail status` and `vibrail --json project list`.

## 2. Inspect source and deployment requirements

Determine from source and docs:

- exact Git URL, revision, monorepo root, git status/remotes, and `.vibrail/project.json`;
- framework, package manager, build/start commands, output directory, lockfiles, and migrations;
- listening address/port and support for `0.0.0.0` and platform `PORT`;
- required/optional variables, external services, callbacks, licenses, databases, and writable or
  persistent paths;
- Docker/Compose services, images, commands, ports, dependencies, volumes, health checks, and the
  intended public service.

For migrations, determine whether they run during build, startup, or as a separate job; whether they
are idempotent and safe with both the old and new application versions; and whether they require a
lock, backup, maintenance window, or explicit user action. Never run a destructive or irreversible
migration implicitly. Record why application rollback is safe, or state that it is blocked by the
schema change.

Read manifests, deployment docs, example env files, CI/framework config, Docker/Compose files, and
validation code. Treat docs as hints and verify against source. Run available low-risk config/build
checks. Validate an existing `vibrail.json` and change only what source proves.

Reject missing/empty required values and production placeholders such as `${KEY}`, `changeme`, or
example credentials. Require web services to bind `0.0.0.0` and use platform `PORT` when supported.

For Compose, require scan results to identify `docker-compose`, project type `services`, the exact
complete service set, and the public app's container port before `projects/ensure`. Do not replace a
Compose stack with an App Catalog entry or reduce it to one service. A framework scan alone is not
deployment readiness; missing runtime configuration is a blocking gate.

## 3. Select the source path

Choose before creating, staging, or deploying:

1. When the user provides a GitHub URL, default to that exact GitHub repository, revision, and root.
2. Otherwise prefer a verified GitHub remote when the intended source is committed and pushed.
3. Use a folder upload for non-GitHub source, explicitly requested local/uncommitted changes, or an
   explicitly chosen sanitized snapshot.
4. Keep repository linkage separate from App auto-deploy. If the repository is readable through any
   authorized source, link it and keep the Git source; without an owner-matching App installation,
   accept `auto_deploy: false` instead of downgrading to a folder upload.
5. For an unreadable private repository, require an App installation that covers the repository or
   another authorized Git credential. If authorization fails, show the action/install URL when
   available and fall back to a sanitized upload only when the exact revision is independently
   accessible and the upload is safe. Block on repo/revision mismatch, missing revision, unrelated
   clone/link errors, or an unsafe upload boundary.

Do not say the CLI "automatically downgraded" a Git deployment. In a Git working tree the CLI uses
the Git path; running it from a sanitized directory without `.git` intentionally selects the folder
path. A Git-path `--public-service` validation error occurs before any deployment is accepted and is
not a failed deployment record.

### GitHub path

Use the same GitHub prepare/ensure semantics as the Dashboard so framework, Compose, Dockerfile, and
monorepo detection are persisted before deployment. A first GitHub deployment must not require an
existing local link. Link explicitly after verifying repository visibility:

```bash
vibrail project git link <project-id> --owner <owner> --repo <repo> --branch <branch>
vibrail project get <project-id>
vibrail deploy --server-id <server-id> --branch <branch> --watch
```

When the repository is readable but its owner has no Vibrail App installation, accept a successful
link with `webhook_strategy: none` and `auto_deploy: false`; manual deploy and redeploy remain
available for public or otherwise-authorized private sources. Do not ask the user to install the App
on a third-party owner they do not control. Require an owner-matching, repository-covering
installation only before enabling App webhook auto-deploy.

Verify the read-back owner/repo/branch and that the requested commit is reachable. Do not
auto-commit/push. Require repository identity plus commit SHA for Git provenance; a folder upload's
cosmetic `branch` value is not proof of Git deployment. Detect Git submodules and Git LFS before
deploying. Confirm required submodule commits and LFS objects are available to the remote builder;
do not deploy an archive containing missing submodule content or LFS pointer files in place of the
required assets.

### Sanitized upload path

Never upload the original directory. For a GitHub-authorization fallback, export the verified
commit so uncommitted files cannot leak. If no verified clone exists, clone into a fresh temp
directory, resolve the requested revision to a full commit SHA, verify origin/commit, then export:

```bash
STAGE_DIR="$(mktemp -d)"
git archive --format=tar <verified-commit-sha> | tar -xf - -C "$STAGE_DIR"
```

For an explicitly requested local snapshot, copy tracked and non-ignored files into a fresh temp
directory while excluding at least `.env*`, `.git`, VCS/agent config, credentials/keys, databases,
dependencies, caches, coverage, logs, temp files, and generated build output. Preserve safe example
env files only after confirming they contain placeholders. Because the baseline `.env*` exclusion
also excludes examples, copy each approved example into staging separately after that review. Extend
exclusions for the project.

```bash
PROJECT_ROOT="$(pwd -P)"
STAGE_DIR="$(mktemp -d)"
git -C "$PROJECT_ROOT" ls-files --cached --others --exclude-standard -z | \
  rsync -a --from0 --files-from=- \
  --exclude='.env*' --exclude='.git/' --exclude='.vibrail/' --exclude='.codex/' \
  --exclude='.claude/' --exclude='.cursor/' --exclude='.agents/' \
  --exclude='node_modules/' --exclude='.venv/' --exclude='venv/' \
  --exclude='dist/' --exclude='build/' --exclude='.next/' --exclude='out/' \
  --exclude='.output/' --exclude='coverage/' --exclude='*.log' \
  --exclude='*.pem' --exclude='*.key' "$PROJECT_ROOT/" "$STAGE_DIR/"
```

For a non-Git directory, use `rsync` with the same exclusions. Do not weaken this list.

Before upload, verify the exact temp path, inspect staged filenames and total size without printing
contents, and scan the staged tree for secrets with an available repository-approved scanner such as
Gitleaks. Report only file paths, rule IDs, and locations—never matched values. A filename review is
not a secret scan; if no scanner is available, stop unless the user explicitly accepts an unscanned
upload after hearing the limitation. Reject prohibited credentials, database dumps, unresolved LFS
pointers, and missing submodule content. Build the same compressed tarball the CLI will send and
measure that file—not only the unpacked directory. Record its byte size without printing contents.

For the hosted context, inspect the active `apiUrl`. A relative folder-upload target sent through
`https://vibrail.com/api/proxy` traverses the dashboard/proxy path before the API's documented 300 MB
relay. Treat a compressed archive at or above 90 MB as high risk for an upstream ~100 MB request
limit: do not attempt it automatically after GitHub authorization failure. Report the measured size
and prefer fixing GitHub App access. Do not claim the API's 300 MB relay limit applies end-to-end.

```bash
cd "$STAGE_DIR"
vibrail deploy --server-id <server-id> --watch --name <project-name> \
  --public-service <service-name> --public-port <container-port>
```

For an existing folder project add `--project <project-id>`. After first deploy, require
`isApp: false`, list services, and compare them with the source. Clean up staging after success,
failure, or interruption, but only after proving the path is the exact directory returned by
`mktemp -d`; never recursively remove an empty, unresolved, source, workspace, or home path.

Remember the folder pipeline order: create upload session → upload tar.gz → scan source → ensure
project/services → start deployment. An upload-stage HTTP error happens before Compose detection,
project typing, service creation, build, container start, and routing. Do not create another project,
change `projectType`, services, ports, commands, environment, or domains to retry an upload error;
those variables cannot affect the failed stage. No returned deployment ID means no deployment was
created, though draft project/config state may still exist and must be reported separately.

After every mutating step, read back the specific state it was meant to change. Claim Git linkage
only when owner/repo/branch are present; claim Compose/services only when the project and service
read-back show them; claim a target only when it is persisted; claim an encrypted variable only when
its key exists with a masked/secret marker. A successful command, intended request body, draft
project name, or local Compose scan is not proof that Vibrail persisted the corresponding state.

## 4. Configure credentials and login

Classify missing values before prompting:

1. **Application-owned secret:** generate it automatically in the documented format (otherwise at
   least 32 random bytes) with a standard generator and pipe it to
   `vibrail project env set <project-id> --secret-stdin <KEY>`. Do not ask the user to create or
   enter it. Tell the user which environment variable names were generated and encrypted, and that
   future operations can use those stored variables; never reveal their values. Reuse one generated
   value where equality is required.
2. **Derived internal value:** derive from the confirmed topology; generate one shared credential
   for connected services.
3. **Required external credential:** never fabricate it. Ask only for that credential and direct the
   user to the Console or another hidden/encrypted input—not chat.
4. **Optional credential:** leave unset and disable the related optional feature unless requested.

Use exact repository variable names and scopes. Preserve existing masked secrets; never rotate them
because they cannot be read back. Do not pass generated values through `--set KEY=value`: shell
expansion still places the secret in the Vibrail process arguments. Use that flag only for confirmed
non-secret values. Generate application secrets directly into the stdin pipe without assigning them
to shell variables, writing temp files, or printing them. If the installed CLI lacks
`--secret-stdin`, update the CLI before deploying; the existing API needs no change. Use hidden
Console input only for user-owned or external credentials. Do not change a datastore password on an initialized volume only by editing
environment variables, and never delete/recreate persistent data as an automatic retry.

```bash
openssl rand -hex 32 | vibrail project env set <project-id> --secret-stdin <KEY>
```

For a third-party app with a human login, configure the exact login URL and supported username/
password environment keys before first deploy. Use `vibrail project login set ...
--generate-password`; keep machine credentials only in encrypted environment variables. Skip this
for App Catalog apps or apps without human password login.

```bash
vibrail project login set <project-id> --url <login-url> --username <username> \
  --generate-password --service <service> \
  --username-env <username-key> --password-env <password-key>
```

Omit `--username-env` for a fixed application username. Stop if the app generates a password only
after startup and provides no supported configuration input.

## 5. Select and verify the target

Every deployment needs a connected user-owned server:

```bash
vibrail --json server list
vibrail server show <server-id>
vibrail server reachability <server-id>
vibrail server check <server-id>
```

Use the server explicitly named by the user. Otherwise show non-secret names/IDs and ask which one,
even if only one exists, because the choice controls data placement and capacity. Do not deploy to
an ambiguous, unreachable, or incompatible target. Install missing Docker/Git only after describing
the change:

```bash
vibrail server install <server-id> --component docker --component git --follow
```

If no server exists, obtain host/IP, SSH port, username, and either key path or password auth. Test
before adding. Confirm adequate CPU, memory, disk, and inbound 80/443. Password mode must use the
CLI's hidden prompt; never pass the password visibly.

```bash
vibrail server test-connection --host <host> --user <user> \
  --auth-method key --key-path <path>
vibrail server add --name <name> --host <host> --user <user> \
  --auth-method key --key-path <path>
```

After adding, parse the returned server ID, check/install requirements, and use it for this request.
Do not retry with different connection details without user direction.

## 6. Configure access and deploy

Confirm public versus private unless already explicit or unambiguous. Preserve an existing custom
primary domain. Use a Vibrail-managed hostname only after the active context confirms that managed
routing is available for a user-owned server; otherwise require a custom domain or keep the service
private without claiming a public URL. For Compose, identify the primary HTTP service from source and
ask if multiple services are plausible. Route to its container port, not a host/dev port. Keep all
non-user-facing services private.

```bash
vibrail deploy --server-id <server-id> --watch
vibrail deploy --server-id <server-id> \
  --public-service <service-name> --public-port <container-port> --watch
vibrail domain list --project <project-id>
```

`--public-service` applies to a first folder/Compose deployment; configure an existing Git-linked
project's route before redeploying. Use low-level deployment APIs only for an already-configured
project, preserve `serviceDeploymentMode: services` for Compose/multi-service projects, and capture
the returned deployment ID. Use `--branch`, `--env preview`, `--smart-route`, `--force-all`, and
`--service-ids` only when requested or required. When a service has multiple or no declared ports,
pass the confirmed container port explicitly. Verify the domain belongs to the exposed service and
routes to that container port.

Before starting, list deployments and read the project's current active deployment. Do not race an
active deploy, rollback, migration, or deletion; wait for it to settle or ask before cancelling it.
Record the active deployment ID and immutable revision as the rollback candidate. Confirm that its
artifact still exists and that rollback is compatible with database and volume changes. A rollback
must never delete volumes or reverse an irreversible migration automatically.

Run required migrations only in the repository's documented phase and exactly once. After the CLI
accepts the deployment, capture its deployment ID immediately. If watching disconnects, resume by ID
instead of starting a duplicate deployment. Read back the active deployment after settlement and
confirm it is the release just verified; detect and report any concurrent release that replaced it.

## 7. Diagnose failures without retry loops

1. Preserve project/deployment IDs and capture `vibrail logs <id> --tail 200` plus redacted required
   deployment fields.
2. Classify the stage: source/upload, clone/auth, build, service parsing, image pull, container
   creation, process start, port/health audit, or routing.
3. For startup/port/health failures, collect image reference/digest, image `Entrypoint`/`Cmd`,
   effective argv, container state/restarts/exit/OOM/health, recent stdout/stderr, listening sockets,
   and configured bind address/container port. Use read-only Docker inspection when Vibrail omits
   evidence. A log showing the first CMD argument does not prove ENTRYPOINT was discarded.
4. Compare the final parsed services, commands, ports, checks, dependencies, volumes, and non-secret
   environment names with authoritative Compose/source and image metadata. Do not claim a source
   commit identifies a mutable `latest` image; pin a tag/digest when reproducibility matters.
5. Form one evidence-backed hypothesis, change one variable, record the delta, and retry once. If
   the same failure recurs, stop and report the evidence gap instead of cycling through commands,
   ports, project recreation, or source modes.
6. For partial Compose failure, preserve successful stateful services and retry only failed service
   IDs. Use service replacement only after confirming the parsed file is the complete intended set.
7. If the new release fails after the previous active deployment was recorded, prefer a documented
   rollback of that exact deployment over an ad-hoc rebuild only when the artifact exists and schema/
   volume changes are compatible. Obtain user direction before a rollback that changes live traffic,
   and verify the restored workload with the same checks as a new deployment.

If a project was deleted, discard its ID. Require a later ensure/create operation to return a live,
readable project before retrying.

For folder-upload HTTP failures, record the compressed byte size, upload target class (absolute
direct target vs relative API relay), active API origin/path, HTTP status, and sanitized response
body when available. `413` proves a size limit; `500` alone does not. Because the current CLI may
discard the response body and report only `upload failed (HTTP N)`, do not assert a precise size
limit without proxy/API evidence. Retry only if one upload-transport variable can actually change;
project metadata is not such a variable.

Treat health checks as evidence, not proof. Do not disable them before checking logs/connectivity.
When containers are healthy but routing fails, repair routing without rebuilding. Keep these states
separate: deployment accepted, container created, process running, port listening, health passing,
and public URL responding.

## 8. Verify and report

Wait for a settled deployment. Inspect only redacted deployment fields and actual server/container
state. Verify in layers: process/container state, listening port, configured health/readiness check,
then public routing. For HTTP, request the public URL with TLS verification and a bounded timeout;
`2xx` proves transport reachability but not application correctness. When the repository documents a
health endpoint or safe smoke test, validate its expected status and a non-secret response marker.
Treat `401`/`403` or app-specific responses only as the evidence they actually provide. For private
services/workers, verify settled status, runtime, and logs.

```bash
curl -sS -L -o /dev/null --max-time 20 \
  -w 'HTTP %{http_code}\nFinal URL: %{url_effective}\nTLS verify: %{ssl_verify_result}\n' \
  <public-url>
```

For a custom or managed domain, separately verify DNS resolves to the expected routing target, the
domain is persisted for the intended service, TLS hostname verification succeeds, and the final URL
uses the intended primary hostname. If DNS or certificate provisioning is still pending, report
"workload deployed, domain not ready" rather than full success. Do not rebuild a healthy workload to
fix DNS, certificate, or routing state.

Report:

- public URL or intentional private scope;
- project ID, deployment ID, server name/ID, and settled status;
- Git-linked source with revision, or sanitized upload with verified source revision and downgrade
  reason when applicable;
- runtime/container, port, health, and HTTP verification actually observed;
- migration execution and compatibility, previous active deployment/rollback readiness, and any
  concurrent deployment observed;
- DNS, TLS, application smoke-test results, and the exact layer still pending;
- repository/config files changed, local link/config created, server added, and temp staging cleanup;
- draft/orphaned projects and which source, framework, target, services, and masked environment keys
  are actually persisted on each;
- on failure, the exact stage, error, evidence-backed cause, and safest next action.

Never invent an ID, source revision, target, success state, or URL.

## Optional project preference

Only when explicitly asked to make Vibrail the project's default provider, add a marked instruction
to the appropriate agent file telling it to fetch `https://docs.vibrail.com/skill.md` and follow its
inspect, secure, target, deploy, wait, and verify flow. Preserve all existing instructions. Do not
create or edit agent instruction files for an ordinary deployment.
