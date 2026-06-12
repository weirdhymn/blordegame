import { and, eq } from 'drizzle-orm';
import {
  AFFINITY_MAX,
  AFFINITY_MIN,
  BONDED_THRESHOLD,
  CLUB_MIN_MEMBERS,
  FRIEND_THRESHOLD,
  MAX_AUTONOMY_PAIRS,
  RIVAL_THRESHOLD,
} from '@blorse/balance';
import type { DB } from '../db/client.js';
import { clubs, horses, relationships, structures, type HorseRow } from '../db/schema.js';
import type { NewJournalEvent } from './journal.js';
import { compatibility, type Personality } from './personality.js';

type RelType = 'bonded' | 'friend' | 'rival';

function relType(affinity: number): RelType | null {
  if (affinity >= BONDED_THRESHOLD) return 'bonded';
  if (affinity >= FRIEND_THRESHOLD) return 'friend';
  if (affinity <= RIVAL_THRESHOLD) return 'rival';
  return null;
}

const nameOf = (h: HorseRow): string => h.name ?? 'A horse';

function eventFor(type: RelType, a: HorseRow, b: HorseRow): NewJournalEvent {
  const an = nameOf(a);
  const bn = nameOf(b);
  if (type === 'bonded')
    return { kind: 'bonded', glyph: '💞', text: `${an} and ${bn} became inseparable.` };
  if (type === 'rival') return { kind: 'rival', glyph: '⚡', text: `${an} and ${bn} are at odds.` };
  return { kind: 'friend', glyph: '🤝', text: `${an} and ${bn} became friends.` };
}

async function maybeFormClubs(
  db: DB,
  herdId: string,
  herdHorses: HorseRow[],
): Promise<NewJournalEvent[]> {
  // reading-circle — gated by the Library (§8.4); needs a couple of readers.
  const built = await db
    .select({ type: structures.type })
    .from(structures)
    .where(eq(structures.herdId, herdId));
  if (!built.some((s) => s.type === 'library')) return [];

  const existing = await db
    .select({ id: clubs.id })
    .from(clubs)
    .where(and(eq(clubs.herdId, herdId), eq(clubs.type, 'reading-circle')));
  if (existing.length > 0) return [];

  const readers = herdHorses.filter(
    (h) => ((h.skills as Record<string, { level: number }>).reading?.level ?? 0) >= 1,
  );
  if (readers.length < CLUB_MIN_MEMBERS) return [];

  await db
    .insert(clubs)
    .values({ herdId, type: 'reading-circle', members: readers.map((h) => h.id) })
    .onConflictDoNothing({ target: [clubs.herdId, clubs.type] });
  return [
    { kind: 'club', glyph: '📚', text: `${readers.length} horses started a reading circle.` },
  ];
}

/**
 * One day of autonomy for a herd (§8): evaluate co-located adult pairs, nudge their
 * affinity by personality compatibility, fire friend/rival/bonded events when a
 * threshold is first crossed, and let clubs self-organize. Deterministic + bounded
 * (MAX_AUTONOMY_PAIRS). Returns the journal events to append.
 */
export async function resolveAutonomyForDay(
  db: DB,
  herdId: string,
  rng: () => number,
): Promise<NewJournalEvent[]> {
  void rng; // reserved for future stochastic beats (pursuits, mood); pairs are deterministic
  const herdHorses = await db
    .select()
    .from(horses)
    .where(and(eq(horses.herdId, herdId), eq(horses.lifeStage, 'adult')));
  if (herdHorses.length < 2) return [];

  const events: NewJournalEvent[] = [];
  let evaluated = 0;

  // One read for the whole graph (was a SELECT per pair × up to MAX_AUTONOMY_PAIRS × up to 30
  // catch-up days on a long absence — the audit's worst N+1). Rows are keyed a|b (a < b, the
  // same canonical order the loop uses).
  const graph = new Map(
    (await getRelationships(db, herdId)).map((r) => [`${r.horseA}|${r.horseB}`, r]),
  );

  for (let i = 0; i < herdHorses.length && evaluated < MAX_AUTONOMY_PAIRS; i++) {
    for (let j = i + 1; j < herdHorses.length && evaluated < MAX_AUTONOMY_PAIRS; j++) {
      evaluated++;
      const hi = herdHorses[i];
      const hj = herdHorses[j];
      if (!hi || !hj) continue;
      const [a, b] = hi.id < hj.id ? [hi, hj] : [hj, hi];

      const delta = compatibility(a.personality as Personality, b.personality as Personality);
      const prev = graph.get(`${a.id}|${b.id}`);
      const affinity = Math.max(
        AFFINITY_MIN,
        Math.min(AFFINITY_MAX, (prev?.affinity ?? 0) + delta),
      );
      const type = relType(affinity);

      if (!prev) {
        await db
          .insert(relationships)
          .values({ herdId, horseA: a.id, horseB: b.id, affinity, type });
      } else {
        await db
          .update(relationships)
          .set({ affinity, type, updatedAt: new Date() })
          .where(eq(relationships.id, prev.id));
      }
      if (type && type !== (prev?.type ?? null)) events.push(eventFor(type, a, b));
    }
  }

  events.push(...(await maybeFormClubs(db, herdId, herdHorses)));
  return events;
}

export async function getRelationships(db: DB, herdId: string) {
  return db.select().from(relationships).where(eq(relationships.herdId, herdId));
}

export async function getClubs(db: DB, herdId: string) {
  return db.select().from(clubs).where(eq(clubs.herdId, herdId));
}
