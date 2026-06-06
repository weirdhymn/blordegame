import { api } from './client.js';

export interface RegionView {
  id: string;
  name: string;
  tier: number;
  recommendedPower: number;
  unlocked: boolean;
  /** Has an authored scene library → "Set out" launches the interactive story flow. */
  interactive: boolean;
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

// ── Interactive "story" adventures (§9.3) ──────────────────────────────────
export interface SceneChoiceView {
  id: string;
  text: string;
  available: boolean;
  requires: { trait: string; min?: number; max?: number } | null;
  check: { stat: string; skill: string | null; dc: number; harmony: boolean } | null;
}

export interface SceneView {
  id: string;
  stage: number;
  text: string;
  choices: SceneChoiceView[];
}

export interface StoryRunView {
  runId: string;
  regionId: string;
  stage: number;
  loot: ItemStack[];
  cubes: number;
  fatigue: number;
  befriended: string | null;
}

export interface StartStoryResult {
  ok: true;
  runId: string;
  scene: SceneView;
  run: StoryRunView;
}

export interface StoryRoll {
  d20: number;
  total: number;
  dc: number;
  success: boolean;
  harmony: number;
}

export type ChooseStoryResult =
  | {
      ok: true;
      ended: false;
      narration: string;
      roll: StoryRoll | null;
      befriended: { id: string; name: string } | null;
      scene: SceneView;
      run: StoryRunView;
    }
  | {
      ok: true;
      ended: true;
      narration: string;
      roll: StoryRoll | null;
      befriended: { id: string; name: string } | null;
      summary: { loot: ItemStack[]; cubes: number; fatigue: number; befriended: string | null };
    };

export const startStory = (regionId: string, party: string[]): Promise<StartStoryResult> =>
  api.post<StartStoryResult>('/adventure/start', { regionId, party });

export const chooseStory = (runId: string, choiceId: string): Promise<ChooseStoryResult> =>
  api.post<ChooseStoryResult>(`/adventure/${runId}/choose`, { choiceId });
