# BLORSE — Development Progress Report

**Date:** 2026-06-05
**Status:** Build roadmap (Phases 0–11) **complete**. Server is feature-complete and fully
tested per `BLORSE_PLAN.md`. The web client is scaffolded but **not yet wired** to the API.

---

## 1. Executive summary

BLORSE (working title "blorsegame") is a cozy, asynchronous-multiplayer life-sim about a herd
of pixel horses in a literal digital world: real-genetics **breeding**, **exploration**, a
DnD-style **RPG layer** (stats + dice), and an autonomous **"Living Herd"** simulation. It is
a full-stack TypeScript pnpm monorepo.

All twelve planned build phases are implemented, verified, and committed. Every gameplay
system described in the plan runs **server-authoritatively** and is covered by an automated
test. The remaining work to reach a *playable* beta is primarily **front-end integration**
(wiring the React/PixiJS client to the now-complete API) plus a small set of deferred
product decisions, all listed in §7.

| Indicator                | State                                                     |
| ------------------------ | --------------------------------------------------------- |
| Phases complete          | **12 / 12** (Phase 0 → Phase 11)                           |
| Automated tests          | **503 passing**, 0 failing                                |
| Quality gauntlet         | typecheck ✅ · lint ✅ · format ✅ · test ✅ (all green)      |
| Server feature-complete  | ✅ Yes                                                     |
| Web client playable      | ⛔ Not yet (renderer dev page only; API not wired)         |
| Production-deployable     | ✅ Single-instance beta (Docker + persisted PGlite)        |

---

## 2. Metrics at a glance

**Code (TypeScript authored, excluding the vendored engine):**

| Area                          | Lines  | Notes                                            |
| ----------------------------- | ------ | ------------------------------------------------ |
| `apps/server/src`             | 3,537  | 24 service modules, 10 route modules             |
| `apps/server/test`            | 921    | one end-to-end integration script, 145 checks    |
| `packages/render-core/src`    | 391    | genetics→art bridge                              |
| `packages/genetics/src`       | 324    | typed ESM facade over the vendored engine        |
| `packages/balance/src`        | 123    | 55 exported tuning constants/types (§14)         |
| `apps/web/src`                | 397    | scaffold + standalone renderer dev page          |
| **Authored total**            | **~5,693** |                                              |
| `packages/genetics/vendor`    | 2,352  | engine + data, **vendored byte-for-byte**        |

**Data model:** 18 tables, 7 enums, 10 migrations (`0000`–`0009`).

**History:** 14 commits, one per phase/sub-phase. Tags by commit:

| Phase | Commit    | Title                                                    |
| ----- | --------- | -------------------------------------------------------- |
| 0     | `9c733fb` | Scaffold: pnpm/TS monorepo, web + server boot, CI        |
| 1     | `b23155e` | Vendor genetics engine + typed ESM facade                |
| 2a    | `8a60596` | render-core — palette adapter, shading, glitch           |
| 2b    | `e9dca8b` | Canvas-2D compositor + renderer dev page                 |
| 3     | `4beb468` | Persistence & accounts (Drizzle + PGlite + auth)         |
| 4     | `36e3b15` | Breeding loop (server-authoritative)                     |
| 5     | `1e9ca96` | Exploration & quests                                     |
| 6     | `50b4272` | Aging, care & daily rhythm                               |
| 7     | `e4dd115` | The Pasture, gathering & crafting                        |
| 8a    | `5122581` | RPG stats, dice & jobs                                   |
| 8b    | `3996760` | Adventures, wild encounters & the Tavern                 |
| 9     | `b349b6a` | The Living Herd (autonomy)                               |
| 10    | `c132d2c` | Social & economy (async)                                 |
| 11    | `cb71be6` | Beta hardening                                           |

---

## 3. Architecture & stack

```
packages/genetics/    vendored equine-genetics engine (untouched) + typed ESM facade + tests
packages/render-core/ pure genetics→art bridge: RenderSpec, palette adapter, shading, glitches
packages/balance/     all §14 tuning constants in one place (no magic numbers in logic)
apps/server/          Fastify + Drizzle + PGlite — auth, all game logic, the autonomy sim
apps/web/             React + Vite (+ Canvas-2D renderer dev page); client not yet API-wired
```

- **Language/tooling:** TypeScript (strict; `verbatimModuleSyntax`, `noUncheckedIndexedAccess`),
  pnpm workspaces (pnpm 11.5.2 via Corepack), ESLint flat config + Prettier, Node 24 native
  TS type-stripping (no bundler for the server).
- **Server:** Fastify 5, Drizzle ORM, PGlite (embedded Postgres). Schema is dialect-postgres,
  so production can swap to managed Postgres via `drizzle-orm/node-postgres` with no schema
  or query changes.
- **Determinism:** all randomness is server-side through a seeded RNG (`mulberry32`); every
  horse stores `(genotype, seed[, glitch])` and its phenotype/art is **derived on demand**,
  never stored — the same inputs render pixel-identically forever (this is what makes
  "copy link / shareable horse" work).
- **Time:** a daily midnight rollover (UTC−5) with a login-catchup loop that deterministically
  resolves every missed day's jobs and autonomy.

---

## 4. What's built, phase by phase

- **Phase 0 — Scaffold.** Monorepo, workspaces, shared TS config, lint/format, CI
  (typecheck → lint → format:check → test). Web + server boot; `GET /health`.
- **Phase 1 — Genetics.** Vendored `genetics.js`/`data.js` byte-for-byte; brought across its
  ~340-test suite (green); added a typed ESM facade (`resolve`, `breedFoal`, `punnett`,
  `randomGenotype`) plus the regional-frequency table format.
- **Phase 2 — Renderer + palette adapter.** `render-core` turns a genotype into a `RenderSpec`
  (palette adapter, procedural shading for roan/sooty/pangaré, glitch transforms, layer
  manifest); a Canvas-2D compositor + a standalone dev page render and export horses.
- **Phase 3 — Persistence & accounts.** Drizzle schema + migrations, password auth + sessions,
  User + Herd (1:1) + Horse tables, mint/store/load, render-on-demand with caching.
- **Phase 4 — Breeding loop.** Server-authoritative `breedFoal` with cooldowns and adult
  gates, no-shared-ancestor rule (lineage closure), foal minting (white until adulthood),
  `punnett()` odds preview, pedigree view.
- **Phase 5 — Exploration & quests.** Regions with per-region genetics bias and encounter
  tables, a paced roam action for items/resources/quest beats, quest chains, region gating.
- **Phase 6 — Aging, care & daily rhythm.** Life-stage progression over real time, care
  actions (no fail states), the white-foal → adult-color reveal at maturity, the daily
  rollover + dailies + login-catchup cursor, the Field Guide.
- **Phase 7 — The Pasture, gathering & crafting.** Developable Pasture, placeable Structures,
  resource gathering, crafting (books/games/tools/materials).
- **Phase 8 — RPG progression.** Six stats + hidden Luck (heritable + trainable), seeded
  dice resolution, structure-gated jobs, single-horse and small-party adventures with
  per-region encounter tables, the wild-encounter → party-recruit → **Tavern** flow (atomic
  fee-based recruiting), accomplishments.
- **Phase 9 — The Living Herd.** Personality vectors + compatibility, a relationship graph,
  the deterministic daily autonomy tick (global + login-catchup), criteria-gated journal
  events, friend/rival/bonded relationships, structure-gated clubs/roles. *(The signature
  feature.)*
- **Phase 10 — Social & economy.** Marketplace (server-escrowed, atomic buy), direct trades
  (atomic two-sided swap), inter-herd visits, async messaging, AuditLog.
- **Phase 11 — Beta hardening.** Account freeze + central mutation guard, report flow,
  moderator/admin tools, rate limiting, consistent JSON error envelopes, extended audit
  coverage, basic analytics (`/mod/stats`), a Docker deploy pipeline, and a rehearsed
  gene-drop runbook.

---

## 5. Test coverage

| Suite                         | Tests | What it exercises                                              |
| ----------------------------- | ----- | -------------------------------------------------------------- |
| Genetics engine (vendored)    | 340   | differential/ratio correctness of the genetics model          |
| Genetics facade               | 5     | typed API parity (resolve/breed/roll) Node ↔ Vite             |
| render-core                   | 13    | palette adapter, shading, glitch transforms, manifest         |
| Server (integration)          | 145   | the **real** Fastify + Drizzle + PGlite stack, end to end      |
| **Total**                     | **503** |                                                             |

The server suite is a single deterministic script that drives the live stack via
`app.inject()` — registration, auth, minting, breeding, lineage, exploration, care, the daily
rollover, crafting, RPG dice/jobs/adventures, the Tavern, autonomy, marketplace/trades,
messaging, moderation, freeze, rate limiting, and error handling — using injected seeds and
clocks so every run is reproducible.

---

## 6. Key technical decisions & flagged deviations

- **Vendored engine is sacred.** The genetics engine is wrapped, never refactored; its
  ~340 tests are the guardrail. New heritable genes ship as *data*, not code (see the
  gene-drop runbook).
- **PGlite + native Node TS (not tsx/Vite) for the server.** During Phase 3 the server could
  not run under tsx/Vite/`node:test` (PGlite's WASM init breaks when `import.meta.url` is
  rewritten; the engine's `window` shim also tripped PGlite's browser detection). Resolved by
  running TypeScript source directly on Node with a resolve-only loader, and by removing the
  transient `window` global after the engine loads. *Documented; stable.*
- **Renderer is Canvas-2D, not PixiJS** — a deliberate deviation from the §2 stack lock.
  `render-core` is renderer-agnostic, so this is reversible. **Open decision (§7).**
- **Phenotype derived, never stored** — only `(genotype, seed, glitch)` persists. This makes
  rendering reproducible and backups/rollbacks trivial.
- **Atomicity** — marketplace buys, trades, and Tavern recruiting use DB transactions with
  conditional-update claims (e.g. `WHERE status='active'`) so only the first claimant wins.
- **Rate-limit registration order** (Phase 11) — routes were moved into a child plugin that
  loads *after* `@fastify/rate-limit`, because the limiter's `onRoute` listener must be
  attached before routes register or per-route caps are silently dropped.

---

## 7. Known gaps & standing decisions

None block the build; these are the next moves toward a playable, launched beta.

1. **Web client ↔ API wiring (largest remaining item).** The React/PixiJS client is
   scaffolded and the renderer dev page works standalone, but the client does not yet call
   the completed API. This is the bulk of the work to a playable beta.
2. **Canvas-2D vs PixiJS** — resolve the §2 stack-lock deviation before the client UI lands.
3. **LORE.md sync** — canonical-name doc is stale relative to the §13 locked names; reconcile
   before any player-facing copy.
4. **node-postgres for horizontal scale** — `createDb()` already guards the `postgres://`
   path; single-instance beta runs on PGlite persisted to a volume. Swapping the driver is
   the one code change required to scale out.

---

## 8. Quality & deployment posture

- **CI** runs install → typecheck → lint → format:check → test on every push/PR, plus a job
  that builds the server Docker image to validate the deploy artifact.
- **Deploy:** `docker compose up -d --build` runs a single instance with state persisted to a
  `/data` volume (`DEPLOY.md`). Migrations re-apply idempotently on boot.
- **Anti-abuse:** rate limiting, an AuditLog over every state-changing action, a report flow,
  account freeze, and moderator/admin tooling are in place.
- **Content ops:** `docs/GENE_DROP_RUNBOOK.md` is a rehearsed checklist for shipping new
  genetic content with no engine changes and no data migration.

---

## 9. Recommended next steps

1. **Wire the web client to the API** — auth, herd/pasture view, horse detail + live render,
   breeding UI (with the `punnett` odds preview), exploration/adventures, and the journal.
2. **Settle the renderer choice** (Canvas-2D vs PixiJS) so the client builds on a fixed base.
3. **Reconcile LORE.md** with the locked canonical names.
4. **Stand up a staging deploy** and run the gene-drop runbook once end-to-end as a dress
   rehearsal.
5. **(At scale) wire node-postgres** and move to managed Postgres behind stateless replicas.
