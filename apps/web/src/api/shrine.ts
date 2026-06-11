import type { GlitchKind } from '@blorse/render-core';
import { api } from './client.js';

/** The Debug Shrine (§7l). The glitch KIND is always server-rolled — never client-chosen. */
export interface InduceResult {
  ok: true;
  glitch: GlitchKind;
  prior: GlitchKind | null;
  name: string | null;
}

export interface PatchResult {
  ok: true;
  cleared: GlitchKind;
  name: string | null;
  cubes: number;
}

export const offerAtShrine = (horseId: string): Promise<InduceResult> =>
  api.post<InduceResult>('/shrine/glitch', { horseId });

export const fileBugReport = (horseId: string): Promise<PatchResult> =>
  api.post<PatchResult>('/shrine/patch', { horseId });
