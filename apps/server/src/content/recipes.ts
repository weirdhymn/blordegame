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

// Grounded-naturalist recipe tree (§7): raw → intermediate → product. Roam gathers the raws
// (timber, clay, plant fiber, ore); crafting refines them into planks/bricks (for Structures)
// and paper/ingots → books/games/tools.
export const RECIPES: Recipe[] = [
  // ── intermediates ──
  {
    id: 'plank',
    name: 'Plank',
    output: { id: 'plank', qty: 1 },
    inputs: [{ id: 'timber', qty: 2 }],
  },
  {
    id: 'brick',
    name: 'Brick',
    output: { id: 'brick', qty: 1 },
    inputs: [{ id: 'clay', qty: 2 }],
  },
  {
    id: 'paper',
    name: 'Paper',
    output: { id: 'paper', qty: 1 },
    inputs: [{ id: 'plant-fiber', qty: 3 }],
  },
  {
    id: 'ingot',
    name: 'Ingot',
    output: { id: 'ingot', qty: 1 },
    inputs: [{ id: 'ore', qty: 2 }],
  },
  // ── products ──
  {
    id: 'book',
    name: 'Book',
    output: { id: 'book', qty: 1 },
    inputs: [{ id: 'paper', qty: 2 }],
  },
  {
    id: 'board-game',
    name: 'Board Game',
    output: { id: 'board-game', qty: 1 },
    inputs: [
      { id: 'plank', qty: 1 },
      { id: 'paper', qty: 1 },
    ],
  },
  {
    id: 'tool',
    name: 'Tool',
    output: { id: 'tool', qty: 1 },
    inputs: [
      { id: 'ingot', qty: 1 },
      { id: 'timber', qty: 1 },
    ],
  },
  // The marsh-sage sink (§9.3). Also the herb hunt's narrative climax — same recipe, brewed
  // in-adventure. Output is a terminal consumable today (provisioning for future combat, §7).
  {
    id: 'brew-healing-potion',
    name: 'Brew Healing Potion',
    output: { id: 'healing-potion', qty: 1 },
    inputs: [
      { id: 'marsh-sage', qty: 2 },
      { id: 'plant-fiber', qty: 1 },
    ],
  },
];

export const RECIPE_BY_ID = new Map(RECIPES.map((r) => [r.id, r]));
