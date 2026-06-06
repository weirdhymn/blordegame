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
#    Expect: "created account \"tester\"" + a summary: horses (2) : Bay (adult), Chestnut (adult),
#    cubes : 150, login: tester / horsehorse1.  (Registration grants the two starters + purse;
#    the seed just pins this known login.)
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
# Walk the full player path: log in -> two starters -> breeding odds -> breed -> adventure -> Tavern -> journal.
# Expect: lines 0)–8) printing each step, ending in "DONE".
powershell -ExecutionPolicy Bypass -File .\player-path.ps1
```

(That script targets `http://127.0.0.1:3001` by default; override with
`-BaseUrl http://127.0.0.1:3055`.) The individual commands are also listed in
`player-path.ps1` if you'd rather paste them one at a time. Note: a fresh herd starts with
**two unrelated adult founders + 150 Cubes** (the cold-start grant), and the **Tavern/journal can
be empty on day one** — wild-horse-to-Tavern is probabilistic and journal entries accrue from the
daily tick.

---

## The web client

```powershell
# Starts Vite. Expect: "Local: http://localhost:5173/".
# With the server (Terminal 1) running, open it and LOG IN — e.g. the seeded tester /
# horsehorse1 — to land on your herd home (name, Cubes, Level). The client proxies /api → the
# server (same-origin, so the session cookie works); override the target with VITE_API_TARGET.
# The Phase 2 renderer dev page is still here at /render.
corepack pnpm --filter @blorse/web dev
```

> Client wiring is in progress (phase C0 of the client plan — auth + herd home done; horse
> list, breeding, adventures, and journal land in later phases).

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
