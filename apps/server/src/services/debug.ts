import { eq, sql } from 'drizzle-orm';
import { FOAL_TO_ADULT_MS, PERSONALITY_KEYS, STARTING_CUBES, STAT_KEYS } from '@blorse/balance';
import type { Genotype } from '@blorse/genetics';
import type { LifeStage } from '@blorse/render-core';
import type { DB } from '../db/client.js';
import {
  adventureRuns,
  clubs,
  fieldGuide,
  herds,
  horses,
  inventory,
  journalEvents,
  questProgress,
  structures,
  type HorseRow,
} from '../db/schema.js';
import { dayToMs, gameDay } from '../util/clock.js';
import { grantStarterHorses } from './auth.js';
import { getRelationships } from './autonomy.js';
import { advanceHerd, type DailyResult } from './daily.js';
import { getHorse, mintHorse } from './horse.js';
import { getInventory, grantItems, type ItemStack } from './inventory.js';

// ── Admin debug toolkit (§dev) ───────────────────────────────────────────────
// Every function here is a SHORTCUT to existing game logic — mintHorse, the grant/Cubes paths,
// the daily tick (advanceHerd), grantStarterHorses — never new gameplay rules. Gating (admin +
// dev-only instance) lives at the route layer (routes/debug.ts); a player or a prod build can
// never reach these.

// ── Grant: top up Cubes and any item(s) by id ───────────────────────────────
export async function debugGrant(
  db: DB,
  herdId: string,
  opts: { cubes?: number; items?: ItemStack[] },
): Promise<{ cubes: number; inventory: ItemStack[] }> {
  const add = Math.floor(opts.cubes ?? 0);
  if (add !== 0) {
    await db
      .update(herds)
      .set({ cubes: sql`${herds.cubes} + ${add}` })
      .where(eq(herds.id, herdId));
  }
  const items = (opts.items ?? []).filter((i) => i.id && i.qty > 0);
  if (items.length) await grantItems(db, herdId, items);
  const herd = await db.query.herds.findFirst({ where: eq(herds.id, herdId) });
  return { cubes: herd?.cubes ?? 0, inventory: await getInventory(db, herdId) };
}

// ── Custom mint: spawn a horse with chosen traits (reuses mintHorse) ─────────
export interface DebugMintInput {
  genotype?: Genotype;
  personality?: Record<string, number>;
  stats?: Record<string, number>;
  luck?: number;
  lifeStage?: LifeStage;
  name?: string | null;
  seed?: number;
}

const clampPers = (n: number): number => Math.max(0, Math.min(100, Math.round(n)));
const clampStat = (n: number): number => Math.max(1, Math.min(20, Math.round(n)));

/** Complete a partial OCEAN block over the neutral default (50), so a caller can set just one trait. */
function fullPersonality(over?: Record<string, number>): Record<string, number> {
  const p: Record<string, number> = {};
  for (const k of PERSONALITY_KEYS) p[k] = clampPers(over?.[k] ?? 50);
  return p;
}
function fullStats(over?: Record<string, number>): Record<string, number> {
  const s: Record<string, number> = {};
  for (const k of STAT_KEYS) s[k] = clampStat(over?.[k] ?? 10);
  return s;
}

export async function debugMintHorse(
  db: DB,
  herdId: string,
  input: DebugMintInput,
): Promise<HorseRow> {
  return mintHorse(db, {
    herdId,
    genotype: input.genotype ?? { E: 'Ee', A: 'Aa' }, // Bay default
    origin: 'founder',
    lifeStage: input.lifeStage ?? 'adult',
    name: input.name ?? null,
    seed: input.seed,
    personality: fullPersonality(input.personality),
    stats: fullStats(input.stats),
    luck: input.luck !== undefined ? clampStat(input.luck) : 10,
  });
}

// ── Time control (reuses advanceHerd / the daily tick) ──────────────────────
export function debugAdvanceDays(db: DB, herdId: string, days: number): Promise<DailyResult> {
  const d = Math.max(1, Math.min(60, Math.floor(days)));
  return advanceHerd(db, herdId, Date.now() + d * 86_400_000);
}

/** Exactly one rollover from the herd's current cursor. */
export async function debugTick(db: DB, herdId: string): Promise<DailyResult> {
  const herd = await db.query.herds.findFirst({ where: eq(herds.id, herdId) });
  const from = herd?.lastSimTick ?? gameDay(Date.now());
  return advanceHerd(db, herdId, dayToMs(from + 1));
}

/** Mature a specific foal now — reuses the real reveal path (matureFoals → Field Guide). */
export async function debugMatureHorse(
  db: DB,
  herdId: string,
  horseId: string,
): Promise<{ ok: boolean; code?: string; matured?: string[] }> {
  const horse = await getHorse(db, horseId);
  if (!horse || horse.herdId !== herdId) return { ok: false, code: 'not_found' };
  if (horse.lifeStage === 'adult') return { ok: false, code: 'already_adult' };
  // Backdate birth so the standard daily maturation reveals it (no parallel reveal logic).
  await db
    .update(horses)
    .set({ bornAt: new Date(Date.now() - FOAL_TO_ADULT_MS - 60_000) })
    .where(eq(horses.id, horseId));
  const result = await advanceHerd(db, herdId, Date.now());
  return { ok: true, matured: result.matured };
}

// ── Inspect: the full hidden truth for a horse / an in-progress run ──────────
export async function debugInspectHorse(
  db: DB,
  herdId: string,
  horseId: string,
): Promise<{
  horse: HorseRow;
  relationships: Awaited<ReturnType<typeof getRelationships>>;
} | null> {
  const horse = await getHorse(db, horseId);
  if (!horse || horse.herdId !== herdId) return null;
  const rels = await getRelationships(db, herdId);
  const mine = rels.filter((r) => r.horseA === horseId || r.horseB === horseId);
  return { horse, relationships: mine }; // horse carries luck + full OCEAN + genotype (raw row)
}

export async function debugInspectRuns(
  db: DB,
  herdId: string,
): Promise<(typeof adventureRuns.$inferSelect)[]> {
  return db.query.adventureRuns.findMany({ where: eq(adventureRuns.herdId, herdId) });
}

// ── Reset: wipe the herd back to a clean starter state (reuses grantStarterHorses) ──
export async function debugReset(db: DB, herdId: string): Promise<void> {
  // Horses first — FK cascades clear ancestry, jobs, relationships, and market listings.
  await db.delete(horses).where(eq(horses.herdId, herdId));
  // The remaining herd-scoped state (these reference the herd, not a horse).
  await db.delete(adventureRuns).where(eq(adventureRuns.herdId, herdId));
  await db.delete(inventory).where(eq(inventory.herdId, herdId));
  await db.delete(questProgress).where(eq(questProgress.herdId, herdId));
  await db.delete(fieldGuide).where(eq(fieldGuide.herdId, herdId));
  await db.delete(structures).where(eq(structures.herdId, herdId));
  await db.delete(journalEvents).where(eq(journalEvents.herdId, herdId));
  await db.delete(clubs).where(eq(clubs.herdId, herdId));
  // Back to the cold-start position, then re-grant the founder starters (idempotent).
  await db
    .update(herds)
    .set({ cubes: STARTING_CUBES, lastSimTick: gameDay(Date.now()) })
    .where(eq(herds.id, herdId));
  await grantStarterHorses(db, herdId);
}
