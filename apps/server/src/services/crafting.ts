import { RECIPE_BY_ID, RECIPES, type Recipe } from '../content/recipes.js';
import type { DB } from '../db/client.js';
import { consumeItems, grantItems, type ItemStack } from './inventory.js';

export type CraftResult =
  | { ok: false; code: 'not_found' | 'insufficient'; message: string }
  | { ok: true; output: ItemStack };

export function listRecipes(): Recipe[] {
  return RECIPES;
}

/** Craft `qty` of a recipe: consume its inputs (all-or-nothing) and grant the output (§7). */
export async function craft(
  db: DB,
  herdId: string,
  recipeId: string,
  qty = 1,
): Promise<CraftResult> {
  const recipe = RECIPE_BY_ID.get(recipeId);
  if (!recipe) return { ok: false, code: 'not_found', message: 'No such recipe.' };
  const n = Math.max(1, Math.floor(qty));
  const inputs = recipe.inputs.map((i) => ({ id: i.id, qty: i.qty * n }));
  if (!(await consumeItems(db, herdId, inputs))) {
    return { ok: false, code: 'insufficient', message: 'Not enough materials.' };
  }
  const output: ItemStack = { id: recipe.output.id, qty: recipe.output.qty * n };
  await grantItems(db, herdId, [output]);
  return { ok: true, output };
}
