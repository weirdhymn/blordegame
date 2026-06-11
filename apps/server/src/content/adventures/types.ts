import type { PersonalityKey, SkillKey, StatKey } from '@blorse/balance';

export interface ItemAmount {
  id: string;
  qty: number;
}

export interface SceneCheck {
  stat: StatKey;
  skill?: SkillKey;
  dc: number;
  /** Party harmony (avg pairwise OCEAN compatibility) buffs this check (cozy: buff only). */
  harmony?: boolean;
}

export interface Outcome {
  text: string;
  items?: ItemAmount[];
  cubes?: number;
  /** Soft, cozy cost — the party comes home wearier (flavor; never a wipe, never death). */
  fatigue?: number;
  /** Befriend a wild horse — it joins the herd as the narrative reward (no fee). */
  wild?: boolean;
  /** A boss battle (§9.4c): banks the run's haul + ends the run, then drops the party into combat
   *  against this enemy id — the deepest push. On victory the enemy's reward is the big prize. */
  battle?: string;
  /** Next scene id, or 'end' to finish the run and bank everything gathered. */
  next: string;
}

export interface Choice {
  id: string;
  text: string;
  /** Personality gate — only offered if a party member meets the trait bound. */
  requires?: { trait: PersonalityKey; min?: number; max?: number };
  /** Contested check; omit for a safe/narrative choice that always takes `success`. */
  check?: SceneCheck;
  success: Outcome;
  /** Taken on a failed check (soft). Defaults to `success` if omitted. */
  failure?: Outcome;
}

export interface Scene {
  id: string;
  /** Rising difficulty / reward tier (1, 2, 3…). */
  stage: number;
  text: string;
  choices: Choice[];
}

export interface AdventureScript {
  /** Stable id — a run stores which script it picked from its region's pool (§9.3). */
  id: string;
  /** Display name. Regular expeditions are randomized (no picker); this is shown for the deliberate
   *  Keeper challenge and used by tooling/tests. */
  name: string;
  regionId: string;
  start: string;
  scenes: Record<string, Scene>;
  /** A deliberate region-boss "Keeper" challenge — the §7 progression gate. Excluded from the random
   *  expedition pool and offered as a separate, EARNED option; its deepest ending hands off to the
   *  boss battle. Keeps day-to-day adventuring a surprise while the milestone fight stays a choice. */
  keeper?: boolean;
}

// ── VOICE & TONE STANDARD (the bar for every adventure script) ─────────────
// Benchmarks: "The Sunny Hollow" and "The Hollow-Keeper". Hold this bar — new stories must NOT drift
// flatter than the hand-crafted ones. The register:
//   • Second person, present tense. The party is "you / your party"; creatures are "it / its".
//   • Sensory and concrete FIRST — a specific smell, sound, or texture per beat ("warm and humming",
//     "ringing faintly underhoof like a struck bell"). Earn the whimsy with detail.
//   • Wry, deadpan understatement for the buttons — fond, never mean, never grim ("It is not
//     malicious. It is just extremely a bramble."). Aim for one good dry line per scene.
//   • Foes are characters with inner lives, not monsters — sympathetic even in opposition (the Keeper
//     "has been waiting a very long time for someone to be rude to it").
//   • Cozy stakes: a failed check is a meagre haul + a story, never a loss. Combat is opt-in & earned.
//   • Choices read as vivid verbs ("Shoulder the old gate aside", "Strike up a duet with the frogs").
//   • Outcomes are 1–2 sentences with a turn of phrase — no purple paragraphs.
// Every script MUST have: distinct stat checks across its scenes, ≥1 personality gate, and the
// push/bank fork (a "head home with your haul" option opposite a "press deeper" one).
//
