import { STUDBOOK_TIER_CUBES } from '@blorse/balance';
import { and, eq, inArray } from 'drizzle-orm';
import { resolve } from '@blorse/genetics';
import { STUDBOOK_GOALS } from '../content/studbook.js';
import type { DB } from '../db/client.js';
import { horses, studbookEntries, type HorseRow } from '../db/schema.js';
import { logAudit } from './audit.js';
import { creditCubes } from './wallet.js';

/**
 * The Studbook (§7m) — the Registrar's ledger. Goals are checked exactly once, at the
 * moment a coat becomes real: the foal→adult reveal (§4.2). Only foals of your own
 * breeding count (`origin === 'bred'`); recruits and founders walk in already written.
 * Completion is automatic — show, don't tell: the Morning Post announces it.
 */

/** One fulfilled goal, as carried by the daily digest (rewards already granted). */
export interface StudbookBeat {
  goalId: string;
  title: string;
  cubes: number;
  horse: string | null;
  coat: string;
}

export async function checkStudbookOnMature(
  db: DB,
  herdId: string,
  horse: HorseRow,
): Promise<StudbookBeat[]> {
  if (horse.origin !== 'bred') return [];
  const p = resolve(horse.genotype);
  const done = new Set(
    (
      await db
        .select({ goalId: studbookEntries.goalId })
        .from(studbookEntries)
        .where(eq(studbookEntries.herdId, herdId))
    ).map((r) => r.goalId),
  );
  const beats: StudbookBeat[] = [];
  for (const goal of STUDBOOK_GOALS) {
    if (done.has(goal.id) || !goal.test(p)) continue;
    // The unique (herd, goal) index is the double-award guard: only the insert that
    // actually lands pays out (same conditional-statement philosophy as the kernels).
    const inserted = await db
      .insert(studbookEntries)
      .values({ herdId, goalId: goal.id, horseId: horse.id, coat: p.displayName })
      .onConflictDoNothing()
      .returning({ id: studbookEntries.id });
    if (inserted.length === 0) continue;
    const cubes = STUDBOOK_TIER_CUBES[goal.tier] ?? 0;
    if (cubes > 0) await creditCubes(db, herdId, cubes);
    beats.push({
      goalId: goal.id,
      title: goal.title,
      cubes,
      horse: horse.name,
      coat: p.displayName,
    });
  }
  if (beats.length > 0) {
    await logAudit(db, herdId, 'studbook', {
      horseId: horse.id,
      goals: beats.map((b) => b.goalId),
    });
  }
  return beats;
}

// ── The book itself (GET /studbook) ─────────────────────────────────────────

export interface StudbookGoalView {
  id: string;
  tier: 1 | 2 | 3;
  title: string;
  flavor: string;
  cubes: number;
  done: { horse: string | null; coat: string; completedAt: number } | null;
}

/** A founded line: every coat your herd has bred to adulthood, with its first author. */
export interface FoundedLine {
  coat: string;
  count: number;
  firstId: string;
  firstName: string | null;
}

export interface StudbookView {
  goals: StudbookGoalView[];
  registry: FoundedLine[];
}

export async function getStudbook(db: DB, herdId: string): Promise<StudbookView> {
  const entries = await db.select().from(studbookEntries).where(eq(studbookEntries.herdId, herdId));
  const byGoal = new Map(entries.map((e) => [e.goalId, e]));
  const horseIds = entries.map((e) => e.horseId).filter((h): h is string => h !== null);
  const named = new Map<string, string | null>();
  if (horseIds.length > 0) {
    // One query for every stamp's horse (was a findFirst per entry — the audit's N+1).
    const rows = await db
      .select({ id: horses.id, name: horses.name })
      .from(horses)
      .where(inArray(horses.id, horseIds));
    for (const row of rows) named.set(row.id, row.name);
  }
  const goals: StudbookGoalView[] = STUDBOOK_GOALS.map((g) => {
    const e = byGoal.get(g.id);
    return {
      id: g.id,
      tier: g.tier,
      title: g.title,
      flavor: g.flavor,
      cubes: STUDBOOK_TIER_CUBES[g.tier] ?? 0,
      done: e
        ? {
            horse: e.horseId ? (named.get(e.horseId) ?? null) : null,
            coat: e.coat,
            completedAt: e.completedAt.getTime(),
          }
        : null,
    };
  });

  // Founded lines, derived at read (nothing stored): your bred adults, grouped by coat,
  // the earliest-born marked as the line's author.
  const bred = await db
    .select()
    .from(horses)
    .where(
      and(eq(horses.herdId, herdId), eq(horses.origin, 'bred'), eq(horses.lifeStage, 'adult')),
    );
  const lines = new Map<string, FoundedLine & { bornAt: number }>();
  for (const h of bred) {
    const coat = resolve(h.genotype).displayName;
    const prev = lines.get(coat);
    if (!prev) {
      lines.set(coat, {
        coat,
        count: 1,
        firstId: h.id,
        firstName: h.name,
        bornAt: h.bornAt.getTime(),
      });
    } else {
      prev.count += 1;
      if (h.bornAt.getTime() < prev.bornAt) {
        prev.firstId = h.id;
        prev.firstName = h.name;
        prev.bornAt = h.bornAt.getTime();
      }
    }
  }
  const registry = [...lines.values()]
    .sort((a, b) => a.bornAt - b.bornAt)
    .map(({ coat, count, firstId, firstName }) => ({ coat, count, firstId, firstName }));

  return { goals, registry };
}
