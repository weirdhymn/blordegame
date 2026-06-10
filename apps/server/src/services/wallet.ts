import { eq, sql } from 'drizzle-orm';
import type { DbLike } from '../db/client.js';
import { herds } from '../db/schema.js';

/**
 * The atomic Cubes kernel (§11 hardening). Every Cubes SINK goes through `spendCubes` — a single
 * conditional UPDATE (`cubes >= amount` in the WHERE) so a concurrent double-spend can never
 * overdraw: one request wins, the other simply gets `null`. No check-then-act windows.
 * Both helpers accept a transaction handle so multi-step flows (recruit, upload, quick-sell)
 * stay atomic end-to-end.
 */
export async function spendCubes(
  db: DbLike,
  herdId: string,
  amount: number,
): Promise<number | null> {
  if (!Number.isFinite(amount) || amount < 0) return null;
  if (amount === 0) {
    const herd = await db.query.herds.findFirst({ where: eq(herds.id, herdId) });
    return herd?.cubes ?? null;
  }
  const rows = await db
    .update(herds)
    .set({ cubes: sql`${herds.cubes} - ${amount}` })
    .where(sql`${herds.id} = ${herdId} and ${herds.cubes} >= ${amount}`)
    .returning({ cubes: herds.cubes });
  return rows[0]?.cubes ?? null;
}

/** Credit Cubes (a faucet). Single statement — atomic on its own. Returns the new balance. */
export async function creditCubes(db: DbLike, herdId: string, amount: number): Promise<number> {
  const rows = await db
    .update(herds)
    .set({ cubes: sql`${herds.cubes} + ${Math.max(0, amount)}` })
    .where(eq(herds.id, herdId))
    .returning({ cubes: herds.cubes });
  return rows[0]?.cubes ?? 0;
}
