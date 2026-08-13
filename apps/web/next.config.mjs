import path from "path";
import { fileURLToPath } from "url";
import { createMDX } from "fumadocs-mdx/next";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const withMDX = createMDX({ configPath: "./source.config.ts" });

const configuredAppOrigin = process.env.VIBRAIL_CLOUD_DASHBOARD_URL || process.env.VIBRAIL_APP_DOMAIN;
if (!configuredAppOrigin && process.env.NODE_ENV === "production") {
  throw new Error(
    "VIBRAIL_CLOUD_DASHBOARD_URL or VIBRAIL_APP_DOMAIN is required for the production web build.",
  );
}
const APP_ORIGIN = configuredAppOrigin
  ? (/^[a-z][a-z\d+.-]*:\/\//i.test(configuredAppOrigin)
      ? configuredAppOrigin
      : `https://${configuredAppOrigin}`
    ).replace(/\/+$/, "")
  : "http://localhost:3002";

// Bookmarks and callbacks from the former shared-origin deployment stay valid.
// Next preserves the query string when applying these redirects.
const DASHBOARD_COMPAT_REDIRECTS = [
  "accept-invite",
  "admin",
  "apps",
  "audit",
  "authorize",
  "backups",
  "billing",
  "build",
  "cloud-authorize",
  "cloud-connect-callback",
  "deploy",
  "deployments",
  "domains",
  "emails",
  "forgot-password",
  "jobs",
  "library",
  "login",
  "mcp/authorize",
  "members",
  "monitoring",
  "onboarding",
  "projects",
  "register",
  "reset-password",
  "select-organization",
  "servers",
  "settings",
  "suspended",
  "verify-email",
  "auth/callback",
].map((route) => ({
  source: `/${route}/:path*`,
  destination: `${APP_ORIGIN}/${route}/:path*`,
  permanent: true,
}));

DASHBOARD_COMPAT_REDIRECTS.push(
  { source: "/dashboard", destination: APP_ORIGIN, permanent: true },
  { source: "/dashboard/:path*", destination: `${APP_ORIGIN}/:path*`, permanent: true },
);

/** @type {import('next').NextConfig} */
const nextConfig = {
  output: "standalone",
  experimental: {
    optimizePackageImports: ["lucide-react", "motion"],
  },
  // Monorepo: trace from the repo root so the standalone bundle includes the
  // root-hoisted node_modules + workspace packages. Without this, `output:
  // "standalone"` traces from apps/web and can ship an incomplete bundle that
  // fails at runtime with "cannot find module".
  outputFileTracingRoot: path.resolve(__dirname, "../.."),
  transpilePackages: ["@repo/ui", "@repo/core"],
  turbopack: {
    root: path.resolve(__dirname, "../.."),
    resolveAlias: {
      "@/.source/*": "./.source/*",
    },
  },
  async headers() {
    return [
      {
        source: "/:path*.:ext(ico|png|jpg|jpeg|gif|webp|avif|svg|woff|woff2|ttf)",
        headers: [
          {
            key: "Cache-Control",
            value: "public, max-age=86400, stale-while-revalidate=604800",
          },
        ],
      },
    ];
  },
  async redirects() {
    return DASHBOARD_COMPAT_REDIRECTS;
  },
};

export default withMDX(nextConfig);
