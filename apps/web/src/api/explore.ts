import { api } from './client.js';

export interface RegionView {
  id: string;
  name: string;
  tier: number;
  recommendedPower: number;
  unlocked: boolean;
}

export interface Encounter {
  dc: number;
  d20: number;
  total: number;
  success: boolean;
  crit: boolean;
}

export interface WildEncounter {
  toTavern: boolean;
  horseId: string;
  name: string;
}

export interface AdventureResult {
  ok: boolean;
  regionId: string;
  encounters: Encounter[];
  successes: number;
  loot: { id: string; qty: number }[];
  rareFound: number;
  wild: WildEncounter | null;
}

export const getRegions = (): Promise<RegionView[]> => api.get<RegionView[]>('/regions');

export const adventure = (regionId: string, party: string[]): Promise<AdventureResult> =>
  api.post<AdventureResult>('/adventure', { regionId, party });

export interface ItemStack {
  id: string;
  qty: number;
}

export interface RoamResult {
  ok: boolean;
  regionId: string;
  found: ItemStack[];
  questCompletions: { questId: string; reward: { cubes?: number; items?: ItemStack[] } }[];
}

export interface QuestView {
  questId: string;
  title: string;
  status: 'active' | 'completed';
  objectives: { label: string; have: number; need: number }[];
  reward: { cubes?: number; items?: ItemStack[] };
}

export const roam = (regionId: string): Promise<RoamResult> =>
  api.post<RoamResult>(`/regions/${regionId}/roam`);

export const getQuests = (): Promise<QuestView[]> => api.get<QuestView[]>('/quests');

export const getInventory = (): Promise<ItemStack[]> => api.get<ItemStack[]>('/inventory');
