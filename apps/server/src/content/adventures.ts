import type { PersonalityKey, SkillKey, StatKey } from '@blorse/balance';

export interface ItemAmount {
  id: string;
  qty: number;
}

export interface SceneCheck {
  stat: StatKey;
  skill?: SkillKey;
  dc: number;
  /** Party harmony (avg pairwise OCEAN compatibility) buffs this check (cozy: buff only). */
  harmony?: boolean;
}

export interface Outcome {
  text: string;
  items?: ItemAmount[];
  cubes?: number;
  /** Soft, cozy cost — the party comes home wearier (flavor; never a wipe, never death). */
  fatigue?: number;
  /** Befriend a wild horse — it joins the herd as the narrative reward (no fee). */
  wild?: boolean;
  /** Next scene id, or 'end' to finish the run and bank everything gathered. */
  next: string;
}

export interface Choice {
  id: string;
  text: string;
  /** Personality gate — only offered if a party member meets the trait bound. */
  requires?: { trait: PersonalityKey; min?: number; max?: number };
  /** Contested check; omit for a safe/narrative choice that always takes `success`. */
  check?: SceneCheck;
  success: Outcome;
  /** Taken on a failed check (soft). Defaults to `success` if omitted. */
  failure?: Outcome;
}

export interface Scene {
  id: string;
  /** Rising difficulty / reward tier (1, 2, 3…). */
  stage: number;
  text: string;
  choices: Choice[];
}

export interface AdventureScript {
  regionId: string;
  start: string;
  scenes: Record<string, Scene>;
}

// ── Green Grass — "The Sunny Hollow" (v1 vertical slice) ────────────────────
// Hits every slice requirement: a personality-gated choice (call-bold needs Extraversion≥60),
// harmony-buffed checks (approach, gather-bloom), a wild-horse befriend (approach/call-bold),
// and the push-deeper/retreat fork (crossroads). Rising DCs across stages 1→3.
const GREEN_GRASS: AdventureScript = {
  regionId: 'green-grass',
  start: 'meadow-edge',
  scenes: {
    'meadow-edge': {
      id: 'meadow-edge',
      stage: 1,
      text: 'The grass comes up to your hocks, warm and humming. Two ways in: a sunny bank thick with reeds, or a deer-trail under the tree-line.',
      choices: [
        {
          id: 'forage-bank',
          text: 'Forage the sunny bank',
          check: { stat: 'wis', skill: 'foraging', dc: 10 },
          success: {
            text: 'You strip the good reeds and gather a few fallen branches.',
            items: [
              { id: 'plant-fiber', qty: 2 },
              { id: 'timber', qty: 1 },
            ],
            next: 'crossroads',
          },
          failure: {
            text: 'Mostly picked over — you scrounge a handful.',
            items: [{ id: 'plant-fiber', qty: 1 }],
            next: 'crossroads',
          },
        },
        {
          id: 'scout-trees',
          text: 'Scout the tree-line',
          check: { stat: 'con', skill: 'athletics', dc: 11 },
          success: {
            text: 'You shoulder loose a satisfying load of deadwood.',
            items: [{ id: 'timber', qty: 3 }],
            next: 'crossroads',
          },
          failure: {
            text: 'A bramble wins. You back out with one branch and a scratch.',
            items: [{ id: 'timber', qty: 1 }],
            fatigue: 1,
            next: 'crossroads',
          },
        },
      ],
    },
    crossroads: {
      id: 'crossroads',
      stage: 1,
      text: 'The hollow opens deeper, greener, quieter. You could press on… or call it a good day and head home with what you have.',
      choices: [
        {
          id: 'push',
          text: 'Push deeper into the hollow',
          success: { text: 'You wade on into the tall green.', next: 'stranger' },
        },
        {
          id: 'retreat',
          text: 'Bank your haul and head home',
          success: { text: 'A fine, unhurried trip. You amble home.', next: 'end' },
        },
      ],
    },
    stranger: {
      id: 'stranger',
      stage: 2,
      text: 'A lone horse stands on a rise, watching you with both ears forward. Not wild-eyed — curious.',
      choices: [
        {
          id: 'approach',
          text: 'Approach gently, the whole party easy and slow',
          check: { stat: 'cha', dc: 12, harmony: true },
          success: {
            text: 'It blows a soft breath and falls into step beside you.',
            wild: true,
            next: 'deep-bloom',
          },
          failure: {
            text: 'It flares, wheels, and is gone into the reeds.',
            next: 'deep-bloom',
          },
        },
        {
          id: 'call-bold',
          text: 'Call out boldly and strut your stuff',
          requires: { trait: 'e', min: 60 },
          check: { stat: 'cha', skill: 'performance', dc: 14 },
          success: {
            text: 'You put on a show. The stranger is delighted — it tags along, and you find its little cache.',
            wild: true,
            items: [{ id: 'plant-fiber', qty: 2 }],
            next: 'deep-bloom',
          },
          failure: {
            text: 'Too much, too soon. It spooks; your party looks a touch silly.',
            fatigue: 1,
            next: 'deep-bloom',
          },
        },
        {
          id: 'pass',
          text: 'Hang back and pass by',
          success: {
            text: 'You let it watch you go. Some horses keep their own counsel.',
            next: 'deep-bloom',
          },
        },
      ],
    },
    'deep-bloom': {
      id: 'deep-bloom',
      stage: 3,
      text: 'At the heart of the hollow, a single strange bloom nods over a sun-warm stone. It glints.',
      choices: [
        {
          id: 'gather-bloom',
          text: 'Work together to gather the rare bloom',
          check: { stat: 'int', skill: 'foraging', dc: 14, harmony: true },
          success: {
            text: 'Careful hooves, careful teeth — you free it whole. Something rare glints beneath.',
            items: [
              { id: 'rare-gem', qty: 1 },
              { id: 'plant-fiber', qty: 2 },
            ],
            cubes: 20,
            next: 'end',
          },
          failure: {
            text: 'It crumbles to seed-fluff on the wind. You head home tired but unbowed.',
            items: [{ id: 'plant-fiber', qty: 1 }],
            fatigue: 1,
            next: 'end',
          },
        },
        {
          id: 'slip-out',
          text: 'Leave it be and slip out with your haul',
          success: {
            text: 'Some things are better left to bloom. You turn for home, content.',
            next: 'end',
          },
        },
      ],
    },
  },
};

export const ADVENTURE_SCRIPTS: AdventureScript[] = [GREEN_GRASS];
export const ADVENTURE_BY_REGION = new Map(ADVENTURE_SCRIPTS.map((s) => [s.regionId, s]));
