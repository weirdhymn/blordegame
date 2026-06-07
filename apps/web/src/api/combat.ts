import { api } from './client.js';

export type Approach = 'confront' | 'outwit' | 'soothe' | 'endure';

export interface CombatantView {
  id: string;
  side: 'party' | 'foe';
  name: string;
  hp: number;
  maxHp: number;
  ko: boolean;
  defending: boolean;
  /** Foe only — the readable hint at its weakness (§9.4a). */
  tell?: string;
  /** Party only — this horse's attack value per approach. */
  approaches?: Record<Approach, number>;
}

export interface BattleView {
  battleId: string;
  status: 'active' | 'won' | 'retreated' | 'fled';
  round: number;
  /** The current actor's id (a horse id for the party); null when the battle is over. */
  turnId: string | null;
  isPartyTurn: boolean;
  combatants: CombatantView[];
  log: { text: string; kind?: string }[];
  /** Healing Potions in the stash — gates the Item action. */
  potions: number;
  reward: { cubes: number; items: { id: string; qty: number }[] } | null;
}

export type BattleAction =
  | { type: 'attack'; targetId: string; approach?: Approach }
  | { type: 'item'; itemId: string; targetId: string }
  | { type: 'defend' }
  | { type: 'flee' };

export const startBattle = (
  enemies: string[],
  party: string[],
): Promise<{ battleId: string; battle: BattleView }> =>
  api.post<{ battleId: string; battle: BattleView }>('/battle/start', { enemies, party });

export const actInBattle = (
  battleId: string,
  action: BattleAction,
): Promise<{ battle: BattleView }> =>
  api.post<{ battle: BattleView }>(`/battle/${battleId}/act`, action);

export const getBattle = (battleId: string): Promise<{ battle: BattleView }> =>
  api.get<{ battle: BattleView }>(`/battle/${battleId}`);
