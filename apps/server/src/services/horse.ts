import { randomInt } from 'node:crypto';
import { eq } from 'drizzle-orm';
import { resolve, type Genotype } from '@blorse/genetics';
import {
  buildRenderSpec,
  type GlitchKind,
  type LifeStage,
  type RenderSpec,
} from '@blorse/render-core';
import type { DB } from '../db/client.js';
import { horseAncestors, horses, type HorseRow } from '../db/schema.js';
import { mulberry32 } from '../util/rng.js';
import { recordDiscovery } from './fieldguide.js';
import { generateStatBlock } from './stats.js';

export interface MintInput {
  herdId: string | null;
  genotype: Genotype;
  origin: 'founder' | 'wild' | 'bred';
  seed?: number;
  glitch?: GlitchKind | null;
  lifeStage?: LifeStage;
  name?: string | null;
  parentA?: string | null;
  parentB?: string | null;
  /** Override generated stats/luck/skills (tests, special horses). */
  stats?: Record<string, number>;
  luck?: number;
  skills?: Record<string, { level: number; xp: number }>;
}

/** Store a new horse (genotype + seed [+ glitch]) and materialize its lineage closure. */
export async function mintHorse(db: DB, input: MintInput): Promise<HorseRow> {
  const seed = input.seed ?? randomInt(1, 2 ** 31);
  // Stats/luck: inherited from parents (bred) or rolled (wild) — §9.1/§14.2.
  const gen = await generateStatBlock(
    db,
    input.parentA,
    input.parentB,
    mulberry32((seed ^ 0x5bf03635) >>> 0),
  );
  const [horse] = await db
    .insert(horses)
    .values({
      herdId: input.herdId,
      genotype: input.genotype,
      seed,
      glitch: input.glitch ?? null,
      lifeStage: input.lifeStage ?? 'foal',
      name: input.name ?? null,
      origin: input.origin,
      parentA: input.parentA ?? null,
      parentB: input.parentB ?? null,
      stats: input.stats ?? gen.stats,
      luck: input.luck ?? gen.luck,
      skills: input.skills ?? gen.skills,
      accomplishments: gen.accomplishments,
    })
    .returning();
  if (!horse) throw new Error('failed to mint horse');
  await materializeAncestors(db, horse.id, [input.parentA, input.parentB]);
  // Adults reveal their coat immediately → enter the Field Guide. Foals are white
  // until they mature (the reveal is recorded then, by the daily check-in).
  if (horse.herdId && horse.lifeStage === 'adult') {
    await recordDiscovery(db, horse.herdId, horse);
  }
  return horse;
}

/** A horse's ancestors = its parents ∪ each parent's ancestors (BLORSE_PLAN.md §5.4a). */
async function materializeAncestors(
  db: DB,
  horseId: string,
  parents: Array<string | null | undefined>,
): Promise<void> {
  const direct = parents.filter((p): p is string => typeof p === 'string');
  if (direct.length === 0) return;
  const ancestors = new Set<string>(direct);
  for (const parentId of direct) {
    const rows = await db
      .select({ id: horseAncestors.ancestorId })
      .from(horseAncestors)
      .where(eq(horseAncestors.horseId, parentId));
    for (const row of rows) ancestors.add(row.id);
  }
  await db
    .insert(horseAncestors)
    .values([...ancestors].map((ancestorId) => ({ horseId, ancestorId })));
}

export async function getHorse(db: DB, id: string): Promise<HorseRow | null> {
  return (await db.query.horses.findFirst({ where: eq(horses.id, id) })) ?? null;
}

export async function listHerdHorses(db: DB, herdId: string): Promise<HorseRow[]> {
  return db.query.horses.findMany({ where: eq(horses.herdId, herdId) });
}

async function ancestorIds(db: DB, horseId: string): Promise<string[]> {
  const rows = await db
    .select({ id: horseAncestors.ancestorId })
    .from(horseAncestors)
    .where(eq(horseAncestors.horseId, horseId));
  return rows.map((r) => r.id);
}

/**
 * Are two horses related at all? Breeding is allowed ONLY when this is false
 * (§5.4a). Each horse counts as part of its own lineage, so this also blocks
 * parent×child and ancestor×descendant — not just shared-ancestor pairs.
 */
export async function shareLineage(db: DB, a: string, b: string): Promise<boolean> {
  if (a === b) return true;
  const setA = new Set(await ancestorIds(db, a));
  setA.add(a);
  const setB = new Set(await ancestorIds(db, b));
  setB.add(b);
  for (const id of setB) {
    if (setA.has(id)) return true;
  }
  return false;
}

// --- render-on-demand cache (BLORSE_PLAN.md §6: derive the look on demand + cache) ---
const specCache = new Map<string, RenderSpec>();
const SPEC_CACHE_MAX = 5000;

export function horseRenderSpec(
  horse: Pick<HorseRow, 'genotype' | 'seed' | 'glitch' | 'lifeStage'>,
): RenderSpec {
  const key = `${JSON.stringify(horse.genotype)}|${horse.seed}|${horse.glitch ?? ''}|${horse.lifeStage}`;
  const cached = specCache.get(key);
  if (cached) return cached;
  const spec = buildRenderSpec(resolve(horse.genotype), {
    seed: horse.seed,
    glitch: horse.glitch,
    lifeStage: horse.lifeStage,
  });
  if (specCache.size >= SPEC_CACHE_MAX) {
    const oldest = specCache.keys().next().value;
    if (oldest !== undefined) specCache.delete(oldest);
  }
  specCache.set(key, spec);
  return spec;
}
