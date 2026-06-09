import { and, eq, sql } from 'drizzle-orm';
import { ITEM_SELL_VALUE } from '@blorse/balance';
import type { DB } from '../db/client.js';
import { herds, inventory } from '../db/schema.js';
import { logAudit } from './audit.js';

export interface ItemStack {
  id: string;
  qty: number;
}

/** Add items to a herd's stash (upsert + increment). */
export async function grantItems(db: DB, herdId: string, grants: ItemStack[]): Promise<void> {
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

export async function getInventory(db: DB, herdId: string): Promise<ItemStack[]> {
  const rows = await db
    .select({ id: inventory.itemId, qty: inventory.qty })
    .from(inventory)
    .where(eq(inventory.herdId, herdId));
  return rows;
}

export async function itemQty(db: DB, herdId: string, itemId: string): Promise<number> {
  const rows = await db
    .select({ qty: inventory.qty })
    .from(inventory)
    .where(and(eq(inventory.herdId, herdId), eq(inventory.itemId, itemId)));
  return rows[0]?.qty ?? 0;
}

/** Remove items only if the herd has enough of every one; returns false (no change) otherwise. */
export async function consumeItems(db: DB, herdId: string, items: ItemStack[]): Promise<boolean> {
  for (const need of items) {
    if (need.qty <= 0) continue;
    if ((await itemQty(db, herdId, need.id)) < need.qty) return false;
  }
  for (const need of items) {
    if (need.qty <= 0) continue;
    await db
      .update(inventory)
      .set({ qty: sql`${inventory.qty} - ${need.qty}` })
      .where(and(eq(inventory.herdId, herdId), eq(inventory.itemId, need.id)));
  }
  return true;
}

export type SellResult =
  | { ok: false; code: 'not_sellable' | 'none_held'; message: string }
  | { ok: true; itemId: string; sold: number; gained: number; cubes: number };

/**
 * Quick-sell surplus items for a modest Cube sum (a convenience dump, never an income strategy —
 * §7/§10). Sells up to the held quantity at the item's `ITEM_SELL_VALUE`; items without a sell value
 * (grains, reserved finds, cosmetics) are refused. Server-authoritative + audited.
 */
export async function quickSellItem(
  db: DB,
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
  if (n <= 0 || !(await consumeItems(db, herdId, [{ id: itemId, qty: n }]))) {
    return { ok: false, code: 'none_held', message: 'You have none of those to sell.' };
  }
  const gained = unit * n;
  const [row] = await db
    .update(herds)
    .set({ cubes: sql`${herds.cubes} + ${gained}` })
    .where(eq(herds.id, herdId))
    .returning({ cubes: herds.cubes });
  await logAudit(db, herdId, 'item_sell', { itemId, qty: n, gained });
  return { ok: true, itemId, sold: n, gained, cubes: row?.cubes ?? 0 };
}
