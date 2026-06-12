import { randomInt } from 'node:crypto';
import { eq } from 'drizzle-orm';
import {
  BONDED_BREED_STAT_BONUS,
  BONDED_THRESHOLD,
  BREED_COOLDOWN_MS,
  STAT_KEYS,
  STAT_MAX,
} from '@blorse/balance';
import { breedFoal, punnett, resolve } from '@blorse/genetics';
import type { PunnettColor } from '@blorse/genetics';
import type { DB } from '../db/client.js';
import { horses, type HorseRow } from '../db/schema.js';
import { mulberry32 } from '../util/rng.js';
import { logAudit } from './audit.js';
import { getRelationships } from './autonomy.js';
import { getHorse, listHerdHorses, mintHorse, shareLineage } from './horse.js';
import { checkHerdCapacity } from './progression.js';
import { recordEvent } from './quests.js';

export type BreedRejection =
  | 'not_found'
  | 'not_owned'
  | 'not_adult'
  | 'cooldown'
  | 'related'
  | 'same_horse'
  | 'herd_full';

/** How the parents' bond lifted the foal — only present (non-null) when the bonus is > 0. */
export interface BondBreed {
  bonus: number;
  affinity: number;
  type: string | null;
}

export type BreedResult =
  | { ok: false; code: BreedRejection; message: string }
  | { ok: true; viable: false; message: string }
  | { ok: true; viable: true; foal: HorseRow; bond: BondBreed | null };

export interface BreedOptions {
  /** Inject the breeding RNG seed for deterministic/testable outcomes. */
  seed?: number;
  /** Inject the clock (cooldown checks/stamps) — testable like seed (audit §11). */
  nowMs?: number;
}

function onCooldown(h: HorseRow, now: number): boolean {
  return h.lastBredAt !== null && now - h.lastBredAt.getTime() < BREED_COOLDOWN_MS;
}

const pairKey = (x: string, y: string): string => (x < y ? `${x}|${y}` : `${y}|${x}`);

/**
 * Per-stat uplift a foal inherits from its parents' bond, graded by affinity (÷ BONDED_THRESHOLD,
 * capped at 1) — the same rapport reading the adventure harmony buff uses. A tight bond gives the
 * full {@link BONDED_BREED_STAT_BONUS}; strangers and rivals (≤ 0 affinity) give 0: cozy,
 * buff-only, never a penalty for breeding an un-bonded pair.
 */
export function bondedBreedBonus(affinity: number): number {
  const rapport = Math.max(0, Math.min(1, affinity / BONDED_THRESHOLD));
  return Math.round(BONDED_BREED_STAT_BONUS * rapport);
}

/** The stored relationship between two herd-mates, if one exists (order-independent). */
async function parentBond(
  db: DB,
  herdId: string,
  a: string,
  b: string,
): Promise<{ affinity: number; type: string | null } | null> {
  const key = pairKey(a, b);
  const rels = await getRelationships(db, herdId);
  const r = rels.find((x) => pairKey(x.horseA, x.horseB) === key);
  return r ? { affinity: r.affinity, type: r.type } : null;
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

  const now = opts.nowMs ?? Date.now();
  if (onCooldown(a, now) || onCooldown(b, now))
    return {
      ok: false,
      code: 'cooldown',
      message: 'A parent is still resting (breeding cooldown).',
    };

  if (await shareLineage(db, a.id, b.id))
    return { ok: false, code: 'related', message: 'These two share a common ancestor.' };

  // Herd-size cap (§7 progression): a viable foal needs a free roster slot. Motivating, not a wall.
  const room = await checkHerdCapacity(db, herdId);
  if (!room.ok) return { ok: false, code: 'herd_full', message: room.message };

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
    // stats/personality inheritance happens inside mintHorse → generateStatBlock (§9.1/§14.2).
  });

  // Bonds shape breeding (§8 → §14.2): a foal born to a close pair starts a little stronger. Reuses
  // the stored relationship graph — the same affinity the adventure harmony buff reads — on top of
  // the inheritance mintHorse already applied. Strangers/rivals add nothing (cozy, buff-only).
  const rel = await parentBond(db, herdId, a.id, b.id);
  const bonus = rel ? bondedBreedBonus(rel.affinity) : 0;
  let bornFoal = foal;
  if (bonus > 0) {
    const stats = foal.stats as Record<string, number>;
    const boosted: Record<string, number> = { ...stats };
    for (const k of STAT_KEYS) boosted[k] = Math.min(STAT_MAX, (stats[k] ?? 10) + bonus);
    const [updated] = await db
      .update(horses)
      .set({ stats: boosted })
      .where(eq(horses.id, foal.id))
      .returning();
    if (updated) bornFoal = updated;
  }
  const bond: BondBreed | null =
    bonus > 0 && rel ? { bonus, affinity: rel.affinity, type: rel.type } : null;

  const bredAt = new Date(now);
  await db.update(horses).set({ lastBredAt: bredAt }).where(eq(horses.id, a.id));
  await db.update(horses).set({ lastBredAt: bredAt }).where(eq(horses.id, b.id));

  await recordEvent(db, herdId, { type: 'breed' }); // advances breeding quests (§7)
  await logAudit(db, herdId, 'breed', {
    foal: bornFoal.id,
    parentA: a.id,
    parentB: b.id,
    bondBonus: bonus,
  });

  return { ok: true, viable: true, foal: bornFoal, bond };
}

/** A preview of the bond bonus these two would pass to a foal (only when statBonus > 0). */
export interface BondPreview {
  affinity: number;
  type: string | null;
  statBonus: number;
}

/** A hidden allele the foal might receive (§7n "the Registrar squints") — the engine's
 *  carrier summary, previously computed and thrown away. */
export interface CarrierWhisper {
  id: string;
  label: string;
  pLive: number;
}

export interface BreedingOdds {
  ok: true;
  related: boolean;
  distribution: PunnettColor[];
  lethalFraction: number;
  method: string;
  bond: BondPreview | null;
  carriers: CarrierWhisper[];
}

/** The quietest whispers aren't worth the ink; cap what the Registrar mentions. */
const CARRIER_MIN_P = 0.1;
const CARRIER_MAX = 4;

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
  // Preview the bond bonus too (§14.2) so the player sees the payoff before committing.
  const rel = a.herdId ? await parentBond(db, a.herdId, a.id, b.id) : null;
  const statBonus = rel ? bondedBreedBonus(rel.affinity) : 0;
  return {
    ok: true,
    related: await shareLineage(db, a.id, b.id),
    distribution: dist.distribution,
    lethalFraction: dist.lethalFraction,
    method: dist.method,
    bond: statBonus > 0 && rel ? { affinity: rel.affinity, type: rel.type, statBonus } : null,
    carriers: dist.carriers
      .filter((c) => c.pLive >= CARRIER_MIN_P)
      .sort((x, y) => y.pLive - x.pLive)
      .slice(0, CARRIER_MAX)
      .map((c) => ({ id: c.id, label: c.label, pLive: c.pLive })),
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
