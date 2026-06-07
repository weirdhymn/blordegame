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
  /** A boss battle (§9.4c): banks the run's haul + ends the run, then drops the party into combat
   *  against this enemy id — the deepest push. On victory the enemy's reward is the big prize. */
  battle?: string;
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
  /** Stable id — a run stores which script it picked from its region's pool (§9.3). */
  id: string;
  /** Display name for the expedition picker (§9.4c). */
  name: string;
  regionId: string;
  start: string;
  scenes: Record<string, Scene>;
}

// ── Green Grass — "The Sunny Hollow" (v1 vertical slice) ────────────────────
// Hits every slice requirement: a personality-gated choice (call-bold needs Extraversion≥60),
// harmony-buffed checks (approach, gather-bloom), a wild-horse befriend (approach/call-bold),
// and the push-deeper/retreat fork (crossroads). Rising DCs across stages 1→3.
const SUNNY_HOLLOW: AdventureScript = {
  id: 'sunny-hollow',
  name: 'The Sunny Hollow',
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

// ── Green Grass — "The Marsh-Sage Brew" (the herb hunt) ─────────────────────
// Distinct stat checks per choice (wis/con/str/int/dex), a Conscientiousness gate (a different
// trait than Sunny Hollow's Extraversion gate), a harmony-buffed brew, the push/bank fork, and
// feed-forward: the sage you bring out of the fen decides which brew scene (DC 11/14/16) you face.
const HERB_HUNT: AdventureScript = {
  id: 'herb-hunt',
  name: 'The Marsh-Sage Brew',
  regionId: 'green-grass',
  start: 'herb-meadow',
  scenes: {
    'herb-meadow': {
      id: 'herb-meadow',
      stage: 1,
      text: 'An old recipe promises a healing brew — steep marsh-sage with common herbs and you have a remedy for whatever the world throws next. The common herbs come first: some stand in the open sun, some hide under the bramble that bites back.',
      choices: [
        {
          id: 'pick-open',
          text: 'Pick the herbs standing in the open',
          check: { stat: 'wis', skill: 'foraging', dc: 10 },
          success: {
            text: 'A calm, practiced harvest — a good basket of the common stuff.',
            items: [{ id: 'plant-fiber', qty: 2 }],
            next: 'herb-fork',
          },
          failure: {
            text: 'Half of it has gone to seed; you make do with a handful.',
            items: [{ id: 'plant-fiber', qty: 1 }],
            next: 'herb-fork',
          },
        },
        {
          id: 'brave-bramble',
          text: 'Brave the bramble for the richer leaves',
          check: { stat: 'con', skill: 'athletics', dc: 11 },
          success: {
            text: 'You come out scratched and smug, forelegs full of the good leaves.',
            items: [{ id: 'plant-fiber', qty: 3 }],
            next: 'herb-fork',
          },
          failure: {
            text: 'The bramble keeps most of it, and a little of your dignity.',
            items: [{ id: 'plant-fiber', qty: 1 }],
            fatigue: 1,
            next: 'herb-fork',
          },
        },
      ],
    },
    'herb-fork': {
      id: 'herb-fork',
      stage: 1,
      text: "You have common herbs enough for a thin, honest remedy. But the recipe's heart is marsh-sage, and that grows out in the fen — past soft ground and a low, proprietary buzz. Brew the modest version now, or go get the real thing?",
      choices: [
        {
          id: 'brew-now',
          text: 'Settle for the modest brew and head home',
          success: {
            text: 'A thin remedy, but a real one — and useless on these gentle roads. Still: you cork it and tuck it away, for whatever is coming.',
            items: [{ id: 'healing-potion', qty: 1 }],
            next: 'end',
          },
        },
        {
          id: 'into-the-fen',
          text: 'Push into the fen for the marsh-sage',
          success: {
            text: 'You squelch out toward the silver-green. The buzz gets louder.',
            next: 'fen',
          },
        },
      ],
    },
    fen: {
      id: 'fen',
      stage: 2,
      text: 'The meadow sags into a wet, reedy fen — and there it is, the silver-green marsh-sage the recipe wants, growing in a clump out past the soft ground. Between you and it: mud that wants your ankles, and that low buzz of something that does not love visitors.',
      choices: [
        {
          id: 'wade',
          text: 'Wade straight out and grab it',
          check: { stat: 'str', skill: 'athletics', dc: 11 },
          success: {
            text: 'One of you plows through up to the hocks and comes back filthy and triumphant, marsh-sage held high like a trophy nobody asked for.',
            next: 'brew-fair',
          },
          failure: {
            text: 'The mud wins. You wrench free with a thin handful and a leg caked to the knee.',
            fatigue: 1,
            next: 'brew-thin',
          },
        },
        {
          id: 'read-ground',
          text: 'Read the ground and pick a dry line across',
          check: { stat: 'int', skill: 'foraging', dc: 12 },
          success: {
            text: 'You read the reeds like a map — which tussocks hold, which swallow a leg. You cross dry-shod and take the best of the sage.',
            next: 'brew-rich',
          },
          failure: {
            text: 'You misjudge a tussock, soak a leg, and settle for the easy-reach sprigs.',
            next: 'brew-thin',
          },
        },
        {
          id: 'sneak',
          text: 'Send your most careful one alone — quiet and slow',
          requires: { trait: 'c', min: 60 },
          check: { stat: 'dex', skill: 'athletics', dc: 13 },
          success: {
            text: 'Your careful one picks out and back one slow hoof at a time, never troubles the buzz, and returns with a pristine armful and an air of quiet superiority.',
            next: 'brew-rich',
          },
          failure: {
            text: 'Halfway out, your careful one freezes, thinks better of the whole enterprise, and backs out the way it came. Nothing ventured.',
            next: 'fen',
          },
        },
      ],
    },
    'brew-rich': {
      id: 'brew-rich',
      stage: 3,
      text: 'Back on dry ground, you set to brewing. The sage is pristine; the pot all but wants to work. Steady hooves and steady hearts — those who trust each other lean in close over the steam.',
      choices: [
        {
          id: 'brew',
          text: 'Brew the remedy together',
          check: { stat: 'int', skill: 'foraging', dc: 11, harmony: true },
          success: {
            text: 'It comes together clean and green and faintly glowing — a true Healing Potion. No use for it on roads this gentle, but you will want it when the roads turn rough.',
            items: [
              { id: 'healing-potion', qty: 1 },
              { id: 'marsh-sage', qty: 1 },
            ],
            cubes: 20,
            next: 'end',
          },
          failure: {
            text: 'Even good sage can sulk. The brew will not set today; you save the sage to try again.',
            items: [{ id: 'marsh-sage', qty: 1 }],
            next: 'end',
          },
        },
      ],
    },
    'brew-fair': {
      id: 'brew-fair',
      stage: 3,
      text: 'Back on dry ground, you set to brewing. The sage is decent if a little mud-flecked. Steady hooves and steady hearts — those who trust each other lean in close over the steam.',
      choices: [
        {
          id: 'brew',
          text: 'Brew the remedy together',
          check: { stat: 'int', skill: 'foraging', dc: 14, harmony: true },
          success: {
            text: 'It sets, slow but sure — a true Healing Potion. No use for it on roads this gentle, but you will want it when the roads turn rough.',
            items: [{ id: 'healing-potion', qty: 1 }],
            cubes: 12,
            next: 'end',
          },
          failure: {
            text: 'The brew turns and will not come back. You salvage the sage to try again another day.',
            items: [{ id: 'marsh-sage', qty: 1 }],
            next: 'end',
          },
        },
      ],
    },
    'brew-thin': {
      id: 'brew-thin',
      stage: 3,
      text: 'Back on dry ground, you set to brewing — but the sage is thin and bedraggled, and the pot knows it. This will take every steady hoof and every steady heart you have.',
      choices: [
        {
          id: 'brew',
          text: 'Coax the thin brew together',
          check: { stat: 'int', skill: 'foraging', dc: 16, harmony: true },
          success: {
            text: 'Against the odds, it sets — a true Healing Potion, wrung from a poor handful. No use for it yet, but tuck it away; rougher roads are coming.',
            items: [{ id: 'healing-potion', qty: 1 }],
            cubes: 6,
            next: 'end',
          },
          failure: {
            text: 'The thin brew never sets. You keep the sage and the lesson, and amble home.',
            items: [{ id: 'marsh-sage', qty: 1 }],
            next: 'end',
          },
        },
      ],
    },
  },
};

// ── Green Grass — "The Hollow-Keeper" (the region boss, §9.4c) ──────────────
// A deep expedition whose climax is a boss battle. Push deep enough (gather → fork → clearing) and
// the deepest choice hands the party off to combat against the Hollow-Keeper; bank earlier to skip
// it. The run banks its journey haul + ends at that choice; the boss's reward is the big prize.
const HOLLOW_KEEPER: AdventureScript = {
  id: 'hollow-keeper',
  name: 'The Hollow-Keeper',
  regionId: 'green-grass',
  start: 'keeper-meadow',
  scenes: {
    'keeper-meadow': {
      id: 'keeper-meadow',
      stage: 1,
      text: 'There is a part of the Green Grass the old herds speak of only in lowered voices: a deep hollow where something ancient keeps its own counsel. The way in is easy enough, and green, and far too quiet.',
      choices: [
        {
          id: 'gather-way',
          text: 'Gather as you go',
          check: { stat: 'wis', skill: 'foraging', dc: 11 },
          success: {
            text: 'You work the verges as you walk — a tidy armful of good things for the road.',
            items: [
              { id: 'plant-fiber', qty: 2 },
              { id: 'timber', qty: 1 },
            ],
            next: 'keeper-fork',
          },
          failure: {
            text: 'Pickings are thin this deep; you pocket what little there is.',
            items: [{ id: 'plant-fiber', qty: 1 }],
            next: 'keeper-fork',
          },
        },
        {
          id: 'press-quiet',
          text: 'Save your strength and press on quietly',
          success: {
            text: 'You keep your heads down and your hooves soft, and the hollow swallows you whole.',
            next: 'keeper-fork',
          },
        },
      ],
    },
    'keeper-fork': {
      id: 'keeper-fork',
      stage: 2,
      text: 'The hollow forks. One path climbs back toward the open meadow and an easy trip home. The other drops deeper, toward a stillness with a weight to it — toward whatever it is that keeps this place.',
      choices: [
        {
          id: 'bank-home',
          text: 'Bank your haul and head home',
          success: {
            text: 'Discretion, the better part. You turn for the light, content.',
            next: 'end',
          },
        },
        {
          id: 'go-deeper',
          text: 'Go down, toward the keeper',
          success: {
            text: 'You go down. The green closes overhead. The quiet gets quieter.',
            next: 'keeper-clearing',
          },
        },
      ],
    },
    'keeper-clearing': {
      id: 'keeper-clearing',
      stage: 3,
      text: 'The path opens into a sunlit clearing at the heart of the hollow — and the Hollow-Keeper is waiting, vast and unhurried, square across the only way through. There is no going round it. There is only through.',
      choices: [
        {
          id: 'face-keeper',
          text: 'Stand your ground and face the Hollow-Keeper',
          success: {
            text: 'You square up. The great stag rises to meet you, and the whole clearing holds its breath.',
            battle: 'gg-hollow-keeper',
            next: 'end',
          },
        },
        {
          id: 'slip-back',
          text: 'Think better of it and slip back the way you came',
          success: {
            text: 'Some doors are better left closed. You back out quietly; the Keeper lets you go.',
            next: 'end',
          },
        },
      ],
    },
  },
};

// ── Dusty Dunes — "The Bleaching Wash" (a regular tier-2 expedition) ────────
const BLEACHING_WASH: AdventureScript = {
  id: 'bleaching-wash',
  name: 'The Bleaching Wash',
  regionId: 'dusty-dunes',
  start: 'wash-mouth',
  scenes: {
    'wash-mouth': {
      id: 'wash-mouth',
      stage: 1,
      text: 'A dry wash cuts down out of the dunes — a road for water that has not seen rain in living memory, floored with cracked clay and bleached, faintly judgemental bones. Good gleaning, if you can stand the glare.',
      choices: [
        {
          id: 'dig-clay',
          text: 'Lever up the cracked clay-pan',
          check: { stat: 'str', skill: 'athletics', dc: 11 },
          success: {
            text: 'You pry up good slabs of fire-ready clay.',
            items: [{ id: 'clay', qty: 3 }],
            next: 'wash-fork',
          },
          failure: {
            text: 'The pan fights you; you lever loose a meagre lump.',
            items: [{ id: 'clay', qty: 1 }],
            next: 'wash-fork',
          },
        },
        {
          id: 'sift-shade',
          text: 'Sift the shaded undercut for what the floods left',
          check: { stat: 'wis', skill: 'foraging', dc: 12 },
          success: {
            text: 'Patience pays: a seam of good ore the water tucked away.',
            items: [
              { id: 'ore', qty: 2 },
              { id: 'clay', qty: 1 },
            ],
            next: 'wash-fork',
          },
          failure: {
            text: 'Mostly grit and old bone. You pocket a little ore.',
            items: [{ id: 'ore', qty: 1 }],
            next: 'wash-fork',
          },
        },
      ],
    },
    'wash-fork': {
      id: 'wash-fork',
      stage: 2,
      text: 'The wash splits around a great bleached boulder. The shaded fork looks cool and promising; or you could call it a good haul and climb out while the light still holds.',
      choices: [
        {
          id: 'bank',
          text: 'Climb out with your haul',
          success: {
            text: 'A sensible turn for home, pockets full of honest clay.',
            next: 'end',
          },
        },
        {
          id: 'push',
          text: 'Press on up the shaded fork',
          success: { text: 'You duck into the cool blue shade and press on.', next: 'wash-cache' },
        },
      ],
    },
    'wash-cache': {
      id: 'wash-cache',
      stage: 3,
      text: 'The shade opens on a hollow where the last real flood piled its treasures: a glitter of something better than clay, half-buried where the wash gives up its secrets.',
      choices: [
        {
          id: 'work-cache',
          text: 'Work the flood-cache loose together',
          check: { stat: 'dex', skill: 'foraging', dc: 14, harmony: true },
          success: {
            text: 'Careful hooves free it whole — a gem the desert kept for itself, and good ore besides.',
            items: [
              { id: 'rare-gem', qty: 1 },
              { id: 'ore', qty: 2 },
            ],
            cubes: 18,
            next: 'end',
          },
          failure: {
            text: 'It shatters as it comes free; you salvage the ore and a story.',
            items: [{ id: 'ore', qty: 1 }],
            fatigue: 1,
            next: 'end',
          },
        },
        {
          id: 'leave',
          text: 'Leave it and head for home',
          success: {
            text: 'Some treasures keep. You climb back into the light, content.',
            next: 'end',
          },
        },
      ],
    },
  },
};

// ── Dusty Dunes — "The Sandstone Sentinel" (the region boss, §9.4c) ─────────
const SANDSTONE_SENTINEL: AdventureScript = {
  id: 'sandstone-sentinel',
  name: 'The Sandstone Sentinel',
  regionId: 'dusty-dunes',
  start: 'sentinel-flats',
  scenes: {
    'sentinel-flats': {
      id: 'sentinel-flats',
      stage: 1,
      text: 'Out past the last good well, the dunes give way to a country of standing stones and slot canyons — and a story, old as the rock, of a guardian that walks when it is woken. The wind here sounds almost like breathing.',
      choices: [
        {
          id: 'glean-stones',
          text: 'Glean the standing stones as you go',
          check: { stat: 'wis', skill: 'foraging', dc: 12 },
          success: {
            text: 'You chip free good ore and a few odd, heavy stones for the road.',
            items: [
              { id: 'ore', qty: 2 },
              { id: 'clay', qty: 1 },
            ],
            next: 'sentinel-fork',
          },
          failure: {
            text: 'The stones keep their counsel. You take what little flakes off.',
            items: [{ id: 'ore', qty: 1 }],
            next: 'sentinel-fork',
          },
        },
        {
          id: 'pace-quiet',
          text: 'Save your strength and pace it quietly',
          success: {
            text: 'You go soft-hooved through the standing stones, and the country lets you pass.',
            next: 'sentinel-fork',
          },
        },
      ],
    },
    'sentinel-fork': {
      id: 'sentinel-fork',
      stage: 2,
      text: 'The way forks at a slot canyon. One path skirts wide around it, an easy road home. The other goes in — into a deep red cleft where the breathing-wind is loudest and something very large is very still.',
      choices: [
        {
          id: 'skirt-home',
          text: 'Skirt wide and head for home',
          success: {
            text: 'Let sleeping mountains lie. You turn for the wells, content.',
            next: 'end',
          },
        },
        {
          id: 'into-slot',
          text: 'Go in, down the slot canyon',
          success: {
            text: 'You step into the red cleft. The breathing stops. Something begins, very slowly, to stand.',
            next: 'sentinel-slot',
          },
        },
      ],
    },
    'sentinel-slot': {
      id: 'sentinel-slot',
      stage: 3,
      text: 'The slot canyon ends in a wall — and the wall unfolds, sand sheeting off shoulders of red stone, into the Sandstone Sentinel. It fills the only way through. There is no skirting this one.',
      choices: [
        {
          id: 'face-sentinel',
          text: 'Stand your ground and face the Sentinel',
          success: {
            text: 'You set your hooves in the sand. The colossus raises a fist the size of a millstone.',
            battle: 'dd-sandstone-sentinel',
            next: 'end',
          },
        },
        {
          id: 'back-out',
          text: 'Back out of the slot the way you came',
          success: {
            text: 'Wiser, if less glorious. You back into the light; the Sentinel settles, grain by grain, back into a dune.',
            next: 'end',
          },
        },
      ],
    },
  },
};

// ── Weird Woods — "The Mistwood Mimic" (the region boss, §9.4c) ─────────────
const MISTWOOD_MIMIC: AdventureScript = {
  id: 'mistwood-mimic',
  name: 'The Mistwood Mimic',
  regionId: 'weird-woods',
  start: 'mist-eaves',
  scenes: {
    'mist-eaves': {
      id: 'mist-eaves',
      stage: 1,
      text: 'Under the eaves of the Weird Woods the light goes green and strange and the mist never quite lifts. The trees here grow things they have no business growing, and a few of them are worth the taking.',
      choices: [
        {
          id: 'harvest-odd',
          text: 'Harvest the odd, glowing growths',
          check: { stat: 'int', skill: 'foraging', dc: 12 },
          success: {
            text: 'You read which lights are safe to touch and come away with good timber and stranger things.',
            items: [
              { id: 'timber', qty: 2 },
              { id: 'ore', qty: 1 },
            ],
            next: 'mist-fork',
          },
          failure: {
            text: 'Half of it bites back or simply vanishes. You keep what holds still.',
            items: [{ id: 'timber', qty: 1 }],
            next: 'mist-fork',
          },
        },
        {
          id: 'tread-careful',
          text: 'Tread carefully and keep your wits about you',
          success: {
            text: 'You keep one eye on the path and one on the mist, and the woods, for now, behave.',
            next: 'mist-fork',
          },
        },
      ],
    },
    'mist-fork': {
      id: 'mist-fork',
      stage: 2,
      text: 'The path forks at a leaning, lightning-split oak. One way leads back to the honest edge of the wood. The other goes down into a hollow where the mist pools thick as soup and something is laughing very quietly at a joke you cannot hear.',
      choices: [
        {
          id: 'back-edge',
          text: 'Head back to the wood-edge',
          success: {
            text: 'You leave the laughing to itself and turn for home, content.',
            next: 'end',
          },
        },
        {
          id: 'into-mist',
          text: 'Go down, into the laughing mist',
          success: {
            text: 'You wade into the soup. The laughing gets closer, and then it is all around you.',
            next: 'mist-heart',
          },
        },
      ],
    },
    'mist-heart': {
      id: 'mist-heart',
      stage: 3,
      text: 'The hollow at the heart of the mist is full of the Mistwood Mimic — which is to say full of a dozen of it, all grinning, none of them quite where you look. There is one real one in there somewhere, and it is between you and the way out.',
      choices: [
        {
          id: 'face-mimic',
          text: 'Hold your nerve and face the Mimic',
          success: {
            text: 'You plant your hooves and stop chasing afterimages. The crowd of grins turns, as one, to you.',
            battle: 'ww-mistwood-mimic',
            next: 'end',
          },
        },
        {
          id: 'slip-mist',
          text: 'Slip back out through the mist',
          success: {
            text: 'You back out the way you came, following your own hoofprints; the laughing fades behind you.',
            next: 'end',
          },
        },
      ],
    },
  },
};

export const ADVENTURE_SCRIPTS: AdventureScript[] = [
  SUNNY_HOLLOW,
  HERB_HUNT,
  HOLLOW_KEEPER,
  BLEACHING_WASH,
  SANDSTONE_SENTINEL,
  MISTWOOD_MIMIC,
];

/** Each region's pool of adventure scripts; a run picks one (seeded) at startRun (§9.3). */
export const ADVENTURE_POOLS = new Map<string, AdventureScript[]>();
for (const s of ADVENTURE_SCRIPTS) {
  const pool = ADVENTURE_POOLS.get(s.regionId);
  if (pool) pool.push(s);
  else ADVENTURE_POOLS.set(s.regionId, [s]);
}

/** Resolve a run's chosen script by its stored id — a run stays on its script (§9.3). */
export const ADVENTURE_BY_ID = new Map(ADVENTURE_SCRIPTS.map((s) => [s.id, s]));
