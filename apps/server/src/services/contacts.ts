import { and, desc, eq, inArray, isNotNull, ne, or } from 'drizzle-orm';
import type { DB } from '../db/client.js';
import { herds, horses, messages, trades } from '../db/schema.js';

/**
 * Calling Cards (§7q) — the address book, DERIVED at read (nothing stored, nothing to
 * maintain): every herd you've exchanged mail with, traded with, or are tied to by the
 * road (you recruited their find, or they recruited yours — the same tie the Post Office
 * letter celebrates). Latest interaction first; the `via` label remembers how you met.
 */
export interface CallingCard {
  herdId: string;
  name: string;
  via: 'mail' | 'trade' | 'road';
  lastContactAt: number;
}

const CONTACT_CAP = 50;

export async function getCallingCards(db: DB, herdId: string): Promise<CallingCard[]> {
  // Every (otherHerd, when, via) sighting; dedup keeps the most recent.
  const sightings: { other: string; at: number; via: CallingCard['via'] }[] = [];

  const mail = await db
    .select({ from: messages.fromHerd, to: messages.toHerd, at: messages.createdAt })
    .from(messages)
    .where(
      and(
        or(eq(messages.fromHerd, herdId), eq(messages.toHerd, herdId)),
        isNotNull(messages.fromHerd), // system letters introduce nobody
      ),
    )
    .orderBy(desc(messages.createdAt))
    .limit(200);
  for (const m of mail) {
    const other = m.from === herdId ? m.to : m.from;
    if (other && other !== herdId) sightings.push({ other, at: m.at.getTime(), via: 'mail' });
  }

  const swaps = await db
    .select({ from: trades.fromHerd, to: trades.toHerd, at: trades.createdAt })
    .from(trades)
    .where(or(eq(trades.fromHerd, herdId), eq(trades.toHerd, herdId)))
    .orderBy(desc(trades.createdAt))
    .limit(200);
  for (const t of swaps) {
    const other = t.from === herdId ? t.to : t.from;
    if (other !== herdId) sightings.push({ other, at: t.at.getTime(), via: 'trade' });
  }

  // The road: horses now in MY herd that someone else first met…
  const adopted = await db
    .select({ other: horses.firstEncounteredBy, at: horses.bornAt })
    .from(horses)
    .where(
      and(
        eq(horses.herdId, herdId),
        isNotNull(horses.firstEncounteredBy),
        ne(horses.firstEncounteredBy, herdId),
      ),
    );
  for (const h of adopted) {
    if (h.other) sightings.push({ other: h.other, at: h.at.getTime(), via: 'road' });
  }
  // …and horses I first met that found another home.
  const placed = await db
    .select({ other: horses.herdId, at: horses.bornAt })
    .from(horses)
    .where(
      and(
        eq(horses.firstEncounteredBy, herdId),
        isNotNull(horses.herdId),
        ne(horses.herdId, herdId),
      ),
    );
  for (const h of placed) {
    if (h.other) sightings.push({ other: h.other, at: h.at.getTime(), via: 'road' });
  }

  // Dedup to the freshest sighting per herd.
  const best = new Map<string, { at: number; via: CallingCard['via'] }>();
  for (const s of sightings) {
    const prev = best.get(s.other);
    if (!prev || s.at > prev.at) best.set(s.other, { at: s.at, via: s.via });
  }
  if (best.size === 0) return [];

  const named = await db
    .select({ id: herds.id, name: herds.name })
    .from(herds)
    .where(inArray(herds.id, [...best.keys()]));
  const nameOf = new Map(named.map((h) => [h.id, h.name]));

  return [...best.entries()]
    .map(([other, s]) => ({
      herdId: other,
      name: nameOf.get(other) ?? 'A herd since departed',
      via: s.via,
      lastContactAt: s.at,
    }))
    .filter((c) => nameOf.has(c.herdId)) // departed herds drop off the rolodex
    .sort((a, b) => b.lastContactAt - a.lastContactAt)
    .slice(0, CONTACT_CAP);
}
