export type ItemKind =
  | 'material'
  | 'book'
  | 'game'
  | 'tool'
  | 'cosmetic'
  | 'consumable'
  | 'grain'
  | 'crop'
  | 'fertilizer';

export interface ItemDef {
  id: string;
  name: string;
  kind: ItemKind;
  /** Optional in-world flavor (shown on the item) — used to explain a not-yet-usable item. */
  flavor?: string;
}

// Grounded-naturalist supply chain (§7): gather raw timber/clay/fiber/ore → refine into
// planks/bricks/paper/ingots → build Structures and craft books/games/tools.
export const ITEMS: ItemDef[] = [
  // raw materials — gathered by roam / adventure
  { id: 'timber', name: 'Timber', kind: 'material' },
  { id: 'clay', name: 'Clay', kind: 'material' },
  { id: 'plant-fiber', name: 'Plant Fiber', kind: 'material' },
  { id: 'ore', name: 'Ore', kind: 'material' },
  { id: 'marsh-sage', name: 'Marsh-Sage', kind: 'material' }, // silver-green fen herb (§9.3)
  // crafted intermediates
  { id: 'plank', name: 'Plank', kind: 'material' }, // sawn timber — building material
  { id: 'brick', name: 'Brick', kind: 'material' }, // fired clay — building material
  { id: 'paper', name: 'Paper', kind: 'material' }, // pressed fiber pulp
  { id: 'ingot', name: 'Ingot', kind: 'material' }, // smelted ore
  // crafted products — CONSUMED by the Living Herd's night life (§7o): a seeded horse reads
  // a Book each night (reading XP); the Meeting Hall hosts game nights (affinity; games
  // occasionally wear out). Tools still await their sink.
  { id: 'book', name: 'Book', kind: 'book' },
  { id: 'board-game', name: 'Board Game', kind: 'game' },
  { id: 'tool', name: 'Tool', kind: 'tool' },
  // rare adventure drop — sell / prestige; not a crafting input
  { id: 'rare-gem', name: 'Rare Gem', kind: 'material' },
  // cooking grains (§7 care hub) — a gather byproduct; each feeds one stat in the morning cook
  {
    id: 'grain-corn',
    name: 'Corn',
    kind: 'grain',
    flavor: 'Hearty cobs. Cooks into a Strength buff for the day.',
  },
  {
    id: 'grain-oats',
    name: 'Oats',
    kind: 'grain',
    flavor: 'Feeling your oats — a Dexterity buff.',
  },
  {
    id: 'grain-barley',
    name: 'Barley',
    kind: 'grain',
    flavor: 'Stout and sustaining — a Constitution buff.',
  },
  {
    id: 'grain-wheat',
    name: 'Wheat',
    kind: 'grain',
    flavor: 'The bread of thought — an Intelligence buff.',
  },
  {
    id: 'grain-rice',
    name: 'Rice',
    kind: 'grain',
    flavor: 'Quiet, patient grain — a Wisdom buff.',
  },
  {
    id: 'grain-rye',
    name: 'Rye',
    kind: 'grain',
    flavor: 'The characterful one — a Charisma buff.',
  },
  // the rare cooking ingredient — a far-rarer adventuring find that multiplies the whole dish
  {
    id: 'saffron-bloom',
    name: 'Saffron Bloom',
    kind: 'grain',
    flavor:
      'Golden, fragrant threads. Drop one into a big communal pot and the whole meal blooms — save it for a feast.',
  },
  // terminal consumable — provisioning for danger that doesn't exist yet (combat, post-beta).
  // Deliberately has no consumer today (§7); the flavor frames it so it doesn't read as broken.
  {
    id: 'healing-potion',
    name: 'Healing Potion',
    kind: 'consumable',
    flavor:
      'A potent brew, corked and waiting. No use for it on these gentle roads — but tuck it away; rougher ones are coming.',
  },
  // ── Garden crops (§7j) — plant the crop itself, harvest a multiplier. Each feeds the cook pot. ──
  { id: 'radish', name: 'Radish', kind: 'crop', flavor: 'Quick, peppery — a Dexterity buff.' },
  {
    id: 'carrot',
    name: 'Carrot',
    kind: 'crop',
    flavor: 'Good for the eyes, they say — a Wisdom buff. The greens are a bonus.',
  },
  {
    id: 'carrot-greens',
    name: 'Carrot Greens',
    kind: 'crop',
    flavor: 'The leafy half of the bargain — a Constitution buff.',
  },
  {
    id: 'pumpkin',
    name: 'Pumpkin',
    kind: 'crop',
    flavor: 'Enormous and sincere — a Strength buff. The vines make good fiber.',
  },
  {
    id: 'apple',
    name: 'Apple',
    kind: 'crop',
    flavor: 'Shines a coat from the inside — a Charisma buff. The tree throws good wood.',
  },
  {
    id: 'walnut',
    name: 'Walnut',
    kind: 'crop',
    flavor: 'Suspiciously brain-shaped — an Intelligence buff. The old folk consider this proof.',
  },
  // ── Fertilizers (§7j) — optional, additive, never required. The joke is played entirely straight. ──
  {
    id: 'fertilizer',
    name: 'Fertilizer',
    kind: 'fertilizer',
    flavor: 'Locally produced. Astonishingly local. Crops grow a little faster.',
  },
  {
    id: 'rich-fertilizer',
    name: 'Rich Fertilizer',
    kind: 'fertilizer',
    flavor: 'Aged with bone meal of unspecified provenance. The harvest comes up heavier.',
  },
  {
    id: 'magic-fertilizer',
    name: 'Magic Fertilizer',
    kind: 'fertilizer',
    flavor: 'Cut with fairy dust. Something extra comes up. Nobody can say what. That is the fun.',
  },
  // ── Garden craft inputs from the existing world (§7j) ──
  {
    id: 'bone',
    name: 'Bone',
    kind: 'material',
    flavor: 'Of unspecified provenance. The horses have agreed not to ask.',
  },
  {
    id: 'fairy-dust',
    name: 'Fairy Dust',
    kind: 'material',
    flavor: 'Confiscated from a region Keeper, who absolutely should not have had it either.',
  },
];

export const ITEM_BY_ID = new Map(ITEMS.map((i) => [i.id, i]));
