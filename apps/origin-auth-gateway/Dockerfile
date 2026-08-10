# Build from the repository root:
# docker build -f apps/origin-auth-gateway/Dockerfile -t vibrail-origin-gateway .
FROM oven/bun:1.3.14-alpine AS build
WORKDIR /src
COPY package.json bun.lock ./
COPY packages/core/package.json packages/core/package.json
COPY apps/origin-auth-gateway/package.json apps/origin-auth-gateway/package.json
RUN bun install --frozen-lockfile --filter @repo/origin-auth-gateway
COPY packages/core/src packages/core/src
COPY apps/origin-auth-gateway/src apps/origin-auth-gateway/src
RUN bun build apps/origin-auth-gateway/src/server.ts --target=bun --outfile=/out/server.js

FROM oven/bun:1.3.14-alpine
RUN addgroup -S vibrail && adduser -S -G vibrail vibrail
WORKDIR /app
COPY --from=build /out/server.js ./server.js
USER vibrail
EXPOSE 8443
CMD ["bun", "server.js"]
