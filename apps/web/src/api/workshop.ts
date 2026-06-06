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

export const craft = (recipeId: string, qty = 1): Promise<{ ok: boolean; output: ItemStack }> =>
  api.post<{ ok: boolean; output: ItemStack }>('/craft', { recipeId, qty });
