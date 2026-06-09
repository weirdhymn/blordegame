import { api } from './client.js';
import type { ItemStack } from './explore.js';

export interface BuildCost {
  cubes: number;
  items: ItemStack[];
}

export interface Buildable {
  type: string;
  name: string;
  skill: string;
  job: string;
  buildCost: BuildCost;
  built: boolean;
}

export interface PastureView {
  capacity: number;
  used: number;
  structures: { type: string; level: number }[];
  buildable: Buildable[];
}

export interface Recipe {
  id: string;
  name: string;
  output: ItemStack;
  inputs: ItemStack[];
}

export const getPasture = (): Promise<PastureView> => api.get<PastureView>('/pasture');

export const build = (type: string): Promise<{ ok: boolean; type: string }> =>
  api.post<{ ok: boolean; type: string }>('/pasture/build', { type });

export const getRecipes = (): Promise<Recipe[]> => api.get<Recipe[]>('/recipes');

export interface ItemDef {
  id: string;
  name: string;
  kind: string;
  /** Optional in-world flavor — e.g. why a terminal item isn't usable yet. */
  flavor?: string;
  /** Quick-sell value per unit (absent → not quick-sellable). */
  sellValue?: number;
  /** Selling this asks for a confirm first (valuable). */
  sellConfirm?: boolean;
}

export const getItems = (): Promise<ItemDef[]> => api.get<ItemDef[]>('/items');

export const craft = (recipeId: string, qty = 1): Promise<{ ok: boolean; output: ItemStack }> =>
  api.post<{ ok: boolean; output: ItemStack }>('/craft', { recipeId, qty });
