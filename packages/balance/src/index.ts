/**
 * @blorse/balance — every tunable number in one module (BLORSE_PLAN.md §14).
 *
 * These are v0 playtest dials, not architecture. Logic everywhere imports named
 * constants from here; no magic numbers scattered in services (CLAUDE.md golden rule).
 */

// ── §14.1 Scales & conventions ──────────────────────────────────────────────
export const STAT_MIN = 1;
export const STAT_MAX = 20;
/** D&D ability modifier: floor((stat − 10) / 2), range −5…+5. */
export const abilityMod = (stat: number): number => Math.floor((stat - 10) / 2);
/** Hidden Luck contribution: round((luck − 10) / 8), ≈ −1…+1. */
export const luckMod = (luck: number): number => Math.round((luck - 10) / 8);

export const PERSONALITY_MIN = 0;
export const PERSONALITY_MAX = 100;
export const PERSONALITY_MEAN = 50;

export const SKILL_MIN = 0;
export const SKILL_MAX = 10;

/** Cubes stored as integer copper-equivalent; 1 silver = 100 copper, 1 gold = 100 silver. */
export const CUBE_SILVER = 100;
export const CUBE_GOLD = 10_000;

/** Non-heritable glitch chance per new horse (§5.7) — independent of coat genetics. */
export const GLITCH_CHANCE = 0.001;

// ── §7l The Debug Shrine — deliberate glitch access (offering is content: 1 fairy dust) ──
/** Cubes to clear a glitch ("filing a bug report"). Cheap on purpose — cozy-first, nobody
 *  is stuck with a look they hate. */
export const SHRINE_PATCH_FEE = 50;

// ── §7m The Studbook — standing breeding goals (no rotation, no timers: cozy) ──
/** One-time Cube reward per fulfilled goal, by goal tier (Novice/Journeyman/Master pages).
 *  Lifetime total across all 13 goals ≈ 4,050 ⬡ — meaningful beside the tier ladder, not silly. */
export const STUDBOOK_TIER_CUBES: Record<number, number> = { 1: 100, 2: 250, 3: 600 };

// ── §7n The Naturalist's Purse — Field Guide milestones (one-time, automatic) ──
/** Coats-discovered thresholds → one-time Cube purses. The top threshold IS the full catalog
 *  (71 at beta — a content-integrity test pins this; a gene drop that grows the catalog should
 *  extend the ladder in the same change). Lifetime total 3,200 ⬡. */
export const FIELD_GUIDE_MILESTONES: { coats: number; cubes: number }[] = [
  { coats: 10, cubes: 150 },
  { coats: 25, cubes: 300 },
  { coats: 40, cubes: 500 },
  { coats: 55, cubes: 750 },
  { coats: 71, cubes: 1_500 },
];

// ── §7o Night Reading — crafted products feed the Living Herd (the craft→autonomy loop) ──
/** Reading XP one seeded horse gains from a nighttime Book (consumed). A solid bite — just
 *  over half a successful job day — so books matter without dethroning jobs as the trainer. */
export const NIGHT_READ_XP = 12;
/** Affinity nudge for the seeded pair at a Meeting-Hall game night (board games make friends).
 *  Gentle vs the daily compatibility drift — ~10 game nights ≈ a friendship from scratch. */
export const GAME_NIGHT_AFFINITY = 3;
/** Chance per game night that the board game wears out (consumed) — gentle re-demand for the
 *  Workshop, deadpan, never punishing (the night still happened). */
export const GAME_WEAR_CHANCE = 0.15;

// ── §7s A Parcel, With String — gifts ride letters (warmth-sized, never logistics) ──
/** Distinct item stacks one parcel can hold. */
export const PARCEL_MAX_STACKS = 5;
/** Per-stack quantity ceiling. A gift, not a freight contract. */
export const PARCEL_MAX_QTY = 20;

// ── §14.2 Heritability (at birth; clamp to scale) ───────────────────────────
export const PERSONALITY_INHERIT = 0.2; // small parental nudge
export const STAT_INHERIT = 0.7; // dominant parental weight
export const LUCK_INHERIT = 0.5;
export const STAT_TRAIN_SOFTCAP = 18; // 19–20 only by breeding/rare items
/**
 * A foal born to a genuinely bonded pair starts life a little stronger: each stat gets up to this
 * many points, graded by the parents' stored affinity (÷ BONDED_THRESHOLD, capped at 1) — so a
 * tight bond gives the full bonus, a budding rapport a fraction, and strangers/rivals nothing
 * (cozy, buff-only — no penalty for breeding an un-bonded pair). This is a *breeding-path* boost,
 * the sanctioned way past the training soft-cap toward 19–20 (see STAT_TRAIN_SOFTCAP). Reuses the
 * same affinity→rapport reading as the adventure harmony buff (§8).
 */
export const BONDED_BREED_STAT_BONUS = 2;
export const PERSONALITY_MUTATION = { chancePerTrait: 0.02, shiftMin: 15, shiftMax: 30 };

// ── §14.3 Recruitment fee (Tavern) ──────────────────────────────────────────
export const BASE_FEE = 75; // Cubes (copper-equiv)
export const FEE_MULT = 15;
export const RARITY_SCORE = {
  common: 0,
  uncommon: 0.25,
  rare: 0.5,
  exotic: 0.75,
  unnatural: 1.0,
} as const;

// ── §14.3a Uploading to The Cloud — a permanent horse sink; the parting gift is Cubes ───────
// reward = UPLOAD_BASE + UPLOAD_RARITY_BONUS·rarity + UPLOAD_TRAINING_BONUS·training  (adult)
// foal   = round(UPLOAD_BASE · UPLOAD_FOAL_FACTOR)  — coat unrevealed + untrained → minimal.
// It's a fond send-off, not a sale: rewards sit well under recruitment fees on purpose. Tune here.
export const UPLOAD_BASE = 20; // Cubes floor for any revealed (adult) horse
export const UPLOAD_RARITY_BONUS = 150; // max Cubes a rare coat adds (× rarity score 0..1)
export const UPLOAD_TRAINING_BONUS = 100; // max Cubes training adds (× training score 0..1)
export const UPLOAD_FOAL_FACTOR = 0.4; // a foal pays UPLOAD_BASE × this
/**
 * Rarity is DERIVED from the engine's phenotype features — it surfaces rare flags/patterns/
 * modifiers, NOT a continuous probability (§14.7) — so rarer features earn a bigger gift. 0..1.
 */
export const UPLOAD_RARITY_WEIGHTS = {
  grayOrWhite: 0.6, // isGray / isWhiteMasked — the rarest
  leopardOrSabino: 0.3, // isLeopard / sabinoWhite
  roan: 0.2, // hasRoan
  perModifier: 0.12, // each dilution / sooty / champagne / …
  perPattern: 0.08, // each named pattern (tobiano, …)
} as const;
export const UPLOAD_TRAINING_SKILL_DIV = 40; // Σ skill levels ÷ this, capped at 1
export const UPLOAD_TRAINING_STAT_DIV = 30; // Σ stat points above base-10 ÷ this, capped at 1
export const UPLOAD_TRAINING_SKILL_WEIGHT = 0.7; // skills vs. trained stats in the training score

// ── §14.4 Party & wild-accept ───────────────────────────────────────────────
export const PARTY_MAX = 4;

// ── §14.5 Adventure difficulty & loot ───────────────────────────────────────
export const dcForTier = (tier: number): number => 7 + 3 * tier; // T1=10 … T5=22
export const ENCOUNTERS_MIN = 3;
export const ENCOUNTERS_MAX = 5;
/** Adventuring leans toward Cubes/loot/story — NOT raw crafting materials (those come from the
 *  capped daily gather). A successful dice-adventure encounter pays this in Cubes so grindable
 *  adventuring is a Cube/loot source, not an alternate infinite firehose of materials. */
export const ADVENTURE_CUBES_PER_SUCCESS = 6;

// ── Breeding (Phase 4) — v0 defaults; not pinned in §14 yet ──────────────────
/** Per-parent breeding cooldown. Under a day so a daily-rhythm player can re-breed. */
export const BREED_COOLDOWN_MS = 20 * 60 * 60 * 1000; // 20h
/** Foal → adult maturation (the white→color reveal lands at adulthood, Phase 6). */
export const FOAL_TO_ADULT_MS = 2 * 24 * 60 * 60 * 1000; // 2 days

// ── Exploration (Phase 5) — v0 dials ────────────────────────────────────────
/** Per-horse drops from one daily gather (each eligible horse forages once). */
export const ROAM_DROPS_MIN = 1;
export const ROAM_DROPS_MAX = 3;
/** THE economy lever (§7): passive daily gathering is capped at this many gathers per owned (adult)
 *  horse per calendar day. So a bigger stable gathers more — every horse is mechanically valuable —
 *  and raw-material inflation is throttled at the source. Adventuring stays uncapped/grindable, but
 *  pays Cubes/loot (see ADVENTURE_CUBES_PER_SUCCESS), not bulk materials. v0 = once per horse per day. */
export const GATHER_PER_HORSE_PER_DAY = 1;

// ── Daily rhythm (Phase 6) ──────────────────────────────────────────────────
/** Cubes granted per daily rollover (login-catchup accrues one per missed day). */
export const DAILY_CUBES = 50;

// ── Onboarding / cold-start grant (Phase 3, §6) ─────────────────────────────
/** Founder adults granted to every new Herd. Two unrelated founders → they can breed at once. */
export const STARTER_HORSE_COUNT = 2;
/** Starting Cubes purse for a new Herd: three daily stipends. Enough to engage the economy
 *  (a craft, a save toward a first recruit) without immediately affording a standout Tavern
 *  horse — fees start at BASE_FEE (75) and climb with rarity. v0 dial. */
export const STARTING_CUBES = 3 * DAILY_CUBES; // 150

// ── The Pasture (Phase 7) ───────────────────────────────────────────────────
/** Structure slots in a fresh Pasture; grows with herd level (= Herd Tier, see HERD_TIERS). */
export const PASTURE_BASE_SLOTS = 4;
export const PASTURE_SLOTS_PER_LEVEL = 1;

// ── Herd progression spine (§6/§7): the ONE legible ladder ──────────────────
/** A single milestone gate on a tier-up. ALL gates on a tier must be met to buy it. The ids are
 *  resolved by the server (boss = a won battle vs that enemy; quest = completed; rareCoat = an owned
 *  horse with coatRarityScore ≥ minRarity). */
export type HerdTierGate =
  | { kind: 'quest'; questId: string; label: string }
  | { kind: 'boss'; enemyId: string; label: string }
  | { kind: 'rareCoat'; minRarity: number; label: string };

export interface HerdTier {
  /** Tier number = herds.level. */
  tier: number;
  name: string;
  /** Max horses the herd may hold (the master lever: more horses → more gather/jobs/adventures). */
  herdCap: number;
  /** Max horses that can hold an autonomy job at once. */
  jobSlots: number;
  /** Cubes to upgrade INTO this tier from the previous (tier 1 = 0, the start). */
  cost: number;
  /** Accomplishment gates (ALL required); [] = Cubes-only. Major jumps gate on playing the breadth. */
  gates: HerdTierGate[];
}

/** The progression spine. One ladder; each rung raises herdCap + jobSlots + (via pastureCapacity)
 *  structure slots together. Costs priced against measured income so days-to-tier stay ~4→11 (earned,
 *  not a wall) while income compounds 158→394/day. Tier-2 gate is a LIGHT early accomplishment (breed
 *  a foal); the major jumps gate on bosses + a rare coat so progression requires breadth, not farming. */
export const HERD_TIERS: HerdTier[] = [
  { tier: 1, name: 'Smallholding', herdCap: 6, jobSlots: 2, cost: 0, gates: [] },
  {
    tier: 2,
    name: 'Working Farm',
    herdCap: 10,
    jobSlots: 3,
    cost: 650,
    gates: [{ kind: 'quest', questId: 'a-new-foal', label: 'Breed your first foal' }],
  },
  {
    tier: 3,
    name: 'Ranch',
    herdCap: 15,
    jobSlots: 4,
    cost: 1250,
    gates: [
      {
        kind: 'boss',
        enemyId: 'gg-hollow-keeper',
        label: 'Defeat the Green Grass boss (the Hollow-Keeper)',
      },
    ],
  },
  {
    tier: 4,
    name: 'Estate',
    herdCap: 22,
    jobSlots: 5,
    cost: 2100,
    gates: [
      { kind: 'rareCoat', minRarity: 0.5, label: 'Own a rare-coated horse (rarity ≥ 0.5)' },
      {
        kind: 'boss',
        enemyId: 'dd-sandstone-sentinel',
        label: 'Defeat the Dusty Dunes boss (the Sandstone Sentinel)',
      },
    ],
  },
  {
    tier: 5,
    name: 'Dynasty',
    herdCap: 30,
    jobSlots: 6,
    cost: 3600,
    gates: [
      {
        kind: 'boss',
        enemyId: 'ww-mistwood-mimic',
        label: 'Defeat the Weird Woods boss (the Mistwood Mimic)',
      },
    ],
  },
];

export const HERD_TIER_BY_LEVEL = new Map(HERD_TIERS.map((t) => [t.tier, t]));
/** The herd-size cap for a level (clamps to the top tier). */
export const herdCapForLevel = (level: number): number =>
  (HERD_TIER_BY_LEVEL.get(level) ?? HERD_TIERS[HERD_TIERS.length - 1]!).herdCap;
/** The autonomy job-slot cap for a level. */
export const jobSlotsForLevel = (level: number): number =>
  (HERD_TIER_BY_LEVEL.get(level) ?? HERD_TIERS[HERD_TIERS.length - 1]!).jobSlots;

// ── RPG: stats, skills, jobs (Phase 8, §9, §14.6) ───────────────────────────
export type StatKey = 'str' | 'dex' | 'con' | 'int' | 'wis' | 'cha';
export type SkillKey = 'reading' | 'smithing' | 'baking' | 'foraging' | 'athletics' | 'performance';

export const STAT_KEYS: StatKey[] = ['str', 'dex', 'con', 'int', 'wis', 'cha'];
export const SKILL_KEYS: SkillKey[] = [
  'reading',
  'smithing',
  'baking',
  'foraging',
  'athletics',
  'performance',
];

/** Skill → governing stat (§14.6). */
export const SKILL_STAT: Record<SkillKey, StatKey> = {
  reading: 'int',
  smithing: 'str',
  baking: 'dex',
  foraging: 'wis',
  athletics: 'con',
  performance: 'cha',
};

/** Job difficulty + yields (§9.2) — low-risk, cozy: a poor roll just yields less. */
export const JOB_DC = 12;
export const JOB_CUBES_BASE = 10;
export const JOB_XP_BASE = 20;
/**
 * Seasoned adventurers work better (§9.3, jobs↔adventures): a horse that has earned the cosmetic
 * "Seasoned Adventurer" mark (adventures ≥ ADVENTURE_MARK_THRESHOLD) brings worldly experience to
 * its day job — a small DC reduction on its daily job check, so it succeeds (and crits) a little
 * more often. Buff-only (cozy — no penalty for a homebody), and the first real mechanical payoff
 * for the mark, which until now was pure flavor. Adventuring now makes a horse a better worker.
 */
export const JOB_SEASONED_DC_BONUS = 2;
/** XP needed to go from level L to L+1 = SKILL_XP_PER_LEVEL × (L + 1). */
export const SKILL_XP_PER_LEVEL = 100;

// ── Adventures & the Tavern (Phase 8b, §9.3, §14.3–14.5) ────────────────────
export const ADVENTURE_XP = 30; // flat-adventure XP to the lead's best skill (legacy path)
/** Interactive adventures train the *specific* skill a horse uses on a check (§9.3): a little XP
 *  per attempt, more on success. The horse that steps up for the check is the one that learns. */
export const ADVENTURE_SKILL_XP_SUCCESS = 12;
export const ADVENTURE_SKILL_XP_ATTEMPT = 5;
/** Completed interactive adventures a horse needs before it wears the cosmetic "Seasoned" mark. */
export const ADVENTURE_MARK_THRESHOLD = 3;
/** Per-adventure chance a wild horse appears — the main new-horse faucet (§9.3). */
export const WILD_ENCOUNTER_CHANCE = 0.5;
/** Expeditions a herd completes in a region before its boss "Keeper" challenge unlocks — so the
 *  tier-gating fight is EARNED by exploring the area, not stumbled into via a random reroll (§7/§9.4c). */
export const KEEPER_UNLOCK_EXPEDITIONS = 3;

// ── Daily region omens (§7/§9.3): world weather ─────────────────────────────
// One omen per region per game day, seeded by (region, day) ONLY — the same sky for every herd,
// derived never stored. Cozy: buff-only (a DC reduction on one stat's checks in that region, or a
// small gather kicker, or pure flavor) — weather never punishes.
/** DC reduction on the omen's stat for expedition checks in that region today. */
export const OMEN_CHECK_BONUS = 2;
/** Extra units of the omen's featured item each gathering horse brings home. */
export const OMEN_GATHER_BONUS_QTY = 1;

// ── The Garden (§7j): optional enrichment, never an obligation ───────────────
// Plant the crop itself (no seeds), harvest a real multiplier + sometimes a second resource.
// Cozy heart: withering RETURNS the planted crop (0 net loss) after a long, VISIBLE runway —
// full water tank → gradual drain → tier-scaled grace → only then wither.

/** Growth tiers (hours). Value rises with patience but only gently — a playstyle, not an answer. */
export const CROP_TIER_HOURS: Record<number, number> = { 1: 12, 2: 24, 3: 48, 4: 72, 5: 96 };
/** A full watering (manual or at planting) drains to dry over this many hours. */
export const GARDEN_WATER_DRAIN_H = 48;
/** Grace after the tank hits dry, before wither — scales with tier so slow crops are hard to
 *  lose: max(120h, 2× grow time). With the 48h tank: runway ≥ 7 days on every tier. */
export const gardenGraceH = (tierHours: number): number => Math.max(120, 2 * tierHours);
/** Garden plots ride the ONE progression spine: 2 + Herd Tier (3 at Smallholding → 7 at Dynasty). */
export const gardenPlotsForLevel = (level: number): number => 2 + Math.max(1, Math.min(5, level));
/** Manual watering while GROWING also hurries things: 10% of the tier time, but only when the
 *  tank is below this fraction (no spam-clicking a full tank). */
export const GARDEN_WATER_BONUS_FRACTION = 0.1;
export const GARDEN_WATER_TOPUP_BELOW = 0.8;
/** Basic fertilizer (the honest kind): grow-time multiplier (×0.8 → 20% faster). */
export const FERT_BASIC_TIME_MULT = 0.8;
/** Rich fertilizer: +1..2 extra base crops at harvest. */
export const FERT_RICH_BONUS_MIN = 1;
export const FERT_RICH_BONUS_MAX = 2;
/** Each horse produces one basic fertilizer per day — but only if the herd was fed (the communal
 *  cook) the prior day. A bonus for care, never a penalty for skipping (§7g principle). */
export const FERTILIZER_PER_HORSE_PER_DAY = 1;
/** The sprinkler (a Cubes sink): pay per day of runtime; while running it pins every tank full
 *  AND growth hours count this much extra (×1.125 ≈ 11% faster). Convenience, never "pay or die". */
export const SPRINKLER_CUBES_PER_DAY = 15;
export const SPRINKLER_MAX_DAYS = 14;
export const SPRINKLER_GROWTH_BONUS = 0.125;
export const RARE_ITEM = 'rare-gem';

/** Quick-sell (Inventory): modest per-item Cube values — a convenience dump for surplus materials,
 *  deliberately NOT an income strategy (gathering / adventuring / jobs are the real economy). Items
 *  absent from this map are NOT quick-sellable: grains feed the morning cook, Saffron Bloom + Healing
 *  Potion are reserved, cosmetics are kept. The lone valuable that IS sellable (rare-gem, a prestige
 *  drop meant to be cashed in) is gated behind a UI confirm so it can't be dumped by accident. */
export const ITEM_SELL_VALUE: Record<string, number> = {
  timber: 2,
  clay: 2,
  'plant-fiber': 2,
  ore: 2,
  'marsh-sage': 2,
  bone: 2,
  // garden crops (§7j) — same modest yardstick as raw materials
  radish: 2,
  carrot: 2,
  'carrot-greens': 2,
  pumpkin: 2,
  apple: 2,
  walnut: 2,
  plank: 4,
  brick: 4,
  paper: 4,
  ingot: 4,
  book: 8,
  'board-game': 8,
  tool: 8,
  'rare-gem': 40,
};
/** Selling one of these asks for a confirm first (valuable / easy to dump by accident). */
export const SELL_CONFIRM_IDS: readonly string[] = ['rare-gem'];

// ── Daily Care rituals: the cozy heartbeat (§6/§7) ──────────────────────────
// Two bookends — cook a stat buff in the MORNING, groom at NIGHT. Rewarding to do, GENTLE to skip
// (no penalties, no FOMO, no neglect spiral, ever). Both are whole-herd batch actions; the buff is
// daily and resets at the rollover. Ingredients come from the EXISTING gather/adventure drops.

/** Morning cook: each grain maps 1:1 to a stat — the mix you cook IS the day's stat loadout. The six
 *  grains cover every stat adventures / jobs / combat actually test. Item ids = `grain-<name>`. */
export const GRAIN_STAT: Record<string, StatKey> = {
  'grain-corn': 'str',
  'grain-oats': 'dex',
  'grain-barley': 'con',
  'grain-wheat': 'int',
  'grain-rice': 'wis',
  'grain-rye': 'cha',
};
export const GRAIN_IDS = Object.keys(GRAIN_STAT);
/** The FULL cook map (§7g + §7j): grains (a random gather byproduct) AND garden crops (grown on
 *  purpose) each feed one stat. The garden is the deliberate way to cook a chosen loadout;
 *  gathering stays the random way — same pot, two roads in. */
export const COOK_STAT: Record<string, StatKey> = {
  ...GRAIN_STAT,
  radish: 'dex',
  carrot: 'wis',
  'carrot-greens': 'con',
  pumpkin: 'str',
  apple: 'cha',
  walnut: 'int',
};
export const COOK_IDS = Object.keys(COOK_STAT);
/** The rare cooking ingredient — a far-rarer adventuring find that multiplies the whole dish. */
export const COOK_RARE_ITEM = 'saffron-bloom';

/** The communal pot holds one ingredient slot per herd horse (clamped 2..30). A bigger herd cooks a
 *  bigger meal — the herd-tier progression reward — while the per-stat cap stops one stat running away. */
export const cookSlots = (herdSize: number): number => Math.max(2, Math.min(30, herdSize));
/** Grains to MAX one stat; each grain of a stat = +1 to that stat's checks today (a DC −1). So a
 *  6-slot pot maxes one stat (+5); a 30-slot feast maxes all six (30 = 6×5). */
export const COOK_PER_STAT_CAP = 5;
/** Each rare amplifies the WHOLE dish by this (×1.5 for one, ×2 for two…) — the "save it for a big
 *  cook" payoff: a rare scales with how big a meal you already laid out. */
export const COOK_RARE_MULT = 0.5;
/** Absolute per-stat ceiling even with rares — bosses still need the class/approach puzzle. */
export const COOK_BUFF_HARD_CAP = 10;

/** Evening groom: a flat, deliberately SMALL next-morning Cubes bonus for tucking the herd in. Flat
 *  (not per-horse) + tiny vs daily income, so skipping is genuinely guilt-free — no FOMO, ever. */
export const GROOM_CUBES = 25;
/** A cosmetic "rough day" mood a full-party battle retreat leaves behind; grooming clears it. No
 *  stat penalty — a rattled horse isn't *worse*, it just wants cheering up (cozy). */
export const MOOD_CONTENT = 'content';
export const MOOD_RATTLED = 'rattled';

/**
 * Cook the communal pot (pure + deterministic, so server / tests / client-preview agree): `grains` is
 * an already-aggregated stat→count map; `rares` is how many rare ingredients went in. Per-stat buff =
 * min(count, PER_STAT_CAP) × (1 + RARE_MULT·rares), hard-capped. The buff is a DC reduction on that
 * stat's checks for the day.
 */
export function cookMeal(
  grains: Partial<Record<StatKey, number>>,
  rares = 0,
): Partial<Record<StatKey, number>> {
  const mult = 1 + COOK_RARE_MULT * Math.max(0, rares);
  const out: Partial<Record<StatKey, number>> = {};
  for (const [stat, count] of Object.entries(grains)) {
    if (!count || count <= 0) continue;
    const v = Math.min(COOK_BUFF_HARD_CAP, Math.round(Math.min(count, COOK_PER_STAT_CAP) * mult));
    if (v > 0) out[stat as StatKey] = v;
  }
  return out;
}

/**
 * Interactive adventure scenes (§9.3): party harmony buffs `harmony` checks — cozy, buff-only.
 * Each pair's rapport (0..1) is the stored **bond** if they have one (affinity ÷ BONDED_THRESHOLD,
 * capped at 1), else a *dimmer* personality-compatibility proxy (capped below a real bond). Avg
 * pairwise rapport × MAX → the DC reduction. So horses that have genuinely bonded over time (§8)
 * adventure better together than strangers who merely share a temperament; rivals just don't help.
 */
export const ADVENTURE_HARMONY_MAX = 4; // max DC reduction a tight-knit party grants a check
export const ADVENTURE_HARMONY_FRESH_DIV = 20; // un-bonded pair: personality compatibility ÷ this
export const ADVENTURE_HARMONY_FRESH_CAP = 0.55; // …and a fresh pair tops out below a true bond

/** Wild-horse accept odds (§14.4): charisma persuades, agreeable/extravert horses join, anxious hesitate. */
export function acceptChance(avgPartyCha: number, a: number, n: number, e: number): number {
  return Math.max(
    0.1,
    Math.min(
      0.9,
      0.5 +
        0.25 * ((avgPartyCha - 10) / 10) +
        0.15 * ((a - 50) / 50) -
        0.1 * ((n - 50) / 50) +
        0.05 * ((e - 50) / 50),
    ),
  );
}

/** Chance an encounter also drops a rare item (§14.5). */
export function rareItemChance(tier: number, margin: number, crit: boolean): number {
  return 0.02 + 0.025 * (tier - 1) + 0.01 * Math.max(0, Math.min(10, margin)) + (crit ? 0.15 : 0);
}

// ── The Living Herd: personality & autonomy (Phase 9, §8, §14.2) ────────────
export type PersonalityKey = 'o' | 'c' | 'e' | 'a' | 'n'; // OCEAN
export const PERSONALITY_KEYS: PersonalityKey[] = ['o', 'c', 'e', 'a', 'n'];

/** Affinity step for a maximally compatible pair, applied each daily tick. */
export const AFFINITY_STEP = 12;
export const FRIEND_THRESHOLD = 30;
export const BONDED_THRESHOLD = 80;
export const RIVAL_THRESHOLD = -30;
export const AFFINITY_MIN = -100;
export const AFFINITY_MAX = 200;
/** Cap pair-evaluations per herd per day so login-catchup stays cheap (§8.2). */
export const MAX_AUTONOMY_PAIRS = 60;
export const CLUB_MIN_MEMBERS = 2;

// ── §14.7 Combat (turn-based battles, §9.4) ─────────────────────────────────
// Cozy & no-death: a horse at 0 HP is "spooked" (out for the fight, fine after — a nap); a full
// party wipe is a *retreat* home with reduced rewards, never a loss. Reuses skillCheck + DEX +
// the bond graph. HP is battle-scoped (every fight starts full; nothing persists).
//
// The four **approaches** — the damage "types" — map 1:1 onto existing stats + job-skills, so a
// horse's specialization *is* its battle role (the weakness puzzle reads them; the minimum's
// generic Attack just uses a horse's best approach stat).
export type Approach = 'confront' | 'outwit' | 'skirmish' | 'soothe';
export const APPROACHES: Approach[] = ['confront', 'outwit', 'skirmish', 'soothe'];
export const APPROACH_STAT: Record<Approach, StatKey> = {
  confront: 'str', // the Knight — meet it head-on
  outwit: 'int', // the Wizard — feint, exploit, read it
  skirmish: 'dex', // the Rogue — quick, nimble, precise
  soothe: 'cha', // the Cleric — social stat; Soothe *damage* reads kindness (see KINDNESS_STAT_DIV)
};
export const APPROACH_SKILL: Record<Approach, SkillKey> = {
  confront: 'smithing', // the Forge
  outwit: 'reading', // the Library
  skirmish: 'athletics', // the Track (agility)
  soothe: 'performance', // the Stage
};

// ── §9.4b Classes — an identity + themed-ability layer OVER the approaches, NOT a separate track.
// A horse picks a class (freely re-assignable); each maps to a signature approach, but the horse's
// existing STATS decide how good it is (a high-STR horse = a strong Knight; a kind horse = a strong
// Cleric). So classes extend our emergent specialization — they don't replace it. No class XP,
// multiclassing, or gear gating. The class is how party composition answers an enemy's weakness.
export type HorseClass = 'knight' | 'wizard' | 'rogue' | 'cleric';
export const HORSE_CLASSES: HorseClass[] = ['knight', 'wizard', 'rogue', 'cleric'];
export const CLASS_APPROACH: Record<HorseClass, Approach> = {
  knight: 'confront', // Strength
  wizard: 'outwit', // Cleverness
  rogue: 'skirmish', // Dexterity / evasion
  cleric: 'soothe', // Benevolence (kindness) + the Mend heal
};
/** The Cleric's Mend restores this + the Cleric's kindness to an ally (kind Clerics heal harder). */
export const CLERIC_MEND_BASE = 14;

export const HP_BASE = 20; // every combatant's floor HP
export const HP_PER_CON = 3; // + this per point of Constitution (horses); enemies author maxHp
export const COMBAT_GUARD_BASE = 10; // DC to land a clean blow; + the target's CON ability mod
export const COMBAT_DMG_BASE = 6; // damage of a clean hit, before the attacker's stat mod
export const COMBAT_DMG_GLANCE = 2; // a failed swing still chips (cozy — never a 0-damage feel-bad)
export const COMBAT_DMG_CRIT_BONUS = 6; // extra on a crit (nat-20 / margin ≥ 10, from skillCheck)
export const COMBAT_DEFEND_MULT = 0.5; // Defend halves the next incoming hit (until your next turn)
export const COMBAT_FLEE_DC = 12; // a DEX check to slip away (cozy: a miss only costs the turn)
export const POTION_HEAL_HP = 30; // Healing Potion restores this to a conscious horse…
export const POTION_REVIVE_HP = 20; // …or rouses a spooked (KO'd) horse back to this (clutch revive)
export const REWARD_RETREAT_FRACTION = 0.4; // a full-party retreat still banks this share of Cubes

// Approach ↔ weakness (the tactical heart, §9.4a). A party attack picks an approach; an enemy is
// weak to one (×WEAKNESS) and may resist one (×RESIST). Reading the foe's *tell* and matching the
// right approach with the right horse is the core decision. Cozy: a "wrong" approach just does
// less, never a punish; even a resisted hit still chips (≥1).
export const COMBAT_WEAKNESS_MULT = 1.5; // damage × this when the approach hits the foe's weakness
export const COMBAT_RESIST_MULT = 0.5; // …× this when the foe resists the approach
// Soothe is the *kind* approach: its power comes from Benevolence (the Agreeableness trait), not a
// core stat — so kind/Benevolent horses earn a real combat role. Kindness = Agreeableness ÷ this on
// the 0–20 stat scale (A 100 → 20, A 50 → 10). (APPROACH_STAT.soothe='cha' is only its social
// governing stat, reserved for later social checks; Soothe *damage* reads kindness.)
export const KINDNESS_STAT_DIV = 5;
