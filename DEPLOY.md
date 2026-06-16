# Deploying BLORSE (private beta on Fly.io)

One **same-origin, stateless container**: the Fastify server serves the built web client **and**
the API (`/api/*`) on a single origin (no CORS). All durable state lives in **managed Postgres
(Neon)** — *not* on the machine — so the app box can be replaced at will and there is no volume to
lose. Signups are closed-by-default behind invite codes.

> **Why managed Postgres:** the goal is un-loseable player data. Neon gives **automated backups +
> point-in-time recovery off the database disk** for free; a redeploy replaces the app container and
> cannot touch the DB. We *also* keep our own logical dumps (below) so durability never depends on a
> single system. (PGlite stays the zero-setup driver for **local dev, tests, and CI** — the
> driver-agnostic `DB` type means identical code on both.)

## 1. What you need

- **Fly.io account** + `flyctl` (`fly auth login`) for the app.
- **A Neon account** (or any managed Postgres: Fly Managed Postgres, Supabase, RDS…) for the DB.
- **Honest cost:** a `shared-cpu-1x` 256 MB Fly machine ≈ **$1.94/mo**; Neon has a usable free tier
  (scale-to-zero) → roughly **$2–5/month** for a quiet beta. No volume cost (no volume).

## 2. Configuration (env / secrets)

Non-secret config is in `fly.toml [env]`. The **secrets** are the DB URL and the invite code.

| Key | Where | Value |
| --- | --- | --- |
| `PORT` | `fly.toml` | `8080` |
| `NODE_ENV` | `fly.toml` | `production` (secure cookies + invite gate + JSON logs) |
| `TRUST_PROXY` | `fly.toml` | `true` (rate-limit keys on the real client IP behind Fly's edge) |
| `WEB_DIR` | `fly.toml` | `/app/apps/web/dist` |
| `DATABASE_SSL` | `fly.toml` | `true` (Neon and most managed PG require TLS) |
| `DATABASE_URL` | **`fly secrets set`** | `postgres://user:pw@…neon.tech/blorse?sslmode=require` |
| `INVITE_CODES` | **`fly secrets set`** | comma-separated; **unset ⇒ no signups** |
| `ALLOW_MINT` | (unset) | leave unset ⇒ `POST /api/horses` is admin-only |

No session secret — sessions are DB-backed opaque tokens; passwords are scrypt.

## 3. Cut over to Neon (one-time)

```bash
# 1. Create the Neon project + database; copy its pooled connection string.
# 2. Hand it to Fly as a secret (note sslmode=require):
fly secrets set DATABASE_URL='postgres://USER:PW@ep-xxx.REGION.aws.neon.tech/blorse?sslmode=require'
# 3. Deploy. Migrations run idempotently on first boot against Neon.
fly launch --no-deploy     # reconciles app name + region into fly.toml (review it)
fly deploy
# → app at https://<app>.fly.dev ; GET /health → {status:"ok"}
```

There is **no volume** to create — the machine is stateless. Signups stay closed until §6.
First, run the persistence canary (§5).

## 4. Make a user an admin (mod tools + the gated mint route)

After the person has registered, promote them from inside the running machine:

```bash
fly ssh console
cd /app/apps/server
DATABASE_URL="$DATABASE_URL" pnpm set-admin <username>   # → "promoted … to admin"
exit
```

`role='admin'` unlocks `GET /api/mod/*` and lets that account use `POST /api/horses`.

## 5. Persistence canary — survive a REDEPLOY, not just a restart (BEFORE inviting)

A redeploy builds a new image and replaces the machine. With managed Postgres the only real risk is
that the app points at the **wrong** (or an ephemeral) database — so the canary proves a redeploy
keeps reading and writing the same external DB.

The mechanism is **already proven against a live Postgres** in CI on every push (the
`restore-drill` job) and locally (`pnpm canary write` then `pnpm canary check` across two processes
survives the boundary byte-identically). On the real Neon instance, confirm it once:

```bash
# 1. Register a CANARY account in the browser (it gets starter horses). Note the username.
# 2. Redeploy — the actual test (new image + machine, same Neon DB):
fly deploy
# 3. Log in as the canary again → its horses are still there.
# (belt-and-suspenders, from inside the box:)
fly ssh console -C "cd /app/apps/server && DATABASE_URL=\"$DATABASE_URL\" pnpm canary write"
fly deploy
fly ssh console -C "cd /app/apps/server && DATABASE_URL=\"$DATABASE_URL\" pnpm canary check <token>"
```

- ✅ **Pass:** the canary logs in with its horses after the redeploy ⇒ safe to invite.
- 🚩 **Fail:** canary gone / 0 horses ⇒ `DATABASE_URL` is wrong or pointing at an ephemeral DB.
  Fix the secret and re-run — **do not invite anyone.**

## 6. Backups & restore

Two independent layers, so a failure of either still leaves a good copy:

**Layer 1 — the provider (Neon).** Automated backups + **point-in-time recovery** to any moment in
the retention window, off the database disk. Restore via the Neon console/CLI (branch or restore to a
timestamp). Confirm your project's retention; the free tier's window is short, which is exactly why
we keep Layer 2.

**Layer 2 — our own logical dumps (guaranteed retention, off-provider).** A `pg_dump` we own,
shipped off-box and rotated. **Run it from any machine with `pg_dump` + network to Neon** — your
laptop, or a small scheduled runner with `postgresql-client` installed. (The Fly app image is
deliberately minimal: `node:24-slim` has no `pg_dump`, so backups run *outside* the app box, which
is arguably better — they don't depend on the app being healthy.)

```bash
DATABASE_URL="$NEON_URL" \
BACKUP_DIR=./.data/backups \
BACKUP_UPLOAD_CMD='aws s3 cp {file} s3://blorse-backups/' \   # or: rclone copyto {file} r2:…
  pnpm --filter @blorse/server backup
# → blorse-YYYYMMDD-HHMMSS.dump, uploaded off-disk, retention 30 daily / 8 weekly.
```

`BACKUP_UPLOAD_CMD` ships the dump to object storage (`{file}` is substituted) so a database-disk
failure never takes the backups with it. Retention is `BACKUP_RETAIN_DAYS` (30) + one weekly dump
for `BACKUP_RETAIN_WEEKS` (8). Schedule it daily (cron / a CI scheduled job / a tiny runner).

**Restore (emergency):**

```bash
DATABASE_URL="$NEON_URL" CONFIRM_RESTORE=yes \
  pnpm --filter @blorse/server restore /path/to/blorse-….dump   # newest in BACKUP_DIR if omitted
```

**Verify restore SAFELY against real Neon (without endangering production).** Don't destroy the live
DB to test restore — restore into a **scratch Neon branch** (instant copy-on-write) and fingerprint-
match it to production:

```bash
# 1. Back up production (above) → a .dump file.
# 2. In the Neon console, create a branch (e.g. "restore-test"); copy its connection string.
# 3. Restore the dump INTO the branch:
DATABASE_URL="$BRANCH_URL" CONFIRM_RESTORE=yes \
  pnpm --filter @blorse/server restore ./.data/backups/blorse-….dump
# 4. Prove the restored branch matches production, read-only on both:
pnpm --filter @blorse/server compare-db "$NEON_URL" "$BRANCH_URL"
# → "COMPARE: MATCH — the restored copy is byte-identical to the source"
# 5. Delete the branch.
```

**Proof, not faith.** `pnpm --filter @blorse/server restore-drill` performs the full destroy→restore
cycle (seed → back up → `DROP SCHEMA public CASCADE` → confirm gone → restore → assert identical). It
runs **on every push** in CI against a real `postgres:16`, and has been run by hand against a live
Postgres (*58 rows destroyed and restored, identical*). Restore is a tested procedure, not an
assumption.

## 7. Invite waves (progressive-rollout control)

Signups are **closed by default** (no `INVITE_CODES` ⇒ every register returns `403 invite_required`).

```bash
fly secrets set INVITE_CODES=wave1-$(openssl rand -hex 4)   # set + auto-redeploy
```

Add codes (comma-separated) for later waves; remove a code to close it. Existing sessions are
unaffected — the code only gates *new* registrations.

## 8. Reset / wipe test data

```bash
# Against Neon: drop + recreate the schema (next boot re-migrates an empty DB):
psql "$DATABASE_URL" -c "DROP SCHEMA public CASCADE; CREATE SCHEMA public;"
fly machine restart <machine-id>
# (or create a fresh Neon branch/database and point DATABASE_URL at it)
```

## 9. Local development

`pnpm dev:server` + `pnpm dev:web` run unchanged on **PGlite** (`DATABASE_URL` unset → in-memory; or
`file:./.data/blorse` to persist). `NODE_ENV` is unset locally, so signups are **open** and the
cookie isn't `secure`. To exercise the production driver locally, point `DATABASE_URL` at any
`postgres://` instance — migrations and every query run identically (the CI `postgres` job does
exactly this on every push).
