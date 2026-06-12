import { count, desc, eq } from 'drizzle-orm';
import type { DB } from '../db/client.js';
import { herds, horses, reports, users, type UserRow } from '../db/schema.js';
import { logAudit } from './audit.js';

export function isMod(user: UserRow): boolean {
  return user.role === 'mod' || user.role === 'admin';
}

export async function createReport(
  db: DB,
  reporterHerd: string,
  targetType: string,
  targetId: string,
  reason: string,
): Promise<{ ok: boolean; id?: string }> {
  const text = (reason ?? '').trim();
  if (!text || text.length > 500 || !targetType || !targetId) return { ok: false };
  const [row] = await db
    .insert(reports)
    .values({ reporterHerd, targetType, targetId, reason: text })
    .returning({ id: reports.id });
  return { ok: true, id: row?.id };
}

export async function listReports(db: DB, limit = 100) {
  return db
    .select()
    .from(reports)
    .where(eq(reports.status, 'open'))
    .orderBy(desc(reports.createdAt))
    .limit(limit);
}

/** Close a report (§7r): 'resolved' (acted on) or 'dismissed' (no action needed). Reports
 *  used to stay open forever — the Mod Desk's queue is only useful if it drains. */
export async function resolveReport(
  db: DB,
  reportId: string,
  status: 'resolved' | 'dismissed',
  byUserId: string,
): Promise<boolean> {
  const res = await db
    .update(reports)
    .set({ status })
    .where(eq(reports.id, reportId))
    .returning({ id: reports.id });
  if (res.length > 0) await logAudit(db, null, 'mod_report_close', { reportId, status, byUserId });
  return res.length > 0;
}

/** Freeze/unfreeze an account (§11). A frozen account can read but performs no actions. */
export async function setFrozen(db: DB, userId: string, frozen: boolean): Promise<boolean> {
  const res = await db
    .update(users)
    .set({ frozen })
    .where(eq(users.id, userId))
    .returning({ id: users.id });
  if (res.length > 0) await logAudit(db, null, frozen ? 'mod_freeze' : 'mod_unfreeze', { userId });
  return res.length > 0;
}

export async function getStats(db: DB) {
  const [u] = await db.select({ n: count() }).from(users);
  const [h] = await db.select({ n: count() }).from(herds);
  const [ho] = await db.select({ n: count() }).from(horses);
  const [open] = await db.select({ n: count() }).from(reports).where(eq(reports.status, 'open'));
  return { users: u?.n ?? 0, herds: h?.n ?? 0, horses: ho?.n ?? 0, openReports: open?.n ?? 0 };
}
