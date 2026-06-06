import { eq } from 'drizzle-orm';
import type { DB } from '../db/client.js';
import { horses } from '../db/schema.js';
import { gameDay } from '../util/clock.js';
import { getHorse } from './horse.js';

export type CareAction = 'feed' | 'groom';

export type CareResult =
  | { ok: false; code: 'not_found' | 'not_owned' | 'already_cared'; message: string }
  | { ok: true; message: string; careCount: number };

const CARE_MESSAGES: Record<CareAction, string> = {
  feed: 'Munch, munch — looks content.',
  groom: 'Brushed to a soft shine.',
};

/**
 * Light, once-per-day care (BLORSE_PLAN.md §7) — cozy, never a fail-state. Records a
 * care counter that small stat bonuses will read once stats land (Phase 8).
 */
export async function careForHorse(
  db: DB,
  herdId: string,
  horseId: string,
  action: CareAction,
  nowMs: number,
): Promise<CareResult> {
  const h = await getHorse(db, horseId);
  if (!h) return { ok: false, code: 'not_found', message: 'Horse not found.' };
  if (h.herdId !== herdId) return { ok: false, code: 'not_owned', message: 'Not your horse.' };
  if (h.lastCaredAt && gameDay(h.lastCaredAt.getTime()) >= gameDay(nowMs)) {
    return {
      ok: false,
      code: 'already_cared',
      message: 'Already cared for today — come back tomorrow.',
    };
  }

  const careCount = h.careCount + 1;
  await db
    .update(horses)
    .set({ careCount, lastCaredAt: new Date(nowMs) })
    .where(eq(horses.id, horseId));
  return { ok: true, message: CARE_MESSAGES[action], careCount };
}
