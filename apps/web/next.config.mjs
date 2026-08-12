import path from "path";
import { fileURLToPath } from "url";
import { createMDX } from "fumadocs-mdx/next";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const withMDX = createMDX({ configPath: "./source.config.ts" });

// Before the hosted dashboard moved under /dashboard, external callbacks,
// invitation emails, bookmarks, and client-side history could point at these
// root paths. Keep them working at the marketing-site edge instead of serving a
// misleading 404. The destination deliberately stays relative so query strings
// (OAuth state, reset tokens, suspended site names, etc.) are preserved.
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
  destination: `/dashboard/${route}/:path*`,
  permanent: false,
}));

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
