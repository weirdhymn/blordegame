import { eq } from 'drizzle-orm';
import { PASTURE_BASE_SLOTS, PASTURE_SLOTS_PER_LEVEL } from '@blorse/balance';
import { STRUCTURE_BY_ID, STRUCTURES, type BuildCost } from '../content/structures.js';
import type { DB } from '../db/client.js';
import { herds, structures } from '../db/schema.js';
import { consumeItems } from './inventory.js';
import { spendCubes } from './wallet.js';

export function pastureCapacity(level: number): number {
  return PASTURE_BASE_SLOTS + Math.max(0, level - 1) * PASTURE_SLOTS_PER_LEVEL;
}

export interface PastureView {
  capacity: number;
  used: number;
  structures: { type: string; level: number }[];
  buildable: {
    type: string;
    name: string;
    skill: string;
    job: string;
    buildCost: BuildCost;
    built: boolean;
  }[];
}

export async function getPasture(db: DB, herdId: string): Promise<PastureView> {
  const herd = await db.query.herds.findFirst({ where: eq(herds.id, herdId) });
  const built = await db.select().from(structures).where(eq(structures.herdId, herdId));
  const builtTypes = new Set(built.map((b) => b.type));
  return {
    capacity: pastureCapacity(herd?.level ?? 1),
    used: built.length,
    structures: built.map((s) => ({ type: s.type, level: s.level })),
    buildable: STRUCTURES.map((s) => ({
      type: s.id,
      name: s.name,
      skill: s.skill,
      job: s.job,
      buildCost: s.buildCost,
      built: builtTypes.has(s.id),
    })),
  };
}

export type BuildResult =
  | { ok: false; code: 'unknown' | 'already_built' | 'full' | 'cant_afford'; message: string }
  | { ok: true; type: string };

/** Build a Structure in the Pasture: capacity + duplicate + cost gates, then place it (§7). */
export async function buildStructure(db: DB, herdId: string, type: string): Promise<BuildResult> {
  const def = STRUCTURE_BY_ID.get(type);
  if (!def) return { ok: false, code: 'unknown', message: 'No such structure.' };

  const herd = await db.query.herds.findFirst({ where: eq(herds.id, herdId) });
  if (!herd) return { ok: false, code: 'unknown', message: 'No herd.' };

  const built = await db
    .select({ type: structures.type })
    .from(structures)
    .where(eq(structures.herdId, herdId));
  if (built.some((b) => b.type === type)) {
    return { ok: false, code: 'already_built', message: 'You already have one.' };
  }
  if (built.length >= pastureCapacity(herd.level)) {
    return { ok: false, code: 'full', message: 'The Pasture is full — level up for more room.' };
  }
  if (herd.cubes < def.buildCost.cubes) {
    return { ok: false, code: 'cant_afford', message: 'Not enough Cubes.' };
  }

  // Pay (conditional) + consume materials + place in ONE transaction (§11 hardening): a shortfall
  // rolls everything back, and a racing duplicate hits the (herd, type) unique index → already_built
  // instead of a 500. The capacity pre-check above stays a friendly fast-fail.
  try {
    await db.transaction(async (tx) => {
      if ((await spendCubes(tx, herdId, def.buildCost.cubes)) === null) {
        throw new BuildFailed('cant_afford', 'Not enough Cubes.');
      }
      if (!(await consumeItems(tx, herdId, def.buildCost.items))) {
        throw new BuildFailed('cant_afford', 'Not enough building materials.');
      }
      const placed = await tx
        .insert(structures)
        .values({ herdId, type })
        .onConflictDoNothing()
        .returning({ id: structures.id });
      if (placed.length === 0) throw new BuildFailed('already_built', 'You already have one.');
    });
  } catch (e) {
    if (e instanceof BuildFailed) return { ok: false, code: e.code, message: e.message };
    throw e;
  }
  return { ok: true, type };
}

// Sentinel carrying the friendly failure out of the build transaction (rolls it back).
// (No TS parameter property — Node's strip-only mode can't erase those.)
class BuildFailed extends Error {
  readonly code: 'cant_afford' | 'already_built';
  constructor(code: 'cant_afford' | 'already_built', message: string) {
    super(message);
    this.code = code;
  }
}
