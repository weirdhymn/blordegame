# CLAUDE.md — blorsegame (codebase shorthand: BLORSE)

Operating brief for Claude Code. Keep this file short; it loads every session.
**The full spec is `BLORSE_PLAN.md` (source of truth) and `LORE.md` (canonical names).**
Read the relevant `BLORSE_PLAN.md` section for the current phase before writing code — do **not** rely on memory of it.

## What this is
A cozy, asynchronous multiplayer life-sim about a herd of pixel horses in a literal digital world: breeding (real-genetics engine), exploration, a DnD-style RPG layer (stats + dice jobs/adventures), and an autonomous "living herd" simulation. Full-stack TypeScript monorepo.

## How to work here
- **One phase at a time.** Phases are defined in `BLORSE_PLAN.md` §11. Implement the current phase only, finish its acceptance checks, then stop. Don't jump ahead.
- **Before each phase**, open and re-read its `BLORSE_PLAN.md` section (see map below). Treat that section as the contract.
- **Ask before inventing.** If a needed decision isn't in the plan or LORE.md, surface it rather than guessing — especially names (placeholders in LORE.md hold unless overridden).
- Keep PRs/commits scoped to one phase or sub-system.

## Golden rules (do not violate without flagging)
- **Vendored genetics engine is sacred.** `packages/genetics/vendor/{genetics.js,data.js}` is copied in *essentially untouched*. Wrap it with a typed facade; never refactor its internals. Its existing test suite (~340 tests) must stay green at all times.
- **Server is authoritative.** All randomness and state changes (breeding, dice, sim ticks, recruiting) run server-side through the seeded RNG. The client may run genetics/render only for *preview*, never to mint horses or advance the sim.
- **Phenotype is derived, never stored.** Store `genotype` + `seed` (+ `glitch`) per horse; compute the look via `resolve()` + palette adapter on demand and cache. Same `(genotype, seed[, glitch])` must render pixel-identically.
- **Balance values live in one place.** All tunable numbers go in `balance.ts` from `BLORSE_PLAN.md` §14 — named constants, no magic numbers scattered in logic.
- **Cozy-first, no death.** No fail states. Non-viable breeding (`WW`/`OO`) reads as the deadpan "…but nothing happened." Worst adventure outcome is a meager haul + short cooldown.
- **Show, don't tell.** Communicate via images/icons; text is for names, numbers, and short flavor in the project's voice (whimsical, quirky, blunt, subtle dark humor).

## Canonical terms (from LORE.md — use these exact strings in code/UI)
- Player entity = **Herd**; home base = **the Pasture**; hub = **The Town**; recruitment pool = **the Tavern**; collection = **Field Guide**; currency = **Cubes** (copper/silver/gold).
- Regions: **Green Grass**, **Dusty Dunes**, **Weird Woods** (+ The Tundra later).
- Horses: **no sex/gender**, all **it/its**; parents are `parentA`/`parentB`. Breeding allowed only if the two share **no common ancestor** (§5.4a).
- **Foals render solid white**; real coat is revealed at adulthood. No aging visuals.
- **genes** = heritable (live-service drops); **glitches** = non-heritable render transforms (`inverted` first). Keep them separate; glitches never inherit.
- Default horse names: random fruit/veg; cosmetic only (identity = row ID in the URL).

## Project layout (target)
```
packages/genetics/   # vendored engine + typed facade + tests
packages/render-core/ # layer manifest types + palette adapter + glitch transforms
apps/web/            # React + Vite + PixiJS client
apps/server/         # Fastify + Drizzle + auth + game logic + autonomy sim
assets/layers/       # grayscale PNGs + manifest + palette-map.ts
balance.ts           # all §14 tuning constants
```

## Stack & conventions
- TypeScript everywhere; React + Vite (client), Fastify + Drizzle + PostgreSQL (server), PixiJS (rendering). pnpm workspaces.
- Prefer pure, testable modules (the genetics package has zero runtime deps). Determinism via injected seeded RNG.
- Update `BLORSE_PLAN.md` in the *same commit* when a public contract changes (e.g., the genetics facade or data model).

## Commands
pnpm via Corepack (`corepack enable`; version pinned in `package.json` → `packageManager`). No global `pnpm`? prefix with `corepack pnpm …`.
- **install:** `pnpm install`
- **dev:** `pnpm dev:server` (Fastify :3001, `GET /health` → `{status:"ok"}`) · `pnpm dev:web` (Vite :5173)
- **typecheck:** `pnpm typecheck` (`tsc --noEmit` per workspace) · **test:** `pnpm test` (vendored ~340-test suite lands Phase 1)
- **lint/format:** `pnpm lint` · `pnpm format` / `pnpm format:check` · **build:** `pnpm build`
- **CI:** `.github/workflows/ci.yml` runs install → typecheck → lint → format:check → test.
- **Workspaces:** `packages/{genetics,render-core}`, `apps/{web,server}`.

## Phase → plan-section map
- Phase 0 Scaffold → §3, §11
- Phase 1 Genetics (port + wrap) → §5
- Phase 2 Renderer + palette adapter → §4
- Phase 3 Persistence & accounts → §6
- Phase 4 Breeding loop → §5.4a, §7, §14.2
- Phase 5 Exploration & quests → §7
- Phase 6 Aging, care & daily rhythm → §2 (clock), §7
- Phase 7 The Pasture, gathering & crafting → §6, §7
- Phase 8 RPG progression → §9, §14
- Phase 9 The Living Herd (autonomy) → §8, §14
- Phase 10 Social & economy → §10
- Phase 11 Beta hardening → §11
