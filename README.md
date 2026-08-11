<p align="center">
  <img src="docs-site/logo_vibrail.png" alt="Vibrail logo" width="112" />
</p>

<h1 align="center">Vibrail</h1>

<p align="center">
  Open-source deployment infrastructure with built-in CI/CD.<br>
  Connect a repository, choose where it runs, and let Vibrail build, deploy, route, and secure it.
</p>

<p align="center">
  <a href="https://www.npmjs.com/package/@vibrail/cli"><img src="https://img.shields.io/npm/v/%40vibrail%2Fcli?color=0b7285&label=npm" alt="npm version" /></a>
  <a href="https://github.com/aeolialiu2051/vibrail/stargazers"><img src="https://img.shields.io/github/stars/aeolialiu2051/vibrail?style=flat&color=0b7285" alt="GitHub stars" /></a>
  <a href="LICENSE"><img src="https://img.shields.io/badge/license-Apache--2.0-blue" alt="License" /></a>
  <a href="https://vibrail.com"><img src="https://img.shields.io/badge/website-vibrail.com-0b7285" alt="Website" /></a>
</p>

<p align="center">
  <a href="#quick-start">Quick Start</a> ·
  <a href="#architecture">Architecture</a> ·
  <a href="#deployment-pipeline">Deployment Pipeline</a> ·
  <a href="https://docs.vibrail.com/">Docs</a> ·
  <a href="CONTRIBUTING.md">Contributing</a>
</p>

<p align="center">
  <a href="README.md"><img src="https://img.shields.io/badge/lang-English-0b7285" alt="English" /></a>
  <a href="docs/i18n/README.ar.md"><img src="https://img.shields.io/badge/lang-العربية-555" alt="العربية" /></a>
  <a href="docs/i18n/README.zh.md"><img src="https://img.shields.io/badge/lang-简体中文-555" alt="简体中文" /></a>
  <a href="docs/i18n/README.es.md"><img src="https://img.shields.io/badge/lang-Español-555" alt="Español" /></a>
  <a href="docs/i18n/README.fr.md"><img src="https://img.shields.io/badge/lang-Français-555" alt="Français" /></a>
  <a href="docs/i18n/README.ja.md"><img src="https://img.shields.io/badge/lang-日本語-555" alt="日本語" /></a>
  <a href="docs/i18n/README.pt.md"><img src="https://img.shields.io/badge/lang-Português-555" alt="Português" /></a>
  <a href="docs/i18n/README.de.md"><img src="https://img.shields.io/badge/lang-Deutsch-555" alt="Deutsch" /></a>
  <a href="docs/i18n/README.tr.md"><img src="https://img.shields.io/badge/lang-Türkçe-555" alt="Türkçe" /></a>
</p>

<p align="center">
  <img src="docs/screenshots/screen.png" alt="Vibrail web dashboard" width="800" />
</p>

---

## Why Vibrail

Most deployment platforms couple their control plane, build system, runtime, and ingress. Vibrail separates them.

- **One control plane** manages projects, deployments, servers, domains, databases, backups, and access.
- **Pluggable runtimes** send workloads to Vibrail Cloud, a local Docker engine, or a remote Docker host.
- **Independent routing providers** handle public traffic and TLS without leaking infrastructure details into the deployment workflow.
- **Immutable deployment snapshots** preserve the exact source and resolved configuration used for redeploys and rollbacks.
- **Web dashboard, CLI, REST API, and MCP** expose the same platform capabilities for people, CI systems, and AI agents.

Your application remains a standard container. The destination can change without changing the way your team deploys it.

---

## Quick Start

The published CLI requires Node.js 22 or newer:

```bash
npm install --global @vibrail/cli
vibrail login

cd your-project
vibrail init
vibrail deploy --watch
```

Inside a Git repository, Vibrail deploys the current branch by default. Outside Git, it uploads the current folder and runs the same pipeline. Use `vibrail context` to switch between managed and self-hosted instances.

### Self-host on Linux

Install the CLI on a Linux server, then start the guided setup:

```bash
curl -fsSL https://raw.githubusercontent.com/aeolialiu2051/vibrail/main/scripts/install.sh | sh
vibrail
```

For a headless or automated installation:

```bash
vibrail up --public-url https://ops.example.com
```

On Linux with Docker, `vibrail up` starts the published Compose stack: PostgreSQL, Redis, API, web dashboard, and the deployment edge. The service starts on boot and restarts after failure.

See the **[CLI guide](docs/cli.md)** and **[self-hosting guide](docs/installation.md)** for contexts, authentication, Docker Compose, upgrades, and troubleshooting.

<details>
<summary>Run the published Docker Compose stack directly</summary>

```bash
git clone https://github.com/aeolialiu2051/vibrail.git
cd vibrail
cp .env.example .env
docker compose --env-file .env -f docker/docker-compose.yml up -d
```

The API mounts the host Docker socket to build and operate application containers. This grants host-level control; run the stack only on a trusted server. Pin `VIBRAIL_VERSION` in `.env` for reproducible upgrades.

The repository-root `docker-compose.yml` is the SaaS/from-source control plane. For self-hosting, use `docker/docker-compose.yml` or `vibrail up`.

</details>

---

## Architecture

Vibrail is organized around a control plane and interchangeable infrastructure adapters:

```text
         ┌─────────────────────────────────────────────┐
         │  Web Dashboard · CLI · REST API · MCP       │
         └──────────────────────┬──────────────────────┘
                                │
                                ▼
         ┌─────────────────────────────────────────────┐
         │            Vibrail Control Plane            │
         │       projects · auth · deploys · state     │
         └──────────────────────┬──────────────────────┘
                                │
                  ┌─────────────┴────────────────┐
                  │                              │
                  ▼                              ▼
        ┌───────────────────┐          ┌───────────────────┐
        │  Runtime Adapter  │          │  Routing Adapter  │
        └─────────┬─────────┘          └─────────┬─────────┘
                  │                              │
            ┌─────┴─────┐                  ┌─────┴─────┐
            │           │                  │           │
            ▼           ▼                  ▼           ▼
      ┌───────────┐ ┌──────────┐ ┌──────────────┐ ┌────────────────┐
      │ Cloud API │ │  Docker  │ │ Managed Edge │ │ Traefik + ACME │
      └─────┬─────┘ └────┬─────┘ └──────┬───────┘ └───────┬────────┘
            │            │              │                 │
            └────────────┴──────┬───────┴─────────────────┘
                                │
                                ▼
              ┌───────────────────────────────┐
              │     Application Workloads     │
              └───────────────────────────────┘
```

### Control plane

The API is the source of truth for desired state and deployment history. PostgreSQL stores durable state; Redis backs queues, caching, and rate limiting. The web dashboard and CLI both operate through the same API.

### Runtime layer

The runtime adapter owns the build/deploy/stop lifecycle:

- **Managed runtime** uses API calls to provision isolated cloud workspaces. No infrastructure commands execute in the control-plane process.
- **Docker runtime** talks to a local or remote Docker daemon and keeps workloads portable as standard images and containers.

This boundary keeps project and deployment logic independent from the machine that ultimately runs the workload.

### Routing layer

Routing and TLS are applied only after an application is healthy:

- Managed deployments flow through the Vibrail edge router to the correct origin.
- Self-hosted deployments use Traefik routes and Let's Encrypt certificates.
- Custom domains and platform-provided domains share the same deployment model.

Routing failures are surfaced as actionable infrastructure state instead of invalidating an otherwise healthy build.

### Trust boundary

For managed routes, PostgreSQL remains authoritative while edge KV is a reconciled projection. Requests from the edge to an origin are authenticated with per-server derived secrets, timestamps, and one-time nonces. Stale or forged routes fail closed.

For self-hosting, the Docker socket is deliberately treated as privileged infrastructure access and is never exposed directly to application workloads.

For the deeper implementation model, see [adapter architecture](packages/adapters/docs/ARCHITECTURE.md) and [managed edge routing](docs/managed-edge-router.md).

---

## Deployment Pipeline

Every source type follows the same lifecycle:

1. **Detect** — inspect framework files, lockfiles, Dockerfiles, Compose files, and `vibrail.json`.
2. **Resolve** — freeze build commands, start commands, ports, resources, environment, and source revision into a deployment snapshot.
3. **Build** — use the project's Dockerfile or generate one automatically.
4. **Run** — start the workload on the selected runtime and verify its health.
5. **Route** — publish the domain and provision TLS only after the workload is ready.
6. **Observe** — stream build logs, runtime logs, deployment events, and server metrics to the dashboard and CLI.

GitHub webhooks can repeat the pipeline on every push. In monorepos, Vibrail can limit builds to affected services. Redeploys and rollbacks reuse the frozen snapshot so the platform does not silently reinterpret an older release.

---

## Features

| Capability | What it provides |
|---|---|
| **Built-in CI/CD** | Push-to-deploy, deployment history, previews, and rollbacks |
| **Automatic detection** | Node.js, Python, Go, Rust, PHP, Ruby, Java, .NET, Docker, and monorepos |
| **Declarative overrides** | Optional `vibrail.json` with the same validation used by the deployment pipeline |
| **Domains and TLS** | Managed domains, custom domains, Let's Encrypt, verification, and renewal |
| **Data services** | Databases, Redis, persistent volumes, scheduled backups, and restore workflows |
| **Observability** | Live build logs, container logs, deployment events, and multi-server monitoring |
| **Compose support** | Deploy existing Docker Compose applications without redesigning the stack |
| **Automation** | Scriptable CLI, machine-readable JSON, REST API, and permission-aware MCP tools |
| **Portability** | Standard Docker images and containers across managed and self-hosted targets |

---

## Interfaces

- **Web dashboard** — the primary visual interface for projects, infrastructure, logs, and team access.
- **CLI** — deploy from a repository, manage instances, inspect resources, and automate CI workflows.
- **REST API and MCP** — integrate external systems and AI agents. MCP tools are explicitly opted in and re-check authorization on every call.

Full documentation is available at [docs.vibrail.com](https://docs.vibrail.com/).

---

## Repository Layout

```text
apps/
├── api/             Control plane and deployment orchestration
├── dashboard/       Web management interface
├── router-worker/   Managed edge request router
├── cli/             Deployment and instance-management CLI
├── email/           Self-hosted mail stack
└── web/             Product and documentation website

packages/
├── adapters/        Runtime, routing, SSL, executor, and system abstractions
├── core/            Shared domain logic and contracts
├── db/              Control-plane persistence
└── ui/              Shared interface components

docker/              Published self-hosting stack
docs/                Architecture, installation, and operations guides
```

---

## Project Status

Vibrail's core deployment workflow is available and actively developed. Self-hosting is free and does not require a billing integration.

The roadmap includes multi-node scheduling, richer load-balancing controls, private networking, advanced monitoring, and visual CI/CD pipelines.

---

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md) for development and contribution guidelines.

---

## Releasing

The release script synchronizes package versions, commits the version bump, creates a `vX.Y.Z` tag, and pushes it:

```bash
bun scripts/release.ts 0.5.0
# or: bun scripts/release.ts patch | minor | major | rc
```

Version tags publish `@vibrail/cli`, server artifacts, and a GitHub Release. Official Docker images (`vibrail-api`, `vibrail-dashboard`, and `vibrail-edge`) are published to GitHub Container Registry by [the Docker image workflow](.github/workflows/docker-images.yml).

Add critical or recommended update notices to [release-advisories.json](release-advisories.json) before tagging. High-level release notes live in [CHANGELOG.md](CHANGELOG.md).

---

## Security

Please report vulnerabilities privately through [GitHub Security Advisories](https://github.com/aeolialiu2051/vibrail/security/advisories/new), never in a public issue or discussion.

See [SECURITY.md](SECURITY.md) for scope, reporting guidance, the disclosure process, and the safe-harbor policy.

---

## Star History

<a href="https://www.star-history.com/?repos=aeolialiu2051%2Fvibrail&type=date&legend=top-left">
 <picture>
   <source media="(prefers-color-scheme: dark)" srcset="https://api.star-history.com/chart?repos=aeolialiu2051/vibrail&type=date&theme=dark&legend=top-left&sealed_token=Jz1jVpiW8qH_rK8bKmYj3iykZ4rwWAVIuHXpkdu18gKf7-Pdj03p10ZSfCMXMVG4V3pD2U-vRqWaWIjta_VwO8MDfnjE_XBW-ytsnVF8qGMxxbQW2LhUT8sqxvkZ-q2anlgRYVR4Q_eRz4YwcOXxtGTOvcVP0dP9nDl9qZkotu0yILQoHDnFFlro_Wwo" />
   <source media="(prefers-color-scheme: light)" srcset="https://api.star-history.com/chart?repos=aeolialiu2051/vibrail&type=date&legend=top-left&sealed_token=Jz1jVpiW8qH_rK8bKmYj3iykZ4rwWAVIuHXpkdu18gKf7-Pdj03p10ZSfCMXMVG4V3pD2U-vRqWaWIjta_VwO8MDfnjE_XBW-ytsnVF8qGMxxbQW2LhUT8sqxvkZ-q2anlgRYVR4Q_eRz4YwcOXxtGTOvcVP0dP9nDl9qZkotu0yILQoHDnFFlro_Wwo" />
   <img alt="Star History Chart" src="https://api.star-history.com/chart?repos=aeolialiu2051/vibrail&type=date&legend=top-left&sealed_token=Jz1jVpiW8qH_rK8bKmYj3iykZ4rwWAVIuHXpkdu18gKf7-Pdj03p10ZSfCMXMVG4V3pD2U-vRqWaWIjta_VwO8MDfnjE_XBW-ytsnVF8qGMxxbQW2LhUT8sqxvkZ-q2anlgRYVR4Q_eRz4YwcOXxtGTOvcVP0dP9nDl9qZkotu0yILQoHDnFFlro_Wwo" />
 </picture>
</a>

---

## Acknowledgements

Vibrail is based on [OpenShip](https://github.com/oblien/openship). We are grateful to its authors and contributors for making their work open source.

---

## License

Vibrail is licensed under the [Apache License 2.0](LICENSE). You may use, modify, self-host, and distribute it—including in commercial and closed-source products—under the terms of the license.
