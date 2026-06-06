import { desc, eq } from 'drizzle-orm';
import type { DB } from '../db/client.js';
import { auditLog } from '../db/schema.js';

/** Record a state-changing economy action for anti-abuse + moderation (§10). */
export async function logAudit(
  db: DB,
  herdId: string | null,
  action: string,
  detail?: Record<string, unknown>,
): Promise<void> {
  await db.insert(auditLog).values({ herdId, action, detail: detail ?? null });
}

export async function getAudit(db: DB, herdId: string, limit = 50) {
  return db
    .select()
    .from(auditLog)
    .where(eq(auditLog.herdId, herdId))
    .orderBy(desc(auditLog.createdAt))
    .limit(limit);
}
