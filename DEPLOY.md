# Deploying BLORSE (beta)

The beta is a **single server instance** with an **embedded Postgres (PGlite)** persisted
to a disk volume. This keeps the whole stack to one container with no external database to
operate — appropriate for a small public beta. The path to scale is documented at the end.

## Quick start

```bash
docker compose up -d --build
# → server on http://localhost:3001, health at GET /health
docker compose logs -f server     # follow logs
docker compose down               # stop (the blorse-data volume persists)
```

Or build/run the image directly:

```bash
docker build -t blorse-server -f apps/server/Dockerfile .
docker run -d -p 3001:3001 -v blorse-data:/data blorse-server
```

## What happens on boot

`apps/server/src/index.ts` → `createDb()` → `runMigrations(db)` → `app.listen()`.
Migrations (`apps/server/drizzle/0000…0009`) are applied **idempotently every boot**, so a
fresh volume is initialised automatically and an existing one is brought up to date.

## Configuration (env)

| Variable        | Default            | Notes                                                              |
| --------------- | ------------------ | ------------------------------------------------------------------ |
| `PORT`          | `3001`             | Listen port.                                                       |
| `DATABASE_URL`  | `file:/data/blorse`| `file:<dir>` → persisted PGlite. Unset → in-memory (ephemeral).    |
| `NODE_ENV`      | `production`       | —                                                                  |

Rate limiting (§11) is on by default: **600 req/min per IP** globally, with a tighter
**5/min** cap on `POST /report`. Tune the global ceiling via `buildApp(db,{rateLimitMax})`.

## Moderation (§11)

- **Seed a moderator:** there is no self-service role change. Promote an account directly:
  `UPDATE users SET role='admin' WHERE username=$1;` (or `'mod'` for report triage only).
- **Tools:** `GET /mod/reports`, `GET /mod/stats` (mod/admin); `POST /mod/users/:id/freeze`
  and `/unfreeze` (admin). A frozen account can read but every mutating request returns
  `403 {code:"frozen"}`.
- **Analytics:** `GET /mod/stats` returns live counts (users/herds/horses/open reports);
  the `auditLog` table is the per-action event stream behind it.

## Backups & rollback

Phenotype is **derived, never stored** — only `(genotype, seed, glitch)` persists — so a
volume snapshot is a complete backup.

```bash
# snapshot the data volume
docker run --rm -v blorse-data:/data -v "$PWD":/backup busybox \
  tar czf /backup/blorse-$(date +%F).tgz -C /data .
```

**Rollback:** redeploy the previous image tag and, if a migration must be undone, restore
the most recent snapshot into a fresh volume. Because migrations are forward-only, treat the
snapshot as the rollback point for any schema change.

## Scaling beyond one instance

PGlite is in-process, so it does not support multiple server replicas. When the beta
outgrows one box:

1. Stand up managed Postgres and set `DATABASE_URL=postgres://…`.
2. Wire `drizzle-orm/node-postgres` in `apps/server/src/db/client.ts` (`createDb()` already
   guards this path with a clear error). The schema is dialect-postgres, so **no schema or
   query changes** are required — only the driver factory.
3. Run migrations once against the new database, then scale the stateless server replicas
   behind a load balancer.

## Shipping content updates

New genes/glitches/regions/items follow the rehearsed checklist in
[`docs/GENE_DROP_RUNBOOK.md`](docs/GENE_DROP_RUNBOOK.md).
