# Installing Vibrail

Vibrail runs in three shapes. Pick by **who uses it** and **whether it must be reachable when your machine is off**.

| Setup | Use when | How Vibrail runs |
|---|---|---|
| **Desktop app** | It's just you. Private. | Control plane runs **on your machine**, drives your server(s) over SSH. Nothing about Vibrail is exposed to the internet. |
| **Self-hosted on a server** | A team, always-on, remote access, CI / push-to-deploy | Control plane runs **on a Linux box** at a public URL, login required, invite-only. |
| **Vibrail Cloud** | Zero ops | Managed for you. |

---

## Solo / private → use the Desktop app (recommended)

For a single operator this is the best model: the control plane lives **locally** and manages your servers end-to-end over SSH. Vibrail itself has **no public app and no open port** — the only thing that ever goes public is an app *you* give a domain to. Smallest attack surface, nothing to secure.

**When this is the wrong choice:** the dashboard is only up while your machine is. No teammate access, no access from your phone, and push-to-deploy webhooks need a stable public endpoint your laptop isn't. If you need any of those, run Vibrail on a server (below).

**Install:**
- Download for your OS at [vibrail.warpgateapi.com](https://vibrail.warpgateapi.com), or run `vibrail install` (fetches the desktop build).
- On first launch, connect what you want to manage:
  - **This Machine** — manage the local box.
  - **Another Server** — add a remote server over SSH (host, user, key). Test Connection, then manage it.

---

## Team / always-on → install Vibrail on a server

Two ways to stand up the control plane on a Linux box. Point your domain's **DNS A record at the server first**.

### A) From the Desktop app

Add the server (SSH), then **install Vibrail onto it like any other app** — pick the server, install Vibrail, and it runs as an always-on app on that box with its own domain. Use this to promote from "local desktop control" to "always-on server" without touching a terminal.

### B) With the CLI (on the server)

Install the CLI, then just run **`vibrail`** — an interactive wizard walks you through it: it creates the **first admin**, attaches your domain, and installs Vibrail as a boot service. Run `vibrail` again later to manage the running instance.

```bash
curl -fsSL https://raw.githubusercontent.com/aeolialiu2051/vibrail/main/scripts/install.sh | sh      # install  (or: npm i -g @vibrail/cli)
vibrail                                     # interactive setup, then control panel
```

Prefer a one-shot, flag-driven setup for CI / headless boxes? Drive `vibrail up` directly instead of the wizard:

```bash
vibrail up --public-url https://ops.example.com
```

- `vibrail up` installs the same background service the wizard does (starts on boot, auto-restarts), driven entirely by flags.
- `--public-url <url>` makes the dashboard reachable at your domain. Login is required; everyone else joins by invite only.
- `--public-url` assumes you provide the public ingress for the control-plane dashboard. Bind with `--host` as needed and point your proxy at the dashboard port.
- One-off attached run instead of a service: `vibrail up --foreground`.

Once it's up, **Vibrail registers itself as an app** (dashboard → Apps → *Vibrail*): manage its domain, tail its logs, and see it *Live* like any other app.

---

## Docker

Self-host the pull-based stack — Postgres, Redis, API, dashboard, and the Traefik edge on :80/:443. It lives in `docker/docker-compose.yml` and pulls published images (no build). Run it from the repo root:

```bash
git clone https://github.com/aeolialiu2051/vibrail.git && cd vibrail
cp .env.example .env
docker compose --env-file .env -f docker/docker-compose.yml up -d
```

Linux only (the edge needs host networking); pin `VIBRAIL_VERSION` in `.env` for reproducible upgrades, and build from source instead with `-f docker/docker-compose.build.yml … up -d --build`.

> The repo-root `docker-compose.yml` is a different file — the SaaS / from-source control plane (builds from source, ships the marketing site, no edge or Docker socket). It does not self-host your apps.

---

## Users & access (self-hosted)

- **Public signup is disabled after the first account.** The first admin comes from the `vibrail` setup wizard; with `vibrail up --compose` (or raw Docker) you register the first account in the dashboard. Everyone after joins by invite.
- **Invite teammates** from **Settings → Team**. They get an accept link at your instance's URL (so the instance needs to be reachable — a public URL or your LAN).
- **Lost the admin password?** Run `vibrail reset-admin-password` on the box (no sign-in needed; uses the local internal token).

---

## CLI reference

### Run & manage the instance
| Command | Does |
|---|---|
| `vibrail up [--foreground]` | Start Vibrail as a service (boot + auto-restart); `--foreground` runs it attached |
| `vibrail up --public-url <url> [--host <address>]` | Serve the dashboard behind your public ingress |
| `vibrail stop` | Stop the service |
| `vibrail status [--json]` | Is it running? Resolved ports + API health |
| `vibrail open` | Open the dashboard in your browser |
| `vibrail update` | Update the CLI + bundled server to the latest release |
| `vibrail reset-admin-password` | Reset the local admin login on this machine (no sign-in) |
| `vibrail install` | Download the desktop app for this OS |
| `vibrail doctor` | Diagnose the CLI setup (config, context, runtime) |

### Deploy & inspect
| Command | Does |
|---|---|
| `vibrail init` | Link the current directory to a project (`.vibrail/project.json`) |
| `vibrail deploy` | Trigger a deployment for the current project |
| `vibrail logs <deploymentId> [-f] [--tail N]` | View or stream a deployment's logs (`-f` = live) |
| `vibrail deployment` | List / manage deployments |
| `vibrail project` | List / manage projects |
| `vibrail service` | Services within a stack |
| `vibrail domain` | A project's domains |

> Health + logs for the control plane itself: `vibrail status`, and `vibrail logs <vibrail-app-deployment-id>` streams the running instance's own logs (Vibrail is a real app — find its deployment id under Apps → Vibrail → Deployments).

### Infrastructure & admin
| Command | Does |
|---|---|
| `vibrail server` | Manage user-owned SSH servers when the instance enables them |
| `vibrail system` | Read / update instance settings |
| `vibrail mail` | Mail server setup |
| `vibrail backup` | Backup policies (schedules) for a project |

### Auth, config & automation
| Command | Does |
|---|---|
| `vibrail login` / `logout` | Authenticate in your browser (`--token` remains available for CI) |
| `vibrail context` | Manage contexts — which instance the CLI talks to |
| `vibrail token` | Manage personal access tokens |
| `vibrail api <method> <path>` | Authenticated request to any API route (like `gh api`) |

Add `--json` to most read commands for scripting.

---

## Quick decision

- **Just you, private** → Desktop app.
- **Team / always-on / public / CI** → `vibrail up --public-url https://… --host 0.0.0.0` behind your ingress.
- **No ops at all** → Vibrail Cloud.
