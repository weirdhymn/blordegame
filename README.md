# blorsegame (BLORSE)

A cozy, asynchronous multiplayer life-sim about a herd of pixel horses in a digital
world: a real-genetics breeding engine, exploration, a DnD-style RPG layer, and an
autonomous "living herd" simulation.

- **Source of truth:** [`BLORSE_PLAN.md`](./BLORSE_PLAN.md) · **canonical names:** [`LORE.md`](./LORE.md) · **operating brief:** [`CLAUDE.md`](./CLAUDE.md)
- **Status:** Phase 0 (scaffold). See `BLORSE_PLAN.md` §11 for the phase roadmap.

## Quick start

```sh
corepack enable          # provisions the pinned pnpm (see package.json#packageManager)
pnpm install
pnpm dev:server          # Fastify on :3001  (GET /health -> {"status":"ok"})
pnpm dev:web             # Vite on :5173
```

No global `pnpm`? Use Corepack's passthrough: `corepack pnpm <args>`.

## Workspace

| Path | What |
| :--- | :--- |
| `packages/genetics` | Vendored genetics engine + typed facade + tests (Phase 1) |
| `packages/render-core` | Layer manifest + palette adapter + glitch transforms (Phase 2) |
| `apps/web` | React + Vite + PixiJS client |
| `apps/server` | Fastify + Drizzle + game logic + autonomy sim |
| `assets/layers` | Grayscale layer PNGs + manifest + palette map (Phase 2) |

## Scripts

`pnpm typecheck` · `pnpm lint` · `pnpm format` / `format:check` · `pnpm test` · `pnpm build`
