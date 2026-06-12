import type { PunnettColor } from '@blorse/genetics';
import { api } from './client.js';
import type { Horse } from './horses.js';

/** The bond bonus a pair would pass to a foal — graded by the parents' affinity (§14.2). */
export interface BreedBond {
  bonus: number;
  affinity: number;
  type: string | null;
}

export interface BreedOdds {
  ok: boolean;
  related: boolean;
  distribution: PunnettColor[];
  lethalFraction: number;
  method: string;
  /** Present (non-null) when these two are close enough to start their foal stronger. */
  bond: { affinity: number; type: string | null; statBonus: number } | null;
  /** Hidden alleles the foal might receive — the Registrar's whisper (§7n). */
  carriers: { id: string; label: string; pLive: number }[];
}

/** A successful breed (2xx). Gate rejections (cooldown/related/…) throw an ApiError instead. */
export type BreedSuccess =
  | { viable: true; foal: Horse; bond: BreedBond | null }
  | { viable: false; message: string };

export const getBreedOdds = (a: string, b: string): Promise<BreedOdds> =>
  api.get<BreedOdds>(`/breed/odds?a=${encodeURIComponent(a)}&b=${encodeURIComponent(b)}`);

export const breed = (parentA: string, parentB: string): Promise<BreedSuccess> =>
  api.post<BreedSuccess>('/breed', { parentA, parentB });
