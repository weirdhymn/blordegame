import type { FreqOverride } from '@blorse/genetics';

// Deferred white-spotting & leopard loci are pinned OFF everywhere until art ships
// (§4.5, §14.7). White (W) and Gray (G) are never biased up, so they stay the
// globally rarest colors via the engine's default roll frequencies.
const DEFERRED_OFF: FreqOverride = {
  T: { T: 0, n: 1 },
  Sb: { Sb: 0, n: 1 },
  O: { O: 0, n: 1 },
  SW1: { SW1: 0, n: 1 },
  Lp: { Lp: 0, lp: 1 },
  PATN1: { PATN1: 0, patn1: 1 },
  PATN2: { PATN2: 0, patn2: 1 },
};

export interface LootEntry {
  item: string;
  weight: number;
}

export interface Region {
  id: string;
  name: string;
  tier: number;
  recommendedPower: number;
  /** null = open from the start; otherwise unlocked once this quest is completed (§7 gating). */
  requiresQuest: string | null;
  /** Regional rarity bias merged over the engine's defaults (§5.5, §14.7). */
  freqOverride: FreqOverride;
  loot: LootEntry[];
}

export const REGIONS: Region[] = [
  {
    id: 'green-grass',
    name: 'Green Grass',
    tier: 1,
    recommendedPower: 1,
    requiresQuest: null,
    // Plainest — solid bases, almost no dilution.
    freqOverride: {
      ...DEFERRED_OFF,
      A: { A: 0.55, At: 0.15, a: 0.3 },
      C: { C: 0.97, Cr: 0.03 },
      D: { d: 0.97, D: 0.03 },
    },
    loot: [
      { item: 'plant-fiber', weight: 6 },
      { item: 'timber', weight: 3 },
      { item: 'marsh-sage', weight: 2 }, // fen herb — the Brew Healing Potion input (§9.3)
      { item: 'clay', weight: 1 },
      { item: 'bone', weight: 1 }, // rich-fertilizer input (§7j)
    ],
  },
  {
    id: 'dusty-dunes',
    name: 'Dusty Dunes',
    tier: 2,
    recommendedPower: 4,
    requiresQuest: 'first-steps',
    // Warm, arid — dun & gold dilutions surface more.
    freqOverride: {
      ...DEFERRED_OFF,
      D: { D: 0.3, d: 0.7 },
      Ch: { Ch: 0.1, n: 0.9 },
      C: { Cr: 0.12, C: 0.88 },
    },
    loot: [
      { item: 'clay', weight: 6 },
      { item: 'ore', weight: 3 },
      { item: 'plant-fiber', weight: 1 },
      { item: 'bone', weight: 2 }, // the desert is generous with these (§7j)
    ],
  },
  {
    id: 'weird-woods',
    name: 'Weird Woods',
    tier: 3,
    recommendedPower: 7,
    requiresQuest: 'into-the-dunes',
    // Strange edge of the frontier — modifiers (sooty, roan, pearl) slightly likelier.
    freqOverride: {
      ...DEFERRED_OFF,
      Sty: { Sty: 0.2, n: 0.8 },
      Rn: { Rn: 0.1, rn: 0.9 },
      C: { prl: 0.06, Cr: 0.1, C: 0.84 },
    },
    loot: [
      { item: 'timber', weight: 6 },
      { item: 'ore', weight: 3 },
      { item: 'clay', weight: 1 },
      { item: 'bone', weight: 1 }, // rich-fertilizer input (§7j)
    ],
  },
];

export const REGION_BY_ID = new Map(REGIONS.map((r) => [r.id, r]));
