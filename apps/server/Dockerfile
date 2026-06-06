# BLORSE server — run-from-source container.
# The packages export TypeScript directly (`exports: "./src/index.ts"`) and Node 24
# strips types natively, so there is no build step: the container runs the .ts source.
#
# Single-instance beta: all state lives in an embedded Postgres (PGlite) persisted to
# the /data volume. For horizontal scale, point DATABASE_URL at a real Postgres (§6) —
# the Drizzle schema is dialect-postgres, so only db/client.ts changes. See DEPLOY.md.
FROM node:24-slim

WORKDIR /app
RUN corepack enable

# 1) Manifests first so the dependency layer stays cached across source-only edits.
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json ./
COPY packages/balance/package.json      packages/balance/package.json
COPY packages/genetics/package.json     packages/genetics/package.json
COPY packages/render-core/package.json  packages/render-core/package.json
COPY apps/server/package.json           apps/server/package.json
COPY apps/web/package.json              apps/web/package.json

# 2) Install only the server and its workspace deps (skips the web client's heavy deps).
RUN pnpm install --frozen-lockfile --filter @blorse/server...

# 3) Application source (Node runs the .ts directly; no compile).
COPY . .

ENV NODE_ENV=production
ENV PORT=3001
# Persisted embedded Postgres under the mounted volume.
ENV DATABASE_URL=file:/data/blorse
VOLUME ["/data"]
EXPOSE 3001

# Liveness: hit the unauthenticated /health route with Node's global fetch.
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD node -e "fetch('http://localhost:'+(process.env.PORT||3001)+'/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

# `start` runs: node --import ./scripts/register.mjs src/index.ts (applies migrations, then listens).
CMD ["pnpm", "--filter", "@blorse/server", "start"]
