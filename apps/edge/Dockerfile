FROM golang:1.23-alpine AS verify
WORKDIR /plugin
COPY apps/edge/plugin/ ./
RUN go test ./...

FROM traefik:v3.6

# Traefik local plugins execute inside the Traefik process. This keeps origin
# authentication and reverse proxying in one process and one container.
COPY --from=verify /plugin /plugins-local/src/github.com/vibrail/vibrail-origin-auth
