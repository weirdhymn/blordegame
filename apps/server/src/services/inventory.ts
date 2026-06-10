import { and, eq, sql } from 'drizzle-orm';
import { ITEM_SELL_VALUE } from '@blorse/balance';
import type { DbLike } from '../db/client.js';
import { inventory } from '../db/schema.js';
import { logAudit } from './audit.js';
import { creditCubes } from './wallet.js';

export interface ItemStack {
  id: string;
  qty: number;
}

/** Add items to a herd's stash (upsert + increment). */
export async function grantItems(db: DbLike, herdId: string, grants: ItemStack[]): Promise<void> {
  for (const g of grants) {
    if (g.qty <= 0) continue;
    await db
      .insert(inventory)
      .values({ herdId, itemId: g.id, qty: g.qty })
      .onConflictDoUpdate({
        target: [inventory.herdId, inventory.itemId],
        set: { qty: sql`${inventory.qty} + ${g.qty}` },
      });
  }
}

export async function getInventory(db: DbLike, herdId: string): Promise<ItemStack[]> {
  const rows = await db
    .select({ id: inventory.itemId, qty: inventory.qty })
    .from(inventory)
    .where(eq(inventory.herdId, herdId));
  return rows;
}

export async function itemQty(db: DbLike, herdId: string, itemId: string): Promise<number> {
  const rows = await db
    .select({ qty: inventory.qty })
    .from(inventory)
    .where(and(eq(inventory.herdId, herdId), eq(inventory.itemId, itemId)));
  return rows[0]?.qty ?? 0;
}

// Sentinel: a conditional decrement found the stash short → roll the transaction back.
class InsufficientItems extends Error {}

/**
 * Remove items only if the herd has enough of EVERY one; returns false (no change) otherwise.
 * Atomic (§11 hardening): each removal is a conditional decrement (`qty >= n` in the WHERE) inside
 * one transaction, so a concurrent consume can't slip between a check and the act — a shortfall on
 * any item rolls the whole batch back. Runs as a savepoint when called inside a caller's transaction.
 */
export async function consumeItems(
  db: DbLike,
  herdId: string,
  items: ItemStack[],
): Promise<boolean> {
  try {
    await db.transaction(async (tx) => {
      for (const need of items) {
        if (need.qty <= 0) continue;
        const rows = await tx
          .update(inventory)
          .set({ qty: sql`${inventory.qty} - ${need.qty}` })
          .where(
            sql`${inventory.herdId} = ${herdId} and ${inventory.itemId} = ${need.id} and ${inventory.qty} >= ${need.qty}`,
          )
          .returning({ qty: inventory.qty });
        if (rows.length === 0) throw new InsufficientItems();
      }
    });
    return true;
  } catch (e) {
    if (e instanceof InsufficientItems) return false;
    throw e;
  }
}

export type SellResult =
  | { ok: false; code: 'not_sellable' | 'none_held'; message: string }
  | { ok: true; itemId: string; sold: number; gained: number; cubes: number };

/**
 * Quick-sell surplus items for a modest Cube sum (a convenience dump, never an income strategy —
 * §7/§10). Sells up to the held quantity at the item's `ITEM_SELL_VALUE`; items without a sell value
 * (grains, reserved finds, cosmetics) are refused. Consume + credit run in ONE transaction.
 */
export async function quickSellItem(
  db: DbLike,
  herdId: string,
  itemId: string,
  qty: number,
): Promise<SellResult> {
  const unit = ITEM_SELL_VALUE[itemId];
  if (unit == null) {
    return { ok: false, code: 'not_sellable', message: 'That item cannot be sold here.' };
  }
  const held = await itemQty(db, herdId, itemId);
  const n = Math.min(held, Math.max(1, Math.floor(qty || 0)));
  if (n <= 0) return { ok: false, code: 'none_held', message: 'You have none of those to sell.' };

  const gained = unit * n;
  let cubes = 0;
  try {
    await db.transaction(async (tx) => {
      if (!(await consumeItems(tx, herdId, [{ id: itemId, qty: n }]))) {
        throw new InsufficientItems(); // raced away since the read — roll back, sell nothing
      }
      cubes = await creditCubes(tx, herdId, gained);
    });
  } catch (e) {
    if (e instanceof InsufficientItems) {
      return { ok: false, code: 'none_held', message: 'You have none of those to sell.' };
    }
    throw e;
  }
  await logAudit(db, herdId, 'item_sell', { itemId, qty: n, gained });
  return { ok: true, itemId, sold: n, gained, cubes };
}
