import { and, eq } from 'drizzle-orm';
import {
  AFFINITY_MAX,
  AFFINITY_MIN,
  AUTONOMY_ENCOUNTERS_BASE,
  AUTONOMY_ENCOUNTERS_CAP,
  AUTONOMY_ENCOUNTERS_PER,
  AUTONOMY_ESCAPADE_CHANCE,
  AUTONOMY_INSTIGATE_E_BIAS,
  AUTONOMY_JITTER,
  AUTONOMY_ODD_COUPLE_COMPAT_MAX,
  AUTONOMY_PARTNER_AFFINITY_BIAS,
  AUTONOMY_QUIRK_CHANCE,
  AUTONOMY_VOL_C_COEFF,
  AUTONOMY_VOL_MIN,
  AUTONOMY_VOL_N_COEFF,
  BONDED_THRESHOLD,
  CLUB_MIN_MEMBERS,
  FRIEND_THRESHOLD,
  GAME_NIGHT_AFFINITY,
  GAME_WEAR_CHANCE,
  HORSE_MAX_QUIRKS,
  NIGHT_READ_XP,
  PERSONALITY_KEYS,
  RIVAL_THRESHOLD,
} from '@blorse/balance';
import {
  bondBeat,
  escapadeBeat,
  fallingOutBeat,
  friendshipBeat,
  HERD_GLYPH,
  type Mover,
  oddCoupleBeat,
  pickQuirk,
  quirkBeat,
  rivalryBeat,
} from '../content/herd-life.js';
import type { DB } from '../db/client.js';
import { clubs, horses, relationships, structures, type HorseRow } from '../db/schema.js';
import { consumeItems, itemQty } from './inventory.js';
import { accLabel } from './jobs.js';
import type { NewJournalEvent } from './journal.js';
import { compatibility, type Personality } from './personality.js';
import { accomplishmentsForLevel, grantSkillXp, type SkillBlock, type StatBlock } from './stats.js';
import { mulberry32 } from '../util/rng.js';

type RelType = 'bonded' | 'friend' | 'rival';

function relType(affinity: number): RelType | null {
  if (affinity >= BONDED_THRESHOLD) return 'bonded';
  if (affinity >= FRIEND_THRESHOLD) return 'friend';
  if (affinity <= RIVAL_THRESHOLD) return 'rival';
  return null;
}

const nameOf = (h: HorseRow): string => h.name ?? 'A horse';
const mover = (h: HorseRow): Mover => ({ name: nameOf(h), p: h.personality as Personality });
const pers = (h: HorseRow): Personality => h.personality as Personality;

/** The relationships row is always keyed by id order (horseA < horseB) — the canonical key the
 *  table was always written with, so a new encounter finds and updates the existing row rather
 *  than racing a duplicate. (Encounter SELECTION, separately, runs over a personality-sorted
 *  array; the two orderings are independent on purpose — see resolveAutonomyForDay.) */
const idPair = (x: HorseRow, y: HorseRow): [HorseRow, HorseRow] => (x.id < y.id ? [x, y] : [y, x]);
const relKey = (x: HorseRow, y: HorseRow): string => {
  const [p, q] = idPair(x, y);
  return `${p.id}|${q.id}`;
};

/** A plain relationship-threshold beat (friend / bonded / rival), in the herd's voice. */
function relBeat(rng: () => number, type: RelType, a: HorseRow, b: HorseRow): NewJournalEvent {
  const ma = mover(a);
  const mb = mover(b);
  if (type === 'bonded')
    return { kind: 'bonded', glyph: HERD_GLYPH.bonded, text: bondBeat(rng, ma, mb) };
  if (type === 'rival')
    return { kind: 'rival', glyph: HERD_GLYPH.rival, text: rivalryBeat(rng, ma, mb) };
  return { kind: 'friend', glyph: HERD_GLYPH.friend, text: friendshipBeat(rng, ma, mb) };
}

// ── Seeded selection helpers (§8.1) ──

/** Draw an index in proportion to weights (all draws on the day's seeded rng). */
function weightedIndex(rng: () => number, weights: number[]): number {
  const total = weights.reduce((s, w) => s + w, 0);
  if (total <= 0) return 0;
  let r = rng() * total;
  for (let i = 0; i < weights.length; i++) {
    r -= weights[i] ?? 0;
    if (r < 0) return i;
  }
  return weights.length - 1;
}

/** Temperament scales the jitter: Neuroticism amplifies the swing (drama), Conscientiousness
 *  steadies it (calm). A high-N pair lurches; a high-C pair is dependable. */
function volatility(a: Personality, b: Personality): number {
  const avgN = ((a.n ?? 50) + (b.n ?? 50)) / 2 / 100;
  const avgC = ((a.c ?? 50) + (b.c ?? 50)) / 2 / 100;
  return Math.max(AUTONOMY_VOL_MIN, 1 + AUTONOMY_VOL_N_COEFF * avgN - AUTONOMY_VOL_C_COEFF * avgC);
}

/** Stable, twin-portable order: by temperament, then id. Two herds with matching temperaments
 *  sort identically though their ids differ, so the seeded encounter picks — and therefore the
 *  beats — are a pure function of (seed, personalities). The id tiebreak only ever separates two
 *  truly identical temperaments within ONE herd, where ids are fixed across catch-up replays. */
function personalityOrder(a: HorseRow, b: HorseRow): number {
  const pa = pers(a);
  const pb = pers(b);
  for (const k of PERSONALITY_KEYS) {
    const d = (pa[k] ?? 50) - (pb[k] ?? 50);
    if (d !== 0) return d;
  }
  return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
}

/**
 * Classify one encounter's outcome into a journal beat (or none). The surprises live here:
 * a low-compatibility pair that bonds anyway is an "odd couple" (✨, its own kind — never
 * mistaken for an ordinary friendship); a warm pair that cools is a "falling-out" (💔). Plain
 * threshold crossings read as friend/bonded/rival. No crossing → no beat (the journal stays
 * sparse so each line lands). `base` is the un-jittered compatibility lean — it's what tells an
 * odd couple from an expected one.
 */
function classifyBeat(
  rng: () => number,
  prevType: RelType | null,
  type: RelType | null,
  base: number,
  a: HorseRow,
  b: HorseRow,
): NewJournalEvent | null {
  // A warm bond/friendship newly formed against a low compatibility lean → the surprise.
  const oddLean = base <= AUTONOMY_ODD_COUPLE_COMPAT_MAX;

  if (type === 'bonded' && prevType !== 'bonded') {
    if (oddLean && prevType !== 'friend')
      return {
        kind: 'odd-couple',
        glyph: HERD_GLYPH.oddCouple,
        text: oddCoupleBeat(rng, mover(a), mover(b)),
      };
    return relBeat(rng, 'bonded', a, b);
  }
  if (type === 'friend' && prevType !== 'friend' && prevType !== 'bonded') {
    if (oddLean)
      return {
        kind: 'odd-couple',
        glyph: HERD_GLYPH.oddCouple,
        text: oddCoupleBeat(rng, mover(a), mover(b)),
      };
    return relBeat(rng, 'friend', a, b);
  }
  if (type === 'rival' && prevType !== 'rival') {
    return relBeat(rng, 'rival', a, b);
  }
  // A friendship/bond that went cold — the warm beats are what make this one land.
  if ((prevType === 'friend' || prevType === 'bonded') && type !== 'friend' && type !== 'bonded') {
    return {
      kind: 'falling-out',
      glyph: HERD_GLYPH.fallingOut,
      text: fallingOutBeat(rng, mover(a), mover(b)),
    };
  }
  return null;
}

/**
 * The day's ENCOUNTERS (§8.1) — a few seeded meetings, not a roll-call of every pair. Bold
 * (high-Extraversion) horses are likelier to instigate; partners lean mildly toward existing
 * friends. Each meeting nudges affinity by compatibility + a seeded, temperament-scaled jitter,
 * so a compatible pair USUALLY warms but can have an off day, and a mismatch can — rarely —
 * click. Bounded: clamp(BASE + adults/PER, 1, CAP) meetings, one graph read for the whole day.
 */
async function resolveEncounters(
  db: DB,
  herdId: string,
  herdHorses: HorseRow[],
  rng: () => number,
): Promise<NewJournalEvent[]> {
  const events: NewJournalEvent[] = [];
  const adults = herdHorses.length;
  const count = Math.max(
    1,
    Math.min(
      AUTONOMY_ENCOUNTERS_CAP,
      AUTONOMY_ENCOUNTERS_BASE + Math.floor(adults / AUTONOMY_ENCOUNTERS_PER),
    ),
  );

  // One read of the whole relationship graph (the audit's N+1 fix), kept fresh as the day's
  // encounters land so a pair drawn twice in a day sees its own earlier nudge.
  const graph = new Map(
    (await getRelationships(db, herdId)).map((r) => [`${r.horseA}|${r.horseB}`, r]),
  );

  const instWeights = herdHorses.map(
    (h) => 1 + AUTONOMY_INSTIGATE_E_BIAS * ((pers(h).e ?? 50) / 100),
  );

  for (let n = 0; n < count; n++) {
    const i = weightedIndex(rng, instWeights);
    const inst = herdHorses[i];
    if (!inst) continue;
    // Partner: anyone but the instigator, weighted gently toward an existing friend (warmth
    // compounds — the herd's cliques deepen rather than reshuffling at random every day).
    const partnerWeights = herdHorses.map((h, idx) => {
      if (idx === i) return 0;
      const aff = graph.get(relKey(inst, h))?.affinity ?? 0;
      return 1 + AUTONOMY_PARTNER_AFFINITY_BIAS * Math.max(0, aff);
    });
    const partner = herdHorses[weightedIndex(rng, partnerWeights)];
    if (!partner || partner.id === inst.id) continue;

    const [a, b] = idPair(inst, partner);
    const base = compatibility(pers(a), pers(b));
    const jitter = (rng() * 2 - 1) * AUTONOMY_JITTER * volatility(pers(a), pers(b));
    const delta = Math.round(base + jitter);

    const prev = graph.get(`${a.id}|${b.id}`);
    const prevType = (prev?.type ?? null) as RelType | null;
    const affinity = Math.max(AFFINITY_MIN, Math.min(AFFINITY_MAX, (prev?.affinity ?? 0) + delta));
    const type = relType(affinity);

    if (!prev) {
      const inserted = (
        await db
          .insert(relationships)
          .values({ herdId, horseA: a.id, horseB: b.id, affinity, type })
          .returning()
      )[0];
      if (inserted) graph.set(`${a.id}|${b.id}`, inserted);
    } else {
      await db
        .update(relationships)
        .set({ affinity, type, updatedAt: new Date() })
        .where(eq(relationships.id, prev.id));
      graph.set(`${a.id}|${b.id}`, { ...prev, affinity, type });
    }

    const beat = classifyBeat(rng, prevType, type, base, a, b);
    if (beat) events.push(beat);
  }
  return events;
}

/**
 * Solo beats (§8.1) — the small private charm that keeps even a young, bond-less herd alive in
 * the Journal. A high-Openness horse may pick up a cosmetic QUIRK (persistent, capped at
 * HORSE_MAX_QUIRKS, never a stat); a curious/bold horse may slip off on a moonlit ESCAPADE and
 * come back faintly changed (no state, all flavour). Both ride the day's seeded rng.
 */
async function resolveSolo(
  db: DB,
  herdHorses: HorseRow[],
  rng: () => number,
): Promise<NewJournalEvent[]> {
  const events: NewJournalEvent[] = [];

  // 🌿 A quirk picked up — Openness drives curiosity; a maxed-out horse has character enough.
  if (rng() < AUTONOMY_QUIRK_CHANCE) {
    const eligible = herdHorses.filter((h) => (h.quirks as string[]).length < HORSE_MAX_QUIRKS);
    if (eligible.length > 0) {
      const w = eligible.map((h) => 1 + Math.max(0, ((pers(h).o ?? 50) - 50) / 50));
      const h = eligible[weightedIndex(rng, w)];
      if (h) {
        const owned = h.quirks as string[];
        const phrase = pickQuirk(rng, owned);
        if (phrase) {
          await db
            .update(horses)
            .set({ quirks: [...owned, phrase] })
            .where(eq(horses.id, h.id));
          events.push({
            kind: 'quirk',
            glyph: HERD_GLYPH.quirk,
            text: quirkBeat(rng, nameOf(h), phrase),
          });
        }
      }
    }
  }

  // 🌙 A moonlit escapade — curiosity + boldness draw a horse over the fence and back again.
  if (rng() < AUTONOMY_ESCAPADE_CHANCE && herdHorses.length > 0) {
    const w = herdHorses.map((h) => {
      const p = pers(h);
      return 1 + Math.max(0, (((p.o ?? 50) + (p.e ?? 50)) / 2 - 50) / 50);
    });
    const h = herdHorses[weightedIndex(rng, w)];
    if (h)
      events.push({
        kind: 'escapade',
        glyph: HERD_GLYPH.escapade,
        text: escapadeBeat(rng, mover(h)),
      });
  }

  return events;
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
      const [a, b] = idPair(hi, hj);
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
      if (type && type !== (row?.type ?? null)) events.push(relBeat(rng, type, a, b));
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
 * One day of autonomy for a herd (§8). A few SEEDED encounters nudge relationships (with a
 * temperament-scaled jitter, so outcomes surprise without ever being random noise), solo beats
 * add private charm, night life consumes crafted goods, and clubs self-organize. Deterministic
 * (every draw rides the day's seeded rng) and bounded (a handful of encounters, not every pair).
 * Returns the journal events to append.
 */
export async function resolveAutonomyForDay(
  db: DB,
  herdId: string,
  rng: () => number,
): Promise<NewJournalEvent[]> {
  const raw = await adultsOf(db, herdId);
  if (raw.length === 0) return [];
  // Selection order is temperament-then-id (twin-portable; see personalityOrder). The relationship
  // ROW key stays id-canonical (see idPair) — the two orderings are deliberately independent.
  const herdHorses = [...raw].sort(personalityOrder);
  const built = await builtOf(db, herdId);

  // Carve an independent sub-stream off the day's rng for each pass, so adding or reordering one
  // pass never perturbs another's seeded outcomes — a dramatic relationships day doesn't change
  // who reads a book that night, and the §7o night-life tests can drive their pass in isolation.
  const sub = (): (() => number) => mulberry32(Math.floor(rng() * 0x1_0000_0000) >>> 0);
  const encRng = sub();
  const soloRng = sub();
  const nightRng = sub();

  const events: NewJournalEvent[] = [];
  if (herdHorses.length >= 2) {
    events.push(...(await resolveEncounters(db, herdId, herdHorses, encRng))); // §8.1 encounters
  }
  events.push(...(await resolveSolo(db, herdHorses, soloRng))); // §8.1 quirks + escapades
  events.push(...(await nightLife(db, herdId, herdHorses, built, nightRng))); // §7o
  events.push(...(await maybeFormClubs(db, herdId, herdHorses, built))); // §8.4
  return events;
}

/** The day's adult roster — the only horses the autonomy sim acts on (§8). */
const adultsOf = (db: DB, herdId: string): Promise<HorseRow[]> =>
  db
    .select()
    .from(horses)
    .where(and(eq(horses.herdId, herdId), eq(horses.lifeStage, 'adult')));

/** Built structures, read once — the Library gates the reading circle, the Meeting Hall gates
 *  game night and the game club. */
const builtOf = async (db: DB, herdId: string): Promise<Set<string>> =>
  new Set(
    (
      await db
        .select({ type: structures.type })
        .from(structures)
        .where(eq(structures.herdId, herdId))
    ).map((s) => s.type),
  );

/**
 * The §7o structure-gated evening in isolation — books read, games played, the clubs that form
 * at the Hall. resolveAutonomyForDay runs these same passes on its own night sub-stream; this
 * entry lets white-box tests drive the night life directly on a given rng, without the day's
 * encounters consuming draws ahead of it.
 */
export async function resolveNightLifeForDay(
  db: DB,
  herdId: string,
  rng: () => number,
): Promise<NewJournalEvent[]> {
  const raw = await adultsOf(db, herdId);
  if (raw.length === 0) return [];
  const herdHorses = [...raw].sort(personalityOrder);
  const built = await builtOf(db, herdId);
  return [
    ...(await nightLife(db, herdId, herdHorses, built, rng)),
    ...(await maybeFormClubs(db, herdId, herdHorses, built)),
  ];
}

export async function getRelationships(db: DB, herdId: string) {
  return db.select().from(relationships).where(eq(relationships.herdId, herdId));
}

export async function getClubs(db: DB, herdId: string) {
  return db.select().from(clubs).where(eq(clubs.herdId, herdId));
}
