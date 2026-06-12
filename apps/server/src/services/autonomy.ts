import { and, eq } from 'drizzle-orm';
import {
  AFFINITY_MAX,
  AFFINITY_MIN,
  BONDED_THRESHOLD,
  CLUB_MIN_MEMBERS,
  FRIEND_THRESHOLD,
  GAME_NIGHT_AFFINITY,
  GAME_WEAR_CHANCE,
  MAX_AUTONOMY_PAIRS,
  NIGHT_READ_XP,
  RIVAL_THRESHOLD,
} from '@blorse/balance';
import type { DB } from '../db/client.js';
import { clubs, horses, relationships, structures, type HorseRow } from '../db/schema.js';
import { consumeItems, itemQty } from './inventory.js';
import { accLabel } from './jobs.js';
import type { NewJournalEvent } from './journal.js';
import { compatibility, type Personality } from './personality.js';
import { accomplishmentsForLevel, grantSkillXp, type SkillBlock, type StatBlock } from './stats.js';

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

/** Form a club of `type` once, with the given members, if it doesn't exist yet. */
async function formClub(db: DB, herdId: string, type: string, members: string[]): Promise<boolean> {
  const existing = await db
    .select({ id: clubs.id })
    .from(clubs)
    .where(and(eq(clubs.herdId, herdId), eq(clubs.type, type)));
  if (existing.length > 0) return false;
  await db
    .insert(clubs)
    .values({ herdId, type, members })
    .onConflictDoNothing({ target: [clubs.herdId, clubs.type] });
  return true;
}

async function maybeFormClubs(
  db: DB,
  herdId: string,
  herdHorses: HorseRow[],
  built: Set<string>,
): Promise<NewJournalEvent[]> {
  const events: NewJournalEvent[] = [];

  // reading-circle — gated by the Library (§8.4); needs a couple of readers.
  if (built.has('library')) {
    const readers = herdHorses.filter(
      (h) => ((h.skills as Record<string, { level: number }>).reading?.level ?? 0) >= 1,
    );
    if (
      readers.length >= CLUB_MIN_MEMBERS &&
      (await formClub(
        db,
        herdId,
        'reading-circle',
        readers.map((h) => h.id),
      ))
    ) {
      events.push({
        kind: 'club',
        glyph: '📚',
        text: `${readers.length} horses started a reading circle.`,
      });
    }
  }

  // game-club — the Meeting Hall's civic promise (§7o), seeded by an owned Board Game.
  if (built.has('meeting-hall') && herdHorses.length >= CLUB_MIN_MEMBERS) {
    if ((await itemQty(db, herdId, 'board-game')) > 0) {
      if (
        await formClub(
          db,
          herdId,
          'game-club',
          herdHorses.map((h) => h.id),
        )
      ) {
        events.push({
          kind: 'club',
          glyph: '🎲',
          text: `${herdHorses.length} horses founded a game club at the Meeting Hall. There is a sign-up sheet. Nobody signed it; they all just came.`,
        });
      }
    }
  }

  return events;
}

/**
 * Night Reading (§7o) — the craft→autonomy loop: crafted products are finally CONSUMED by
 * the Living Herd. Each night, one seeded horse may read a Book (real reading XP — skills,
 * accomplishments, the works), and — if the Meeting Hall stands — a seeded pair may share a
 * Board Game (affinity nudge; the game occasionally wears out). All draws ride the day's
 * seeded rng, so a catch-up replays identically.
 */
async function nightLife(
  db: DB,
  herdId: string,
  herdHorses: HorseRow[],
  built: Set<string>,
  rng: () => number,
): Promise<NewJournalEvent[]> {
  const events: NewJournalEvent[] = [];

  // 📚 One reader, one Book, real XP.
  if (herdHorses.length > 0 && (await itemQty(db, herdId, 'book')) > 0) {
    const reader = herdHorses[Math.floor(rng() * herdHorses.length)]!;
    if (await consumeItems(db, herdId, [{ id: 'book', qty: 1 }])) {
      const skills = reader.skills as SkillBlock;
      const stats = reader.stats as StatBlock;
      const ups = grantSkillXp(skills, stats, 'reading', NIGHT_READ_XP);
      const accomplishments = new Set(reader.accomplishments);
      const fresh: string[] = [];
      for (const up of ups) {
        for (const acc of accomplishmentsForLevel(up.skill, up.newLevel)) {
          if (!accomplishments.has(acc)) fresh.push(acc);
          accomplishments.add(acc);
        }
      }
      await db
        .update(horses)
        .set({ skills, stats, accomplishments: [...accomplishments] })
        .where(eq(horses.id, reader.id));
      events.push({
        kind: 'reading',
        glyph: '📚',
        text: `${nameOf(reader)} stayed up late with a book. It now has opinions.`,
      });
      for (const acc of fresh) {
        events.push({
          kind: 'accomplishment',
          glyph: '🏅',
          text: `${nameOf(reader)} is now ${accLabel(acc)} — all that night reading.`,
        });
      }
    }
  }

  // 🎲 Game night needs the Meeting Hall (its first real job), a Board Game, and two players.
  if (built.has('meeting-hall') && herdHorses.length >= 2) {
    if ((await itemQty(db, herdId, 'board-game')) > 0) {
      const i = Math.floor(rng() * herdHorses.length);
      let j = Math.floor(rng() * (herdHorses.length - 1));
      if (j >= i) j++;
      const hi = herdHorses[i]!;
      const hj = herdHorses[j]!;
      const [a, b] = hi.id < hj.id ? [hi, hj] : [hj, hi];
      const row = (
        await db
          .select()
          .from(relationships)
          .where(
            and(
              eq(relationships.herdId, herdId),
              eq(relationships.horseA, a.id),
              eq(relationships.horseB, b.id),
            ),
          )
      )[0];
      const affinity = Math.max(
        AFFINITY_MIN,
        Math.min(AFFINITY_MAX, (row?.affinity ?? 0) + GAME_NIGHT_AFFINITY),
      );
      const type = relType(affinity);
      if (row) {
        await db
          .update(relationships)
          .set({ affinity, type, updatedAt: new Date() })
          .where(eq(relationships.id, row.id));
      } else {
        await db
          .insert(relationships)
          .values({ herdId, horseA: a.id, horseB: b.id, affinity, type });
      }
      events.push({
        kind: 'game',
        glyph: '🎲',
        text: `Game night at the Meeting Hall — ${nameOf(a)} and ${nameOf(b)} are surprisingly competitive about it.`,
      });
      if (type && type !== (row?.type ?? null)) events.push(eventFor(type, a, b));
      // Wear and tear: a worn-out game is gentle re-demand, never a loss (the night happened).
      if (rng() < GAME_WEAR_CHANCE) {
        if (await consumeItems(db, herdId, [{ id: 'board-game', qty: 1 }])) {
          events.push({
            kind: 'game',
            glyph: '🎲',
            text: 'The board game is worn through — the dice went under the floorboards for good.',
          });
        }
      }
    }
  }

  return events;
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
  // Pairs are deterministic from temperaments; the rng drives the §7o night life ONLY
  // (who reads, who plays, what wears out) — and only when the herd owns such items, so
  // item-less herds consume zero draws (the twin-determinism check relies on this).
  const herdHorses = await db
    .select()
    .from(horses)
    .where(and(eq(horses.herdId, herdId), eq(horses.lifeStage, 'adult')));
  if (herdHorses.length === 0) return [];
  // Built structures, read once — the Library gates the reading circle, the Meeting Hall
  // gates game night and the game club.
  const built = new Set(
    (
      await db
        .select({ type: structures.type })
        .from(structures)
        .where(eq(structures.herdId, herdId))
    ).map((s) => s.type),
  );
  if (herdHorses.length < 2) {
    // A lone horse still gets its night reading (cozy: company optional, books not).
    return nightLife(db, herdId, herdHorses, built, rng);
  }

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

  events.push(...(await nightLife(db, herdId, herdHorses, built, rng))); // §7o
  events.push(...(await maybeFormClubs(db, herdId, herdHorses, built)));
  return events;
}

export async function getRelationships(db: DB, herdId: string) {
  return db.select().from(relationships).where(eq(relationships.herdId, herdId));
}

export async function getClubs(db: DB, herdId: string) {
  return db.select().from(clubs).where(eq(clubs.herdId, herdId));
}
