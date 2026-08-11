FROM golang:1.23-alpine AS verify
WORKDIR /plugin
COPY apps/edge/plugin/ ./
# `go test` accepts any legal package identifier, while Traefik's Yaegi plugin
# loader expects the import basename with '-' converted to '_'. Check both the
# Go behavior and that runtime-only naming contract during the image build.
RUN grep -q '^package vibrail_origin_auth$' origin_auth.go \
    && grep -q '^package vibrail_origin_auth$' origin_auth_test.go \
    && go test ./...

FROM traefik:v3.6
COPY --from=verify /plugin /plugins-local/src/github.com/vibrail/vibrail-origin-auth
