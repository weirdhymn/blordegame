export type ItemKind = 'material' | 'book' | 'game' | 'tool' | 'cosmetic';

export interface ItemDef {
  id: string;
  name: string;
  kind: ItemKind;
}

export const ITEMS: ItemDef[] = [
  // raw materials (roam loot, §7 gathering)
  { id: 'grass-tuft', name: 'Grass Tuft', kind: 'material' },
  { id: 'clover', name: 'Lucky Clover', kind: 'material' },
  { id: 'smooth-pebble', name: 'Smooth Pebble', kind: 'material' },
  { id: 'dust-shard', name: 'Dust Shard', kind: 'material' },
  { id: 'sun-bead', name: 'Sun Bead', kind: 'material' },
  { id: 'odd-acorn', name: 'Odd Acorn', kind: 'material' },
  { id: 'glitch-mote', name: 'Glitch Mote', kind: 'material' },
  // crafted building materials
  { id: 'plank', name: 'Plank', kind: 'material' },
  { id: 'brick', name: 'Brick', kind: 'material' },
  // crafted activity items (feed jobs/clubs in Phases 8–9)
  { id: 'book', name: 'Book', kind: 'book' },
  { id: 'board-game', name: 'Board Game', kind: 'game' },
  { id: 'tool', name: 'Tool', kind: 'tool' },
  // rare adventure drop
  { id: 'rare-gem', name: 'Rare Gem', kind: 'material' },
];

export const ITEM_BY_ID = new Map(ITEMS.map((i) => [i.id, i]));
