import type { PunnettColor } from '@blorse/genetics';
import { api } from './client.js';
import type { Horse } from './horses.js';

export interface BreedOdds {
  ok: boolean;
  related: boolean;
  distribution: PunnettColor[];
  lethalFraction: number;
  method: string;
}

/** A successful breed (2xx). Gate rejections (cooldown/related/…) throw an ApiError instead. */
export type BreedSuccess = { viable: true; foal: Horse } | { viable: false; message: string };

export const getBreedOdds = (a: string, b: string): Promise<BreedOdds> =>
  api.get<BreedOdds>(`/breed/odds?a=${encodeURIComponent(a)}&b=${encodeURIComponent(b)}`);

export const breed = (parentA: string, parentB: string): Promise<BreedSuccess> =>
  api.post<BreedSuccess>('/breed', { parentA, parentB });
