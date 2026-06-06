export interface ItemAmount {
  id: string;
  qty: number;
}

export interface Recipe {
  id: string;
  name: string;
  output: ItemAmount;
  inputs: ItemAmount[];
}

// Materials -> building materials -> activity items (§7). Roam gathers the raw
// inputs; crafting turns them into planks/bricks (for Structures) and books/games/
// tools (which feed jobs and clubs in Phases 8–9).
export const RECIPES: Recipe[] = [
  {
    id: 'plank',
    name: 'Plank',
    output: { id: 'plank', qty: 1 },
    inputs: [{ id: 'odd-acorn', qty: 2 }],
  },
  {
    id: 'brick',
    name: 'Brick',
    output: { id: 'brick', qty: 1 },
    inputs: [
      { id: 'smooth-pebble', qty: 2 },
      { id: 'dust-shard', qty: 1 },
    ],
  },
  {
    id: 'book',
    name: 'Book',
    output: { id: 'book', qty: 1 },
    inputs: [
      { id: 'clover', qty: 2 },
      { id: 'grass-tuft', qty: 1 },
    ],
  },
  {
    id: 'board-game',
    name: 'Board Game',
    output: { id: 'board-game', qty: 1 },
    inputs: [
      { id: 'plank', qty: 1 },
      { id: 'clover', qty: 1 },
    ],
  },
  {
    id: 'tool',
    name: 'Tool',
    output: { id: 'tool', qty: 1 },
    inputs: [
      { id: 'brick', qty: 1 },
      { id: 'smooth-pebble', qty: 1 },
    ],
  },
];

export const RECIPE_BY_ID = new Map(RECIPES.map((r) => [r.id, r]));
