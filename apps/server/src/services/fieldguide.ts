import { FIELD_GUIDE_MILESTONES } from '@blorse/balance';
import { count, eq } from 'drizzle-orm';
import { enumerateColors, resolve, slugify, type Genotype } from '@blorse/genetics';
import type { DB } from '../db/client.js';
import { fieldGuide, guideMilestones } from '../db/schema.js';
import { gameDay } from '../util/clock.js';
import { logAudit } from './audit.js';
import { addJournalEvents } from './journal.js';
import { creditCubes } from './wallet.js';

const CATALOG_SIZE = enumerateColors().length;

/** One claimed Field Guide milestone (§7n) — rides the daily digest's ledger. */
export interface GuideBeat {
  coats: number;
  cubes: number;
}

/**
 * Record a horse's revealed coat in its herd's Field Guide (idempotent; keeps first) and pay
 * any milestone the new count crosses — the Naturalist's Purse (§7n). A single reveal can
 * cross several thresholds at once (e.g. a recruited rarity landing on a sparse page); each
 * pays exactly once via the unique (herd, coats) index, kernels-style. `day` stamps the
 * journal beat (callers in the daily catch-up pass the tick day).
 */
export async function recordDiscovery(
  db: DB,
  herdId: string,
  horse: { id: string; genotype: Genotype },
  day?: number,
): Promise<GuideBeat[]> {
  const r = resolve(horse.genotype);
  if (r.flags.isLethal) return []; // non-viable never reveals a coat
  const inserted = await db
    .insert(fieldGuide)
    .values({
      herdId,
      colorSlug: slugify(r.displayName),
      name: r.displayName,
      firstHorseId: horse.id,
    })
    .onConflictDoNothing({ target: [fieldGuide.herdId, fieldGuide.colorSlug] })
    .returning({ slug: fieldGuide.colorSlug });
  if (inserted.length === 0) return []; // a re-discovery moves no needle

  const [n] = await db.select({ n: count() }).from(fieldGuide).where(eq(fieldGuide.herdId, herdId));
  const coatsNow = n?.n ?? 0;

  const beats: GuideBeat[] = [];
  for (const m of FIELD_GUIDE_MILESTONES) {
    if (coatsNow < m.coats) continue;
    const claimed = await db
      .insert(guideMilestones)
      .values({ herdId, coats: m.coats })
      .onConflictDoNothing()
      .returning({ id: guideMilestones.id });
    if (claimed.length === 0) continue; // already paid
    await creditCubes(db, herdId, m.cubes);
    beats.push({ coats: m.coats, cubes: m.cubes });
  }
  if (beats.length > 0) {
    await logAudit(db, herdId, 'guide_milestone', {
      coats: beats.map((b) => b.coats),
      cubes: beats.reduce((s, b) => s + b.cubes, 0),
    });
    // The Journal hears about it too — the mid-day path (a recruit/befriend completing a
    // page) has no Morning Post to ride, so the beat IS the announcement.
    await addJournalEvents(
      db,
      herdId,
      day ?? gameDay(Date.now()),
      beats.map((b) => ({
        kind: 'guide',
        glyph: '📖',
        text: `The Field Guide reached ${b.coats} coats — the Naturalists sent ${b.cubes} ⬡ and a very formal letter.`,
      })),
    );
  }
  return beats;
}

export interface FieldGuideView {
  discovered: { slug: string; name: string }[];
  discoveredCount: number;
  catalogSize: number;
  /** The Naturalist's Purse ladder (§7n) — thresholds with claimed flags, for the Guide page. */
  milestones: { coats: number; cubes: number; claimed: boolean }[];
}

export async function getFieldGuide(db: DB, herdId: string): Promise<FieldGuideView> {
  const rows = await db
    .select({ slug: fieldGuide.colorSlug, name: fieldGuide.name })
    .from(fieldGuide)
    .where(eq(fieldGuide.herdId, herdId));
  const claimed = new Set(
    (
      await db
        .select({ coats: guideMilestones.coats })
        .from(guideMilestones)
        .where(eq(guideMilestones.herdId, herdId))
    ).map((m) => m.coats),
  );
  return {
    discovered: rows,
    discoveredCount: rows.length,
    catalogSize: CATALOG_SIZE,
    milestones: FIELD_GUIDE_MILESTONES.map((m) => ({ ...m, claimed: claimed.has(m.coats) })),
  };
}
