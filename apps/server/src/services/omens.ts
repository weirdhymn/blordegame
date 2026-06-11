import { OMENS_BY_REGION, type Omen } from '../content/omens.js';
import { mulberry32 } from '../util/rng.js';

// Distinct salt so the day's omen is independent of every other seeded draw.
const OMEN_SALT = 0x0c0a51;

// FNV-1a over the region id — a stable numeric handle for the seed.
function regionHash(id: string): number {
  let h = 2166136261;
  for (let i = 0; i < id.length; i++) {
    h = Math.imul(h ^ id.charCodeAt(i), 16777619);
  }
  return h >>> 0;
}

/**
 * The region's omen for a game day — WORLD weather (§7/§9.3): seeded by (region, day) only, so
 * every herd sees the same mist over Green Grass. Derived, never stored; deterministic across
 * restarts and instances. Null only for a region with no omen table (none today).
 */
export function omenFor(regionId: string, day: number): Omen | null {
  const pool = OMENS_BY_REGION.get(regionId);
  if (!pool || pool.length === 0) return null;
  const rng = mulberry32((regionHash(regionId) ^ Math.imul(day + 1, 0x9e3779b9) ^ OMEN_SALT) >>> 0);
  return pool[Math.floor(rng() * pool.length)] ?? null;
}
