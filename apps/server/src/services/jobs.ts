import { eq, sql } from 'drizzle-orm';
import {
  ADVENTURE_MARK_THRESHOLD,
  JOB_CUBES_BASE,
  JOB_DC,
  JOB_SEASONED_DC_BONUS,
  JOB_XP_BASE,
  type SkillKey,
  type StatKey,
} from '@blorse/balance';
import { STRUCTURE_BY_ID } from '../content/structures.js';
import type { DB } from '../db/client.js';
import { herds, horses, jobAssignments, structures } from '../db/schema.js';
import { getHorse } from './horse.js';
import { checkJobSlots } from './progression.js';
import {
  accomplishmentsForLevel,
  grantSkillXp,
  skillCheck,
  type SkillBlock,
  type StatBlock,
} from './stats.js';

export type JobResult =
  | {
      ok: false;
      code: 'not_found' | 'not_owned' | 'not_adult' | 'no_structure' | 'no_job' | 'jobs_full';
      message: string;
    }
  | { ok: true; structureType: string; skill: string };

/** Post a horse to a Structure's job (§9.2). One job per horse; re-assign moves it. */
export async function assignJob(
  db: DB,
  herdId: string,
  horseId: string,
  structureType: string,
): Promise<JobResult> {
  const def = STRUCTURE_BY_ID.get(structureType);
  if (!def || !def.skill)
    return { ok: false, code: 'no_job', message: 'That building has no job.' };

  const h = await getHorse(db, horseId);
  if (!h) return { ok: false, code: 'not_found', message: 'Horse not found.' };
  if (h.herdId !== herdId) return { ok: false, code: 'not_owned', message: 'Not your horse.' };
  if (h.lifeStage !== 'adult')
    return { ok: false, code: 'not_adult', message: 'Foals cannot work jobs.' };

  const built = await db
    .select({ type: structures.type })
    .from(structures)
    .where(eq(structures.herdId, herdId));
  if (!built.some((b) => b.type === structureType)) {
    return { ok: false, code: 'no_structure', message: 'Build that structure first.' };
  }

  // Job-slot cap (§7 progression). A re-assignment (the horse already works) just MOVES it — no new
  // slot; a fresh assignment needs a free work slot, else a motivating "tier up for another" message.
  const herdJobs = await db
    .select({ horseId: jobAssignments.horseId })
    .from(jobAssignments)
    .where(eq(jobAssignments.herdId, herdId));
  if (!herdJobs.some((j) => j.horseId === horseId)) {
    const slot = await checkJobSlots(db, herdId, herdJobs.length);
    if (!slot.ok) return { ok: false, code: 'jobs_full', message: slot.message };
  }

  await db
    .insert(jobAssignments)
    .values({ horseId, herdId, structureType, skill: def.skill, stat: def.stat })
    .onConflictDoUpdate({
      target: jobAssignments.horseId,
      set: { herdId, structureType, skill: def.skill, stat: def.stat, assignedAt: new Date() },
    });
  return { ok: true, structureType, skill: def.skill };
}

export async function unassignJob(db: DB, horseId: string): Promise<void> {
  await db.delete(jobAssignments).where(eq(jobAssignments.horseId, horseId));
}

/**
 * A horse's job-check DC, eased for **Seasoned** adventurers (§9.3, jobs↔adventures): once a horse
 * has cleared `ADVENTURE_MARK_THRESHOLD` adventures it brings that experience to work and rolls
 * against a slightly lower DC. Pure + buff-only (a homebody just uses the base `JOB_DC`).
 */
export function jobDc(adventures: number): number {
  return JOB_DC - (adventures >= ADVENTURE_MARK_THRESHOLD ? JOB_SEASONED_DC_BONUS : 0);
}

export async function getJob(db: DB, horseId: string) {
  return (
    (await db.query.jobAssignments.findFirst({ where: eq(jobAssignments.horseId, horseId) })) ??
    null
  );
}

/**
 * Resolve every job in a herd for ONE game day with a seeded RNG (called per missed
 * day on the daily rollover, §9.2). Cozy: a poor roll just yields less, never a loss.
 * Returns total Cubes earned (and writes skill XP / level-ups / accomplishments).
 */
export async function resolveJobsForDay(
  db: DB,
  herdId: string,
  rng: () => number,
  /** The meal buff cooked FOR this resolved day (per-stat DC reduction), if any (§7). */
  mealBuff: Record<string, number> = {},
): Promise<number> {
  const jobs = await db.select().from(jobAssignments).where(eq(jobAssignments.herdId, herdId));
  let cubes = 0;

  for (const job of jobs) {
    const h = await getHorse(db, job.horseId);
    if (!h || h.lifeStage !== 'adult') continue;

    const stats = h.stats as StatBlock;
    const skills = h.skills as SkillBlock;
    const skill = job.skill as SkillKey;
    const stat = job.stat as StatKey;
    const level = skills[skill]?.level ?? 0;

    // Seasoned adventurers work with a steadier hand (§9.3); the morning meal also buffs this stat.
    const check = skillCheck(
      stats[stat] ?? 10,
      level,
      h.luck,
      jobDc(h.adventures) - (mealBuff[stat] ?? 0),
      rng,
    );
    const earned = check.success
      ? JOB_CUBES_BASE + level * 2 + (check.crit ? JOB_CUBES_BASE : 0)
      : Math.floor(JOB_CUBES_BASE / 2);
    const xp = check.success ? JOB_XP_BASE : Math.floor(JOB_XP_BASE / 2);
    cubes += earned;

    const ups = grantSkillXp(skills, stats, skill, xp);
    const accomplishments = new Set(h.accomplishments);
    for (const up of ups) {
      for (const acc of accomplishmentsForLevel(up.skill, up.newLevel)) accomplishments.add(acc);
    }
    await db
      .update(horses)
      .set({ skills, stats, accomplishments: [...accomplishments] })
      .where(eq(horses.id, h.id));
  }

  if (cubes > 0) {
    await db
      .update(herds)
      .set({ cubes: sql`${herds.cubes} + ${cubes}` })
      .where(eq(herds.id, herdId));
  }
  return cubes;
}
