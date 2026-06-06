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
