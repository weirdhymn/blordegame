import { api } from './client.js';
import type { ItemStack } from './explore.js';

// Admin-only debug toolkit (mirrors POST /api/debug/* — see routes/debug.ts). These calls only
// succeed for an admin on a dev instance; a normal player / prod build gets 403 / 404.

export interface GrantResult {
  cubes: number;
  inventory: ItemStack[];
}
export const grant = (cubes: number, items: ItemStack[]): Promise<GrantResult> =>
  api.post<GrantResult>('/debug/grant', { cubes, items });

export interface DebugMintBody {
  genotype?: Record<string, string>;
  personality?: Record<string, number>;
  stats?: Record<string, number>;
  luck?: number;
  lifeStage?: 'foal' | 'adult';
  name?: string;
}
export interface MintedHorse {
  id: string;
  name: string | null;
  lifeStage: string;
  personality: Record<string, number>;
  stats: Record<string, number>;
  luck: number;
}
export const mintHorse = (body: DebugMintBody): Promise<MintedHorse> =>
  api.post<MintedHorse>('/debug/mint', body);

export interface TickResult {
  daysAdvanced: number;
  cubesGained: number;
  jobCubes: number;
  matured: string[];
  day: number;
}
export const advanceDays = (days: number): Promise<TickResult> =>
  api.post<TickResult>('/debug/advance-days', { days });
export const tick = (): Promise<TickResult> => api.post<TickResult>('/debug/tick', {});
export const matureHorse = (horseId: string): Promise<{ ok: boolean; matured?: string[] }> =>
  api.post<{ ok: boolean; matured?: string[] }>(`/debug/mature/${horseId}`, {});

export const inspectHorse = (horseId: string): Promise<unknown> =>
  api.get<unknown>(`/debug/horse/${horseId}`);
export const inspectRuns = (): Promise<unknown[]> => api.get<unknown[]>('/debug/runs');

export const reset = (): Promise<{ ok: boolean }> => api.post<{ ok: boolean }>('/debug/reset', {});
