import { and, eq, isNotNull, isNull, sql } from 'drizzle-orm';
import { BASE_FEE, FEE_MULT, RARITY_SCORE, SKILL_KEYS, STAT_KEYS } from '@blorse/balance';
import { resolve, type Genotype } from '@blorse/genetics';
import type { DB } from '../db/client.js';
import { herds, horses, type HorseRow } from '../db/schema.js';
import { getHorse } from './horse.js';
import type { SkillBlock, StatBlock } from './stats.js';

function rarityTier(genotype: Genotype): keyof typeof RARITY_SCORE {
  const r = resolve(genotype);
  if (r.flags.isWhiteMasked || r.flags.isGray) return 'rare'; // White/Gray are the rarest (§14.7)
  return 'common';
}

/** Recruitment fee from rarity + skills + stats (Luck excluded — it must not leak, §14.3). */
export function computeTavernFee(horse: Pick<HorseRow, 'genotype' | 'stats' | 'skills'>): number {
  const skills = horse.skills as SkillBlock;
  const stats = horse.stats as StatBlock;
  const rarityScore = RARITY_SCORE[rarityTier(horse.genotype)];
  const skillScore = Math.min(1, SKILL_KEYS.reduce((s, k) => s + (skills[k]?.level ?? 0), 0) / 40);
  const statScore = (STAT_KEYS.reduce((s, k) => s + (stats[k] ?? 0), 0) - 6) / (120 - 6);
  const persScore = 0.5; // neutral until personality lands (Phase 9)
  const score = 0.45 * rarityScore + 0.25 * skillScore + 0.2 * statScore + 0.1 * persScore;
  return Math.round((BASE_FEE * (1 + FEE_MULT * score)) / 5) * 5; // round to 5
}

export interface TavernHorseView {
  id: string;
  name: string;
  fee: number;
  firstEncounteredBy: string | null;
}

export async function listTavern(db: DB): Promise<TavernHorseView[]> {
  const rows = await db
    .select()
    .from(horses)
    .where(and(isNull(horses.herdId), isNotNull(horses.tavernFee)));
  return rows.map((h) => ({
    id: h.id,
    name: resolve(h.genotype).displayName,
    fee: h.tavernFee ?? 0,
    firstEncounteredBy: h.firstEncounteredBy,
  }));
}

export type RecruitResult =
  | { ok: false; code: 'not_found' | 'gone' | 'cant_afford'; message: string }
  | { ok: true; horseId: string; fee: number };

/** Recruit a Tavern horse for the fee. Atomic: only the first claimant wins (§10). */
export async function recruitFromTavern(
  db: DB,
  herdId: string,
  horseId: string,
): Promise<RecruitResult> {
  const h = await getHorse(db, horseId);
  if (!h || h.herdId !== null || h.tavernFee === null) {
    return { ok: false, code: 'not_found', message: 'That horse is not in the Tavern.' };
  }
  const herd = await db.query.herds.findFirst({ where: eq(herds.id, herdId) });
  if (!herd) return { ok: false, code: 'not_found', message: 'No herd.' };
  if (herd.cubes < h.tavernFee) {
    return { ok: false, code: 'cant_afford', message: 'Not enough Cubes for the fee.' };
  }

  // Atomic claim — succeeds only while the horse is still unowned.
  const claimed = await db
    .update(horses)
    .set({ herdId, tavernFee: null })
    .where(and(eq(horses.id, horseId), isNull(horses.herdId)))
    .returning({ id: horses.id });
  if (claimed.length === 0) {
    return { ok: false, code: 'gone', message: 'Someone else recruited it first.' };
  }

  await db
    .update(herds)
    .set({ cubes: sql`${herds.cubes} - ${h.tavernFee}` })
    .where(eq(herds.id, herdId));
  // firstEncounteredBy is retained for the recruit notification (delivered in Phase 9).
  return { ok: true, horseId, fee: h.tavernFee };
}
