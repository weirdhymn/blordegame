import { desc, eq } from 'drizzle-orm';
import type { DB } from '../db/client.js';
import { journalEvents } from '../db/schema.js';

export interface NewJournalEvent {
  kind: string;
  text: string;
  glyph?: string;
}

export async function addJournalEvents(
  db: DB,
  herdId: string,
  day: number,
  events: NewJournalEvent[],
): Promise<void> {
  if (events.length === 0) return;
  await db
    .insert(journalEvents)
    .values(
      events.map((e) => ({ herdId, day, kind: e.kind, text: e.text, glyph: e.glyph ?? null })),
    );
}

export async function getJournal(db: DB, herdId: string, limit = 50) {
  return db
    .select()
    .from(journalEvents)
    .where(eq(journalEvents.herdId, herdId))
    .orderBy(desc(journalEvents.createdAt))
    .limit(limit);
}
