import { and, eq, sql } from 'drizzle-orm';
import {
  SKILL_KEYS,
  STAT_KEYS,
  UPLOAD_BASE,
  UPLOAD_FOAL_FACTOR,
  UPLOAD_RARITY_BONUS,
  UPLOAD_RARITY_WEIGHTS,
  UPLOAD_TRAINING_BONUS,
  UPLOAD_TRAINING_SKILL_DIV,
  UPLOAD_TRAINING_SKILL_WEIGHT,
  UPLOAD_TRAINING_STAT_DIV,
} from '@blorse/balance';
import { resolve, type Genotype } from '@blorse/genetics';
import type { DB } from '../db/client.js';
import { adventureRuns, herds, horses, type HorseRow } from '../db/schema.js';
import { logAudit } from './audit.js';
import { getRelationships } from './autonomy.js';
import { getHorse } from './horse.js';
import type { SkillBlock, StatBlock } from './stats.js';

// ── Reward (server-authoritative — the client never computes the payout) ─────
/**
 * Coat rarity 0..1, DERIVED from the engine's phenotype features. The engine surfaces rare
 * *flags / patterns / modifiers*, not a continuous probability (§14.7), so a rarer coat (more /
 * rarer features — Gray, White, leopard, dilutions…) earns a bigger parting gift. Capped at 1.
 */
export function coatRarityScore(genotype: Genotype): number {
  const p = resolve(genotype);
  const w = UPLOAD_RARITY_WEIGHTS;
  let r = 0;
  if (p.flags.isGray || p.flags.isWhiteMasked) r += w.grayOrWhite;
  if (p.flags.isLeopard || p.flags.sabinoWhite) r += w.leopardOrSabino;
  if (p.flags.hasRoan) r += w.roan;
  r += p.modifiers.length * w.perModifier;
  r += p.patterns.length * w.perPattern;
  return Math.max(0, Math.min(1, r));
}

/** Training 0..1 from leveled skills + stat points trained above base-10. */
function trainingScore(horse: Pick<HorseRow, 'skills' | 'stats'>): number {
  const skills = horse.skills as SkillBlock;
  const stats = horse.stats as StatBlock;
  const skillSum = SKILL_KEYS.reduce((s, k) => s + (skills[k]?.level ?? 0), 0);
  const statBonus = STAT_KEYS.reduce((s, k) => s + Math.max(0, (stats[k] ?? 0) - 10), 0);
  const skillScore = Math.min(1, skillSum / UPLOAD_TRAINING_SKILL_DIV);
  const statScore = Math.min(1, statBonus / UPLOAD_TRAINING_STAT_DIV);
  const w = UPLOAD_TRAINING_SKILL_WEIGHT;
  return Math.max(0, Math.min(1, w * skillScore + (1 - w) * statScore));
}

export interface RewardBreakdown {
  reward: number;
  isFoal: boolean;
  rarityScore: number;
  trainingScore: number;
}

export function computeUploadReward(
  horse: Pick<HorseRow, 'genotype' | 'skills' | 'stats' | 'lifeStage'>,
): RewardBreakdown {
  if (horse.lifeStage === 'foal') {
    // Coat unrevealed + untrained → a token thanks only (§14.3a).
    return {
      reward: Math.round(UPLOAD_BASE * UPLOAD_FOAL_FACTOR),
      isFoal: true,
      rarityScore: 0,
      trainingScore: 0,
    };
  }
  const rarityScore = coatRarityScore(horse.genotype);
  const tScore = trainingScore(horse);
  const reward = Math.round(
    UPLOAD_BASE + UPLOAD_RARITY_BONUS * rarityScore + UPLOAD_TRAINING_BONUS * tScore,
  );
  return { reward, isFoal: false, rarityScore, trainingScore: tScore };
}

// ── Guards ───────────────────────────────────────────────────────────────────
/** A horse currently out on an active adventure run can't be uploaded (footgun guard). */
async function isOnActiveRun(db: DB, herdId: string, horseId: string): Promise<boolean> {
  const runs = await db.query.adventureRuns.findMany({
    where: and(eq(adventureRuns.herdId, herdId), eq(adventureRuns.status, 'active')),
  });
  return runs.some((r) => r.party.includes(horseId));
}

// ── Quote (read-only preview that feeds the confirmation) ────────────────────
export interface UploadBond {
  name: string;
  type: string | null;
  affinity: number;
}
export type UploadQuote =
  | { ok: false; code: 'not_found' }
  | {
      ok: true;
      horse: { id: string; name: string; coat: string; lifeStage: string };
      reward: number;
      isFoal: boolean;
      onAdventure: boolean;
      relationships: UploadBond[];
    };

export async function uploadQuote(db: DB, herdId: string, horseId: string): Promise<UploadQuote> {
  const horse = await getHorse(db, horseId);
  if (!horse || horse.herdId !== herdId) return { ok: false, code: 'not_found' };
  const { reward, isFoal } = computeUploadReward(horse);
  const onAdventure = await isOnActiveRun(db, herdId, horseId);
  const rels = (await getRelationships(db, herdId)).filter(
    (r) => r.horseA === horseId || r.horseB === horseId,
  );
  const relationships: UploadBond[] = [];
  for (const r of rels) {
    const other = await getHorse(db, r.horseA === horseId ? r.horseB : r.horseA);
    relationships.push({
      name: other?.name ?? (other ? resolve(other.genotype).displayName : 'a herdmate'),
      type: r.type,
      affinity: r.affinity,
    });
  }
  return {
    ok: true,
    horse: {
      id: horse.id,
      name: horse.name ?? resolve(horse.genotype).displayName,
      coat: resolve(horse.genotype).displayName,
      lifeStage: horse.lifeStage,
    },
    reward,
    isFoal,
    onAdventure,
    relationships,
  };
}

// ── The send-off — deletes the horse, grants the gift (server-authoritative) ──
export type UploadResult =
  | { ok: false; code: 'not_found' | 'on_adventure'; message: string }
  | { ok: true; reward: number; name: string; coat: string };

export async function uploadHorse(db: DB, herdId: string, horseId: string): Promise<UploadResult> {
  const horse = await getHorse(db, horseId);
  if (!horse || horse.herdId !== herdId) {
    return { ok: false, code: 'not_found', message: 'That horse is not in your herd.' };
  }
  if (await isOnActiveRun(db, herdId, horseId)) {
    return {
      ok: false,
      code: 'on_adventure',
      message: 'That horse is out on an adventure — bring the party home first.',
    };
  }
  // Re-compute server-side so the gift always matches what was quoted.
  const { reward } = computeUploadReward(horse);
  const name = horse.name ?? resolve(horse.genotype).displayName;
  const coat = resolve(horse.genotype).displayName;

  // FK-clean removal: a single horse may be a *parent* (parentA/parentB have no cascade), so null
  // those child links first, then delete — the delete cascades ancestry (horse_ancestors), jobs,
  // relationships, and market listings (the same FK surface debug Reset relies on). No dangling rows.
  await db.update(horses).set({ parentA: null }).where(eq(horses.parentA, horseId));
  await db.update(horses).set({ parentB: null }).where(eq(horses.parentB, horseId));
  await db.delete(horses).where(eq(horses.id, horseId));

  // The parting gift — reuse the Cubes economy (no new currency).
  await db
    .update(herds)
    .set({ cubes: sql`${herds.cubes} + ${reward}` })
    .where(eq(herds.id, herdId));
  await logAudit(db, herdId, 'upload', { horseId, reward, coat });
  return { ok: true, reward, name, coat };
}
