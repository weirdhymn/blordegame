# Deploying BLORSE (private beta on Fly.io)

One **same-origin container**: the Fastify server serves the built web client **and** the API
(`/api/*`) on a single origin (no CORS). State lives in an embedded Postgres (**PGlite**)
on a **persistent Fly volume**. Closed-by-default signups behind invite codes.

> **The hard gate:** do not invite anyone until the **canary survives a real redeploy** with
> the same volume ID (§5). PGlite on an *ephemeral* disk silently loses every herd on deploy.

## 1. What you need

- **Fly.io account** + the `flyctl` CLI (`fly auth login`).
- **A credit card on file** — Fly is pay-as-you-go; there is no guaranteed $0 tier.
- **Honest cost:** a `shared-cpu-1x` 256 MB machine ≈ **$1.94/mo** + a 1 GB volume ≈ **$0.15/mo**
  + negligible bandwidth → **~$2–3/month** always-on. Nothing else costs money.

## 2. Configuration (env / secrets)

Most config is in `fly.toml [env]`. The only **secret** is the invite code.

| Key | Where | Value |
| --- | --- | --- |
| `PORT` | `fly.toml` | `8080` |
| `NODE_ENV` | `fly.toml` | `production` (turns on secure cookies + the invite gate) |
| `TRUST_PROXY` | `fly.toml` | `true` (rate-limit keys on the real client IP behind Fly's edge) |
| `WEB_DIR` | `fly.toml` | `/app/apps/web/dist` |
| `DATABASE_URL` | `fly.toml` | `file:/data/blorse` (PGlite on the volume) |
| `INVITE_CODES` | **`fly secrets set`** | comma-separated; **unset ⇒ no signups** |
| `ALLOW_MINT` | (unset) | leave unset ⇒ `POST /api/horses` is admin-only |

No DB password, no session secret — sessions are DB-backed opaque tokens; passwords are scrypt.

## 3. Deploy

```bash
fly launch --no-deploy                 # reconciles app name + region into fly.toml (review it)
fly volumes create blorse_data --size 1 --region <your-region>   # the persistent disk
fly deploy                             # builds the Dockerfile (web + server), boots
# migrations run idempotently on first boot; the app comes up at https://<app>.fly.dev
```

Signups are **closed** until you open a wave (§6). First, prove persistence (§5).

## 4. Make a user an admin (mod tools + the gated mint route)

There is no self-service role change. After the person has registered, promote them from inside
the running machine (the `set-admin` script targets the same PGlite DB on the volume):

```bash
fly ssh console
# inside the container:
cd /app/apps/server
pnpm set-admin <username>
# → "promoted "<username>" to admin"
exit
```

`role='admin'` unlocks `GET /api/mod/*` and lets that account use `POST /api/horses`.

## 5. Persistence proof — survive a REDEPLOY, not just a restart (do this BEFORE inviting)

A restart reuses the machine; a **redeploy** builds a new image and replaces it. The risk is
PGlite writing to the image (ephemeral) instead of the volume. Confirm:

```bash
# 1. Register a CANARY account in the browser (it gets starter horses). Note the username.
# 2. Prove the data is on the volume, not the image:
fly ssh console -C "df -h /data"            # shows the volume device, not overlay/rootfs
fly ssh console -C "ls -la /data/blorse"    # PGlite files present
fly volumes list                            # RECORD the volume ID
# 3. Restart test (necessary, not sufficient):
fly machine restart <machine-id>            # → log in as canary: horses still there
# 4. THE REAL TEST — redeploy (new image + machine):
fly deploy
# → log in as canary again, and:
fly volumes list                            # same volume ID as step 2?
```

- ✅ **Pass:** canary logs in with its horses **and** the volume ID is unchanged ⇒ safe to invite.
- 🚩 **Fail:** canary gone / 0 horses / new volume ID ⇒ the data dir isn't on the volume.
  Fix the `[mounts]` / `DATABASE_URL` path and re-run — **do not invite anyone.**

## 6. Invite waves (your progressive-rollout control)

Signups are **closed by default** (no `INVITE_CODES` ⇒ every register returns
`403 invite_required`). Opening a wave is a deliberate config change:

```bash
fly secrets set INVITE_CODES=wave1-$(openssl rand -hex 4)   # set + auto-redeploy
# share that exact code with wave 1's testers; they enter it on the Register screen
```

Add codes (comma-separated) for later waves; remove a code to close it. Existing sessions are
unaffected — the code only gates *new* registrations.

## 7. Reset / wipe test data

```bash
fly ssh console -C "rm -rf /data/blorse"   # delete the PGlite dir
fly machine restart <machine-id>           # next boot re-migrates an empty DB
# (or destroy + recreate the volume for a guaranteed clean slate)
```

## 8. Local development

`pnpm dev:server` + `pnpm dev:web` run unchanged: `NODE_ENV` is unset locally, so signups are
**open** (no invite needed) and the cookie isn't `secure`. The client's Vite proxy forwards
`/api` to the server (same path as prod). Mint stays admin-only unless you set `ALLOW_MINT=true`.

## 9. Scaling beyond one machine (deferred)

PGlite is in-process → single instance only. When the beta outgrows one box, move to managed
Postgres. That means **wiring `drizzle-orm/node-postgres`** in `apps/server/src/db/client.ts`
(it currently guards `postgres://` with an explicit error) and resolving the DB-type union
across the services — a real refactor, **not** a config flip. Don't do it for a few testers.
