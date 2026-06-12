import { desc, eq } from 'drizzle-orm';
import { resolve } from '@blorse/genetics';
import type { DB } from '../db/client.js';
import { clubs, herds, horses, journalEvents } from '../db/schema.js';

/** Public, async view of another herd's grounds + journal highlights (§10). */
export async function getHerdProfile(db: DB, herdId: string) {
  const herd = await db.query.herds.findFirst({ where: eq(herds.id, herdId) });
  if (!herd) return null;

  const owned = await db.select().from(horses).where(eq(horses.herdId, herdId));
  const highlights = owned.slice(0, 6).map((h) => ({
    id: h.id,
    name: h.name,
    // a visiting player sees foals as white silhouettes — the coat is still hidden (§4.2)
    displayName: h.lifeStage === 'foal' ? 'Foal' : resolve(h.genotype).displayName,
    lifeStage: h.lifeStage,
    // Render fields so visits show REAL sprites (§7q) — ADULTS ONLY: shipping a foal's
    // genotype would let a visitor compute the unrevealed coat (the §4.2 leak class).
    ...(h.lifeStage === 'adult' ? { genotype: h.genotype, seed: h.seed, glitch: h.glitch } : {}),
  }));
  const recentJournal = (
    await db
      .select()
      .from(journalEvents)
      .where(eq(journalEvents.herdId, herdId))
      .orderBy(desc(journalEvents.createdAt))
      .limit(5)
  ).map((j) => ({ kind: j.kind, text: j.text, glyph: j.glyph }));
  const herdClubs = (
    await db.select({ type: clubs.type }).from(clubs).where(eq(clubs.herdId, herdId))
  ).map((c) => c.type);

  return {
    id: herd.id,
    name: herd.name,
    level: herd.level,
    horseCount: owned.length,
    adultCount: owned.filter((h) => h.lifeStage === 'adult').length,
    highlights,
    recentJournal,
    clubs: herdClubs,
  };
}
