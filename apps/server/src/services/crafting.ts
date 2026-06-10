import { RECIPE_BY_ID, RECIPES, type Recipe } from '../content/recipes.js';
import type { DB } from '../db/client.js';
import { consumeItems, grantItems, type ItemStack } from './inventory.js';

export type CraftResult =
  | { ok: false; code: 'not_found' | 'insufficient'; message: string }
  | { ok: true; output: ItemStack };

export function listRecipes(): Recipe[] {
  return RECIPES;
}

/** A craft batch is bounded so a huge `qty` can't build giant input arrays (audit §11). */
const MAX_CRAFT_QTY = 100;

/** Craft `qty` of a recipe: consume its inputs (all-or-nothing) and grant the output (§7).
 *  Consume + grant run in ONE transaction — inputs can never vanish without the output landing. */
export async function craft(
  db: DB,
  herdId: string,
  recipeId: string,
  qty = 1,
): Promise<CraftResult> {
  const recipe = RECIPE_BY_ID.get(recipeId);
  if (!recipe) return { ok: false, code: 'not_found', message: 'No such recipe.' };
  const n = Math.min(MAX_CRAFT_QTY, Math.max(1, Math.floor(qty)));
  const inputs = recipe.inputs.map((i) => ({ id: i.id, qty: i.qty * n }));
  const output: ItemStack = { id: recipe.output.id, qty: recipe.output.qty * n };
  let ok = false;
  await db.transaction(async (tx) => {
    ok = await consumeItems(tx, herdId, inputs);
    if (!ok) return; // nothing consumed (consumeItems rolled its savepoint back) — no output
    await grantItems(tx, herdId, [output]);
  });
  if (!ok) return { ok: false, code: 'insufficient', message: 'Not enough materials.' };
  return { ok: true, output };
}
