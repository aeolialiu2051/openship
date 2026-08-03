# @vibrail/cli

The official command-line interface for [Vibrail](https://github.com/aeolialiu2051/vibrail), an open-source, self-hostable deployment platform.

## Install

```bash
npm install --global @vibrail/cli
```

You can also run it without a permanent installation:

```bash
npx --yes @vibrail/cli@latest --help
```

Node.js 22 or newer is required. The Vibrail installer can set up Bun and the CLI for environments that do not already have Node.js:

```bash
curl -fsSL https://raw.githubusercontent.com/aeolialiu2051/vibrail/main/scripts/install.sh | sh
```

## Get started

Run the interactive setup and control panel:

```bash
vibrail
```

Or inspect the available commands:

```bash
vibrail --help
vibrail up --help
vibrail deploy --help
```

The npm package bundles the local Vibrail control-plane server. The dashboard is downloaded from the matching GitHub release when needed, while Docker-based installations use the published Vibrail images.

### Deploy an application

Sign in, link a directory to a project, and deploy it:

```bash
vibrail login
cd my-app
vibrail init
vibrail deploy --watch
```

Inside a Git repository, Vibrail deploys the current branch by default. In a non-Git directory, it uploads the folder and runs the same deployment pipeline. Use `vibrail config init` when you need a declarative `vibrail.json`; Vibrail otherwise auto-detects the application.

### Use multiple instances

Named contexts keep Vibrail Cloud, staging, and self-hosted credentials separate:

```bash
vibrail login --context production \
  --api-url https://ops.example.com/api/proxy \
  --dashboard-url https://ops.example.com
vibrail context list
vibrail context use production
```

### Automate with JSON

Place the global `--json` option before the command:

```bash
vibrail --json project list
vibrail --json deployment list --project <project-id>
vibrail api /projects
```

See the [complete CLI guide](https://github.com/aeolialiu2051/vibrail/blob/main/docs/cli.md) for authentication, contexts, deployment modes, self-hosted lifecycle management, infrastructure commands, CI usage, and troubleshooting.

## Links

- [Documentation](https://docs.vibrail.warpgateapi.com)
- [CLI guide](https://github.com/aeolialiu2051/vibrail/blob/main/docs/cli.md)
- [GitHub repository](https://github.com/aeolialiu2051/vibrail)
- [Issue tracker](https://github.com/aeolialiu2051/vibrail/issues)
- [Security policy](https://github.com/aeolialiu2051/vibrail/security/policy)

## License

Apache-2.0
