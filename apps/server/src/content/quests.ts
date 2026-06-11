export type ObjectiveType =
  | 'roam'
  | 'breed'
  | 'collect'
  | 'cook'
  | 'groom'
  | 'expedition'
  | 'sunrise';

export interface QuestObjective {
  type: ObjectiveType;
  /** For 'roam' (required) and 'expedition' (optional — omit to match any region). */
  regionId?: string;
  /** For 'collect'. */
  itemId?: string;
  count: number;
  label: string;
}

export interface QuestReward {
  cubes?: number;
  items?: { id: string; qty: number }[];
}

export interface QuestDef {
  id: string;
  title: string;
  /** Prerequisite quest id; null = available from the start. */
  requires: string | null;
  objectives: QuestObjective[];
  reward: QuestReward;
}

// A small starter chain. Completing 'first-steps' / 'into-the-dunes' also unlocks the
// next region (regions reference these via `requiresQuest`).
export const QUESTS: QuestDef[] = [
  // The onboarding checklist (§7i): one quest that walks the whole daily rhythm in order —
  // forage (grains come home) → cook → expedition → groom → wake to the reward. The order is
  // taught by the labels, never enforced (cozy: it's a rhythm, not a railroad).
  {
    id: 'first-day',
    title: 'Your First Day',
    requires: null,
    objectives: [
      {
        type: 'roam',
        regionId: 'green-grass',
        count: 1,
        label: '🧺 Send the herd foraging (grains ride home with them)',
      },
      { type: 'cook', count: 1, label: '🍳 Cook a morning meal at the Care hub' },
      { type: 'expedition', count: 1, label: '🗺 Set out on an expedition (Adventure)' },
      { type: 'groom', count: 1, label: '🌙 Groom the herd at dusk' },
      { type: 'sunrise', count: 1, label: '☀ Greet the next sunrise' },
    ],
    reward: { cubes: 250 },
  },
  {
    id: 'first-steps',
    title: 'First Steps',
    requires: null,
    objectives: [
      // One daily gather (the gather is now a once-per-horse-per-day action, §7), not a 3× grind.
      {
        type: 'roam',
        regionId: 'green-grass',
        count: 1,
        label: 'Send your herd foraging in Green Grass',
      },
    ],
    reward: { cubes: 150 },
  },
  {
    id: 'a-new-foal',
    title: 'A New Foal',
    requires: null,
    objectives: [{ type: 'breed', count: 1, label: 'Breed your first foal' }],
    reward: { cubes: 200, items: [{ id: 'plant-fiber', qty: 3 }] },
  },
  {
    id: 'into-the-dunes',
    title: 'Into the Dunes',
    requires: 'first-steps',
    objectives: [
      { type: 'roam', regionId: 'dusty-dunes', count: 1, label: 'Forage once in Dusty Dunes' },
    ],
    reward: { cubes: 300 },
  },
];

export const QUEST_BY_ID = new Map(QUESTS.map((q) => [q.id, q]));
