export interface BuildCost {
  cubes: number;
  items: { id: string; qty: number }[];
}

export interface StructureDef {
  id: string;
  name: string;
  /** Skill ↔ job ↔ governing stat (§14.6) — Phase 8 reads these to enable jobs. */
  skill: string;
  job: string;
  stat: string;
  buildCost: BuildCost;
  description: string;
}

export const STRUCTURES: StructureDef[] = [
  {
    id: 'library',
    name: 'Library',
    skill: 'reading',
    job: 'librarian',
    stat: 'int',
    buildCost: { cubes: 50, items: [{ id: 'plank', qty: 3 }] },
    description: 'Raises Reading; enables the Librarian job.',
  },
  {
    id: 'forge',
    name: 'Forge',
    skill: 'smithing',
    job: 'blacksmith',
    stat: 'str',
    buildCost: { cubes: 80, items: [{ id: 'brick', qty: 3 }] },
    description: 'Enables the Blacksmith job.',
  },
  {
    id: 'kitchen',
    name: 'Kitchen',
    skill: 'baking',
    job: 'baker',
    stat: 'dex',
    buildCost: {
      cubes: 60,
      items: [
        { id: 'plank', qty: 2 },
        { id: 'brick', qty: 1 },
      ],
    },
    description: 'Enables the Baker job.',
  },
  {
    id: 'foragers-hut',
    name: "Forager's Hut",
    skill: 'foraging',
    job: 'forager',
    stat: 'wis',
    buildCost: { cubes: 40, items: [{ id: 'plank', qty: 2 }] },
    description: 'Enables the Forager job.',
  },
  {
    id: 'track',
    name: 'Track',
    skill: 'athletics',
    job: 'trainer',
    stat: 'con',
    buildCost: { cubes: 50, items: [{ id: 'brick', qty: 2 }] },
    description: 'Enables the Trainer job.',
  },
  {
    id: 'stage',
    name: 'Stage',
    skill: 'performance',
    job: 'performer',
    stat: 'cha',
    buildCost: {
      cubes: 70,
      items: [
        { id: 'plank', qty: 2 },
        { id: 'brick', qty: 2 },
      ],
    },
    description: 'Enables the Performer job.',
  },
  {
    id: 'meeting-hall',
    name: 'Meeting Hall',
    skill: '',
    job: '',
    stat: '',
    buildCost: {
      cubes: 100,
      items: [
        { id: 'plank', qty: 3 },
        { id: 'brick', qty: 2 },
      ],
    },
    description: 'Enables clubs and civil-society roles (Phase 9).',
  },
];

export const STRUCTURE_BY_ID = new Map(STRUCTURES.map((s) => [s.id, s]));
