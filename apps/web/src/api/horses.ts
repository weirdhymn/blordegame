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
  /** Earned at skill milestones (§9.1) — worn as 🏅 chips on the horse sheet (§7n). */
  accomplishments: string[];
  /** Cosmetic quirks picked up living in the herd (§8) — flavour only, no stat effect. */
  quirks: string[];
  personality: Record<string, number>;
  /** Completed interactive adventures + the derived cosmetic "Seasoned" mark (§9.3). */
  adventures?: number;
  experienced?: boolean;
  /** Combat class (§9.4b) — identity + signature approach; null/absent = unclassed. */
  class?: 'knight' | 'wizard' | 'rogue' | 'cleric' | null;
  /** Cosmetic mood (§7) — 'content' or 'rattled' (after a rough day; the evening groom soothes it). */
  mood?: string;
}

export const listHerdHorses = (herdId: string): Promise<Horse[]> =>
  api.get<Horse[]>(`/herds/${herdId}/horses`);

export const getHorse = (id: string): Promise<Horse> => api.get<Horse>(`/horses/${id}`);

/** A node in the pedigree tree (GET /horses/:id/pedigree). Adults carry render fields for
 *  the portrait tree (§7t); foals never do — their node renders the stock white silhouette. */
export interface Pedigree {
  id: string;
  name: string | null;
  displayName: string;
  lifeStage: string;
  genotype?: Genotype;
  seed?: number;
  glitch?: GlitchKind | null;
  /** This ancestor is stamped in YOUR studbook — "entered in good ink" (§7m). */
  inStudbook?: boolean;
  parents: Pedigree[];
}

export const getPedigree = (id: string): Promise<Pedigree> =>
  api.get<Pedigree>(`/horses/${id}/pedigree`);
