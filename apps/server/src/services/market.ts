import { and, desc, eq, sql } from 'drizzle-orm';
import { resolve } from '@blorse/genetics';
import type { DB } from '../db/client.js';
import { herds, horses, marketListings } from '../db/schema.js';
import { logAudit } from './audit.js';
import { getHorse } from './horse.js';

export type ListResult =
  | { ok: false; code: 'not_found' | 'not_owned' | 'bad_price' | 'already_listed'; message: string }
  | { ok: true; listingId: string };

export async function listHorse(
  db: DB,
  herdId: string,
  horseId: string,
  price: number,
): Promise<ListResult> {
  if (!Number.isInteger(price) || price <= 0) {
    return { ok: false, code: 'bad_price', message: 'Price must be a positive whole number.' };
  }
  const h = await getHorse(db, horseId);
  if (!h) return { ok: false, code: 'not_found', message: 'Horse not found.' };
  if (h.herdId !== herdId) return { ok: false, code: 'not_owned', message: 'Not your horse.' };

  const existing = await db
    .select({ id: marketListings.id })
    .from(marketListings)
    .where(and(eq(marketListings.horseId, horseId), eq(marketListings.status, 'active')));
  if (existing.length > 0) return { ok: false, code: 'already_listed', message: 'Already listed.' };

  const [row] = await db
    .insert(marketListings)
    .values({ herdId, horseId, price })
    .returning({ id: marketListings.id });
  await logAudit(db, herdId, 'market_list', { horseId, price });
  return { ok: true, listingId: row?.id ?? '' };
}

export async function browseMarket(db: DB, limit = 50) {
  // One joined query (was a getHorse per listing — the audit's N+1).
  const rows = await db
    .select({
      id: marketListings.id,
      horseId: marketListings.horseId,
      price: marketListings.price,
      sellerId: marketListings.herdId,
      name: horses.name,
      genotype: horses.genotype,
    })
    .from(marketListings)
    .leftJoin(horses, eq(marketListings.horseId, horses.id))
    .where(eq(marketListings.status, 'active'))
    .orderBy(desc(marketListings.createdAt))
    .limit(limit);
  return rows.map((r) => ({
    id: r.id,
    horseId: r.horseId,
    price: r.price,
    sellerId: r.sellerId,
    name: r.name,
    displayName: r.genotype ? resolve(r.genotype).displayName : null,
  }));
}

export type BuyResult =
  | { ok: false; code: 'not_found' | 'gone' | 'own_listing' | 'cant_afford'; message: string }
  | { ok: true; horseId: string; price: number };

/** Buy a listing — atomic: the listing is claimed (status=active → sold) inside a txn. */
export async function buyListing(
  db: DB,
  buyerHerdId: string,
  listingId: string,
): Promise<BuyResult> {
  const listing = await db.query.marketListings.findFirst({
    where: eq(marketListings.id, listingId),
  });
  if (!listing || listing.status !== 'active') {
    return { ok: false, code: 'not_found', message: 'Listing not available.' };
  }
  if (listing.herdId === buyerHerdId) {
    return { ok: false, code: 'own_listing', message: 'You cannot buy your own listing.' };
  }
  const buyer = await db.query.herds.findFirst({ where: eq(herds.id, buyerHerdId) });
  if (!buyer) return { ok: false, code: 'not_found', message: 'No herd.' };
  if (buyer.cubes < listing.price) {
    return { ok: false, code: 'cant_afford', message: 'Not enough Cubes.' };
  }

  const result = await db.transaction(async (tx): Promise<BuyResult> => {
    const claimed = await tx
      .update(marketListings)
      .set({ status: 'sold' })
      .where(and(eq(marketListings.id, listingId), eq(marketListings.status, 'active')))
      .returning({ id: marketListings.id });
    if (claimed.length === 0) return { ok: false, code: 'gone', message: 'Already sold.' };

    await tx.update(horses).set({ herdId: buyerHerdId }).where(eq(horses.id, listing.horseId));
    await tx
      .update(herds)
      .set({ cubes: sql`${herds.cubes} - ${listing.price}` })
      .where(eq(herds.id, buyerHerdId));
    await tx
      .update(herds)
      .set({ cubes: sql`${herds.cubes} + ${listing.price}` })
      .where(eq(herds.id, listing.herdId));
    return { ok: true, horseId: listing.horseId, price: listing.price };
  });

  if (result.ok) {
    await logAudit(db, buyerHerdId, 'market_buy', {
      listingId,
      horseId: listing.horseId,
      price: listing.price,
      seller: listing.herdId,
    });
  }
  return result;
}

export async function cancelListing(db: DB, herdId: string, listingId: string): Promise<boolean> {
  const res = await db
    .update(marketListings)
    .set({ status: 'cancelled' })
    .where(
      and(
        eq(marketListings.id, listingId),
        eq(marketListings.herdId, herdId),
        eq(marketListings.status, 'active'),
      ),
    )
    .returning({ id: marketListings.id });
  return res.length > 0;
}
