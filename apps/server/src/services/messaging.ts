import { desc, eq } from 'drizzle-orm';
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

export async function getInbox(db: DB, herdId: string, limit = 50) {
  return db
    .select()
    .from(messages)
    .where(eq(messages.toHerd, herdId))
    .orderBy(desc(messages.createdAt))
    .limit(limit);
}
