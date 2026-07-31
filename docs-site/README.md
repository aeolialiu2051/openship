# Vibrail documentation site

Static documentation for [Vibrail](https://vibrail.warpgateapi.com), published at:

- https://docs.vibrail.warpgateapi.com/

The site intentionally has no build step. GitHub Pages serves the files in this directory directly.

## Local preview

```bash
python3 -m http.server 4173 --directory docs-site
```

Then open `http://127.0.0.1:4173`.

## Deployment

`.github/workflows/docs-site.yml` deploys this directory to GitHub Pages when the `vibrail` branch changes under `docs-site/**`, or when the workflow is run manually.

The custom domain is declared in `CNAME`. Configure the repository's Pages environment and DNS record before the first production deployment.
