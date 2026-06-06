import { and, eq, sql } from 'drizzle-orm';
import type { DB } from '../db/client.js';
import { inventory } from '../db/schema.js';

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
