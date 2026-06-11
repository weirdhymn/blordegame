/**
 * The Garden's plant list (§7j). Every plant is a real plant (or already in the game), planted as
 * the crop ITSELF (no seeds), harvested as a real multiplier — never break-even. Dual-yield plants
 * add a second resource that feeds an EXISTING sink (timber → planks/tools, plant-fiber →
 * paper/potions, greens → the cook pot), so which plant you grow is a genuine choice:
 * focused quantity (singles) vs. a combination you can't gather randomly (duals).
 */
export interface CropDef {
  /** The item id — planting consumes one of these; harvesting yields `baseYield` of them. */
  crop: string;
  /** Growth tier (1..5 → CROP_TIER_HOURS). */
  tier: number;
  /** Base-crop harvest count (plant 1, harvest this many — replant and keep the surplus). */
  baseYield: number;
  /** The dual-yield bonus — a second resource alongside the base crop. */
  second?: { id: string; qty: number };
}

export const CROPS: CropDef[] = [
  // Tier 1 — 12h. Quick errand crops; the cheap ones it's fine to lose.
  { crop: 'radish', tier: 1, baseYield: 4 },
  { crop: 'carrot', tier: 1, baseYield: 3, second: { id: 'carrot-greens', qty: 1 } },
  // Tier 2 — 24h. The same-tier single/dual choice: pure STR volume vs STR + craft fiber.
  { crop: 'grain-corn', tier: 2, baseYield: 7 },
  { crop: 'pumpkin', tier: 2, baseYield: 6, second: { id: 'plant-fiber', qty: 1 } },
  // Tier 3 — 48h. The patient middle; marsh-sage feeds the potion brew + Green Grass quests.
  { crop: 'grain-wheat', tier: 3, baseYield: 14 },
  { crop: 'marsh-sage', tier: 3, baseYield: 12, second: { id: 'plant-fiber', qty: 2 } },
  // Tier 4 — 72h. The flagship dual: an orchard in one plot.
  { crop: 'apple', tier: 4, baseYield: 16, second: { id: 'timber', qty: 6 } },
  // Tier 5 — 96h. The long game: brain-shaped wisdom plus a small lumberyard.
  { crop: 'walnut', tier: 5, baseYield: 20, second: { id: 'timber', qty: 9 } },
];

export const CROP_BY_ID = new Map(CROPS.map((c) => [c.crop, c]));

/** Magic fertilizer's bonus pool: ONE unit of one random base crop — never a second yield, never
 *  a multiplied harvest. Expected value ≈ one 2⬡ item, so it stays a fun bonus (a taste of a
 *  96h tree without the wait), not a farm-bosses-skip-the-garden strategy. */
export const MAGIC_CROP_POOL = CROPS.map((c) => c.crop);

/** The three fertilizers (§7j) — optional, additive, never required. */
export const FERTILIZER_KINDS = ['fertilizer', 'rich-fertilizer', 'magic-fertilizer'] as const;
export type FertilizerKind = (typeof FERTILIZER_KINDS)[number];
