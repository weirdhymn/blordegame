import { and, count, eq } from 'drizzle-orm';
import {
  DAILY_CUBES,
  FERTILIZER_PER_HORSE_PER_DAY,
  FOAL_TO_ADULT_MS,
  GROOM_CUBES,
} from '@blorse/balance';
import { resolve } from '@blorse/genetics';
import { QUEST_BY_ID } from '../content/quests.js';
import type { DB } from '../db/client.js';
import { herds, horses } from '../db/schema.js';
import { gameDay, nextRollover } from '../util/clock.js';
import { mulberry32 } from '../util/rng.js';
import { logAudit } from './audit.js';
import { resolveAutonomyForDay } from './autonomy.js';
import { recordDiscovery } from './fieldguide.js';
import { grantItems } from './inventory.js';
import { addJournalEvents } from './journal.js';
import { resolveJobsForDay } from './jobs.js';
import { recordEvent } from './quests.js';
import { checkStudbookOnMature, type StudbookBeat } from './studbook.js';
import { creditCubes } from './wallet.js';

/** Cap on per-day job resolution during catch-up so a long absence stays cheap (§8.2). */
const MAX_JOB_CATCHUP_DAYS = 30;

/** A foal whose coat was revealed this check-in — the Morning Post's headline moment. */
export interface MaturedFoal {
  id: string;
  name: string | null;
  /** The revealed coat's display name (derived — never stored, §4). */
  coat: string;
}

/** A Living-Herd beat written during THIS catch-up (the Morning Post's news column, §8). */
export interface DigestBeat {
  day: number;
  text: string;
  glyph: string | null;
}

/** A quest that completed at this sunrise (the first-day rhythm chain ends here, §7i). */
export interface DigestQuest {
  questId: string;
  title: string;
  cubes: number;
}

export interface DailyResult {
  daysAdvanced: number;
  cubesGained: number;
  /** Cubes earned by jobs during the caught-up days. */
  jobCubes: number;
  /** The next-morning bonus from last night's groom (§7), if one was pending. */
  groomCubes: number;
  /** Foals whose coat was revealed (foal → adult) this check-in. */
  matured: MaturedFoal[];
  /** The autonomy beats generated during this catch-up, in day order (also in the Journal). */
  journal: DigestBeat[];
  /** Quests completed by this sunrise (rewards already granted) — the Post celebrates them. */
  questCompletions: DigestQuest[];
  /** Studbook goals fulfilled by this check-in's reveals (§7m, rewards already granted). */
  studbook: StudbookBeat[];
  /** Basic fertilizer the horses produced overnight (§7j) — only for days the herd was FED (the
   *  communal cook). A bonus for care, never a penalty for skipping. */
  fertilizer: number;
  day: number;
  nextRolloverMs: number;
}

/** Reveal foals whose maturation time has passed (white → adult coat, §4.2/§7). The reveal is
 *  also the Studbook's moment (§7m) — a coat can only fulfill a goal once it is real. */
async function matureFoals(
  db: DB,
  herdId: string,
  nowMs: number,
): Promise<{ matured: MaturedFoal[]; studbook: StudbookBeat[] }> {
  const foals = await db
    .select()
    .from(horses)
    .where(and(eq(horses.herdId, herdId), eq(horses.lifeStage, 'foal')));
  const matured: MaturedFoal[] = [];
  const studbook: StudbookBeat[] = [];
  for (const f of foals) {
    if (f.bornAt.getTime() + FOAL_TO_ADULT_MS <= nowMs) {
      // Conditional claim (§11 hardening): only the check-in that actually flips
      // foal→adult announces the reveal — a concurrent check-in skips it cleanly.
      const claimed = await db
        .update(horses)
        .set({ lifeStage: 'adult' })
        .where(and(eq(horses.id, f.id), eq(horses.lifeStage, 'foal')))
        .returning({ id: horses.id });
      if (claimed.length === 0) continue;
      await recordDiscovery(db, herdId, f); // the reveal enters the Field Guide
      matured.push({ id: f.id, name: f.name, coat: resolve(f.genotype).displayName });
      studbook.push(...(await checkStudbookOnMature(db, herdId, f))); // §7m — bred foals only
    }
  }
  return { matured, studbook };
}

/**
 * Check-in for a herd: reveal matured foals, then deterministically replay missed
 * daily rollovers since `lastSimTick`, accruing the daily Cube stipend (§2 clock,
 * §8.2 login-catchup). `nowMs` is injectable for testing. Autonomy (§8) fills the
 * per-day tick with emergent events in Phase 9.
 */
export async function advanceHerd(db: DB, herdId: string, nowMs: number): Promise<DailyResult> {
  const day = gameDay(nowMs);
  const herd = await db.query.herds.findFirst({ where: eq(herds.id, herdId) });
  if (!herd) {
    return {
      daysAdvanced: 0,
      cubesGained: 0,
      jobCubes: 0,
      groomCubes: 0,
      matured: [],
      journal: [],
      questCompletions: [],
      studbook: [],
      fertilizer: 0,
      day,
      nextRolloverMs: nextRollover(nowMs),
    };
  }

  const { matured, studbook } = await matureFoals(db, herdId, nowMs);
  let daysAdvanced = Math.max(0, day - herd.lastSimTick);

  // Claim the whole catch-up range FIRST (§11 hardening): a single conditional UPDATE on the
  // lastSimTick we read. Concurrent check-ins at a rollover all read the same old tick, but
  // only one claim lands — the others replay nothing and credit nothing (the audit's
  // stipend-multiplication race). The pending groom bonus is consumed by the same claim.
  if (daysAdvanced > 0) {
    const won = await db
      .update(herds)
      .set({ lastSimTick: day, groomBonusPending: false })
      .where(and(eq(herds.id, herdId), eq(herds.lastSimTick, herd.lastSimTick)))
      .returning({ id: herds.id });
    if (won.length === 0) daysAdvanced = 0; // another request owns this catch-up
  }

  // Resolve jobs deterministically for each missed day (bounded for cheap catch-up).
  let jobCubes = 0;
  let fedDays = 0;
  const journal: DigestBeat[] = [];
  const jobDays = Math.min(daysAdvanced, MAX_JOB_CATCHUP_DAYS);
  for (let i = 0; i < jobDays; i++) {
    const tickDay = herd.lastSimTick + 1 + i;
    // Fertilizer (§7j): the horses produce overnight only for a day the herd was FED — the
    // communal cook. mealDay holds the most recent cook, so at most one catch-up day qualifies.
    if (herd.mealDay === tickDay) fedDays++;
    // The morning meal buffs that day's jobs too (only the day it was actually cooked for, §7).
    const dayMeal = herd.mealDay === tickDay ? (herd.mealBuffs ?? {}) : {};
    jobCubes += await resolveJobsForDay(
      db,
      herdId,
      mulberry32((herd.simSeed ^ tickDay) >>> 0),
      dayMeal,
    );
    // The Living Herd (§8): relationships + clubs evolve, producing journal beats. They land in
    // the Journal as before — AND ride along in the result, so the Morning Post can read them
    // without a second query.
    const events = await resolveAutonomyForDay(
      db,
      herdId,
      mulberry32((herd.simSeed ^ tickDay ^ 0x9e3779b9) >>> 0),
    );
    await addJournalEvents(db, herdId, tickDay, events);
    for (const e of events) journal.push({ day: tickDay, text: e.text, glyph: e.glyph ?? null });
  }

  // "Wake to a reward": a pending groom from last night pays its small flat bonus at this
  // rollover. The claim above already consumed the pending flag; we hold its pre-claim value.
  const groomCubes = daysAdvanced > 0 && herd.groomBonusPending ? GROOM_CUBES : 0;
  const cubesGained = daysAdvanced * DAILY_CUBES + groomCubes;
  if (cubesGained > 0) await creditCubes(db, herdId, cubesGained);
  // Every faucet leaves a trail (audit P2): one entry per claimed catch-up, jobs included.
  if (daysAdvanced > 0) {
    await logAudit(db, herdId, 'daily', {
      days: daysAdvanced,
      stipend: daysAdvanced * DAILY_CUBES,
      groom: groomCubes,
      jobs: jobCubes,
    });
  }

  // A real rollover greets the sunrise — the last beat of the first-day rhythm quest (§7i).
  // Quest rewards are granted inside recordEvent; the Post gets titles to celebrate with.
  const sunrise = daysAdvanced > 0 ? await recordEvent(db, herdId, { type: 'sunrise' }) : [];
  const questCompletions: DigestQuest[] = sunrise.map((c) => ({
    questId: c.questId,
    title: QUEST_BY_ID.get(c.questId)?.title ?? c.questId,
    cubes: c.reward.cubes ?? 0,
  }));

  // The morning's fertilizer (§7j): one per horse per FED day. Skipping the cook simply yields
  // none — nothing worse (the §7g cozy guard).
  let fertilizer = 0;
  if (fedDays > 0) {
    const [n] = await db.select({ n: count() }).from(horses).where(eq(horses.herdId, herdId));
    fertilizer = (n?.n ?? 0) * FERTILIZER_PER_HORSE_PER_DAY * fedDays;
    if (fertilizer > 0) await grantItems(db, herdId, [{ id: 'fertilizer', qty: fertilizer }]);
  }

  return {
    daysAdvanced,
    cubesGained,
    jobCubes,
    groomCubes,
    matured,
    journal,
    questCompletions,
    studbook,
    fertilizer,
    day,
    nextRolloverMs: nextRollover(nowMs),
  };
}
