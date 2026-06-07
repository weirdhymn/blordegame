export type ObjectiveType = 'roam' | 'breed' | 'collect';

export interface QuestObjective {
  type: ObjectiveType;
  /** For 'roam'. */
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
