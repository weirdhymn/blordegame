import { api } from './client.js';

export interface ProgressionView {
  tier: number;
  tierName: string;
  herdCap: number;
  jobSlots: number;
  structureSlots: number;
  herdSize: number;
  cubes: number;
  next: {
    tier: number;
    name: string;
    cost: number;
    canAfford: boolean;
    gates: { label: string; met: boolean }[];
    gatesMet: boolean;
    unlocks: { herdCap: number; jobSlots: number; structureSlots: number };
  } | null;
}

export interface UpgradeResult {
  ok: true;
  tier: number;
  tierName: string;
  herdCap: number;
  jobSlots: number;
}

export const getProgression = (): Promise<ProgressionView> =>
  api.get<ProgressionView>('/progression');

export const upgradeProgression = (): Promise<UpgradeResult> =>
  api.post<UpgradeResult>('/progression/upgrade');
