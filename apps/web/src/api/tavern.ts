import type { Genotype } from '@blorse/genetics';
import type { GlitchKind } from '@blorse/render-core';
import { api } from './client.js';

export interface TavernHorse {
  id: string;
  name: string;
  fee: number;
  firstEncounteredBy: string | null;
  /** Render fields ride the listing (always adults — nothing to redact). */
  genotype: Genotype;
  seed: number;
  glitch: GlitchKind | null;
}

export const listTavern = (): Promise<TavernHorse[]> => api.get<TavernHorse[]>('/tavern');

export const recruit = (id: string): Promise<{ ok: boolean; horseId: string; fee: number }> =>
  api.post<{ ok: boolean; horseId: string; fee: number }>(`/tavern/${id}/recruit`);
