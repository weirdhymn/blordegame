import { api } from './client.js';

export type PlotStage = 'empty' | 'growing' | 'ripe' | 'drying' | 'withered';

export interface PlotView {
  slot: number;
  stage: PlotStage;
  crop: string | null;
  fertilizer: string | null;
  water: number;
  growth: number;
  ripeInMs: number | null;
  graceLeftMs: number | null;
  dryInMs: number | null;
}

export interface CropDef {
  crop: string;
  tier: number;
  baseYield: number;
  second?: { id: string; qty: number };
}

export interface GardenView {
  plots: PlotView[];
  sprinkler: { active: boolean; until: number | null };
  returned: { slot: number; crop: string }[];
  crops: CropDef[];
}

export const getGarden = (): Promise<GardenView> => api.get<GardenView>('/garden');
export const plantCrop = (slot: number, crop: string): Promise<{ ok: true; ripeInMs: number }> =>
  api.post('/garden/plant', { slot, crop });
export const fertilize = (slot: number, kind: string): Promise<{ ok: true }> =>
  api.post('/garden/fertilize', { slot, kind });
export const waterPlot = (slot: number): Promise<{ ok: true; stage: PlotStage }> =>
  api.post('/garden/water', { slot });
export const harvestPlot = (
  slot: number,
): Promise<{ ok: true; harvested: { id: string; qty: number }[] }> =>
  api.post('/garden/harvest', { slot });
export const buySprinkler = (days: number): Promise<{ ok: true; until: number }> =>
  api.post('/garden/sprinkler', { days });
