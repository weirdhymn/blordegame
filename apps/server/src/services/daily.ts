import { and, eq, sql } from 'drizzle-orm';
import { DAILY_CUBES, FOAL_TO_ADULT_MS, GROOM_CUBES } from '@blorse/balance';
import type { DB } from '../db/client.js';
import { herds, horses } from '../db/schema.js';
import { gameDay, nextRollover } from '../util/clock.js';
import { mulberry32 } from '../util/rng.js';
import { resolveAutonomyForDay } from './autonomy.js';
import { recordDiscovery } from './fieldguide.js';
import { addJournalEvents } from './journal.js';
import { resolveJobsForDay } from './jobs.js';

/** Cap on per-day job resolution during catch-up so a long absence stays cheap (§8.2). */
const MAX_JOB_CATCHUP_DAYS = 30;

export interface DailyResult {
  daysAdvanced: number;
  cubesGained: number;
  /** Cubes earned by jobs during the caught-up days. */
  jobCubes: number;
  /** The next-morning bonus from last night's groom (§7), if one was pending. */
  groomCubes: number;
  /** Horse ids whose coat was revealed (foal → adult) this check-in. */
  matured: string[];
  day: number;
  nextRolloverMs: number;
}

/** Reveal foals whose maturation time has passed (white → adult coat, §4.2/§7). */
async function matureFoals(db: DB, herdId: string, nowMs: number): Promise<string[]> {
  const foals = await db
    .select()
    .from(horses)
    .where(and(eq(horses.herdId, herdId), eq(horses.lifeStage, 'foal')));
  const matured: string[] = [];
  for (const f of foals) {
    if (f.bornAt.getTime() + FOAL_TO_ADULT_MS <= nowMs) {
      await db.update(horses).set({ lifeStage: 'adult' }).where(eq(horses.id, f.id));
      await recordDiscovery(db, herdId, f); // the reveal enters the Field Guide
      matured.push(f.id);
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
      day,
      nextRolloverMs: nextRollover(nowMs),
    };
  }

  const matured = await matureFoals(db, herdId, nowMs);
  const daysAdvanced = Math.max(0, day - herd.lastSimTick);

  // Resolve jobs deterministically for each missed day (bounded for cheap catch-up).
  let jobCubes = 0;
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
    // The Living Herd (§8): relationships + clubs evolve, producing journal beats.
    const events = await resolveAutonomyForDay(
      db,
      herdId,
      mulberry32((herd.simSeed ^ tickDay ^ 0x9e3779b9) >>> 0),
    );
    await addJournalEvents(db, herdId, tickDay, events);
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

  return {
    daysAdvanced,
    cubesGained,
    jobCubes,
    groomCubes,
    matured,
    day,
    nextRolloverMs: nextRollover(nowMs),
  };
}
