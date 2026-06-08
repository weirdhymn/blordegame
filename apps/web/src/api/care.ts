import { api } from './client.js';

export interface CareState {
  cookedToday: boolean;
  mealBuffs: Record<string, number>;
  slots: number;
  herdSize: number;
  grains: { id: string; stat: string; qty: number }[];
  rares: number;
  groomed: boolean;
  groomCubes: number;
  rattled: number;
}

export interface CookResult {
  ok: true;
  mealBuffs: Record<string, number>;
  slots: number;
}

export interface GroomResult {
  ok: true;
  soothed: number;
  pendingCubes: number;
}

export const getCare = (): Promise<CareState> => api.get<CareState>('/care');

export const cookMeal = (grains: Record<string, number>, rares: number): Promise<CookResult> =>
  api.post<CookResult>('/care/cook', { grains, rares });

export const groomHerd = (): Promise<GroomResult> => api.post<GroomResult>('/care/groom', {});
