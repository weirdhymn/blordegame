/**
 * Adventure content barrel (§9.3) — the scripts live per region under ./adventures/ (with the
 * shared types + the VOICE & TONE standard in ./adventures/types.ts); this module assembles the
 * canonical registry. Importers keep this stable path. The concatenation order below IS the
 * canonical ADVENTURE_SCRIPTS order (the seeded pool draw depends on it — do not reorder).
 */
import { DUSTY_DUNES_SCRIPTS } from './adventures/dusty-dunes.js';
import { GREEN_GRASS_SCRIPTS } from './adventures/green-grass.js';
import type { AdventureScript } from './adventures/types.js';
import { WEIRD_WOODS_SCRIPTS } from './adventures/weird-woods.js';

export type {
  AdventureScript,
  Choice,
  ItemAmount,
  Outcome,
  Scene,
  SceneCheck,
} from './adventures/types.js';

export const ADVENTURE_SCRIPTS: AdventureScript[] = [
  ...GREEN_GRASS_SCRIPTS,
  ...DUSTY_DUNES_SCRIPTS,
  ...WEIRD_WOODS_SCRIPTS,
];

/** Each region's pool of RANDOM expeditions — a run picks one (seeded) at startRun (§9.3). Keeper
 *  challenges are deliberately EXCLUDED here so day-to-day adventuring is a surprise, never a reroll
 *  hunting for the boss (see REGION_KEEPER for the separate, earned milestone fight). */
export const ADVENTURE_POOLS = new Map<string, AdventureScript[]>();
for (const s of ADVENTURE_SCRIPTS) {
  if (s.keeper) continue;
  const pool = ADVENTURE_POOLS.get(s.regionId);
  if (pool) pool.push(s);
  else ADVENTURE_POOLS.set(s.regionId, [s]);
}

/** The deliberate region-boss "Keeper" challenge per region (the §7 progression gate) — offered as
 *  its own option once earned, never in the random pool above. */
export const REGION_KEEPER = new Map<string, AdventureScript>();
for (const s of ADVENTURE_SCRIPTS) if (s.keeper) REGION_KEEPER.set(s.regionId, s);

/** Resolve a run's chosen script by its stored id — a run stays on its script (§9.3). Includes
 *  keepers, so a deliberate keeper challenge resolves by id even though it's out of the pool. */
export const ADVENTURE_BY_ID = new Map(ADVENTURE_SCRIPTS.map((s) => [s.id, s]));
