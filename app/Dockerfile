# Continuum custody backend — single deployable: builds the SPA and serves it + the API.
FROM node:22-slim AS build
WORKDIR /app
# Copy the whole app first (web imports ../../../ledger-client, so it must be present
# before the web build runs). .dockerignore keeps secrets/keys/node_modules out.
COPY . .
RUN npm ci
RUN cd web && npm ci && npm run build

FROM node:22-slim
WORKDIR /app
COPY --from=build /app /app
ENV NODE_ENV=production PORT=8787
EXPOSE 8787
# Secrets injected as env at deploy time (NEVER baked in):
#   FN_SECRET               — 5N M2M client secret (transport token)
#   CUSTODY_KEYS_JSON       — the custody-keys.json content (per-party mnemonics) as a JSON string
#   CUSTODY_SESSION_SECRET  — random string for signing session cookies
#   SYNCHRONIZER_ID         — the devnet synchronizer id (no party-registry.json needed)
# Optional: FN_LEDGER_URL, FN_AUTH_URL, PORT.
CMD ["npx", "tsx", "custody/server.ts"]
