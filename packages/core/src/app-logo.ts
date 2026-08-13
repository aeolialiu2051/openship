export interface AppLogoConfig {
  slug?: string;
  src?: string;
  fill?: boolean;
  darkInvert?: boolean;
}

/** Brand-source exceptions shared by every surface that renders catalog apps. */
export const APP_LOGO_OVERRIDES: Readonly<Record<string, AppLogoConfig>> = {
  "3x-ui": { src: "https://avatars.githubusercontent.com/u/33454419?s=128&v=4" },
  convex: { src: "https://www.google.com/s2/favicons?domain=convex.dev&sz=128" },
  "cli-proxy-api": {
    src: "https://avatars.githubusercontent.com/u/233033915?s=128&v=4",
  },
  "stirling-pdf": {
    src: "https://avatars.githubusercontent.com/u/139791695?s=60&v=4",
  },
  // simpleicons removed the Slack + Microsoft Teams brand marks (both 404 on the
  // CDN now), so resolve their official colored favicons like convex above —
  // otherwise they fall back to a generic monochrome glyph.
  slack: { src: "https://www.google.com/s2/favicons?domain=slack.com&sz=128" },
  microsoftteams: { src: "https://www.google.com/s2/favicons?domain=teams.microsoft.com&sz=128" },
  // Supabase's official mark, rendered in its brand green by the simpleicons CDN.
  supabase: { slug: "supabase" },
  mongodb: { slug: "mongodb" },
  n8n: { slug: "n8n" },
  // Ghost's brand mark is near-black — invert it on the dark themes so it
  // stays visible (it's monochrome, so invert = clean white). Colored logos
  // are left alone.
  ghost: { slug: "ghost", darkInvert: true },
  "uptime-kuma": { slug: "uptimekuma" },
  vaultwarden: { slug: "vaultwarden" },
  metabase: { slug: "metabase" },
  directus: { slug: "directus" },
  nocodb: { slug: "nocodb" },
  // Grafana's mark stays colored; Gitea's tea-cup mark is fine as-is.
  grafana: { slug: "grafana" },
  gitea: { slug: "gitea" },
  minio: { slug: "minio" },
  freshrss: { slug: "freshrss" },
  excalidraw: { slug: "excalidraw" },
  qdrant: { slug: "qdrant" },
  // Kafka's catalog id is "kafka"; its simpleicons brand slug is "apachekafka".
  // The mark is near-black (brand color #231F20), so it vanishes on the dark/dim
  // tiles — darkInvert flips it to near-white there (dark on light themes as-is).
  kafka: { slug: "apachekafka", darkInvert: true },
  // Buzz (block/buzz) — vendored bee mark (its own favicon, OS-recolor stripped).
  // Monochrome near-black, so darkInvert flips it to light on the dark themes.
  buzz: { src: "https://avatars.githubusercontent.com/u/185116535?s=60&v=4" },
  // code-server / IT-Tools have no reliable simpleicons mark →
  // they fall back to the monochrome Boxes glyph.
  // vibrail-native mail stack — its own brand mark, a full-bleed square icon.
  // Both the catalog id ("mail") and the installed-app id ("mail-webmail").
  "mail-webmail": { src: "https://vibrail.com/apple-touch-icon.png", fill: true },
  mail: { src: "https://vibrail.com/apple-touch-icon.png", fill: true },
  // The control plane self-registered as an app (CLI self-deploy) — Vibrail's
  // own brand mark, a full-bleed square icon.
  vibrail: { src: "/apple-touch-icon.png", fill: true },
};

/** Resolve the same catalog-app logo on Dashboard, API, and public Web. */
export function resolveAppLogo(appId?: string | null, catalogLogo?: string | null): AppLogoConfig {
  const override = APP_LOGO_OVERRIDES[appId ?? ""] ?? APP_LOGO_OVERRIDES[catalogLogo ?? ""];
  if (override) return override;
  if (!catalogLogo) return {};
  if (/^(?:https?:)?\/\//i.test(catalogLogo) || catalogLogo.startsWith("/")) {
    return { src: catalogLogo };
  }
  return { slug: catalogLogo };
}

export function appLogoUrl(config: AppLogoConfig): string | undefined {
  return (
    config.src ??
    (config.slug ? `https://cdn.simpleicons.org/${encodeURIComponent(config.slug)}` : undefined)
  );
}
