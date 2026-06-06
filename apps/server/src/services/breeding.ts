import { randomInt } from 'node:crypto';
import { eq } from 'drizzle-orm';
import { BREED_COOLDOWN_MS } from '@blorse/balance';
import { breedFoal, punnett, resolve } from '@blorse/genetics';
import type { PunnettColor } from '@blorse/genetics';
import type { DB } from '../db/client.js';
import { horses, type HorseRow } from '../db/schema.js';
import { mulberry32 } from '../util/rng.js';
import { getHorse, listHerdHorses, mintHorse, shareLineage } from './horse.js';

export type BreedRejection =
  | 'not_found'
  | 'not_owned'
  | 'not_adult'
  | 'cooldown'
  | 'related'
  | 'same_horse';

export type BreedResult =
  | { ok: false; code: BreedRejection; message: string }
  | { ok: true; viable: false; message: string }
  | { ok: true; viable: true; foal: HorseRow };

export interface BreedOptions {
  /** Inject the breeding RNG seed for deterministic/testable outcomes. */
  seed?: number;
}

function onCooldown(h: HorseRow, now: number): boolean {
  return h.lastBredAt !== null && now - h.lastBredAt.getTime() < BREED_COOLDOWN_MS;
}

/**
 * Server-authoritative breeding (BLORSE_PLAN.md §5.4a, §7). Gates: both owned by the
 * herd, both adult, neither on cooldown, no shared ancestor, not the same horse.
 * Runs `breedFoal` through a seeded RNG; a non-viable cross (WW/OO) resolves as the
 * deadpan "…but nothing happened." and — being cozy — does NOT burn the cooldown.
 */
export async function breedHorses(
  db: DB,
  herdId: string,
  parentAId: string,
  parentBId: string,
  opts: BreedOptions = {},
): Promise<BreedResult> {
  if (parentAId === parentBId)
    return { ok: false, code: 'same_horse', message: 'A horse cannot breed with itself.' };

  const a = await getHorse(db, parentAId);
  const b = await getHorse(db, parentBId);
  if (!a || !b) return { ok: false, code: 'not_found', message: 'Horse not found.' };
  if (a.herdId !== herdId || b.herdId !== herdId)
    return { ok: false, code: 'not_owned', message: 'Both horses must be in your herd.' };
  if (a.lifeStage !== 'adult' || b.lifeStage !== 'adult')
    return { ok: false, code: 'not_adult', message: 'Both horses must be adults.' };

  const now = Date.now();
  if (onCooldown(a, now) || onCooldown(b, now))
    return {
      ok: false,
      code: 'cooldown',
      message: 'A parent is still resting (breeding cooldown).',
    };

  if (await shareLineage(db, a.id, b.id))
    return { ok: false, code: 'related', message: 'These two share a common ancestor.' };

  const seed = opts.seed ?? randomInt(1, 2 ** 31);
  const result = breedFoal(a.genotype, b.genotype, mulberry32(seed));

  if (!result.viable) {
    // Cozy framing (§5, §8): the cross didn't take. No foal, no cooldown — soft retry.
    return { ok: true, viable: false, message: '…but nothing happened.' };
  }

  const foal = await mintHorse(db, {
    herdId,
    genotype: result.genotype,
    origin: 'bred',
    lifeStage: 'foal', // renders solid white until adulthood (§4.2)
    parentA: a.id,
    parentB: b.id,
    // glitch intentionally omitted — foals never inherit one (§5.4a/§5.7).
    // personality + stats inheritance land with those systems (Phase 8/9).
  });

  const bredAt = new Date(now);
  await db.update(horses).set({ lastBredAt: bredAt }).where(eq(horses.id, a.id));
  await db.update(horses).set({ lastBredAt: bredAt }).where(eq(horses.id, b.id));

  return { ok: true, viable: true, foal };
}

export interface BreedingOdds {
  ok: true;
  related: boolean;
  distribution: PunnettColor[];
  lethalFraction: number;
  method: string;
}

/** Foal-color odds preview (`punnett`) for the breeding UI (BLORSE_PLAN.md §5.3, Phase 4). */
export async function breedingOdds(
  db: DB,
  parentAId: string,
  parentBId: string,
): Promise<BreedingOdds | { ok: false }> {
  const a = await getHorse(db, parentAId);
  const b = await getHorse(db, parentBId);
  if (!a || !b) return { ok: false };
  const dist = punnett(a.genotype, b.genotype);
  return {
    ok: true,
    related: await shareLineage(db, a.id, b.id),
    distribution: dist.distribution,
    lethalFraction: dist.lethalFraction,
    method: dist.method,
  };
}

export interface PedigreeNode {
  id: string;
  name: string | null;
  displayName: string;
  lifeStage: string;
  parents: PedigreeNode[];
}

/** Recursive pedigree view up to `depth` generations (BLORSE_PLAN.md Phase 4). */
export async function pedigree(db: DB, id: string, depth = 3): Promise<PedigreeNode | null> {
  const h = await getHorse(db, id);
  if (!h) return null;
  const node: PedigreeNode = {
    id: h.id,
    name: h.name,
    displayName: resolve(h.genotype).displayName,
    lifeStage: h.lifeStage,
    parents: [],
  };
  if (depth > 0) {
    for (const parentId of [h.parentA, h.parentB]) {
      if (parentId) {
        const p = await pedigree(db, parentId, depth - 1);
        if (p) node.parents.push(p);
      }
    }
  }
  return node;
}

/** Herd-mates this horse can breed with (adult, unrelated). Powers the UI's grey-out. */
export async function eligibleMates(db: DB, herdId: string, horseId: string): Promise<HorseRow[]> {
  const subject = await getHorse(db, horseId);
  if (!subject || subject.herdId !== herdId || subject.lifeStage !== 'adult') return [];
  const candidates = await listHerdHorses(db, herdId);
  const eligible: HorseRow[] = [];
  for (const cand of candidates) {
    if (cand.id === horseId || cand.lifeStage !== 'adult') continue;
    if (await shareLineage(db, horseId, cand.id)) continue;
    eligible.push(cand);
  }
  return eligible;
}
