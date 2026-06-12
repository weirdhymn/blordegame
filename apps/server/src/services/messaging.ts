import { and, count, desc, eq, isNull } from 'drizzle-orm';
import type { DB } from '../db/client.js';
import { herds, messages } from '../db/schema.js';

export type SendResult =
  | { ok: false; code: 'bad_request' | 'no_recipient'; message: string }
  | { ok: true; messageId: string };

export async function sendMessage(
  db: DB,
  fromHerd: string,
  toHerd: string,
  body: string,
): Promise<SendResult> {
  const text = (body ?? '').trim();
  if (!text || text.length > 1000) {
    return { ok: false, code: 'bad_request', message: 'A message is 1–1000 characters.' };
  }
  if (!toHerd || toHerd === fromHerd) {
    return { ok: false, code: 'bad_request', message: 'Pick another herd to message.' };
  }
  const to = await db.query.herds.findFirst({ where: eq(herds.id, toHerd) });
  if (!to) return { ok: false, code: 'no_recipient', message: 'No such herd.' };

  const [row] = await db
    .insert(messages)
    .values({ fromHerd, toHerd, body: text })
    .returning({ id: messages.id });
  return { ok: true, messageId: row?.id ?? '' };
}

/** A letter from the Post Office itself (§7p) — fromHerd null; the client shows the
 *  postmark, not a sender. Server-only faucet for system news (recruit notices, etc.). */
export async function sendSystemLetter(db: DB, toHerd: string, body: string): Promise<void> {
  await db.insert(messages).values({ fromHerd: null, toHerd, body });
}

/** One inbox letter, sender resolved (§7p) — null sender = the Post Office. */
export interface InboxLetter {
  id: string;
  fromHerd: string | null;
  fromName: string | null;
  body: string;
  read: boolean;
  createdAt: number;
}

export async function getInbox(db: DB, herdId: string, limit = 50): Promise<InboxLetter[]> {
  // LEFT join: system letters have no sender row and still deliver.
  const rows = await db
    .select({
      id: messages.id,
      fromHerd: messages.fromHerd,
      fromName: herds.name,
      body: messages.body,
      readAt: messages.readAt,
      createdAt: messages.createdAt,
    })
    .from(messages)
    .leftJoin(herds, eq(messages.fromHerd, herds.id))
    .where(eq(messages.toHerd, herdId))
    .orderBy(desc(messages.createdAt))
    .limit(limit);
  return rows.map((r) => ({
    id: r.id,
    fromHerd: r.fromHerd,
    fromName: r.fromHerd ? (r.fromName ?? 'A herd since departed') : null,
    body: r.body,
    read: r.readAt !== null,
    createdAt: r.createdAt.getTime(),
  }));
}

/** Unread letters — the little number on the Town tab (§7p). */
export async function unreadCount(db: DB, herdId: string): Promise<number> {
  const [row] = await db
    .select({ n: count() })
    .from(messages)
    .where(and(eq(messages.toHerd, herdId), isNull(messages.readAt)));
  return row?.n ?? 0;
}

/** Opening the Post Office reads everything — one stamp, no per-letter ceremony (§7p). */
export async function markAllRead(db: DB, herdId: string): Promise<void> {
  await db
    .update(messages)
    .set({ readAt: new Date() })
    .where(and(eq(messages.toHerd, herdId), isNull(messages.readAt)));
}
