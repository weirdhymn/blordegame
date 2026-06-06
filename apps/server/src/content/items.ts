export type ItemKind = 'material' | 'book' | 'tool' | 'cosmetic';

export interface ItemDef {
  id: string;
  name: string;
  kind: ItemKind;
}

// Beta materials (placeholder flavor). Crafting into books/tools lands in Phase 7.
export const ITEMS: ItemDef[] = [
  { id: 'grass-tuft', name: 'Grass Tuft', kind: 'material' },
  { id: 'clover', name: 'Lucky Clover', kind: 'material' },
  { id: 'smooth-pebble', name: 'Smooth Pebble', kind: 'material' },
  { id: 'dust-shard', name: 'Dust Shard', kind: 'material' },
  { id: 'sun-bead', name: 'Sun Bead', kind: 'material' },
  { id: 'odd-acorn', name: 'Odd Acorn', kind: 'material' },
  { id: 'glitch-mote', name: 'Glitch Mote', kind: 'material' },
];

export const ITEM_BY_ID = new Map(ITEMS.map((i) => [i.id, i]));
