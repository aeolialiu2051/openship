# ─── Build stage ────────────────────────────────────────
FROM oven/bun:latest AS builder
WORKDIR /app

COPY package.json bun.lock pnpm-workspace.yaml ./
COPY tsconfig.base.json ./
COPY packages/ ./packages/
COPY apps/ ./apps/

ENV NEXT_TELEMETRY_DISABLED=1
ARG VIBRAIL_SITE_DOMAIN
ARG VIBRAIL_APP_DOMAIN
ARG VIBRAIL_CLOUD_DASHBOARD_URL
ARG VIBRAIL_CLOUD_API_URL
ENV VIBRAIL_SITE_DOMAIN=${VIBRAIL_SITE_DOMAIN}
ENV VIBRAIL_APP_DOMAIN=${VIBRAIL_APP_DOMAIN}
ENV VIBRAIL_CLOUD_DASHBOARD_URL=${VIBRAIL_CLOUD_DASHBOARD_URL}
ENV VIBRAIL_CLOUD_API_URL=${VIBRAIL_CLOUD_API_URL}
RUN bun install && cd apps/web && bun run build

# ─── Production stage ──────────────────────────────────
FROM node:22-alpine AS runner
WORKDIR /app

COPY --from=builder /app/apps/web/.next/standalone ./
COPY --from=builder /app/apps/web/.next/static ./apps/web/.next/static
COPY --from=builder /app/apps/web/public ./apps/web/public

ENV NODE_ENV=production
EXPOSE 3000
CMD ["node", "apps/web/server.js"]
