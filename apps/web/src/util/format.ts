import { CUBE_GOLD, CUBE_SILVER } from '@blorse/balance';

/** Turn an id like "plant-fiber" / "reading-circle" into "Plant Fiber" / "Reading Circle". */
export function pretty(id: string): string {
  return id
    .split('-')
    .map((w) => (w ? w.charAt(0).toUpperCase() + w.slice(1) : w))
    .join(' ');
}

/**
 * Proper Change (§7n): balances are stored in copper-equivalent, but the fiction says three
 * metals (§2 — Cubes come in copper, silver, gold). 1,275 → "12s 75c"; 23,450 → "2g 34s 50c".
 * Zero parts are skipped; a flat zero reads "0c". Prices/fees stay plain ⬡ (copper) — only
 * the purse wears its denominations.
 */
export function formatCubes(copper: number): string {
  const c = Math.max(0, Math.floor(copper));
  const gold = Math.floor(c / CUBE_GOLD);
  const silver = Math.floor((c % CUBE_GOLD) / CUBE_SILVER);
  const rest = c % CUBE_SILVER;
  const parts: string[] = [];
  if (gold > 0) parts.push(`${gold}g`);
  if (silver > 0) parts.push(`${silver}s`);
  if (rest > 0 || parts.length === 0) parts.push(`${rest}c`);
  return parts.join(' ');
}
