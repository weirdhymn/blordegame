# Running BLORSE locally (Windows / PowerShell)

Exact, in-order commands to install, seed, and run the server + renderer, then exercise the
API by hand. Commands assume **PowerShell** run from the repo root (`C:\Users\dvale\blorsegame`).

> **Database model — read this first.** The server uses PGlite (embedded Postgres). With **no**
> `DATABASE_URL` it runs **in-memory** and wipes on every restart. To keep data, set
> `DATABASE_URL=file:./.data/blorse` — a persisted folder under `apps/server/`. The seed and the
> server must use the **same** `DATABASE_URL`, in the **same** PowerShell window, and PGlite is
> single-process: **seed first, then start the server** (stop the server before re-seeding).

## Prerequisites

- **Node 24** (see `.nvmrc`). Check: `node --version`.
- **Corepack** (ships with Node) provides the pinned pnpm — every command below uses
  `corepack pnpm` so you don't need a global pnpm.

---

## Terminal 1 — set up and run the server

```powershell
# 1. Install all workspace dependencies.
#    Expect: pnpm resolves + links packages, ending in "Done".
corepack pnpm install

# 2. Choose a persistent database for this PowerShell session.
#    Expect: no output — it just sets the env var for the next two commands.
$env:DATABASE_URL = 'file:./.data/blorse'

# 3. Seed the database (idempotent — safe to run repeatedly).
#    Expect: "created account \"tester\"" then "minted starter horse ... Bay \"Clementine\" (adult)",
#    and a summary printing  login: tester / horsehorse1.
corepack pnpm --filter @blorse/server seed

# 4. Start the server (no file-watching; stable for hand-testing).
#    Expect: "blorse server listening at http://0.0.0.0:3001"  (leave this window running).
corepack pnpm --filter @blorse/server start
```

Quick check (new window, or before step 4 in another tab):

```powershell
# Expect: {"status":"ok"}
Invoke-RestMethod http://127.0.0.1:3001/health
```

> The server binds `0.0.0.0:3001`, so reach it at **`http://127.0.0.1:3001`**.
> To use a different port: `$env:PORT = '3055'` before step 4.

---

## Terminal 2 — exercise the API by hand

With the server from Terminal 1 still running, open a **second** PowerShell window:

```powershell
# Walk the full player path: log in -> starter horse -> breeding odds -> breed -> adventure -> Tavern -> journal.
# Expect: lines 0)–9) printing each step, ending in "DONE".
powershell -ExecutionPolicy Bypass -File .\player-path.ps1
```

(That script targets `http://127.0.0.1:3001` by default; override with
`-BaseUrl http://127.0.0.1:3055`.) The individual commands are also listed in
`player-path.ps1` if you'd rather paste them one at a time. Note: a fresh herd has **0 Cubes**,
and the **Tavern/journal can be empty on day one** — wild-horse-to-Tavern is probabilistic and
journal entries accrue from the daily tick.

---

## Optional — the renderer dev page (Phase 2, standalone)

```powershell
# Starts Vite. Expect: "Local: http://localhost:5173/". Open it to generate genotypes and
# render horses. This page is NOT yet wired to the :3001 API — it runs genetics + rendering
# entirely in the browser (the API integration is the next milestone).
corepack pnpm --filter @blorse/web dev
```

---

## Reset / re-seed

```powershell
# Stop the server first (Ctrl+C in Terminal 1), then:
Remove-Item .\apps\server\.data -Recurse -Force   # delete the persisted DB
$env:DATABASE_URL = 'file:./.data/blorse'
corepack pnpm --filter @blorse/server seed         # fresh starter herd + horse
```

## Troubleshooting

- **Data didn't persist across a restart** → `DATABASE_URL` wasn't set (or a new window dropped
  it). Re-set `$env:DATABASE_URL = 'file:./.data/blorse'` before seeding/starting.
- **`running scripts is disabled on this system`** → run the smoke test as shown with
  `powershell -ExecutionPolicy Bypass -File .\player-path.ps1`.
- **`EADDRINUSE` / port already in use** → another server is on 3001; set `$env:PORT` to a free
  port (and pass `-BaseUrl` to the smoke test).
- **Seed says it can't open the database** → the server is holding the PGlite file open. Stop the
  server, then seed.
