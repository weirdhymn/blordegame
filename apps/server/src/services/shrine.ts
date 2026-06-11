import { SHRINE_PATCH_FEE } from '@blorse/balance';
import { eq } from 'drizzle-orm';
import { GLITCH_KINDS, type GlitchKind } from '@blorse/render-core';
import type { DB } from '../db/client.js';
import { horses } from '../db/schema.js';
import { logAudit } from './audit.js';
import { getHorse } from './horse.js';
import { consumeItems } from './inventory.js';
import { spendCubes } from './wallet.js';

/**
 * The Debug Shrine (§7l) — deliberate access to the glitch system. The monks accept one
 * offering of fairy dust and introduce a bug into a horse: the KIND is the shrine's choice
 * (uniform over every implemented glitch, server-rolled). Filing a bug report (a modest
 * Cube fee) closes the ticket and restores the horse to, regrettably, normal.
 *
 * Glitches stay non-heritable (§5.7) — the shrine writes the same column the natural
 * birth roll does; breeding still never copies it.
 */

export const SHRINE_OFFERING_ID = 'fairy-dust';

// Sentinel: the offering went missing between check and act — roll everything back.
class OfferingShort extends Error {}

export type InduceResult =
  | { ok: false; code: 'not_found' | 'foal' | 'cant_afford'; message: string }
  | { ok: true; glitch: GlitchKind; prior: GlitchKind | null; name: string | null };

export async function induceGlitch(
  db: DB,
  herdId: string,
  horseId: string,
  rng: () => number,
): Promise<InduceResult> {
  const horse = await getHorse(db, horseId);
  if (!horse || horse.herdId !== herdId) {
    return { ok: false, code: 'not_found', message: 'No such horse stands before the shrine.' };
  }
  if (horse.lifeStage !== 'adult') {
    return {
      ok: false,
      code: 'foal',
      message: 'The shrine does not debug foals. They have no bugs yet.',
    };
  }
  const kind = GLITCH_KINDS[Math.floor(rng() * GLITCH_KINDS.length)] ?? 'inverted';
  try {
    await db.transaction(async (tx) => {
      if (!(await consumeItems(tx, herdId, [{ id: SHRINE_OFFERING_ID, qty: 1 }]))) {
        throw new OfferingShort();
      }
      await tx.update(horses).set({ glitch: kind }).where(eq(horses.id, horseId));
    });
  } catch (e) {
    if (e instanceof OfferingShort) {
      return {
        ok: false,
        code: 'cant_afford',
        message: 'The shrine accepts exactly one offering: fairy dust. You have none.',
      };
    }
    throw e;
  }
  await logAudit(db, herdId, 'shrine_glitch', { horseId, glitch: kind, prior: horse.glitch });
  return { ok: true, glitch: kind, prior: horse.glitch, name: horse.name };
}

export type PatchResult =
  | { ok: false; code: 'not_found' | 'not_glitched' | 'cant_afford'; message: string }
  | { ok: true; cleared: GlitchKind; name: string | null; cubes: number };

export async function patchGlitch(db: DB, herdId: string, horseId: string): Promise<PatchResult> {
  const horse = await getHorse(db, horseId);
  if (!horse || horse.herdId !== herdId) {
    return { ok: false, code: 'not_found', message: 'No such horse stands before the shrine.' };
  }
  if (!horse.glitch) {
    return {
      ok: false,
      code: 'not_glitched',
      message: 'Nothing to patch — this horse is, regrettably, normal.',
    };
  }
  const cleared = horse.glitch;
  let cubes = 0;
  const paid = await db.transaction(async (tx) => {
    const balance = await spendCubes(tx, herdId, SHRINE_PATCH_FEE);
    if (balance === null) return false;
    cubes = balance;
    await tx.update(horses).set({ glitch: null }).where(eq(horses.id, horseId));
    return true;
  });
  if (!paid) {
    return {
      ok: false,
      code: 'cant_afford',
      message: `Filing a bug report costs ${SHRINE_PATCH_FEE} ⬡. The form is in triplicate.`,
    };
  }
  await logAudit(db, herdId, 'shrine_patch', { horseId, cleared });
  return { ok: true, cleared, name: horse.name, cubes };
}
