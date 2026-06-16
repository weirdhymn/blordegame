# BLORSE — single same-origin, STATELESS container: the Fastify server serves the built web
# client AND the API (`/api/*`). Durable state lives in managed Postgres (DATABASE_URL secret) —
# nothing here. Node 24 strips TypeScript natively, so the server runs from source (no compile).
FROM node:24-slim

WORKDIR /app
RUN corepack enable

# 1) Manifests first — keeps the dependency layer cached across source-only edits.
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json ./
COPY packages/balance/package.json      packages/balance/package.json
COPY packages/genetics/package.json     packages/genetics/package.json
COPY packages/render-core/package.json  packages/render-core/package.json
COPY apps/server/package.json           apps/server/package.json
COPY apps/web/package.json              apps/web/package.json

# 2) Full install — the web build needs vite/react; the server needs @fastify/static.
RUN pnpm install --frozen-lockfile

# 3) Source, then build the web client → apps/web/dist (the server runs from .ts source).
COPY . .
RUN pnpm --filter @blorse/web build

ENV NODE_ENV=production
ENV PORT=8080
ENV WEB_DIR=/app/apps/web/dist
ENV TRUST_PROXY=true
# DATABASE_URL is intentionally NOT set here — it is a host SECRET (the Neon URL). In production,
# index.ts refuses to boot unless it is a postgres:// URL, so a missing secret fails LOUD rather
# than silently falling back to an ephemeral embedded DB. INVITE_CODES is likewise a host secret.
EXPOSE 8080

# Drop root (§11 hardening): the bundled `node` user owns the app. No data volume — state is in
# managed Postgres.
RUN chown -R node:node /app
USER node

# Liveness: the unauthenticated /health route (kept at the root, no /api prefix).
HEALTHCHECK --interval=30s --timeout=5s --start-period=25s --retries=3 \
  CMD node -e "fetch('http://localhost:'+(process.env.PORT||8080)+'/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

# node runs as PID 1 directly (not via pnpm), so the platform's SIGTERM reaches the graceful
# shutdown handler in index.ts instead of dying inside a package-manager wrapper.
WORKDIR /app/apps/server
CMD ["node", "--import", "./scripts/register.mjs", "src/index.ts"]
