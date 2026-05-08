# syntax=docker/dockerfile:1.7

ARG NODE_VERSION=22-alpine

# ─── deps ────────────────────────────────────────────────────────────────────
FROM node:${NODE_VERSION} AS deps
RUN corepack enable
WORKDIR /app
COPY package.json pnpm-lock.yaml ./
RUN --mount=type=cache,id=pnpm-store,target=/root/.local/share/pnpm/store \
    pnpm install --frozen-lockfile

# ─── builder ─────────────────────────────────────────────────────────────────
FROM node:${NODE_VERSION} AS builder
RUN corepack enable
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
# Next 16 evaluates route modules during `next build` to collect page data,
# which transitively imports our db client + crypto helpers. Both throw
# synchronously when their env vars are missing. Supply placeholders that
# are syntactically valid but never used at runtime — Next's build doesn't
# open a DB connection or perform any crypto.
ENV NEXT_TELEMETRY_DISABLED=1 \
    DATABASE_URL=postgres://build:build@localhost:5432/build \
    MASTER_KEY_ENC_KEY=AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA= \
    FINGERPRINT_HMAC_PEPPER=AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA= \
    SUB_KEY_HMAC_PEPPER=AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA= \
    BETTER_AUTH_SECRET=build-only-not-used-at-runtime \
    BETTER_AUTH_URL=http://localhost:3000
RUN pnpm run build

# Drizzle CLI + its required deps for migrations at runtime.
RUN --mount=type=cache,id=pnpm-store,target=/root/.local/share/pnpm/store \
    pnpm install --prod=false --frozen-lockfile --prefer-offline \
    && cp -r node_modules /opt/full-node_modules

# ─── runner ──────────────────────────────────────────────────────────────────
FROM node:${NODE_VERSION} AS runner
WORKDIR /app
ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    PORT=3000 \
    HOSTNAME=0.0.0.0

RUN apk add --no-cache curl tini \
 && addgroup -S app -g 1001 \
 && adduser  -S app -G app -u 1001

# Standalone server bundle (Next 16 — output: "standalone").
COPY --from=builder --chown=app:app /app/.next/standalone ./
COPY --from=builder --chown=app:app /app/.next/static ./.next/static
# `public/` is optional — copy if present, otherwise skip silently.
RUN mkdir -p ./public

# Drizzle migration runtime: full node_modules, schema sources, config, cli scripts.
COPY --from=builder --chown=app:app /opt/full-node_modules ./_migrate/node_modules
COPY --from=builder --chown=app:app /app/drizzle.config.ts ./_migrate/drizzle.config.ts
COPY --from=builder --chown=app:app /app/src/server/db ./_migrate/src/server/db
COPY --from=builder --chown=app:app /app/package.json ./_migrate/package.json
COPY --from=builder --chown=app:app /app/tsconfig.json ./_migrate/tsconfig.json

COPY --chown=app:app docker/entrypoint.sh /usr/local/bin/entrypoint.sh
RUN chmod +x /usr/local/bin/entrypoint.sh

USER app
EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD curl -fsS http://127.0.0.1:3000/healthz || exit 1

ENTRYPOINT ["/sbin/tini", "--", "/usr/local/bin/entrypoint.sh"]
CMD ["node", "server.js"]
