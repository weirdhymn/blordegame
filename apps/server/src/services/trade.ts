import { and, eq, or } from 'drizzle-orm';
import type { DB } from '../db/client.js';
import { herds, horses, trades } from '../db/schema.js';
import { logAudit } from './audit.js';
import { getHorse } from './horse.js';
import { creditCubes, spendCubes } from './wallet.js';

// Sentinel: a side's conditional debit found the balance short → roll the accept back.
class SideShort extends Error {}

export interface TradeOffer {
  toHerd: string;
  offerHorses?: string[];
  offerCubes?: number;
  requestHorses?: string[];
  requestCubes?: number;
}

export type CreateTradeResult =
  | { ok: false; code: 'bad_request' | 'not_owned' | 'cant_afford'; message: string }
  | { ok: true; tradeId: string };

/** Propose a trade. The offer side is validated now; both sides are re-checked at accept. */
export async function createTrade(
  db: DB,
  fromHerd: string,
  offer: TradeOffer,
): Promise<CreateTradeResult> {
  const offerHorses = offer.offerHorses ?? [];
  const requestHorses = offer.requestHorses ?? [];
  const offerCubes = Math.max(0, Math.floor(offer.offerCubes ?? 0));
  const requestCubes = Math.max(0, Math.floor(offer.requestCubes ?? 0));
  if (!offer.toHerd || offer.toHerd === fromHerd) {
    return { ok: false, code: 'bad_request', message: 'Pick another herd to trade with.' };
  }
  // The recipient must actually exist — otherwise ghost trades clutter the table (audit §11).
  const recipient = await db.query.herds.findFirst({ where: eq(herds.id, offer.toHerd) });
  if (!recipient) {
    return { ok: false, code: 'bad_request', message: 'No such herd to trade with.' };
  }
  if (offerHorses.length + offerCubes + requestHorses.length + requestCubes === 0) {
    return { ok: false, code: 'bad_request', message: 'An empty trade.' };
  }
  for (const hid of offerHorses) {
    const h = await getHorse(db, hid);
    if (!h || h.herdId !== fromHerd) {
      return { ok: false, code: 'not_owned', message: 'You can only offer your own horses.' };
    }
  }
  const from = await db.query.herds.findFirst({ where: eq(herds.id, fromHerd) });
  if (!from || from.cubes < offerCubes) {
    return { ok: false, code: 'cant_afford', message: 'Not enough Cubes to offer.' };
  }

  const [row] = await db
    .insert(trades)
    .values({
      fromHerd,
      toHerd: offer.toHerd,
      offerHorses,
      offerCubes,
      requestHorses,
      requestCubes,
    })
    .returning({ id: trades.id });
  await logAudit(db, fromHerd, 'trade_offer', { tradeId: row?.id, toHerd: offer.toHerd });
  return { ok: true, tradeId: row?.id ?? '' };
}

export type AcceptResult =
  | {
      ok: false;
      code: 'not_found' | 'not_recipient' | 'gone' | 'invalid' | 'cant_afford';
      message: string;
    }
  | { ok: true };

/** Accept a trade — atomic swap of horses + Cubes, re-verifying ownership both ways. */
export async function acceptTrade(
  db: DB,
  accepterHerd: string,
  tradeId: string,
): Promise<AcceptResult> {
  const t = await db.query.trades.findFirst({ where: eq(trades.id, tradeId) });
  if (!t || t.status !== 'pending')
    return { ok: false, code: 'not_found', message: 'No such open trade.' };
  if (t.toHerd !== accepterHerd)
    return { ok: false, code: 'not_recipient', message: 'This trade is not for you.' };

  let result: AcceptResult;
  try {
    result = await db.transaction(async (tx): Promise<AcceptResult> => {
      const ownedBy = async (ids: string[], herdId: string): Promise<boolean> => {
        for (const id of ids) {
          const h = await tx.query.horses.findFirst({ where: eq(horses.id, id) });
          if (!h || h.herdId !== herdId) return false;
        }
        return true;
      };
      if (
        !(await ownedBy(t.offerHorses, t.fromHerd)) ||
        !(await ownedBy(t.requestHorses, t.toHerd))
      ) {
        return { ok: false, code: 'invalid', message: 'A horse in this trade changed hands.' };
      }
      const from = await tx.query.herds.findFirst({ where: eq(herds.id, t.fromHerd) });
      const to = await tx.query.herds.findFirst({ where: eq(herds.id, t.toHerd) });
      if (!from || !to || from.cubes < t.offerCubes || to.cubes < t.requestCubes) {
        return { ok: false, code: 'cant_afford', message: 'Not enough Cubes on one side.' };
      }

      const claimed = await tx
        .update(trades)
        .set({ status: 'accepted' })
        .where(and(eq(trades.id, tradeId), eq(trades.status, 'pending')))
        .returning({ id: trades.id });
      if (claimed.length === 0)
        return { ok: false, code: 'gone', message: 'Trade already resolved.' };

      for (const id of t.offerHorses)
        await tx.update(horses).set({ herdId: t.toHerd }).where(eq(horses.id, id));
      for (const id of t.requestHorses)
        await tx.update(horses).set({ herdId: t.fromHerd }).where(eq(horses.id, id));
      // Cubes through the kernel (audit P0): each side SPENDS what it gives (conditional —
      // a concurrent spend elsewhere can no longer drive a balance negative) and is then
      // credited what it receives. Either shortfall rolls the whole accept back.
      if (t.offerCubes > 0 && (await spendCubes(tx, t.fromHerd, t.offerCubes)) === null) {
        throw new SideShort();
      }
      if (t.requestCubes > 0 && (await spendCubes(tx, t.toHerd, t.requestCubes)) === null) {
        throw new SideShort();
      }
      if (t.requestCubes > 0) await creditCubes(tx, t.fromHerd, t.requestCubes);
      if (t.offerCubes > 0) await creditCubes(tx, t.toHerd, t.offerCubes);
      return { ok: true };
    });
  } catch (e) {
    if (e instanceof SideShort) {
      return { ok: false, code: 'cant_afford', message: 'Not enough Cubes on one side.' };
    }
    throw e;
  }

  if (result.ok) await logAudit(db, accepterHerd, 'trade_accept', { tradeId, from: t.fromHerd });
  return result;
}

export async function resolveTrade(
  db: DB,
  herdId: string,
  tradeId: string,
  status: 'declined' | 'cancelled',
): Promise<boolean> {
  // recipient declines; proposer cancels
  const whoCol = status === 'declined' ? trades.toHerd : trades.fromHerd;
  const res = await db
    .update(trades)
    .set({ status })
    .where(and(eq(trades.id, tradeId), eq(whoCol, herdId), eq(trades.status, 'pending')))
    .returning({ id: trades.id });
  return res.length > 0;
}

export async function listTrades(db: DB, herdId: string) {
  return db
    .select()
    .from(trades)
    .where(
      and(eq(trades.status, 'pending'), or(eq(trades.fromHerd, herdId), eq(trades.toHerd, herdId))),
    );
}
