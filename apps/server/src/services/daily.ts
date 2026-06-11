import { and, eq, sql } from 'drizzle-orm';
import { DAILY_CUBES, FOAL_TO_ADULT_MS, GROOM_CUBES } from '@blorse/balance';
import { resolve } from '@blorse/genetics';
import { QUEST_BY_ID } from '../content/quests.js';
import type { DB } from '../db/client.js';
import { herds, horses } from '../db/schema.js';
import { gameDay, nextRollover } from '../util/clock.js';
import { mulberry32 } from '../util/rng.js';
import { resolveAutonomyForDay } from './autonomy.js';
import { recordDiscovery } from './fieldguide.js';
import { addJournalEvents } from './journal.js';
import { resolveJobsForDay } from './jobs.js';
import { recordEvent } from './quests.js';

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
  day: number;
  nextRolloverMs: number;
}

/** Reveal foals whose maturation time has passed (white → adult coat, §4.2/§7). */
async function matureFoals(db: DB, herdId: string, nowMs: number): Promise<MaturedFoal[]> {
  const foals = await db
    .select()
    .from(horses)
    .where(and(eq(horses.herdId, herdId), eq(horses.lifeStage, 'foal')));
  const matured: MaturedFoal[] = [];
  for (const f of foals) {
    if (f.bornAt.getTime() + FOAL_TO_ADULT_MS <= nowMs) {
      await db.update(horses).set({ lifeStage: 'adult' }).where(eq(horses.id, f.id));
      await recordDiscovery(db, herdId, f); // the reveal enters the Field Guide
      matured.push({ id: f.id, name: f.name, coat: resolve(f.genotype).displayName });
    }
  }
  return matured;
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
      day,
      nextRolloverMs: nextRollover(nowMs),
    };
  }

  const matured = await matureFoals(db, herdId, nowMs);
  const daysAdvanced = Math.max(0, day - herd.lastSimTick);

  // Resolve jobs deterministically for each missed day (bounded for cheap catch-up).
  let jobCubes = 0;
  const journal: DigestBeat[] = [];
  const jobDays = Math.min(daysAdvanced, MAX_JOB_CATCHUP_DAYS);
  for (let i = 0; i < jobDays; i++) {
    const tickDay = herd.lastSimTick + 1 + i;
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

  // "Wake to a reward": a pending groom from last night pays its small flat bonus at this rollover.
  const groomCubes = daysAdvanced > 0 && herd.groomBonusPending ? GROOM_CUBES : 0;
  const cubesGained = daysAdvanced * DAILY_CUBES + groomCubes;
  if (daysAdvanced > 0) {
    await db
      .update(herds)
      .set({
        cubes: sql`${herds.cubes} + ${cubesGained}`,
        lastSimTick: day,
        groomBonusPending: false,
      })
      .where(eq(herds.id, herdId));
  }

  // A real rollover greets the sunrise — the last beat of the first-day rhythm quest (§7i).
  // Quest rewards are granted inside recordEvent; the Post gets titles to celebrate with.
  const sunrise = daysAdvanced > 0 ? await recordEvent(db, herdId, { type: 'sunrise' }) : [];
  const questCompletions: DigestQuest[] = sunrise.map((c) => ({
    questId: c.questId,
    title: QUEST_BY_ID.get(c.questId)?.title ?? c.questId,
    cubes: c.reward.cubes ?? 0,
  }));

  return {
    daysAdvanced,
    cubesGained,
    jobCubes,
    groomCubes,
    matured,
    journal,
    questCompletions,
    day,
    nextRolloverMs: nextRollover(nowMs),
  };
}
