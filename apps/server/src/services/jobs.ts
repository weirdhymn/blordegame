import { eq, sql } from 'drizzle-orm';
import { JOB_CUBES_BASE, JOB_DC, JOB_XP_BASE, type SkillKey, type StatKey } from '@blorse/balance';
import { STRUCTURE_BY_ID } from '../content/structures.js';
import type { DB } from '../db/client.js';
import { herds, horses, jobAssignments, structures } from '../db/schema.js';
import { getHorse } from './horse.js';
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
      code: 'not_found' | 'not_owned' | 'not_adult' | 'no_structure' | 'no_job';
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

    const check = skillCheck(stats[stat] ?? 10, level, h.luck, JOB_DC, rng);
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
