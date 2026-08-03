# ─── Build stage ────────────────────────────────────────
# Pinned to .bun-version (1.3.3) — reproducible official images.
FROM oven/bun:1.3.3 AS builder
WORKDIR /app

COPY package.json bun.lock pnpm-workspace.yaml ./
COPY tsconfig.base.json ./
COPY packages/ ./packages/
COPY apps/ ./apps/

ENV NEXT_TELEMETRY_DISABLED=1
ARG NEXT_PUBLIC_DASHBOARD_BASE_PATH=""
ENV NEXT_PUBLIC_DASHBOARD_BASE_PATH=${NEXT_PUBLIC_DASHBOARD_BASE_PATH}
# Same-origin API proxy (browser → /api/proxy/* → INTERNAL_API_URL). Baked at
# build time (NEXT_PUBLIC_* is inlined) so the dashboard never calls a hardcoded
# API host — works behind any reverse proxy / on a remote host.
ENV NEXT_PUBLIC_API_PROXY=true
RUN bun install && cd apps/dashboard && bun run build

# ─── Production stage ──────────────────────────────────
FROM node:22-alpine AS runner
WORKDIR /app

ARG NEXT_PUBLIC_DASHBOARD_BASE_PATH=""
ENV NEXT_PUBLIC_DASHBOARD_BASE_PATH=${NEXT_PUBLIC_DASHBOARD_BASE_PATH}

COPY --from=builder /app/apps/dashboard/.next/standalone ./
COPY --from=builder /app/apps/dashboard/.next/static ./apps/dashboard/.next/static
COPY --from=builder /app/apps/dashboard/public ./apps/dashboard/public
COPY --from=builder /app/apps/dashboard/scripts/standalone-server.mjs ./apps/dashboard/standalone-server.mjs

ENV NODE_ENV=production
EXPOSE 3001
CMD ["node", "apps/dashboard/standalone-server.mjs"]
