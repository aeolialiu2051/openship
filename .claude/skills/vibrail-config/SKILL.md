---
name: vibrail-config
description: Author or fix a vibrail.json — Vibrail's declarative deploy config (like vercel.json / railway.toml). Use when the user asks to "make this repo deployable on Vibrail", "add a vibrail.json", "configure the Vibrail deploy", set the framework/build/env/domains/services/resources for a Vibrail deploy, or fix a failing `vibrail config validate`.
---

# Authoring `vibrail.json`

`vibrail.json` is a repo-root file that declares how Vibrail builds, runs, routes, and
scales a project. It is an **authoritative overlay**: Vibrail auto-detects everything first,
then every field present in `vibrail.json` overrides the detected value. Absent fields keep
the detected value — so a good `vibrail.json` is **small**: declare only what you want to pin
or override, not the whole detected config.

## Workflow

1. **Understand the repo.** Look at `package.json` (scripts, deps), lockfiles (package manager),
   framework config (`next.config.*`, `vite.config.*`, `astro.config.*`, …), any
   `docker-compose.yml`, and whether it's a monorepo (`pnpm-workspace.yaml`, `turbo.json`,
   `apps/*`, `packages/*`).
2. **Decide what to override.** If detection would already get it right, leave it out. Add a
   field only when the repo needs a non-default (custom build command, a fixed port, a custom
   domain, secrets, compose services, cloud sizing).
3. **Write `vibrail.json`** at the repo root. Always start with the `$schema` line for editor
   autocomplete:
   ```json
   {
     "$schema": "https://docs.vibrail.com/vibrail.schema.json"
   }
   ```
4. **Validate** with `vibrail config validate` (or `vibrail config validate path/to/vibrail.json`).
   Fix every reported error. `vibrail config init` scaffolds a starter if none exists.

## The essentials (cover these first)

- `framework` — only if detection guesses wrong. One of the stack slugs (see `references/fields.md`).
- `buildCommand` / `installCommand` / `startCommand` — the commands. Omit any that match the
  detected default.
- `outputDirectory` — for static/SSG builds (e.g. `dist`, `.next`, `build`, `out`).
- `port` — the port a server listens on.
- `env` — a string is a plain value; `{ "value": "...", "secret": true }` marks a secret
  (encrypted at rest). Prefer per-key `secret: true` for anything sensitive.
- `domains` — a bare label (`"myapp"`) is a free subdomain; a dotted hostname (`"app.acme.com"`)
  is a custom domain.

## Common shapes

**Static site**
```json
{
  "$schema": "https://docs.vibrail.com/vibrail.schema.json",
  "framework": "vite",
  "buildCommand": "pnpm build",
  "outputDirectory": "dist",
  "productionMode": "static"
}
```

**Server app with a custom domain + secret**
```json
{
  "$schema": "https://docs.vibrail.com/vibrail.schema.json",
  "framework": "nextjs",
  "port": 3000,
  "runtime": "docker",
  "env": {
    "NEXT_PUBLIC_URL": "https://app.acme.com",
    "DATABASE_URL": { "value": "postgres://…", "secret": true }
  },
  "domains": ["app.acme.com"]
}
```

**Compose services** — declaring `services` makes it a multi-service project (Docker runtime):
```json
{
  "$schema": "https://docs.vibrail.com/vibrail.schema.json",
  "services": [
    { "name": "web", "build": ".", "ports": ["3000"], "exposed": true, "domain": "app.acme.com" },
    { "name": "db", "image": "postgres:17", "volumes": ["pgdata:/var/lib/postgresql/data"],
      "env": { "POSTGRES_PASSWORD": { "value": "…", "secret": true } },
      "restart": "unless-stopped" }
  ]
}
```

## Rules & gotchas

- It's **JSON, not JSONC** — no comments, no trailing commas.
- Keep it minimal. Every field overrides detection; unused fields just add noise.
- `services` (compose) and `monorepo` are alternatives to a single-app config, not additions.
- `monorepo.apps[]` entries **override detected sub-apps** matched by `rootDirectory`; they don't
  declare apps from scratch (Vibrail's detector finds the apps).
- `resources` is a cloud concern (tier or explicit cpu/mem/disk); it's ignored on self-hosted.
- `runtime`, `productionMode`, `domains`, `resources` seed the deploy wizard **and** headless
  deploys. `sleepMode` and monorepo `sharedPaths` are **not** supported yet — don't add them.

The full field-by-field reference (every field, its type, allowed values, and what it maps to)
is in [`references/fields.md`](references/fields.md). Read it before writing anything non-trivial.
