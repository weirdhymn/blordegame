import { and, eq, sql } from 'drizzle-orm';
import {
  QUEST_BY_ID,
  QUESTS,
  type QuestDef,
  type QuestObjective,
  type QuestReward,
} from '../content/quests.js';
import type { DB } from '../db/client.js';
import { herds, questProgress } from '../db/schema.js';
import { grantItems } from './inventory.js';

export type GameEvent =
  | { type: 'roam'; regionId: string }
  | { type: 'breed' }
  | { type: 'collect'; itemId: string }
  | { type: 'cook' }
  | { type: 'groom' }
  | { type: 'expedition'; regionId: string }
  | { type: 'sunrise' };

export interface QuestCompletion {
  questId: string;
  reward: QuestReward;
}

async function completedQuestIds(db: DB, herdId: string): Promise<Set<string>> {
  const rows = await db
    .select({ q: questProgress.questId })
    .from(questProgress)
    .where(and(eq(questProgress.herdId, herdId), eq(questProgress.status, 'completed')));
  return new Set(rows.map((r) => r.q));
}

/** Open every quest whose prerequisite is met and which has no progress row yet. */
export async function ensureActiveQuests(db: DB, herdId: string): Promise<void> {
  const existing = await db
    .select({ q: questProgress.questId })
    .from(questProgress)
    .where(eq(questProgress.herdId, herdId));
  const have = new Set(existing.map((r) => r.q));
  const completed = await completedQuestIds(db, herdId);
  for (const quest of QUESTS) {
    if (have.has(quest.id)) continue;
    if (quest.requires && !completed.has(quest.requires)) continue;
    await db
      .insert(questProgress)
      .values({ herdId, questId: quest.id, counters: quest.objectives.map(() => 0) })
      .onConflictDoNothing({ target: [questProgress.herdId, questProgress.questId] });
  }
}

export interface QuestView {
  questId: string;
  title: string;
  status: 'active' | 'completed';
  objectives: { label: string; have: number; need: number }[];
  reward: QuestReward;
}

export async function getQuestState(db: DB, herdId: string): Promise<QuestView[]> {
  await ensureActiveQuests(db, herdId);
  const rows = await db.select().from(questProgress).where(eq(questProgress.herdId, herdId));
  return rows.flatMap((r) => {
    const def = QUEST_BY_ID.get(r.questId);
    if (!def) return [];
    return [
      {
        questId: r.questId,
        title: def.title,
        status: r.status,
        objectives: def.objectives.map((o, i) => ({
          label: o.label,
          have: r.counters[i] ?? 0,
          need: o.count,
        })),
        reward: def.reward,
      },
    ];
  });
}

function objectiveMatches(obj: QuestObjective, event: GameEvent): boolean {
  if (obj.type !== event.type) return false;
  if (event.type === 'roam') return obj.regionId === event.regionId;
  if (event.type === 'collect') return obj.itemId === event.itemId;
  // An expedition objective may pin a region, or omit it to match any.
  if (event.type === 'expedition') return !obj.regionId || obj.regionId === event.regionId;
  return true; // breed / cook / groom / sunrise carry no qualifiers
}

async function grantReward(db: DB, herdId: string, def: QuestDef): Promise<void> {
  if (def.reward.cubes) {
    await db
      .update(herds)
      .set({ cubes: sql`${herds.cubes} + ${def.reward.cubes}` })
      .where(eq(herds.id, herdId));
  }
  if (def.reward.items?.length) await grantItems(db, herdId, def.reward.items);
}

/**
 * Advance every active quest against a game event; complete + reward those whose
 * objectives are all met, then re-open any quests the completion unlocks.
 */
export async function recordEvent(
  db: DB,
  herdId: string,
  event: GameEvent,
): Promise<QuestCompletion[]> {
  await ensureActiveQuests(db, herdId);
  const active = await db
    .select()
    .from(questProgress)
    .where(and(eq(questProgress.herdId, herdId), eq(questProgress.status, 'active')));

  const completions: QuestCompletion[] = [];
  for (const row of active) {
    const def = QUEST_BY_ID.get(row.questId);
    if (!def) continue;
    const counters = [...row.counters];
    let changed = false;
    def.objectives.forEach((obj, i) => {
      if (objectiveMatches(obj, event) && (counters[i] ?? 0) < obj.count) {
        counters[i] = (counters[i] ?? 0) + 1;
        changed = true;
      }
    });
    if (!changed) continue;

    const done = def.objectives.every((obj, i) => (counters[i] ?? 0) >= obj.count);
    if (done) {
      await db
        .update(questProgress)
        .set({ counters, status: 'completed', completedAt: new Date() })
        .where(eq(questProgress.id, row.id));
      await grantReward(db, herdId, def);
      completions.push({ questId: def.id, reward: def.reward });
    } else {
      await db.update(questProgress).set({ counters }).where(eq(questProgress.id, row.id));
    }
  }
  if (completions.length > 0) await ensureActiveQuests(db, herdId); // cascade unlocks
  return completions;
}

export async function isQuestCompleted(
  db: DB,
  herdId: string,
  questId: string | null,
): Promise<boolean> {
  if (!questId) return true;
  return (await completedQuestIds(db, herdId)).has(questId);
}
