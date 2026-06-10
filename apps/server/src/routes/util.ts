import type { DB } from '../db/client.js';
import type { HerdRow } from '../db/schema.js';
import { getHerdForUser, resolveSessionUser } from '../services/auth.js';

/** Resolve the calling session's Herd, or null (caller replies 401). The one shared auth-context
 *  helper for route files — previously copy-pasted into each one (audit §11 consistency). */
export async function herdFor(db: DB, cookie: string | undefined): Promise<HerdRow | null> {
  const user = await resolveSessionUser(db, cookie);
  if (!user) return null;
  return getHerdForUser(db, user.id);
}
