import { randomInt } from 'node:crypto';
import { ROAM_DROPS_MAX, ROAM_DROPS_MIN } from '@blorse/balance';
import { ADVENTURE_POOLS } from '../content/adventures.js';
import { REGION_BY_ID, REGIONS, type Region } from '../content/regions.js';
import type { DB } from '../db/client.js';
import { mulberry32 } from '../util/rng.js';
import { grantItems, type ItemStack } from './inventory.js';
import { isQuestCompleted, recordEvent, type QuestCompletion } from './quests.js';

export interface RegionView {
  id: string;
  name: string;
  tier: number;
  recommendedPower: number;
  unlocked: boolean;
  /** Has an authored scene library → the Explore "Set out" runs the interactive flow (§9.3). */
  interactive: boolean;
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
  | { ok: false; code: 'not_found' | 'locked'; message: string }
  | { ok: true; regionId: string; found: ItemStack[]; questCompletions: QuestCompletion[] };

/**
 * A paced roam in a region (BLORSE_PLAN.md §7): server-seeded loot roll → Materials
 * into the stash, and a 'roam' game event that advances any matching quest. Region
 * must be unlocked (quest-gated). No energy cap — pacing is one beat per action (§2).
 */
export async function roam(
  db: DB,
  herdId: string,
  regionId: string,
  seed?: number,
): Promise<RoamResult> {
  const region = REGION_BY_ID.get(regionId);
  if (!region) return { ok: false, code: 'not_found', message: 'No such region.' };
  if (!(await isQuestCompleted(db, herdId, region.requiresQuest))) {
    return { ok: false, code: 'locked', message: 'That region is not open yet.' };
  }

  const rng = mulberry32(seed ?? randomInt(1, 2 ** 31));
  const drops = ROAM_DROPS_MIN + Math.floor(rng() * (ROAM_DROPS_MAX - ROAM_DROPS_MIN + 1));
  const tally = new Map<string, number>();
  for (let i = 0; i < drops; i++) {
    const item = rollLoot(region, rng);
    tally.set(item, (tally.get(item) ?? 0) + 1);
  }
  const found: ItemStack[] = [...tally.entries()].map(([id, qty]) => ({ id, qty }));
  await grantItems(db, herdId, found);
  const questCompletions = await recordEvent(db, herdId, { type: 'roam', regionId });

  return { ok: true, regionId, found, questCompletions };
}
