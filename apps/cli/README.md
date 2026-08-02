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

## Links

- [Documentation](https://vibrail.warpgateapi.com/docs)
- [GitHub repository](https://github.com/aeolialiu2051/vibrail)
- [Issue tracker](https://github.com/aeolialiu2051/vibrail/issues)
- [Security policy](https://github.com/aeolialiu2051/vibrail/security/policy)

## License

Apache-2.0
