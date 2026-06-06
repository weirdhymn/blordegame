import { randomInt, randomUUID } from 'node:crypto';
import { eq, sql } from 'drizzle-orm';
import {
  ADVENTURE_HARMONY_MAX,
  ADVENTURE_HARMONY_SCALE,
  PARTY_MAX,
  type PersonalityKey,
  type SkillKey,
  type StatKey,
} from '@blorse/balance';
import { randomGenotype, resolve } from '@blorse/genetics';
import {
  ADVENTURE_BY_REGION,
  type Choice,
  type Outcome,
  type Scene,
} from '../content/adventures.js';
import { REGION_BY_ID } from '../content/regions.js';
import type { DB } from '../db/client.js';
import { herds, type HorseRow } from '../db/schema.js';
import { mulberry32 } from '../util/rng.js';
import { getHorse, mintHorse } from './horse.js';
import { grantItems, type ItemStack } from './inventory.js';
import { compatibility, rollWildPersonality, type Personality } from './personality.js';
import { isQuestCompleted } from './quests.js';
import { skillCheck, type SkillBlock, type StatBlock } from './stats.js';

// ── Run state ────────────────────────────────────────────────────────────────
// Lives in an in-memory per-process store for the vertical slice. Runs are short
// (a few choices) and server-authoritative. PRODUCTION TODO: swap RUNS for a small
// `adventureRuns` table so runs survive a restart / multiple instances (§9.3).
export interface RunState {
  id: string;
  herdId: string;
  regionId: string;
  party: string[];
  seed: number;
  step: number;
  sceneId: string;
  loot: Record<string, number>;
  cubes: number;
  fatigue: number;
  befriended: string | null; // name of a wild horse who joined this run
  status: 'active' | 'ended';
}

const RUNS = new Map<string, RunState>();

// Deterministic per-step RNG derived from (seed, step) — same inputs, same dice (testable).
function stepRng(seed: number, step: number, salt = 0x9e3779b9): () => number {
  return mulberry32((seed ^ Math.imul(step + 1, salt)) >>> 0);
}

// ── Harmony, gating, party selection (pure) ──────────────────────────────────
/** Avg pairwise OCEAN compatibility → a small DC reduction (cozy: buff only, 0..MAX). */
export function partyHarmony(party: HorseRow[]): number {
  if (party.length < 2) return 0;
  let sum = 0;
  let pairs = 0;
  for (let i = 0; i < party.length; i++) {
    for (let j = i + 1; j < party.length; j++) {
      const a = party[i];
      const b = party[j];
      if (!a || !b) continue;
      sum += compatibility(a.personality as Personality, b.personality as Personality);
      pairs++;
    }
  }
  if (pairs === 0) return 0;
  const bonus = Math.round(sum / pairs / ADVENTURE_HARMONY_SCALE);
  return Math.max(0, Math.min(ADVENTURE_HARMONY_MAX, bonus));
}

/** Does any party member satisfy a personality gate? (no gate → always true) */
export function partyMeets(
  party: HorseRow[],
  req?: { trait: PersonalityKey; min?: number; max?: number },
): boolean {
  if (!req) return true;
  return party.some((h) => {
    const v = (h.personality as Personality)[req.trait] ?? 50;
    return (req.min === undefined || v >= req.min) && (req.max === undefined || v <= req.max);
  });
}

/** The choices a party may actually pick in a scene (gated ones still listed, flagged unavailable). */
export function availableChoices(scene: Scene, party: HorseRow[]): Choice[] {
  return scene.choices.filter((c) => partyMeets(party, c.requires));
}

// The party member who steps up for a check: best at the governing stat (+skill, weighted).
function bestForCheck(
  party: HorseRow[],
  stat: StatKey,
  skill?: SkillKey,
): { statValue: number; skillLevel: number; luck: number } {
  const score = (h: HorseRow): number =>
    ((h.stats as StatBlock)[stat] ?? 10) +
    (skill ? ((h.skills as SkillBlock)[skill]?.level ?? 0) * 2 : 0);
  const best = party.reduce((a, b) => (score(b) > score(a) ? b : a));
  return {
    statValue: (best.stats as StatBlock)[stat] ?? 10,
    skillLevel: skill ? ((best.skills as SkillBlock)[skill]?.level ?? 0) : 0,
    luck: best.luck,
  };
}

export interface ChoiceResolution {
  outcome: Outcome;
  /** Present when the choice had a check; absent for safe/narrative choices. */
  roll: { d20: number; total: number; dc: number; success: boolean; harmony: number } | null;
}

/**
 * PURE scene resolution: roll the choice's check for the party's best horse, apply the
 * party-harmony buff (as a DC reduction), and pick success vs. failure. No DB, no I/O —
 * this is the unit under test.
 */
export function resolveChoice(
  party: HorseRow[],
  choice: Choice,
  rng: () => number,
): ChoiceResolution {
  if (!choice.check) return { outcome: choice.success, roll: null };
  const { stat, skill, dc, harmony } = choice.check;
  const who = bestForCheck(party, stat, skill);
  const bonus = harmony ? partyHarmony(party) : 0;
  const check = skillCheck(who.statValue, who.skillLevel, who.luck, dc - bonus, rng);
  const outcome = check.success ? choice.success : (choice.failure ?? choice.success);
  return {
    outcome,
    roll: { d20: check.d20, total: check.total, dc, success: check.success, harmony: bonus },
  };
}

// ── Run lifecycle (store + DB side-effects) ──────────────────────────────────
async function loadParty(db: DB, herdId: string, ids: string[]): Promise<HorseRow[] | null> {
  const party: HorseRow[] = [];
  for (const id of ids) {
    const h = await getHorse(db, id);
    if (!h || h.herdId !== herdId || h.lifeStage !== 'adult') return null;
    party.push(h);
  }
  return party;
}

interface SceneView {
  id: string;
  stage: number;
  text: string;
  choices: {
    id: string;
    text: string;
    available: boolean;
    requires: { trait: PersonalityKey; min?: number; max?: number } | null;
    check: { stat: StatKey; skill: SkillKey | null; dc: number; harmony: boolean } | null;
  }[];
}

function sceneView(scene: Scene, party: HorseRow[]): SceneView {
  return {
    id: scene.id,
    stage: scene.stage,
    text: scene.text,
    choices: scene.choices.map((c) => ({
      id: c.id,
      text: c.text,
      available: partyMeets(party, c.requires),
      requires: c.requires ?? null,
      check: c.check
        ? {
            stat: c.check.stat,
            skill: c.check.skill ?? null,
            dc: c.check.dc,
            harmony: !!c.check.harmony,
          }
        : null,
    })),
  };
}

interface RunView {
  runId: string;
  regionId: string;
  stage: number;
  loot: ItemStack[];
  cubes: number;
  fatigue: number;
  befriended: string | null;
}

function runView(run: RunState, stage: number): RunView {
  return {
    runId: run.id,
    regionId: run.regionId,
    stage,
    loot: Object.entries(run.loot).map(([id, qty]) => ({ id, qty })),
    cubes: run.cubes,
    fatigue: run.fatigue,
    befriended: run.befriended,
  };
}

export type StartResult =
  | { ok: false; code: 'no_script' | 'locked' | 'bad_party'; message: string }
  | { ok: true; runId: string; scene: SceneView; run: RunView };

export interface StartOptions {
  seed?: number;
}

/** Begin an interactive adventure run in a region that has an authored scene library. */
export async function startRun(
  db: DB,
  herdId: string,
  regionId: string,
  partyIds: string[],
  opts: StartOptions = {},
): Promise<StartResult> {
  const script = ADVENTURE_BY_REGION.get(regionId);
  if (!script) return { ok: false, code: 'no_script', message: 'No story for that region yet.' };
  const region = REGION_BY_ID.get(regionId);
  if (!region || !(await isQuestCompleted(db, herdId, region.requiresQuest))) {
    return { ok: false, code: 'locked', message: 'That region is not open yet.' };
  }
  if (partyIds.length < 1 || partyIds.length > PARTY_MAX) {
    return { ok: false, code: 'bad_party', message: `A party is 1–${PARTY_MAX} horses.` };
  }
  const party = await loadParty(db, herdId, partyIds);
  if (!party)
    return { ok: false, code: 'bad_party', message: 'A party must be your adult horses.' };

  const start = script.scenes[script.start];
  if (!start) return { ok: false, code: 'no_script', message: 'That story is misconfigured.' };

  const run: RunState = {
    id: randomUUID(),
    herdId,
    regionId,
    party: partyIds,
    seed: opts.seed ?? randomInt(1, 2 ** 31),
    step: 0,
    sceneId: script.start,
    loot: {},
    cubes: 0,
    fatigue: 0,
    befriended: null,
    status: 'active',
  };
  RUNS.set(run.id, run);
  return {
    ok: true,
    runId: run.id,
    scene: sceneView(start, party),
    run: runView(run, start.stage),
  };
}

export type ChooseResult =
  | { ok: false; code: 'not_found' | 'bad_choice' | 'locked_choice' | 'bad_party'; message: string }
  | {
      ok: true;
      ended: false;
      narration: string;
      roll: ChoiceResolution['roll'];
      befriended: { id: string; name: string } | null;
      scene: SceneView;
      run: RunView;
    }
  | {
      ok: true;
      ended: true;
      narration: string;
      roll: ChoiceResolution['roll'];
      befriended: { id: string; name: string } | null;
      summary: { loot: ItemStack[]; cubes: number; fatigue: number; befriended: string | null };
    };

/** Resolve one choice in an active run: roll, accrue, branch — and bank everything on `end`. */
export async function chooseInRun(
  db: DB,
  herdId: string,
  runId: string,
  choiceId: string,
): Promise<ChooseResult> {
  const run = RUNS.get(runId);
  if (!run || run.herdId !== herdId || run.status !== 'active') {
    return { ok: false, code: 'not_found', message: 'No such run.' };
  }
  const script = ADVENTURE_BY_REGION.get(run.regionId);
  const scene = script?.scenes[run.sceneId];
  if (!script || !scene) return { ok: false, code: 'not_found', message: 'This run got lost.' };
  const choice = scene.choices.find((c) => c.id === choiceId);
  if (!choice) return { ok: false, code: 'bad_choice', message: 'No such choice here.' };

  const party = await loadParty(db, herdId, run.party);
  if (!party) return { ok: false, code: 'bad_party', message: 'Your party has changed.' };
  if (!partyMeets(party, choice.requires)) {
    return { ok: false, code: 'locked_choice', message: 'No one in your party can do that.' };
  }

  const { outcome, roll } = resolveChoice(party, choice, stepRng(run.seed, run.step));

  // Accrue the haul (banked only when the run ends — the whole point of push-vs-bank).
  for (const it of outcome.items ?? []) run.loot[it.id] = (run.loot[it.id] ?? 0) + it.qty;
  run.cubes += outcome.cubes ?? 0;
  run.fatigue += outcome.fatigue ?? 0;

  // Befriend a wild stranger → it joins the herd now (the narrative recruit, no fee).
  let befriended: { id: string; name: string } | null = null;
  if (outcome.wild) {
    const region = REGION_BY_ID.get(run.regionId);
    const wrng = stepRng(run.seed, run.step, 0x85ebca6b);
    const genotype = randomGenotype(region?.freqOverride);
    const personality = rollWildPersonality(wrng);
    const name = resolve(genotype).displayName;
    const minted = await mintHorse(db, {
      herdId,
      genotype,
      origin: 'wild',
      lifeStage: 'adult',
      personality,
    });
    befriended = { id: minted.id, name };
    run.befriended = name;
  }

  run.step += 1;
  const narration = outcome.text;

  if (outcome.next === 'end') {
    const summary = await bankAndEnd(db, run);
    return { ok: true, ended: true, narration, roll, befriended, summary };
  }

  const nextScene = script.scenes[outcome.next];
  if (!nextScene) {
    // Defensive: a dangling `next` ends the run rather than trapping the player.
    const summary = await bankAndEnd(db, run);
    return { ok: true, ended: true, narration, roll, befriended, summary };
  }
  run.sceneId = outcome.next;
  return {
    ok: true,
    ended: false,
    narration,
    roll,
    befriended,
    scene: sceneView(nextScene, party),
    run: runView(run, nextScene.stage),
  };
}

async function bankAndEnd(
  db: DB,
  run: RunState,
): Promise<{ loot: ItemStack[]; cubes: number; fatigue: number; befriended: string | null }> {
  run.status = 'ended';
  const loot: ItemStack[] = Object.entries(run.loot).map(([id, qty]) => ({ id, qty }));
  if (loot.length) await grantItems(db, run.herdId, loot);
  if (run.cubes > 0) {
    await db
      .update(herds)
      .set({ cubes: sql`${herds.cubes} + ${run.cubes}` })
      .where(eq(herds.id, run.herdId));
  }
  RUNS.delete(run.id);
  return { loot, cubes: run.cubes, fatigue: run.fatigue, befriended: run.befriended };
}
