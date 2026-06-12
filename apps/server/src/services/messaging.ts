import { PARCEL_MAX_QTY, PARCEL_MAX_STACKS } from '@blorse/balance';
import { and, count, desc, eq, isNull } from 'drizzle-orm';
import { ITEM_BY_ID } from '../content/items.js';
import type { DB } from '../db/client.js';
import { herds, messages } from '../db/schema.js';
import { logAudit } from './audit.js';
import { consumeItems, grantItems, type ItemStack } from './inventory.js';

export type SendResult =
  | { ok: false; code: 'bad_request' | 'no_recipient' | 'parcel_short'; message: string }
  | { ok: true; messageId: string };

// Sentinel: the parcel couldn't be packed (sender short) — roll the whole letter back.
class StringSnapped extends Error {}

/** Validate a parcel's SHAPE (real items, sane bounds); ownership is checked atomically
 *  at consume time. Returns the cleaned stacks, or null when the parcel is malformed. */
function packParcel(parcel: ItemStack[] | undefined): ItemStack[] | null {
  if (!parcel || parcel.length === 0) return [];
  if (parcel.length > PARCEL_MAX_STACKS) return null;
  const cleaned: ItemStack[] = [];
  const seen = new Set<string>();
  for (const s of parcel) {
    const qty = Math.floor(s.qty);
    if (!ITEM_BY_ID.has(s.id) || qty < 1 || qty > PARCEL_MAX_QTY || seen.has(s.id)) return null;
    seen.add(s.id);
    cleaned.push({ id: s.id, qty });
  }
  return cleaned;
}

export async function sendMessage(
  db: DB,
  fromHerd: string,
  toHerd: string,
  body: string,
  parcel?: ItemStack[],
): Promise<SendResult> {
  const text = (body ?? '').trim();
  if (!text || text.length > 1000) {
    return { ok: false, code: 'bad_request', message: 'A message is 1–1000 characters.' };
  }
  if (!toHerd || toHerd === fromHerd) {
    return { ok: false, code: 'bad_request', message: 'Pick another herd to message.' };
  }
  const packed = packParcel(parcel);
  if (packed === null) {
    return {
      ok: false,
      code: 'bad_request',
      message: `A parcel holds up to ${PARCEL_MAX_STACKS} kinds of thing, ${PARCEL_MAX_QTY} apiece.`,
    };
  }
  const to = await db.query.herds.findFirst({ where: eq(herds.id, toHerd) });
  if (!to) return { ok: false, code: 'no_recipient', message: 'No such herd.' };

  // The gift moves atomically WITH the letter (§7s): consume from the sender (conditional
  // decrements), grant to the recipient, write the letter — one transaction. A short stash
  // snaps the string and nothing moves, nothing sends.
  let messageId = '';
  try {
    await db.transaction(async (tx) => {
      if (packed.length > 0) {
        if (!(await consumeItems(tx, fromHerd, packed))) throw new StringSnapped();
        await grantItems(tx, toHerd, packed);
      }
      const [row] = await tx
        .insert(messages)
        .values({ fromHerd, toHerd, body: text, parcel: packed.length > 0 ? packed : null })
        .returning({ id: messages.id });
      messageId = row?.id ?? '';
    });
  } catch (e) {
    if (e instanceof StringSnapped) {
      return {
        ok: false,
        code: 'parcel_short',
        message: 'The string snapped — you do not have all of that to give.',
      };
    }
    throw e;
  }
  if (packed.length > 0) {
    await logAudit(db, fromHerd, 'gift', { toHerd, parcel: packed, messageId });
  }
  return { ok: true, messageId };
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
  /** Items that rode this letter (§7s) — already delivered; this is the gift tag. */
  parcel: ItemStack[] | null;
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
      parcel: messages.parcel,
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
    parcel: r.parcel,
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
