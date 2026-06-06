import { randomInt } from 'node:crypto';
import { and, eq, sql } from 'drizzle-orm';
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
  ADVENTURE_BY_ID,
  ADVENTURE_POOLS,
  type Choice,
  type Outcome,
  type Scene,
} from '../content/adventures.js';
import { REGION_BY_ID } from '../content/regions.js';
import type { DB } from '../db/client.js';
import { adventureRuns, herds, type HorseRow } from '../db/schema.js';
import { mulberry32 } from '../util/rng.js';
import { getHorse, mintHorse } from './horse.js';
import { grantItems, type ItemStack } from './inventory.js';
import { compatibility, rollWildPersonality, type Personality } from './personality.js';
import { isQuestCompleted } from './quests.js';
import { skillCheck, type SkillBlock, type StatBlock } from './stats.js';

// ── Run state ────────────────────────────────────────────────────────────────
// Persisted in the `adventure_runs` table (§9.3) so a run survives a restart / redeploy /
// multiple instances. A row carries only the cursor (regionId, sceneId, step, seed) + the
// accrued, not-yet-banked haul; resolution stays pure + seeded below. `$inferSelect` keeps
// this type in lockstep with the schema.
type RunRow = typeof adventureRuns.$inferSelect;

// Deterministic per-step RNG derived from (seed, step) — same inputs, same dice (testable).
function stepRng(seed: number, step: number, salt = 0x9e3779b9): () => number {
  return mulberry32((seed ^ Math.imul(step + 1, salt)) >>> 0);
}

// Salt for the per-run script draw from a region's pool — distinct from the dice salts above so
// which-script and the in-run rolls stay independent.
const PICK_SALT = 0xc2b2ae35;

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

function runView(run: RunRow, stage: number): RunView {
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
  /** Force a specific script (tests / replay), bypassing the seeded pool draw. */
  scriptId?: string;
}

/** Begin an interactive adventure run in a region that has an authored scene library. */
export async function startRun(
  db: DB,
  herdId: string,
  regionId: string,
  partyIds: string[],
  opts: StartOptions = {},
): Promise<StartResult> {
  const pool = ADVENTURE_POOLS.get(regionId);
  if (!pool || pool.length === 0) {
    return { ok: false, code: 'no_script', message: 'No story for that region yet.' };
  }
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

  const seed = opts.seed ?? randomInt(1, 2 ** 31);
  // Pick the run's script: an explicit override (tests/replay), else a seeded uniform draw from
  // the pool. Stored on the run so it stays put across a redeploy even if the pool changes.
  const script = opts.scriptId
    ? ADVENTURE_BY_ID.get(opts.scriptId)
    : pool[Math.floor(mulberry32((seed ^ PICK_SALT) >>> 0)() * pool.length)];
  if (!script || script.regionId !== regionId) {
    return { ok: false, code: 'no_script', message: 'No such adventure here.' };
  }
  const start = script.scenes[script.start];
  if (!start) return { ok: false, code: 'no_script', message: 'That story is misconfigured.' };

  const [run] = await db
    .insert(adventureRuns)
    .values({
      herdId,
      regionId,
      scriptId: script.id,
      party: partyIds,
      seed,
      sceneId: script.start,
    })
    .returning();
  if (!run) return { ok: false, code: 'bad_party', message: 'Could not start the run.' };
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
  const run = await db.query.adventureRuns.findFirst({
    where: and(
      eq(adventureRuns.id, runId),
      eq(adventureRuns.herdId, herdId),
      eq(adventureRuns.status, 'active'),
    ),
  });
  if (!run) return { ok: false, code: 'not_found', message: 'No such run.' };
  const script = ADVENTURE_BY_ID.get(run.scriptId);
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

  // Accrue the haul into next-state locals (banked only when the run ends — push-vs-bank).
  const loot = { ...run.loot };
  for (const it of outcome.items ?? []) loot[it.id] = (loot[it.id] ?? 0) + it.qty;
  const cubes = run.cubes + (outcome.cubes ?? 0);
  const fatigue = run.fatigue + (outcome.fatigue ?? 0);
  let befriendedName = run.befriended;

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
    befriendedName = name;
  }

  const step = run.step + 1;
  const narration = outcome.text;
  const nextScene = outcome.next === 'end' ? undefined : script.scenes[outcome.next];

  if (!nextScene) {
    // `end`, or a dangling `next` → bank everything and close the run (never trap the player).
    const summary = await bankAndEnd(db, {
      id: run.id,
      herdId,
      step,
      loot,
      cubes,
      fatigue,
      befriended: befriendedName,
    });
    return { ok: true, ended: true, narration, roll, befriended, summary };
  }

  await db
    .update(adventureRuns)
    .set({ step, sceneId: nextScene.id, loot, cubes, fatigue, befriended: befriendedName })
    .where(eq(adventureRuns.id, run.id));
  return {
    ok: true,
    ended: false,
    narration,
    roll,
    befriended,
    scene: sceneView(nextScene, party),
    run: runView(
      { ...run, step, sceneId: nextScene.id, loot, cubes, fatigue, befriended: befriendedName },
      nextScene.stage,
    ),
  };
}

interface RunEndState {
  id: string;
  herdId: string;
  step: number;
  loot: Record<string, number>;
  cubes: number;
  fatigue: number;
  befriended: string | null;
}

async function bankAndEnd(
  db: DB,
  run: RunEndState,
): Promise<{ loot: ItemStack[]; cubes: number; fatigue: number; befriended: string | null }> {
  const loot: ItemStack[] = Object.entries(run.loot).map(([id, qty]) => ({ id, qty }));
  if (loot.length) await grantItems(db, run.herdId, loot);
  if (run.cubes > 0) {
    await db
      .update(herds)
      .set({ cubes: sql`${herds.cubes} + ${run.cubes}` })
      .where(eq(herds.id, run.herdId));
  }
  // Keep the row as `ended` (history) with the final accrued state persisted.
  await db
    .update(adventureRuns)
    .set({
      status: 'ended',
      step: run.step,
      loot: run.loot,
      cubes: run.cubes,
      fatigue: run.fatigue,
      befriended: run.befriended,
    })
    .where(eq(adventureRuns.id, run.id));
  return { loot, cubes: run.cubes, fatigue: run.fatigue, befriended: run.befriended };
}
