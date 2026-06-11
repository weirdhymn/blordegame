import { and, count, eq } from 'drizzle-orm';
import {
  COOK_RARE_ITEM,
  cookMeal,
  cookSlots,
  GRAIN_IDS,
  GRAIN_STAT,
  GROOM_CUBES,
  MOOD_CONTENT,
  MOOD_RATTLED,
  type StatKey,
} from '@blorse/balance';
import type { DB } from '../db/client.js';
import { herds, horses } from '../db/schema.js';
import { gameDay } from '../util/clock.js';
import { consumeItems, getInventory } from './inventory.js';
import { recordEvent } from './quests.js';

/** The herd's LIVE meal buff (per-stat DC reduction) — only while it was cooked *today*, else {}. */
export async function getMealBuff(
  db: DB,
  herdId: string,
  nowMs: number,
): Promise<Record<string, number>> {
  const herd = await db.query.herds.findFirst({ where: eq(herds.id, herdId) });
  if (!herd || herd.mealDay == null || herd.mealDay !== gameDay(nowMs)) return {};
  return herd.mealBuffs ?? {};
}

async function herdHorseCount(db: DB, herdId: string): Promise<number> {
  const rows = await db.select({ n: count() }).from(horses).where(eq(horses.herdId, herdId));
  return rows[0]?.n ?? 0;
}

export interface CareState {
  cookedToday: boolean;
  /** Live per-stat buff (empty if not cooked today). */
  mealBuffs: Record<string, number>;
  /** Pot capacity = one slot per herd horse (clamped). */
  slots: number;
  herdSize: number;
  /** Grain pantry: each cookable grain + the stat it feeds + how many you hold. */
  grains: { id: string; stat: string; qty: number }[];
  /** Rare cooking ingredients in the pantry. */
  rares: number;
  /** A groom is queued — its Cubes bonus arrives at the next sunrise. */
  groomed: boolean;
  groomCubes: number;
  /** Horses currently in a rough mood (grooming soothes them). */
  rattled: number;
}

export async function getCareState(db: DB, herdId: string, nowMs: number): Promise<CareState> {
  const herd = await db.query.herds.findFirst({ where: eq(herds.id, herdId) });
  const stable = await db
    .select({ id: horses.id, mood: horses.mood })
    .from(horses)
    .where(eq(horses.herdId, herdId));
  const inv = await getInventory(db, herdId);
  const qtyOf = (id: string): number => inv.find((s) => s.id === id)?.qty ?? 0;
  const cookedToday = herd?.mealDay != null && herd.mealDay === gameDay(nowMs);
  return {
    cookedToday,
    mealBuffs: cookedToday ? (herd?.mealBuffs ?? {}) : {},
    slots: cookSlots(stable.length),
    herdSize: stable.length,
    grains: GRAIN_IDS.map((id) => ({ id, stat: GRAIN_STAT[id]!, qty: qtyOf(id) })),
    rares: qtyOf(COOK_RARE_ITEM),
    groomed: herd?.groomBonusPending ?? false,
    groomCubes: GROOM_CUBES,
    rattled: stable.filter((h) => h.mood === MOOD_RATTLED).length,
  };
}

export type CookResult =
  | { ok: false; code: 'empty_pot' | 'too_many' | 'cant_afford'; message: string }
  | { ok: true; mealBuffs: Record<string, number>; slots: number };

/**
 * Cook the communal morning pot. `grainCounts` maps grain item-ids → how many of each to add;
 * `rares` is how many rare ingredients. The pot holds one slot per herd horse; the cooked mix is the
 * day's stat loadout (a DC reduction on each buffed stat's checks). Cozy: nothing is gated behind it.
 */
export async function cook(
  db: DB,
  herdId: string,
  grainCounts: Record<string, number>,
  rares: number,
  nowMs: number,
): Promise<CookResult> {
  // Request-shape guard (not balance): a real pot only ever holds the six grains; refuse landslides.
  if (Object.keys(grainCounts).length > 32) {
    return { ok: false, code: 'too_many', message: 'That is not a pot, that is a landslide.' };
  }
  const slots = cookSlots(await herdHorseCount(db, herdId));
  const rareN = Math.max(0, Math.floor(rares || 0));
  const consume: { id: string; qty: number }[] = [];
  const byStat: Partial<Record<StatKey, number>> = {};
  let totalGrains = 0;
  for (const [grainId, raw] of Object.entries(grainCounts)) {
    const count = Math.max(0, Math.floor(raw || 0));
    if (count <= 0) continue;
    const stat = GRAIN_STAT[grainId];
    if (!stat) continue; // ignore non-grain ids
    consume.push({ id: grainId, qty: count });
    byStat[stat] = (byStat[stat] ?? 0) + count;
    totalGrains += count;
  }
  if (rareN > 0) consume.push({ id: COOK_RARE_ITEM, qty: rareN });

  const total = totalGrains + rareN;
  if (total <= 0)
    return { ok: false, code: 'empty_pot', message: 'Add some grain to the pot first.' };
  if (total > slots) {
    return {
      ok: false,
      code: 'too_many',
      message: `Your pot holds ${slots} ingredients (one per horse) — a bigger herd cooks a bigger meal.`,
    };
  }
  // Consume the ingredients + set the meal in ONE transaction (§11 hardening) — the pantry can
  // never be eaten without the day's buff landing.
  const mealBuffs = cookMeal(byStat, rareN);
  let paid = false;
  await db.transaction(async (tx) => {
    paid = await consumeItems(tx, herdId, consume);
    if (!paid) return;
    await tx
      .update(herds)
      .set({ mealDay: gameDay(nowMs), mealBuffs })
      .where(eq(herds.id, herdId));
  });
  if (!paid) {
    return {
      ok: false,
      code: 'cant_afford',
      message: 'You do not have those ingredients in the pantry.',
    };
  }
  await recordEvent(db, herdId, { type: 'cook' }); // advances the first-day rhythm quest (§7i)
  return { ok: true, mealBuffs, slots };
}

export interface GroomResult {
  ok: true;
  /** How many rough-mood horses were soothed back to content. */
  soothed: number;
  /** The Cubes bonus that will arrive at the next sunrise (flat — guilt-free to skip). */
  pendingCubes: number;
}

/** Evening groom — tuck the whole herd in: clear rough moods now, and queue a small morning Cubes
 *  bonus collected at the next daily rollover. Deliberately gentle: skipping is never penalized. */
export async function groom(db: DB, herdId: string): Promise<GroomResult> {
  const soothed = await db
    .update(horses)
    .set({ mood: MOOD_CONTENT })
    .where(and(eq(horses.herdId, herdId), eq(horses.mood, MOOD_RATTLED)))
    .returning({ id: horses.id });
  await db.update(herds).set({ groomBonusPending: true }).where(eq(herds.id, herdId));
  await recordEvent(db, herdId, { type: 'groom' }); // advances the first-day rhythm quest (§7i)
  return { ok: true, soothed: soothed.length, pendingCubes: GROOM_CUBES };
}
