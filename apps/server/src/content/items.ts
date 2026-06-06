export type ItemKind = 'material' | 'book' | 'game' | 'tool' | 'cosmetic';

export interface ItemDef {
  id: string;
  name: string;
  kind: ItemKind;
}

// Grounded-naturalist supply chain (§7): gather raw timber/clay/fiber/ore → refine into
// planks/bricks/paper/ingots → build Structures and craft books/games/tools.
export const ITEMS: ItemDef[] = [
  // raw materials — gathered by roam / adventure
  { id: 'timber', name: 'Timber', kind: 'material' },
  { id: 'clay', name: 'Clay', kind: 'material' },
  { id: 'plant-fiber', name: 'Plant Fiber', kind: 'material' },
  { id: 'ore', name: 'Ore', kind: 'material' },
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
];

export const ITEM_BY_ID = new Map(ITEMS.map((i) => [i.id, i]));
