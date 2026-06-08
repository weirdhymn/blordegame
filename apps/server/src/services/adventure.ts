import { randomInt } from 'node:crypto';
import { eq, sql } from 'drizzle-orm';
import {
  acceptChance,
  ADVENTURE_CUBES_PER_SUCCESS,
  ADVENTURE_XP,
  dcForTier,
  ENCOUNTERS_MAX,
  ENCOUNTERS_MIN,
  PARTY_MAX,
  RARE_ITEM,
  rareItemChance,
  SKILL_KEYS,
  STAT_KEYS,
  WILD_ENCOUNTER_CHANCE,
  type SkillKey,
} from '@blorse/balance';
import { randomGenotype, resolve } from '@blorse/genetics';
import { REGION_BY_ID } from '../content/regions.js';
import type { DB } from '../db/client.js';
import { herds, horses, type HorseRow } from '../db/schema.js';
import { mulberry32 } from '../util/rng.js';
import { getHorse, mintHorse } from './horse.js';
import { grantItems, type ItemStack } from './inventory.js';
import { rollWildPersonality } from './personality.js';
import { checkHerdCapacity } from './progression.js';
import { isQuestCompleted } from './quests.js';
import {
  accomplishmentsForLevel,
  grantSkillXp,
  skillCheck,
  type SkillBlock,
  type StatBlock,
} from './stats.js';
import { computeTavernFee } from './tavern.js';

const bestStat = (stats: StatBlock): number => Math.max(...STAT_KEYS.map((k) => stats[k] ?? 1));

function bestSkillKey(skills: SkillBlock): SkillKey {
  let best: SkillKey = 'reading';
  let level = -1;
  for (const k of SKILL_KEYS) {
    const l = skills[k]?.level ?? 0;
    if (l > level) {
      level = l;
      best = k;
    }
  }
  return best;
}

export interface Encounter {
  dc: number;
  d20: number;
  total: number;
  success: boolean;
  crit: boolean;
}

export interface WildOutcome {
  toTavern: boolean;
  horseId: string;
  name: string;
}

export type AdventureResult =
  | { ok: false; code: 'not_found' | 'locked' | 'bad_party'; message: string }
  | {
      ok: true;
      regionId: string;
      encounters: Encounter[];
      successes: number;
      loot: ItemStack[];
      /** Cubes earned (ADVENTURE_CUBES_PER_SUCCESS × successes) — adventuring's headline reward. */
      cubes: number;
      rareFound: number;
      wild: WildOutcome | null;
    };

export interface AdventureOptions {
  seed?: number;
  /** Force a wild-horse encounter (tests). */
  forceWild?: boolean;
}

/**
 * Send a party (1..PARTY_MAX) on a dice-driven adventure into a region (§9.3): an
 * encounter chain vs the region DC yields Materials + rare items, the party grows
 * skills, and a wild horse may appear — recruited into an open party slot (§14.4)
 * or sent to the Tavern (§10). Server-authoritative + seeded.
 */
export async function adventure(
  db: DB,
  herdId: string,
  regionId: string,
  partyIds: string[],
  opts: AdventureOptions = {},
): Promise<AdventureResult> {
  const region = REGION_BY_ID.get(regionId);
  if (!region) return { ok: false, code: 'not_found', message: 'No such region.' };
  if (!(await isQuestCompleted(db, herdId, region.requiresQuest))) {
    return { ok: false, code: 'locked', message: 'That region is not open yet.' };
  }
  if (partyIds.length < 1 || partyIds.length > PARTY_MAX) {
    return { ok: false, code: 'bad_party', message: `A party is 1–${PARTY_MAX} horses.` };
  }

  const party: HorseRow[] = [];
  for (const pid of partyIds) {
    const h = await getHorse(db, pid);
    if (!h || h.herdId !== herdId || h.lifeStage !== 'adult') {
      return { ok: false, code: 'bad_party', message: 'A party must be your adult horses.' };
    }
    party.push(h);
  }

  const rng = mulberry32(opts.seed ?? randomInt(1, 2 ** 31));
  const dc = dcForTier(region.tier);
  const nEnc = ENCOUNTERS_MIN + Math.floor(rng() * (ENCOUNTERS_MAX - ENCOUNTERS_MIN + 1));
  const lead = party.reduce((a, b) =>
    bestStat(b.stats as StatBlock) > bestStat(a.stats as StatBlock) ? b : a,
  );

  const encounters: Encounter[] = [];
  const tally = new Map<string, number>();
  let successes = 0;
  let rareFound = 0;
  let cubes = 0;

  for (let i = 0; i < nEnc; i++) {
    const stats = lead.stats as StatBlock;
    const skills = lead.skills as SkillBlock;
    const sk = bestSkillKey(skills);
    const check = skillCheck(bestStat(stats), skills[sk]?.level ?? 0, lead.luck, dc, rng);
    encounters.push({
      dc,
      d20: check.d20,
      total: check.total,
      success: check.success,
      crit: check.crit,
    });

    const pick = (idx: number): string => region.loot[idx]?.item ?? 'plant-fiber';
    if (check.success) {
      successes++;
      cubes += ADVENTURE_CUBES_PER_SUCCESS; // adventuring pays Cubes, not a materials firehose
      const item = pick(Math.floor(rng() * region.loot.length));
      tally.set(item, (tally.get(item) ?? 0) + 1);
      if (rng() < rareItemChance(region.tier, check.margin, check.crit)) {
        tally.set(RARE_ITEM, (tally.get(RARE_ITEM) ?? 0) + 1);
        rareFound++;
      }
    } else {
      const item = region.loot[region.loot.length - 1]?.item ?? 'plant-fiber'; // meager haul, never a loss
      tally.set(item, (tally.get(item) ?? 0) + 1);
    }
  }

  const loot: ItemStack[] = [...tally.entries()]
    .filter(([, qty]) => qty > 0)
    .map(([id, qty]) => ({ id, qty }));
  await grantItems(db, herdId, loot);
  if (cubes > 0) {
    await db
      .update(herds)
      .set({ cubes: sql`${herds.cubes} + ${cubes}` })
      .where(eq(herds.id, herdId));
  }

  // skill/stat growth for every party member
  for (const h of party) {
    const skills = h.skills as SkillBlock;
    const stats = h.stats as StatBlock;
    const ups = grantSkillXp(skills, stats, bestSkillKey(skills), ADVENTURE_XP);
    const accomplishments = new Set(h.accomplishments);
    for (const up of ups) {
      for (const acc of accomplishmentsForLevel(up.skill, up.newLevel)) accomplishments.add(acc);
    }
    await db
      .update(horses)
      .set({ skills, stats, accomplishments: [...accomplishments] })
      .where(eq(horses.id, h.id));
  }

  // wild encounter — rolled with the region's freqOverride (White/Gray rarest, §14.7)
  let wild: WildOutcome | null = null;
  if (opts.forceWild || rng() < WILD_ENCOUNTER_CHANCE) {
    const genotype = randomGenotype(region.freqOverride);
    const personality = rollWildPersonality(rng);
    const name = resolve(genotype).displayName;
    const avgCha = party.reduce((s, h) => s + ((h.stats as StatBlock).cha ?? 10), 0) / party.length;
    // A wild only joins if there's both a party slot AND a herd-roster slot; otherwise → Tavern (§7).
    const room = await checkHerdCapacity(db, herdId);
    const accepted =
      room.ok &&
      party.length < PARTY_MAX &&
      rng() < acceptChance(avgCha, personality.a, personality.n, personality.e);

    if (accepted) {
      const recruited = await mintHorse(db, {
        herdId,
        genotype,
        origin: 'wild',
        lifeStage: 'adult',
        personality,
      });
      wild = { toTavern: false, horseId: recruited.id, name };
    } else {
      const stray = await mintHorse(db, {
        herdId: null,
        genotype,
        origin: 'wild',
        lifeStage: 'adult',
        personality,
      });
      await db
        .update(horses)
        .set({ tavernFee: computeTavernFee(stray), firstEncounteredBy: herdId })
        .where(eq(horses.id, stray.id));
      wild = { toTavern: true, horseId: stray.id, name };
    }
  }

  return { ok: true, regionId, encounters, successes, loot, cubes, rareFound, wild };
}
