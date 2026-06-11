import { randomInt } from 'node:crypto';
import { and, asc, eq, isNotNull, sql } from 'drizzle-orm';
import {
  CROP_TIER_HOURS,
  FERT_BASIC_TIME_MULT,
  FERT_RICH_BONUS_MAX,
  FERT_RICH_BONUS_MIN,
  GARDEN_WATER_BONUS_FRACTION,
  GARDEN_WATER_DRAIN_H,
  GARDEN_WATER_TOPUP_BELOW,
  gardenGraceH,
  gardenPlotsForLevel,
  SPRINKLER_CUBES_PER_DAY,
  SPRINKLER_GROWTH_BONUS,
  SPRINKLER_MAX_DAYS,
} from '@blorse/balance';
import {
  CROP_BY_ID,
  CROPS,
  FERTILIZER_KINDS,
  MAGIC_CROP_POOL,
  type FertilizerKind,
} from '../content/crops.js';
import type { DB } from '../db/client.js';
import { gardenPlots, herds, type HerdRow } from '../db/schema.js';
import { mulberry32 } from '../util/rng.js';
import { consumeItems, grantItems, type ItemStack } from './inventory.js';
import { spendCubes } from './wallet.js';

const H = 3_600_000;
const DAY = 24 * H;
const DRAIN_MS = GARDEN_WATER_DRAIN_H * H;

type PlotRow = typeof gardenPlots.$inferSelect;

/** Every stage is DERIVED from timestamps at read time — nothing ticks, nothing is stored but
 *  facts. The runway is deliberately long and visible: full tank → 48h drain → tier-scaled
 *  grace → only then wither (which RETURNS the planted crop: 0 net loss). */
export type PlotStage = 'empty' | 'growing' | 'ripe' | 'drying' | 'withered';

export interface PlotView {
  slot: number;
  stage: PlotStage;
  crop: string | null;
  fertilizer: string | null;
  /** 0..1 — the visible tank. */
  water: number;
  /** 0..1 while growing; 1 when ripe. */
  growth: number;
  /** ms until ripe (estimate; null when not growing). */
  ripeInMs: number | null;
  /** ms of grace left before wither (null unless drying). */
  graceLeftMs: number | null;
  /** ms until the tank hits dry (null when empty/withered). */
  dryInMs: number | null;
}

function sprinklerActive(herd: HerdRow, nowMs: number): boolean {
  return !!herd.sprinklerUntil && nowMs < herd.sprinklerUntil.getTime();
}

/** The growth credit the sprinkler has accrued for this plot (overlap × bonus rate). */
function sprinklerCreditMs(plot: PlotRow, herd: HerdRow, nowMs: number): number {
  if (!plot.plantedAt || !herd.sprinklerFrom || !herd.sprinklerUntil) return 0;
  const overlap =
    Math.min(nowMs, herd.sprinklerUntil.getTime()) -
    Math.max(plot.plantedAt.getTime(), herd.sprinklerFrom.getTime());
  return Math.max(0, overlap) * SPRINKLER_GROWTH_BONUS;
}

/** The last moment this plot's tank was full (manual watering, planting, or the sprinkler). */
function tankFullAtMs(plot: PlotRow, herd: HerdRow, nowMs: number): number {
  const watered = plot.lastWateredAt?.getTime() ?? plot.plantedAt?.getTime() ?? nowMs;
  const sprinklerEnd = herd.sprinklerUntil ? Math.min(herd.sprinklerUntil.getTime(), nowMs) : 0;
  return Math.max(watered, sprinklerEnd);
}

function neededMs(plot: PlotRow): number {
  const def = plot.crop ? CROP_BY_ID.get(plot.crop) : undefined;
  const tierMs = (CROP_TIER_HOURS[def?.tier ?? 1] ?? 12) * H;
  return plot.fertilizer === 'fertilizer' ? tierMs * FERT_BASIC_TIME_MULT : tierMs;
}

export function plotView(plot: PlotRow, herd: HerdRow, nowMs: number): PlotView {
  if (!plot.crop || !plot.plantedAt) {
    return {
      slot: plot.slot,
      stage: 'empty',
      crop: null,
      fertilizer: plot.fertilizer,
      water: 0,
      growth: 0,
      ripeInMs: null,
      graceLeftMs: null,
      dryInMs: null,
    };
  }
  const def = CROP_BY_ID.get(plot.crop);
  const tierHours = CROP_TIER_HOURS[def?.tier ?? 1] ?? 12;
  const active = sprinklerActive(herd, nowMs);
  const fullAt = tankFullAtMs(plot, herd, nowMs);
  const water = active ? 1 : Math.max(0, 1 - (nowMs - fullAt) / DRAIN_MS);
  const dryAt = fullAt + DRAIN_MS;
  const witherAt = dryAt + gardenGraceH(tierHours) * H;

  const need = neededMs(plot);
  const progress =
    nowMs - plot.plantedAt.getTime() + plot.bonusMs + sprinklerCreditMs(plot, herd, nowMs);
  const ripe = progress >= need;
  const remaining = Math.max(0, need - progress);
  const rate = active ? 1 + SPRINKLER_GROWTH_BONUS : 1;

  let stage: PlotStage;
  if (!active && nowMs >= witherAt) stage = 'withered';
  else if (!active && water <= 0) stage = 'drying';
  else stage = ripe ? 'ripe' : 'growing';

  return {
    slot: plot.slot,
    stage,
    crop: plot.crop,
    fertilizer: plot.fertilizer,
    water,
    growth: Math.min(1, progress / need),
    ripeInMs: ripe ? null : Math.round(remaining / rate),
    graceLeftMs: stage === 'drying' ? Math.max(0, witherAt - nowMs) : null,
    dryInMs: stage === 'growing' || stage === 'ripe' ? (active ? null : dryAt - nowMs) : null,
  };
}

/** Open plots up to the herd-tier allowance (the ONE progression spine — no garden XP). */
async function ensurePlots(db: DB, herd: HerdRow): Promise<PlotRow[]> {
  const want = gardenPlotsForLevel(herd.level);
  for (let slot = 1; slot <= want; slot++) {
    await db
      .insert(gardenPlots)
      .values({ herdId: herd.id, slot })
      .onConflictDoNothing({ target: [gardenPlots.herdId, gardenPlots.slot] });
  }
  return db
    .select()
    .from(gardenPlots)
    .where(eq(gardenPlots.herdId, herd.id))
    .orderBy(asc(gardenPlots.slot));
}

export interface WitherReturn {
  slot: number;
  crop: string;
}

/** Finalize any withered plots: RETURN the planted crop (0 net loss — only the growing time and
 *  any fertilizer are gone) and clear the plot. Guarded so a racing double-read pays once. */
async function finalizeWithered(db: DB, herd: HerdRow, nowMs: number): Promise<WitherReturn[]> {
  const rows = await db
    .select()
    .from(gardenPlots)
    .where(and(eq(gardenPlots.herdId, herd.id), isNotNull(gardenPlots.crop)));
  const returns: WitherReturn[] = [];
  for (const p of rows) {
    if (plotView(p, herd, nowMs).stage !== 'withered') continue;
    const crop = p.crop!;
    let cleared = false;
    await db.transaction(async (tx) => {
      const done = await tx
        .update(gardenPlots)
        .set({ crop: null, fertilizer: null, plantedAt: null, lastWateredAt: null, bonusMs: 0 })
        .where(and(eq(gardenPlots.id, p.id), sql`${gardenPlots.crop} is not null`))
        .returning({ id: gardenPlots.id });
      if (done.length === 0) return;
      cleared = true;
      await grantItems(tx, herd.id, [{ id: crop, qty: 1 }]);
    });
    if (cleared) returns.push({ slot: p.slot, crop });
  }
  return returns;
}

export interface GardenView {
  plots: PlotView[];
  sprinkler: { active: boolean; until: number | null };
  /** Crops withered-and-returned by this read — the UI tells the player gently. */
  returned: WitherReturn[];
}

export async function getGarden(db: DB, herd: HerdRow, nowMs: number): Promise<GardenView> {
  await ensurePlots(db, herd);
  const returned = await finalizeWithered(db, herd, nowMs);
  const rows = await db
    .select()
    .from(gardenPlots)
    .where(eq(gardenPlots.herdId, herd.id))
    .orderBy(asc(gardenPlots.slot));
  return {
    plots: rows.map((p) => plotView(p, herd, nowMs)),
    sprinkler: {
      active: sprinklerActive(herd, nowMs),
      until: herd.sprinklerUntil ? herd.sprinklerUntil.getTime() : null,
    },
    returned,
  };
}

type ActionFail = { ok: false; code: string; message: string };

async function plotBySlot(db: DB, herdId: string, slot: number): Promise<PlotRow | undefined> {
  return (
    await db
      .select()
      .from(gardenPlots)
      .where(and(eq(gardenPlots.herdId, herdId), eq(gardenPlots.slot, slot)))
  )[0];
}

export type PlantResult = ActionFail | { ok: true; crop: string; ripeInMs: number };

/** Plant the crop ITSELF (no seeds): consume one unit, set the clock. Planting waters the plot. */
export async function plantCrop(
  db: DB,
  herd: HerdRow,
  slot: number,
  cropId: string,
  nowMs: number,
): Promise<PlantResult> {
  const def = CROP_BY_ID.get(cropId);
  if (!def) return { ok: false, code: 'unknown_crop', message: 'Nothing grows from that.' };
  await ensurePlots(db, herd);
  const plot = await plotBySlot(db, herd.id, slot);
  if (!plot) return { ok: false, code: 'no_plot', message: 'No such plot.' };
  if (plot.crop)
    return { ok: false, code: 'occupied', message: 'Something is already growing there.' };

  let paid = false;
  await db.transaction(async (tx) => {
    paid = await consumeItems(tx, herd.id, [{ id: cropId, qty: 1 }]);
    if (!paid) return;
    await tx
      .update(gardenPlots)
      .set({ crop: cropId, plantedAt: new Date(nowMs), lastWateredAt: new Date(nowMs), bonusMs: 0 })
      .where(eq(gardenPlots.id, plot.id));
  });
  if (!paid) {
    return { ok: false, code: 'cant_afford', message: 'You need one in the pantry to plant it.' };
  }
  const need = plot.fertilizer === 'fertilizer' ? 0.8 : 1; // mirrored in neededMs
  return {
    ok: true,
    crop: cropId,
    ripeInMs: Math.round((CROP_TIER_HOURS[def.tier] ?? 12) * H * need),
  };
}

export type FertilizeResult = ActionFail | { ok: true; fertilizer: FertilizerKind };

/** Fertilizer goes on the EMPTY plot, before planting. Optional, additive, never required. */
export async function fertilizePlot(
  db: DB,
  herd: HerdRow,
  slot: number,
  kind: string,
  nowMs: number,
): Promise<FertilizeResult> {
  void nowMs;
  if (!FERTILIZER_KINDS.includes(kind as FertilizerKind)) {
    return { ok: false, code: 'unknown_fertilizer', message: 'That is not fertilizer.' };
  }
  await ensurePlots(db, herd);
  const plot = await plotBySlot(db, herd.id, slot);
  if (!plot) return { ok: false, code: 'no_plot', message: 'No such plot.' };
  if (plot.crop) {
    return { ok: false, code: 'occupied', message: 'Fertilizer goes in before planting.' };
  }
  if (plot.fertilizer) {
    return { ok: false, code: 'already_fertilized', message: 'That plot is already enriched.' };
  }
  let paid = false;
  await db.transaction(async (tx) => {
    paid = await consumeItems(tx, herd.id, [{ id: kind, qty: 1 }]);
    if (!paid) return;
    await tx.update(gardenPlots).set({ fertilizer: kind }).where(eq(gardenPlots.id, plot.id));
  });
  if (!paid) return { ok: false, code: 'cant_afford', message: 'None of that in the stash.' };
  return { ok: true, fertilizer: kind as FertilizerKind };
}

export type WaterResult = ActionFail | { ok: true; stage: PlotStage; hurriedMs: number };

/** Manual watering: refills the tank (resetting any drying/grace) and, while still growing,
 *  hurries things along a little. Watering a full tank does nothing (no spam clicking). */
export async function waterPlot(
  db: DB,
  herd: HerdRow,
  slot: number,
  nowMs: number,
): Promise<WaterResult> {
  const plot = await plotBySlot(db, herd.id, slot);
  if (!plot?.crop) return { ok: false, code: 'empty', message: 'Nothing planted there.' };
  const view = plotView(plot, herd, nowMs);
  if (view.stage === 'withered') {
    return { ok: false, code: 'withered', message: 'Too late for water — let it rest.' };
  }
  if (view.water >= GARDEN_WATER_TOPUP_BELOW) {
    return { ok: false, code: 'already_wet', message: 'The soil is already good and dark.' };
  }
  const hurriedMs =
    view.stage === 'growing' ? Math.round(neededMs(plot) * GARDEN_WATER_BONUS_FRACTION) : 0;
  await db
    .update(gardenPlots)
    .set({ lastWateredAt: new Date(nowMs), bonusMs: sql`${gardenPlots.bonusMs} + ${hurriedMs}` })
    .where(eq(gardenPlots.id, plot.id));
  const after = plotView(
    { ...plot, lastWateredAt: new Date(nowMs), bonusMs: plot.bonusMs + hurriedMs },
    herd,
    nowMs,
  );
  return { ok: true, stage: after.stage, hurriedMs };
}

export type HarvestResult = ActionFail | { ok: true; harvested: ItemStack[] };

/** Harvest a ripe plot: the base multiplier, the dual yield, and the fertilizer bonuses. */
export async function harvestPlot(
  db: DB,
  herd: HerdRow,
  slot: number,
  nowMs: number,
  seed?: number,
): Promise<HarvestResult> {
  const plot = await plotBySlot(db, herd.id, slot);
  if (!plot?.crop) return { ok: false, code: 'empty', message: 'Nothing planted there.' };
  const view = plotView(plot, herd, nowMs);
  if (view.stage === 'withered') {
    return { ok: false, code: 'withered', message: 'It went over — the planted crop came home.' };
  }
  if (view.stage !== 'ripe' && view.stage !== 'drying') {
    return { ok: false, code: 'not_ripe', message: 'Still growing — give it time.' };
  }
  if (view.growth < 1) {
    return { ok: false, code: 'not_ripe', message: 'Still growing — give it time.' };
  }
  const def = CROP_BY_ID.get(plot.crop)!;
  const rng = mulberry32(seed ?? randomInt(1, 2 ** 31));

  const tally = new Map<string, number>();
  let base = def.baseYield;
  if (plot.fertilizer === 'rich-fertilizer') {
    base +=
      FERT_RICH_BONUS_MIN + Math.floor(rng() * (FERT_RICH_BONUS_MAX - FERT_RICH_BONUS_MIN + 1));
  }
  tally.set(def.crop, base);
  if (def.second) tally.set(def.second.id, (tally.get(def.second.id) ?? 0) + def.second.qty);
  if (plot.fertilizer === 'magic-fertilizer') {
    const bonus = MAGIC_CROP_POOL[Math.floor(rng() * MAGIC_CROP_POOL.length)]!;
    tally.set(bonus, (tally.get(bonus) ?? 0) + 1);
  }
  const harvested: ItemStack[] = [...tally.entries()].map(([id, qty]) => ({ id, qty }));

  let cleared = false;
  await db.transaction(async (tx) => {
    const done = await tx
      .update(gardenPlots)
      .set({ crop: null, fertilizer: null, plantedAt: null, lastWateredAt: null, bonusMs: 0 })
      .where(and(eq(gardenPlots.id, plot.id), sql`${gardenPlots.crop} is not null`))
      .returning({ id: gardenPlots.id });
    if (done.length === 0) return; // a racing harvest got there first — pay once
    cleared = true;
    await grantItems(tx, herd.id, harvested);
  });
  if (!cleared) return { ok: false, code: 'empty', message: 'Nothing planted there.' };
  return { ok: true, harvested };
}

export type SprinklerResult = ActionFail | { ok: true; until: number; cubes: number };

/** The sprinkler (a Cubes sink): pay per day; while running, every tank stays full and growth
 *  runs a touch faster. A convenience purchase — never "pay or your crops die". */
export async function buySprinkler(
  db: DB,
  herd: HerdRow,
  days: number,
  nowMs: number,
): Promise<SprinklerResult> {
  const d = Math.floor(days);
  if (!Number.isFinite(d) || d < 1 || d > SPRINKLER_MAX_DAYS) {
    return { ok: false, code: 'bad_days', message: `1 to ${SPRINKLER_MAX_DAYS} days.` };
  }
  const cost = d * SPRINKLER_CUBES_PER_DAY;
  const balance = await spendCubes(db, herd.id, cost);
  if (balance === null) {
    return { ok: false, code: 'cant_afford', message: `The sprinkler wants ${cost} ⬡.` };
  }
  const activeUntil = herd.sprinklerUntil?.getTime() ?? 0;
  const from = activeUntil > nowMs ? (herd.sprinklerFrom ?? new Date(nowMs)) : new Date(nowMs);
  const until = new Date(Math.max(activeUntil, nowMs) + d * DAY);
  await db
    .update(herds)
    .set({ sprinklerFrom: from, sprinklerUntil: until })
    .where(eq(herds.id, herd.id));
  return { ok: true, until: until.getTime(), cubes: balance };
}

/** The static crop catalog for the client (what's plantable + what each yields). */
export function cropCatalog(): typeof CROPS {
  return CROPS;
}
