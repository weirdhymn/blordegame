import type { Genotype } from '@blorse/genetics';
import type { GlitchKind, LifeStage } from '@blorse/render-core';
import { api } from './client.js';

/** A horse as exposed by the public API (`publicHorse` — note: no hidden `luck`). */
export interface Horse {
  id: string;
  herdId: string | null;
  genotype: Genotype;
  seed: number;
  glitch: GlitchKind | null;
  lifeStage: LifeStage;
  name: string | null;
  origin: string;
  parentA: string | null;
  parentB: string | null;
  stats: Record<string, number>;
  skills: Record<string, { level: number; xp: number }>;
  personality: Record<string, number>;
}

export const listHerdHorses = (herdId: string): Promise<Horse[]> =>
  api.get<Horse[]>(`/herds/${herdId}/horses`);

export const getHorse = (id: string): Promise<Horse> => api.get<Horse>(`/horses/${id}`);

/** A node in the pedigree tree (GET /horses/:id/pedigree). */
export interface Pedigree {
  id: string;
  name: string | null;
  displayName: string;
  lifeStage: string;
  parents: Pedigree[];
}

export const getPedigree = (id: string): Promise<Pedigree> =>
  api.get<Pedigree>(`/horses/${id}/pedigree`);

export const care = (
  id: string,
  action: 'feed' | 'groom',
): Promise<{ ok: boolean; message: string; careCount: number }> =>
  api.post<{ ok: boolean; message: string; careCount: number }>(`/horses/${id}/care`, { action });
