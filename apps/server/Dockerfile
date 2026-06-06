# BLORSE — single same-origin container: the Fastify server serves the built web client AND
# the API (`/api/*`). State persists in an embedded Postgres (PGlite) on the /data volume.
# Node 24 strips TypeScript natively, so the server runs from source (no compile step).
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
ENV DATABASE_URL=file:/data/blorse
ENV TRUST_PROXY=true
# INVITE_CODES is intentionally NOT set here — provide it as a host secret to open a wave.
VOLUME ["/data"]
EXPOSE 8080

# Liveness: the unauthenticated /health route (kept at the root, no /api prefix).
HEALTHCHECK --interval=30s --timeout=5s --start-period=25s --retries=3 \
  CMD node -e "fetch('http://localhost:'+(process.env.PORT||8080)+'/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

# `start` runs: node --import ./scripts/register.mjs src/index.ts (applies migrations, listens).
CMD ["pnpm", "--filter", "@blorse/server", "start"]
