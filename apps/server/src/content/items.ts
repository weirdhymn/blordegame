export type ItemKind = 'material' | 'book' | 'game' | 'tool' | 'cosmetic' | 'consumable';

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
  // crafted products — feed jobs/clubs in Phases 8–9 (no consuming sink yet, see BLORSE_PLAN §7)
  { id: 'book', name: 'Book', kind: 'book' },
  { id: 'board-game', name: 'Board Game', kind: 'game' },
  { id: 'tool', name: 'Tool', kind: 'tool' },
  // rare adventure drop — sell / prestige; not a crafting input
  { id: 'rare-gem', name: 'Rare Gem', kind: 'material' },
  // terminal consumable — provisioning for danger that doesn't exist yet (combat, post-beta).
  // Deliberately has no consumer today (§7); the flavor frames it so it doesn't read as broken.
  {
    id: 'healing-potion',
    name: 'Healing Potion',
    kind: 'consumable',
    flavor:
      'A potent brew, corked and waiting. No use for it on these gentle roads — but tuck it away; rougher ones are coming.',
  },
];

export const ITEM_BY_ID = new Map(ITEMS.map((i) => [i.id, i]));
