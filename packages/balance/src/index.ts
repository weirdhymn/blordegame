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

// ── §14.2 Heritability (at birth; clamp to scale) ───────────────────────────
export const PERSONALITY_INHERIT = 0.2; // small parental nudge
export const STAT_INHERIT = 0.7; // dominant parental weight
export const LUCK_INHERIT = 0.5;
export const STAT_TRAIN_SOFTCAP = 18; // 19–20 only by breeding/rare items
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

// ── Breeding (Phase 4) — v0 defaults; not pinned in §14 yet ──────────────────
/** Per-parent breeding cooldown. Under a day so a daily-rhythm player can re-breed. */
export const BREED_COOLDOWN_MS = 20 * 60 * 60 * 1000; // 20h
/** Foal → adult maturation (the white→color reveal lands at adulthood, Phase 6). */
export const FOAL_TO_ADULT_MS = 2 * 24 * 60 * 60 * 1000; // 2 days

// ── Exploration (Phase 5) — v0 dials ────────────────────────────────────────
export const ROAM_DROPS_MIN = 1;
export const ROAM_DROPS_MAX = 3;

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
/** Structure slots in a fresh Pasture; grows with herd level. */
export const PASTURE_BASE_SLOTS = 4;
export const PASTURE_SLOTS_PER_LEVEL = 1;

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
/** XP needed to go from level L to L+1 = SKILL_XP_PER_LEVEL × (L + 1). */
export const SKILL_XP_PER_LEVEL = 100;

// ── Adventures & the Tavern (Phase 8b, §9.3, §14.3–14.5) ────────────────────
export const ADVENTURE_XP = 30;
/** Per-adventure chance a wild horse appears — the main new-horse faucet (§9.3). */
export const WILD_ENCOUNTER_CHANCE = 0.5;
export const RARE_ITEM = 'rare-gem';

/** Interactive adventure scenes (§9.3): party harmony buffs `harmony` checks — cozy, buff-only. */
export const ADVENTURE_HARMONY_MAX = 4; // max DC reduction a tight-knit party grants a check
export const ADVENTURE_HARMONY_SCALE = 3; // avg pairwise OCEAN compatibility ÷ this → the bonus

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
