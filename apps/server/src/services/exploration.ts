import { randomInt } from 'node:crypto';
import {
  GATHER_PER_HORSE_PER_DAY,
  GRAIN_IDS,
  OMEN_GATHER_BONUS_QTY,
  ROAM_DROPS_MAX,
  ROAM_DROPS_MIN,
} from '@blorse/balance';
import { and, eq, inArray } from 'drizzle-orm';
import { ADVENTURE_POOLS } from '../content/adventures.js';
import { ITEM_BY_ID } from '../content/items.js';
import { REGION_BY_ID, REGIONS, type Region } from '../content/regions.js';
import type { DB } from '../db/client.js';
import { horses } from '../db/schema.js';
import { gameDay } from '../util/clock.js';
import { mulberry32 } from '../util/rng.js';
import { grantItems, type ItemStack } from './inventory.js';
import { omenFor } from './omens.js';
import { isQuestCompleted, recordEvent, type QuestCompletion } from './quests.js';

/** Today's omen as the client sees it — the voice line + a pre-worded qualitative hint (no
 *  balance numbers leak; the server owns the magnitudes). */
export interface RegionOmenView {
  id: string;
  name: string;
  text: string;
  hint: string | null;
}

export interface RegionView {
  id: string;
  name: string;
  tier: number;
  recommendedPower: number;
  unlocked: boolean;
  /** Has an authored scene library → the Explore "Set out" runs the interactive flow (§9.3). */
  interactive: boolean;
  /** The day's world weather over this region (§7) — the same sky for every herd. */
  omen: RegionOmenView | null;
}

const STAT_NAME: Record<string, string> = {
  str: 'Strength',
  dex: 'Dexterity',
  con: 'Constitution',
  int: 'Intelligence',
  wis: 'Wisdom',
  cha: 'Charisma',
};

function omenView(regionId: string, nowMs: number): RegionOmenView | null {
  const o = omenFor(regionId, gameDay(nowMs));
  if (!o) return null;
  const hint = o.stat
    ? `${STAT_NAME[o.stat] ?? o.stat} checks come a little easier here today.`
    : o.bonusItem
      ? `Foragers bring home extra ${ITEM_BY_ID.get(o.bonusItem)?.name ?? o.bonusItem} today.`
      : null;
  return { id: o.id, name: o.name, text: o.text, hint };
}

export async function listRegions(db: DB, herdId: string): Promise<RegionView[]> {
  const out: RegionView[] = [];
  for (const r of REGIONS) {
    out.push({
      id: r.id,
      name: r.name,
      tier: r.tier,
      recommendedPower: r.recommendedPower,
      unlocked: await isQuestCompleted(db, herdId, r.requiresQuest),
      interactive: (ADVENTURE_POOLS.get(r.id)?.length ?? 0) > 0,
      omen: omenView(r.id, Date.now()),
    });
  }
  return out;
}

function rollLoot(region: Region, rng: () => number): string {
  const total = region.loot.reduce((sum, e) => sum + e.weight, 0);
  let roll = rng() * total;
  for (const entry of region.loot) {
    roll -= entry.weight;
    if (roll < 0) return entry.item;
  }
  return region.loot[region.loot.length - 1]?.item ?? region.loot[0]?.item ?? 'plant-fiber';
}

export type RoamResult =
  | { ok: false; code: 'not_found' | 'locked' | 'no_horses' | 'already_gathered'; message: string }
  | {
      ok: true;
      regionId: string;
      found: ItemStack[];
      /** How many horses foraged this gather (each eligible adult forages once). */
      horsesGathered: number;
      /** Total adult horses in the herd (so the UI can say "N of M foraged"). */
      herdSize: number;
      questCompletions: QuestCompletion[];
    };

/** A horse's gathers used today (timestamp model → 0 or 1; the v0 cap is 1). */
function gathersToday(lastGatheredAt: Date | null, nowMs: number): number {
  return lastGatheredAt && gameDay(lastGatheredAt.getTime()) >= gameDay(nowMs) ? 1 : 0;
}

/**
 * The daily gather (BLORSE_PLAN.md §7) — passive, capped at GATHER_PER_HORSE_PER_DAY per owned
 * **adult** horse per calendar day. One action sends the whole stable foraging: every horse that is
 * still under its daily cap rolls ROAM_DROPS_MIN..MAX Materials from the region's loot table, banked
 * together, and is marked gathered for the day. So a bigger stable gathers more (every horse matters)
 * and raw-material inflation is throttled at the source. Region must be unlocked (quest-gated).
 *
 * NOTE: the timestamp cursor enforces the v0 cap of exactly 1/day; raising GATHER_PER_HORSE_PER_DAY
 * above 1 would need a same-day counter column (flagged follow-up).
 */
export async function roam(
  db: DB,
  herdId: string,
  regionId: string,
  nowMs: number,
  seed?: number,
): Promise<RoamResult> {
  const region = REGION_BY_ID.get(regionId);
  if (!region) return { ok: false, code: 'not_found', message: 'No such region.' };
  if (!(await isQuestCompleted(db, herdId, region.requiresQuest))) {
    return { ok: false, code: 'locked', message: 'That region is not open yet.' };
  }

  const stable = await db.query.horses.findMany({
    where: and(eq(horses.herdId, herdId), eq(horses.lifeStage, 'adult')),
  });
  if (stable.length === 0) {
    return { ok: false, code: 'no_horses', message: 'You need a grown horse to send foraging.' };
  }
  const eligible = stable.filter(
    (h) => gathersToday(h.lastGatheredAt, nowMs) < GATHER_PER_HORSE_PER_DAY,
  );
  if (eligible.length === 0) {
    return {
      ok: false,
      code: 'already_gathered',
      message: 'Your herd has already foraged today — back at the next sunrise.',
    };
  }

  // Each eligible horse forages once (seeded; a bigger stable simply rolls more times) and brings home
  // one random cooking grain (§7) — so grain supply scales with herd size, feeding the morning cook.
  // A gather omen (world weather) features one item today: each forager brings a little extra.
  // Read AFTER the seeded rolls each loop so the omen never shifts the RNG stream (same seed, same
  // base haul, omen day or not).
  const omen = omenFor(regionId, gameDay(nowMs));
  const rng = mulberry32(seed ?? randomInt(1, 2 ** 31));
  const tally = new Map<string, number>();
  for (let h = 0; h < eligible.length; h++) {
    const drops = ROAM_DROPS_MIN + Math.floor(rng() * (ROAM_DROPS_MAX - ROAM_DROPS_MIN + 1));
    for (let i = 0; i < drops; i++) {
      const item = rollLoot(region, rng);
      tally.set(item, (tally.get(item) ?? 0) + 1);
    }
    const grain = GRAIN_IDS[Math.floor(rng() * GRAIN_IDS.length)]!;
    tally.set(grain, (tally.get(grain) ?? 0) + 1);
    if (omen?.bonusItem) {
      tally.set(omen.bonusItem, (tally.get(omen.bonusItem) ?? 0) + OMEN_GATHER_BONUS_QTY);
    }
  }
  const found: ItemStack[] = [...tally.entries()].map(([id, qty]) => ({ id, qty }));
  await grantItems(db, herdId, found);
  await db
    .update(horses)
    .set({ lastGatheredAt: new Date(nowMs) })
    .where(
      inArray(
        horses.id,
        eligible.map((h) => h.id),
      ),
    );
  const questCompletions = await recordEvent(db, herdId, { type: 'roam', regionId });

  return {
    ok: true,
    regionId,
    found,
    horsesGathered: eligible.length,
    herdSize: stable.length,
    questCompletions,
  };
}
