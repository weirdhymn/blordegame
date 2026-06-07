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

// ── VOICE & TONE STANDARD (the bar for every adventure script) ─────────────
// Benchmarks: "The Sunny Hollow" and "The Hollow-Keeper". Hold this bar — new stories must NOT drift
// flatter than the hand-crafted ones. The register:
//   • Second person, present tense. The party is "you / your party"; creatures are "it / its".
//   • Sensory and concrete FIRST — a specific smell, sound, or texture per beat ("warm and humming",
//     "ringing faintly underhoof like a struck bell"). Earn the whimsy with detail.
//   • Wry, deadpan understatement for the buttons — fond, never mean, never grim ("It is not
//     malicious. It is just extremely a bramble."). Aim for one good dry line per scene.
//   • Foes are characters with inner lives, not monsters — sympathetic even in opposition (the Keeper
//     "has been waiting a very long time for someone to be rude to it").
//   • Cozy stakes: a failed check is a meagre haul + a story, never a loss. Combat is opt-in & earned.
//   • Choices read as vivid verbs ("Shoulder the old gate aside", "Strike up a duet with the frogs").
//   • Outcomes are 1–2 sentences with a turn of phrase — no purple paragraphs.
// Every script MUST have: distinct stat checks across its scenes, ≥1 personality gate, and the
// push/bank fork (a "head home with your haul" option opposite a "press deeper" one).
//
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

// ── Green Grass — "The Bramble Gate" (combat-forward: a Knight-weak skirmish) ─
const BRAMBLE_GATE: AdventureScript = {
  id: 'bramble-gate',
  name: 'The Bramble Gate',
  regionId: 'green-grass',
  start: 'gate-lane',
  scenes: {
    'gate-lane': {
      id: 'gate-lane',
      stage: 1,
      text: 'An old drystone lane runs off between two meadows toward a forgotten orchard gone gloriously to seed. Somewhere down it, too, is whatever has been snapping branches after dark.',
      choices: [
        {
          id: 'glean-lane',
          text: 'Glean the hedgerows as you go',
          check: { stat: 'wis', skill: 'foraging', dc: 11 },
          success: {
            text: 'You strip the hedge of late berries and good straight withies.',
            items: [
              { id: 'plant-fiber', qty: 2 },
              { id: 'timber', qty: 1 },
            ],
            next: 'gate-fork',
          },
          failure: {
            text: 'Thornier than it looks; you come away with a modest handful and a few scratches.',
            items: [{ id: 'plant-fiber', qty: 1 }],
            next: 'gate-fork',
          },
        },
        {
          id: 'march-on',
          text: 'Save your strength and march straight for the orchard',
          success: { text: 'You pick up the pace down the green lane.', next: 'gate-fork' },
        },
      ],
    },
    'gate-fork': {
      id: 'gate-fork',
      stage: 2,
      text: 'The lane ends where the orchard gate used to be. A bramble has eaten it: a wall of thorn as tall as a horse, bristling, and — you would swear — breathing. Beyond it the old trees hang heavy with fruit nobody has picked in years.',
      choices: [
        {
          id: 'turn-back',
          text: 'Decide the berries you have are plenty, and turn back',
          success: {
            text: 'A wise, unscratched retreat. You amble home with your hedgerow haul.',
            next: 'end',
          },
        },
        {
          id: 'press-gate',
          text: 'Step up for a closer look at what you are dealing with',
          success: {
            text: 'You approach the thorn-wall. It shivers, shakes off a season of dust, and hauls itself upright to meet you. Ah.',
            next: 'gate-stand',
          },
        },
      ],
    },
    'gate-stand': {
      id: 'gate-stand',
      stage: 3,
      text: 'The bramble fills the gateway, thorns combing the air, entirely and uncomplicatedly in your way. There is a great deal of fruit on the other side of it.',
      choices: [
        {
          id: 'pick-through',
          text: 'Thread a careful path through the gaps',
          requires: { trait: 'c', min: 60 },
          check: { stat: 'dex', skill: 'athletics', dc: 14 },
          success: {
            text: 'Patient, exact, not a wasted step — you thread the whole party through and raid the orchard clean.',
            items: [
              { id: 'rare-gem', qty: 1 },
              { id: 'plant-fiber', qty: 2 },
            ],
            cubes: 20,
            next: 'end',
          },
          failure: {
            text: 'Three steps in, the thorns have other ideas; you back out the way you came, prickled and laughing.',
            items: [{ id: 'plant-fiber', qty: 1 }],
            fatigue: 1,
            next: 'end',
          },
        },
        {
          id: 'shoulder-in',
          text: 'Put your shoulders into it and force the gate',
          success: {
            text: 'No more finesse, then. You square up to the thing and shove — and it shoves back.',
            battle: 'bramble-tangle',
            next: 'end',
          },
        },
      ],
    },
  },
};

// ── Green Grass — "Frogmarch Pond" (cozy, with an optional Cleric-weak fight) ─
const FROGMARCH_POND: AdventureScript = {
  id: 'frogmarch-pond',
  name: 'Frogmarch Pond',
  regionId: 'green-grass',
  start: 'pond-edge',
  scenes: {
    'pond-edge': {
      id: 'pond-edge',
      stage: 1,
      text: 'Frogmarch Pond is exactly as advertised: a wide, warm, weed-green pond, and several hundred frogs conducting some enormous froggy business across it in tremendous voice. The reeds grow tall and useful here, and something is glinting out on the little island.',
      choices: [
        {
          id: 'cut-reeds',
          text: 'Wade in and cut the tall reeds',
          check: { stat: 'con', skill: 'athletics', dc: 10 },
          success: {
            text: 'Cold to the hocks but worth it — you come out laden with the best reeds of the year.',
            items: [{ id: 'plant-fiber', qty: 3 }],
            next: 'pond-middle',
          },
          failure: {
            text: 'The mud has opinions about your footing. You salvage an armful and most of your dignity.',
            items: [{ id: 'plant-fiber', qty: 1 }],
            fatigue: 1,
            next: 'pond-middle',
          },
        },
        {
          id: 'charm-frogs',
          text: 'Strike up a duet with the frog chorus',
          requires: { trait: 'e', min: 60 },
          check: { stat: 'cha', skill: 'performance', dc: 12 },
          success: {
            text: 'You add a baritone the chorus did not know it needed. Delighted, the frogs escort you to the choicest reed-beds.',
            items: [
              { id: 'plant-fiber', qty: 3 },
              { id: 'marsh-sage', qty: 1 },
            ],
            next: 'pond-middle',
          },
          failure: {
            text: 'You are, it turns out, no frog. The chorus falls into appalled silence, then resumes without you.',
            next: 'pond-middle',
          },
        },
      ],
    },
    'pond-middle': {
      id: 'pond-middle',
      stage: 2,
      text: 'The glint is real: something bright, snagged in the reeds out on the island. The only dry way across is a fallen log — currently occupied, end to end, by a single enormous grey goose, who has watched your entire approach with the cold patience of a customs official.',
      choices: [
        {
          id: 'leave-glint',
          text: 'Decide the island can keep its secret, and head home',
          success: {
            text: 'You bank your good green haul and leave the goose to its bridge. Everyone keeps their feathers.',
            next: 'end',
          },
        },
        {
          id: 'cross-log',
          text: 'Try the log anyway',
          success: {
            text: 'You set one hoof on the log. The goose rises, spreads wings the span of a barn door, and informs you — at volume — that you have made a grave mistake.',
            next: 'goose-stand',
          },
        },
      ],
    },
    'goose-stand': {
      id: 'goose-stand',
      stage: 3,
      text: 'The gander plants itself dead-centre of the log, hissing like a punctured kettle, absolutely prepared to defend this damp stick with its life. The glint winks at you from the island just beyond.',
      choices: [
        {
          id: 'soothe-goose',
          text: 'Talk it down, slow and kind',
          requires: { trait: 'a', min: 60 },
          check: { stat: 'cha', dc: 13, harmony: true },
          success: {
            text: 'You go gentle, and gentler, until the great bird deflates, grumbles, and waddles aside to let you pass. The island gives up its treasure.',
            items: [
              { id: 'rare-gem', qty: 1 },
              { id: 'plant-fiber', qty: 1 },
            ],
            cubes: 15,
            next: 'end',
          },
          failure: {
            text: 'It is having precisely none of it. You retreat down the log with your haul and your ears ringing.',
            fatigue: 1,
            next: 'end',
          },
        },
        {
          id: 'shoo-goose',
          text: 'Stand your ground and settle this properly',
          success: {
            text: 'Fine. If the goose wants a debate, you will give it one. It drops off the log to meet you, wings wide.',
            battle: 'snappish-gander',
            next: 'end',
          },
        },
      ],
    },
  },
};

// ── Dusty Dunes — "The Whirling Waste" (combat-forward: a Wizard-weak skirmish) ─
const WHIRLING_WASTE: AdventureScript = {
  id: 'whirling-waste',
  name: 'The Whirling Waste',
  regionId: 'dusty-dunes',
  start: 'waste-rim',
  scenes: {
    'waste-rim': {
      id: 'waste-rim',
      stage: 1,
      text: 'A flat pan of cracked earth runs to the horizon, scoured by a wind that never quite stops. Dust-devils stalk across it in twos and threes, and out in the middle of it all stands a lone dead tree, hung with something that catches the light.',
      choices: [
        {
          id: 'read-wind',
          text: 'Read the wind before you commit to crossing',
          requires: { trait: 'o', min: 60 },
          check: { stat: 'int', dc: 12 },
          success: {
            text: 'You watch the devils long enough to learn their habits, and pick a clean line between them.',
            items: [{ id: 'clay', qty: 2 }],
            next: 'waste-tree',
          },
          failure: {
            text: 'The wind keeps its own counsel. You set off into it on a guess.',
            next: 'waste-tree',
          },
        },
        {
          id: 'gather-pan',
          text: 'Work the cracked pan for what it is worth',
          check: { stat: 'str', skill: 'athletics', dc: 11 },
          success: {
            text: 'You lever up slabs of good clay and a surprising seam of ore.',
            items: [
              { id: 'clay', qty: 2 },
              { id: 'ore', qty: 1 },
            ],
            next: 'waste-tree',
          },
          failure: {
            text: 'Hard, hot work for one honest lump of clay.',
            items: [{ id: 'clay', qty: 1 }],
            fatigue: 1,
            next: 'waste-tree',
          },
        },
      ],
    },
    'waste-tree': {
      id: 'waste-tree',
      stage: 2,
      text: 'The dead tree is closer now, and the thing hung in its branches is unmistakable: a knot of old harness-brass, desert-polished to a shine. Between you and it, one of the dust-devils has stopped wandering. It has noticed you — and it is not made of dust at all, but of a vast, bone-dry tumble of thistle, spinning where it stands.',
      choices: [
        {
          id: 'leave-brass',
          text: 'Leave the brass to the wind and bank what you have',
          success: {
            text: 'Not worth the bother. You pocket your clay and angle away for home.',
            next: 'end',
          },
        },
        {
          id: 'go-for-brass',
          text: 'Make for the tree and the brass',
          success: {
            text: 'You break for the tree. The thistle-whirl shrieks up to full height and bowls straight at you, prickling and gleeful.',
            next: 'waste-whirl',
          },
        },
      ],
    },
    'waste-whirl': {
      id: 'waste-whirl',
      stage: 3,
      text: 'The thistle-whirl careens between you and the tree, all spin and spite and not one single thought, daring you to get past it.',
      choices: [
        {
          id: 'sidestep',
          text: 'Time it and slip past while it over-spins',
          requires: { trait: 'c', min: 55 },
          check: { stat: 'dex', skill: 'athletics', dc: 14 },
          success: {
            text: 'You wait for it to commit, then dance through the gap and pluck the brass clean off the tree.',
            items: [
              { id: 'rare-gem', qty: 1 },
              { id: 'ore', qty: 1 },
            ],
            cubes: 18,
            next: 'end',
          },
          failure: {
            text: 'You mistime it, get a faceful of thistle for your trouble, and back off to regroup.',
            fatigue: 1,
            next: 'end',
          },
        },
        {
          id: 'face-whirl',
          text: 'Stop dodging and deal with it head-on',
          success: {
            text: 'Enough. You plant your hooves and square up to the spinning thing.',
            battle: 'thistle-whirl',
            next: 'end',
          },
        },
      ],
    },
  },
};

// ── Dusty Dunes — "The Glasslands" (cozy, no combat) ───────────────────────
const GLASSLANDS: AdventureScript = {
  id: 'glasslands',
  name: 'The Glasslands',
  regionId: 'dusty-dunes',
  start: 'glass-flat',
  scenes: {
    'glass-flat': {
      id: 'glass-flat',
      stage: 1,
      text: 'Where some ancient heat once kissed the desert, the sand has run to glass: a shining flat of it, green and gold and treacherous, ringing faintly underhoof like a struck bell. Selenite blades grow up out of it in clusters, clear as ice and twice as sharp.',
      choices: [
        {
          id: 'harvest-selenite',
          text: 'Harvest the selenite blades',
          check: { stat: 'dex', skill: 'foraging', dc: 12 },
          success: {
            text: 'Careful teeth, careful hooves — you snap free a double handful of flawless crystal.',
            items: [
              { id: 'rare-gem', qty: 1 },
              { id: 'clay', qty: 1 },
            ],
            next: 'glass-deep',
          },
          failure: {
            text: 'It shatters more than it yields. You salvage a few cloudy shards.',
            items: [{ id: 'clay', qty: 1 }],
            next: 'glass-deep',
          },
        },
        {
          id: 'map-safe',
          text: 'Map the safe footing before anyone gets cut',
          requires: { trait: 'c', min: 60 },
          check: { stat: 'int', dc: 11 },
          success: {
            text: 'You read the glass like a frozen pond and chart a path that spares every fetlock. The party crosses easy and gleans as it goes.',
            items: [
              { id: 'rare-gem', qty: 1 },
              { id: 'ore', qty: 1 },
            ],
            next: 'glass-deep',
          },
          failure: {
            text: 'The pattern will not resolve. You pick across on instinct and gather what is in reach.',
            items: [{ id: 'clay', qty: 1 }],
            next: 'glass-deep',
          },
        },
      ],
    },
    'glass-deep': {
      id: 'glass-deep',
      stage: 2,
      text: 'Deeper in, the glass darkens and dips into a bowl, and at the bottom of the bowl something is frozen mid-shine — a great bubble of the old glass, and trapped inside it, impossibly, a single perfect desert flower.',
      choices: [
        {
          id: 'bank-glass',
          text: 'Leave the bowl be and head home with good crystal',
          success: {
            text: 'Some things are prettier left where they are. You climb out of the bowl, pockets singing.',
            next: 'end',
          },
        },
        {
          id: 'free-flower',
          text: 'Climb down to free the flower in the glass',
          success: {
            text: 'You ease down the slope of the bowl toward the trapped bloom.',
            next: 'glass-bloom',
          },
        },
      ],
    },
    'glass-bloom': {
      id: 'glass-bloom',
      stage: 3,
      text: 'Up close the bubble is thin as an eggshell and humming with stored heat. One wrong move shatters it; one right one might lift the whole flower free, glass and all.',
      choices: [
        {
          id: 'ease-free',
          text: 'Ease it loose together, slow and sure',
          check: { stat: 'wis', skill: 'foraging', dc: 15, harmony: true },
          success: {
            text: 'Breath held, the whole party moving as one — the bubble lifts free whole, the flower caught forever mid-bloom inside it. A wonder, and worth a small fortune.',
            items: [{ id: 'rare-gem', qty: 2 }],
            cubes: 28,
            next: 'end',
          },
          failure: {
            text: 'It chimes once, beautifully, and falls to glittering dust. You carry home the memory and a few bright shards.',
            items: [{ id: 'clay', qty: 1 }],
            fatigue: 1,
            next: 'end',
          },
        },
        {
          id: 'leave-bloom',
          text: 'Think better of it and back away',
          success: {
            text: 'You leave it shining in its bowl for the next wanderer to gasp at. Home you go.',
            next: 'end',
          },
        },
      ],
    },
  },
};

// ── Weird Woods — "The Lantern-Fly Hunt" (cozy, no combat) ─────────────────
const LANTERN_FLY_HUNT: AdventureScript = {
  id: 'lantern-fly-hunt',
  name: 'The Lantern-Fly Hunt',
  regionId: 'weird-woods',
  start: 'lantern-eaves',
  scenes: {
    'lantern-eaves': {
      id: 'lantern-eaves',
      stage: 1,
      text: 'Dusk in the Weird Woods, and the lantern-flies are rising: fat, slow, gloriously luminous bugs that drift up out of the leaf-litter by the hundred, each glowing a different impossible colour. Bottle a few and they will light a stable for a month. Catch them wrong and they simply pop, with a small offended flash.',
      choices: [
        {
          id: 'net-flies',
          text: 'Net the drifting flies',
          check: { stat: 'dex', skill: 'foraging', dc: 12 },
          success: {
            text: 'Slow hooves, slower breath — you cup a dozen of the gentle glowing things without a single pop.',
            items: [
              { id: 'timber', qty: 1 },
              { id: 'plant-fiber', qty: 1 },
            ],
            cubes: 8,
            next: 'lantern-hollow',
          },
          failure: {
            text: 'Pop. Pop-pop. Pop. The grove fills with tiny indignant flashes; you salvage a couple of the slower ones.',
            cubes: 3,
            next: 'lantern-hollow',
          },
        },
        {
          id: 'follow-colour',
          text: 'Follow the strangest colour deeper in',
          requires: { trait: 'o', min: 60 },
          check: { stat: 'wis', dc: 12 },
          success: {
            text: 'You chase a fly that glows a colour you have no name for, and it leads you to a whole hidden bloom of its kin.',
            items: [{ id: 'timber', qty: 2 }],
            cubes: 12,
            next: 'lantern-hollow',
          },
          failure: {
            text: 'The colour leads you in a large, undignified circle and winks out. Back where you started, then.',
            next: 'lantern-hollow',
          },
        },
      ],
    },
    'lantern-hollow': {
      id: 'lantern-hollow',
      stage: 2,
      text: 'The flies are thickest over a mossy hollow where an old well has half-collapsed. Down in the dark of it, something glows steadier and brighter than any lantern-fly — a light that does not drift, but waits.',
      choices: [
        {
          id: 'bank-flies',
          text: 'Be content with your jar of stars and head home',
          success: {
            text: "A good evening's work, glowing softly all the way home. No need to go poking down strange wells.",
            next: 'end',
          },
        },
        {
          id: 'peer-well',
          text: 'Peer down into the well',
          success: {
            text: 'You lean over the broken rim and look down into the patient glow.',
            next: 'lantern-well',
          },
        },
      ],
    },
    'lantern-well': {
      id: 'lantern-well',
      stage: 3,
      text: 'It is the queen of them: one vast, ancient lantern-fly — the size of an actual lantern — glowing like a trapped moon at the bottom of the dry well, too big and too grand to rise on its own. It regards you with what might be hope.',
      choices: [
        {
          id: 'lift-queen',
          text: 'Work together to lift the old queen out',
          requires: { trait: 'a', min: 55 },
          check: { stat: 'str', skill: 'athletics', dc: 14, harmony: true },
          success: {
            text: 'Gently, gently, the whole party hauling as one, you lift the great soft creature into the air — and it goes up like a lifted lamp, raining glowing dust over you in thanks. You will be finding fortune in your manes for weeks.',
            items: [
              { id: 'rare-gem', qty: 1 },
              { id: 'timber', qty: 1 },
            ],
            cubes: 30,
            next: 'end',
          },
          failure: {
            text: 'It is heavier than it looks and the old well is crumbling; you let it settle back with an apologetic glow and climb out empty-hooved but fond.',
            fatigue: 1,
            next: 'end',
          },
        },
        {
          id: 'leave-queen',
          text: 'Leave the old queen to her well',
          success: {
            text: 'Some lights are not yours to carry. You tip her a respectful nod and head home aglow.',
            next: 'end',
          },
        },
      ],
    },
  },
};

// ── Weird Woods — "The Toll-Keeper" (cozy, with an optional Rogue-weak fight) ─
const TOLL_KEEPER: AdventureScript = {
  id: 'toll-keeper',
  name: 'The Toll-Keeper',
  regionId: 'weird-woods',
  start: 'toll-path',
  scenes: {
    'toll-path': {
      id: 'toll-path',
      stage: 1,
      text: 'The good mushrooming is all on the far side of the Snigglewick Brook, and the only dry crossing is the old mossy footbridge — which, the woods being the woods, has a keeper. You can already hear it: a slow, ponderous voice rehearsing what it clearly considers some very good riddles.',
      choices: [
        {
          id: 'forage-near',
          text: 'Forage this side of the brook first',
          check: { stat: 'wis', skill: 'foraging', dc: 11 },
          success: {
            text: 'The near bank is no slouch: you fill up on fat woodland mushrooms and good dry timber.',
            items: [
              { id: 'timber', qty: 2 },
              { id: 'plant-fiber', qty: 1 },
            ],
            next: 'toll-bridge',
          },
          failure: {
            text: 'Slim pickings on the trodden side. A little timber, and on you go.',
            items: [{ id: 'timber', qty: 1 }],
            next: 'toll-bridge',
          },
        },
        {
          id: 'stroll-up',
          text: 'Just stroll up to the bridge and see what is what',
          success: {
            text: 'You amble down to the brook to meet the famous keeper.',
            next: 'toll-bridge',
          },
        },
      ],
    },
    'toll-bridge': {
      id: 'toll-bridge',
      stage: 2,
      text: '"NONE SHALL PASS," announces the Toll-Keeper — a mossback tortoise the size of a wheelbarrow, settled dead-centre of the footbridge it entirely fills — "WHO CANNOT ANSWER ME THIS." It has clearly been waiting all year. The mushrooming beyond is, frankly, spectacular.',
      choices: [
        {
          id: 'answer-riddle',
          text: 'Play along and answer its riddle',
          requires: { trait: 'o', min: 55 },
          check: { stat: 'int', dc: 13 },
          success: {
            text: 'The riddle is terrible and the answer is "a turnip," obviously. The tortoise is so thrilled someone finally played along that it waves you across and tips you a hoard it has been sitting on for a decade.',
            items: [
              { id: 'rare-gem', qty: 1 },
              { id: 'timber', qty: 2 },
            ],
            cubes: 20,
            next: 'end',
          },
          failure: {
            text: 'You guess "a turnip." It was not a turnip. The tortoise is delighted to explain, at length; you settle in to wait it out before crossing.',
            items: [{ id: 'timber', qty: 1 }],
            next: 'end',
          },
        },
        {
          id: 'turn-around',
          text: 'Decide the near bank was plenty and turn around',
          success: {
            text: 'You leave the keeper to its riddles. The mushrooms can keep; you have a good load already.',
            next: 'end',
          },
        },
        {
          id: 'rush-bridge',
          text: 'Lose patience and simply barge across',
          success: {
            text: 'You have heard enough riddles for one lifetime, and make a break for the far bank — and the tortoise, scandalised, heaves up to block you.',
            battle: 'mossback-tortoise',
            next: 'end',
          },
        },
      ],
    },
  },
};

// ── Green Grass — "The Lost Lamb" (a deep branching study, §9.3) ───────────
// The showcase for real branching + cross-scene consequence, all on the scene-tree engine via the
// herb-hunt feed-forward mechanism (route to a consequence-specific variant; carry materials in loot;
// carry the soft penalty as fatigue). NO combat by design. The echoes:
//   • calm-arrival vs tense-arrival → `creek-calm` vs `creek-tense` (the Befriend DC differs: 11 vs 14).
//   • a Winded horse (climb-failure) → `hollow` vs `hollow-winded` (Cut/Find DCs +2).
//   • the lamb's state + what you carried → which `finale-*` you land on (flavor + reward), and the
//     marsh-sage found in the bramble rides home in the loot.
// The opening fork does NOT funnel back: creek (Swim/Befriend) and hollow (Force/Knowledge) are
// genuinely different middles. The Openness-gated third route (the Fence-Line) is the replay hook.
const LOST_LAMB: AdventureScript = {
  id: 'lost-lamb',
  name: 'The Lost Lamb',
  regionId: 'green-grass',
  start: 'lamb-bleating',
  scenes: {
    'lamb-bleating': {
      id: 'lamb-bleating',
      stage: 1,
      text: "Somewhere in the tall grass, something small is crying. Not a horse — higher, sillier, more put-upon. A lamb, by the sound of it, separated from its flock and extremely unhappy about the arrangement. The bleating bounces off the hills; hard to tell if it's near the creek to the west or up in the bramble-hollow to the east.",
      choices: [
        {
          id: 'head-creek',
          text: 'Listen hard and head west, for the creek',
          check: { stat: 'wis', skill: 'foraging', dc: 10, harmony: true },
          success: {
            text: 'You pin the sound to the creek and pad down unhurried, in no rush to spook a thing already having the worst day of its short life.',
            next: 'creek-calm',
          },
          failure: {
            text: "You crash west on a hunch — right creek, wrong approach. The bleating spikes to a shriek; whatever's down there now thinks you're the second-worst thing to happen today.",
            next: 'creek-tense',
          },
        },
        {
          id: 'climb-hollow',
          text: 'Scramble east, up to the bramble-hollow',
          check: { stat: 'str', skill: 'athletics', dc: 11, harmony: true },
          success: {
            text: 'You haul up the slope, sure-hoofed, and crest into the hollow with breath to spare.',
            next: 'hollow',
          },
          failure: {
            text: 'The slope is loose and mean; someone takes a scraped knee on the way up and crests the rise winded, favouring a leg.',
            fatigue: 1,
            next: 'hollow-winded',
          },
        },
        {
          id: 'pip-knows',
          text: '“Pip swears it knows this bleat.”',
          requires: { trait: 'o', min: 60 },
          success: {
            text: 'Your most curious one plants its hooves and refuses to go west OR east — insists, with the certainty of the genuinely odd, that this is neither creek nor hollow but the old fence-line. Against your better judgement, you follow it.',
            next: 'fence',
          },
        },
      ],
    },

    // ROUTE A — the Creek. Two arrival variants; only the Befriend DC differs (the calm/tense echo).
    'creek-calm': {
      id: 'creek-calm',
      stage: 2,
      text: 'The lamb is on the wrong side of the creek, of course — stranded on a mud spit, ankle-deep and furious, as the water mutters past. It eyes you with the deep suspicion of a creature that has decided all of this is your fault. But you came in quiet, and it has not quite written you off.',
      choices: [
        {
          id: 'cross-carry',
          text: 'Wade across and carry it back',
          check: { stat: 'str', skill: 'athletics', dc: 12 },
          success: {
            text: 'One steady push through the cold and you scoop the indignant thing up dry, holding it well clear of the splashing.',
            next: 'finale-clean',
          },
          failure: {
            text: 'The current has opinions. You get the lamb — you always get the lamb — but the whole party comes out the far side soaked to the belly and deeply grumpy.',
            fatigue: 1,
            next: 'finale-soggy',
          },
        },
        {
          id: 'coax-cross',
          text: 'Coax it to cross to you on its own',
          check: { stat: 'cha', skill: 'performance', dc: 11, harmony: true },
          success: {
            text: 'Soft and low and endlessly patient, your kindest one talks the lamb down off the spit until it picks its own way across and presses, trembling, into a warm flank. It has decided you are People now.',
            next: 'finale-bonded',
          },
          failure: {
            text: 'It will not be talked into anything. In the end you wade out and carry it — and it makes very sure you are good and soaked for doubting it.',
            fatigue: 1,
            next: 'finale-soggy',
          },
        },
        {
          id: 'bank-creek',
          text: 'Decide it is beyond you, and head home',
          success: {
            text: 'Some rescues are not yours to make. You leave the lamb to luck and the ewe to find it, and amble home with a clear conscience and a modest day.',
            next: 'finale-bank',
          },
        },
      ],
    },
    'creek-tense': {
      id: 'creek-tense',
      stage: 2,
      text: 'The lamb is on the wrong side of the creek, of course — stranded on a mud spit, ankle-deep and now genuinely beside itself after your noisy arrival. It eyes you with the deep suspicion of a creature that has decided all of this is, specifically and personally, your fault.',
      choices: [
        {
          id: 'cross-carry',
          text: 'Wade across and carry it back',
          check: { stat: 'str', skill: 'athletics', dc: 12 },
          success: {
            text: 'One steady push through the cold and you scoop the indignant thing up dry, holding it well clear of the splashing.',
            next: 'finale-clean',
          },
          failure: {
            text: 'The current has opinions. You get the lamb — you always get the lamb — but the whole party comes out the far side soaked to the belly and deeply grumpy.',
            fatigue: 1,
            next: 'finale-soggy',
          },
        },
        {
          id: 'coax-cross',
          text: 'Coax it to cross to you on its own',
          check: { stat: 'cha', skill: 'performance', dc: 14, harmony: true },
          success: {
            text: 'It takes everything your kindest one has — the lamb is wound tight as a spring — but slowly, slowly, it uncoils, picks its way across, and leans into a warm flank, forgiving you against its own better judgement.',
            next: 'finale-bonded',
          },
          failure: {
            text: 'Too rattled to be reasoned with. You wade out and carry it the hard way, and come back wet through for your trouble.',
            fatigue: 1,
            next: 'finale-soggy',
          },
        },
        {
          id: 'bank-creek',
          text: 'Decide it is beyond you, and head home',
          success: {
            text: 'Some rescues are not yours to make. You leave the lamb to luck and the ewe to find it, and amble home with a clear conscience and a modest day.',
            next: 'finale-bank',
          },
        },
      ],
    },

    // ROUTE B — the Bramble-Hollow. Two variants; the Winded one rolls Cut/Find at +2 (the echo).
    hollow: {
      id: 'hollow',
      stage: 2,
      text: "The lamb has wedged itself into a hollow ringed with bramble, the way panicking small animals do — choosing the one spot that makes everyone's life worse. The thorns are old and mean. The lamb has stopped crying, which is somehow more alarming.",
      choices: [
        {
          id: 'cut-path',
          text: 'Shoulder a path straight through the thorns',
          check: { stat: 'str', skill: 'athletics', dc: 12 },
          success: {
            text: 'You break the brambles down by main force, reach in, and lift the silent little thing free. It blinks, remembers how to be outraged, and resumes crying at once.',
            next: 'finale-clean',
          },
          failure: {
            text: 'The thorns give as good as they get. You free the lamb in the end, but a horse comes away rattled and everyone comes away scratched and sorry.',
            fatigue: 1,
            next: 'finale-soggy',
          },
        },
        {
          id: 'find-gap',
          text: 'Read the bramble for the gap a clever creature would use',
          check: { stat: 'int', skill: 'foraging', dc: 13 },
          success: {
            text: 'You trace the run a fox would take and slip in clean, lifting the lamb out without a single scratch — and there, tucked deep where the thorns kept it safe, a fat clutch of marsh-sage for the taking.',
            items: [{ id: 'marsh-sage', qty: 2 }],
            next: 'finale-clean',
          },
          failure: {
            text: 'The clever way will not resolve, so you give up and shove through the hard way — lamb out, but the brambles take their toll on the way.',
            fatigue: 1,
            next: 'finale-soggy',
          },
        },
        {
          id: 'bank-hollow',
          text: 'Decide it is beyond you, and head home',
          success: {
            text: 'Some rescues are not yours to make. You leave the lamb to luck and the ewe to find it, and amble home with a clear conscience and a modest day.',
            next: 'finale-bank',
          },
        },
      ],
    },
    'hollow-winded': {
      id: 'hollow-winded',
      stage: 2,
      text: 'The lamb has wedged itself into a hollow ringed with old, mean bramble — and it has gone quiet, which is the alarming kind of quiet. Worse: your scraped-up one is still favouring that leg, breathing hard, not much use for the heavy work ahead.',
      choices: [
        {
          id: 'cut-path',
          text: 'Shoulder a path straight through the thorns',
          check: { stat: 'str', skill: 'athletics', dc: 14 },
          success: {
            text: 'Down a hand, you break the brambles the hard way and haul the silent little thing free. It blinks, remembers how to be outraged, and resumes crying at once.',
            next: 'finale-clean',
          },
          failure: {
            text: 'With your winded one labouring, the thorns win the exchange. You free the lamb, but everyone comes away rattled, scratched, and sorry.',
            fatigue: 1,
            next: 'finale-soggy',
          },
        },
        {
          id: 'find-gap',
          text: 'Read the bramble for the gap a clever creature would use',
          check: { stat: 'int', skill: 'foraging', dc: 15 },
          success: {
            text: 'Short-handed but sharp-eyed, you trace the run a fox would take and slip in clean — lamb out unscratched, and a fat clutch of marsh-sage tucked deep where the thorns kept it safe.',
            items: [{ id: 'marsh-sage', qty: 2 }],
            next: 'finale-clean',
          },
          failure: {
            text: 'Tired eyes miss the gap, so you shove through the hard way — lamb out, but the brambles take their toll on the way.',
            fatigue: 1,
            next: 'finale-soggy',
          },
        },
        {
          id: 'bank-hollow',
          text: 'Decide it is beyond you, and head home',
          success: {
            text: 'Some rescues are not yours to make. You leave the lamb to luck and the ewe to find it, and amble home with a clear conscience and a modest day.',
            next: 'finale-bank',
          },
        },
      ],
    },

    // ROUTE C — the Fence-Line (secret, reached only via the Openness gate above).
    fence: {
      id: 'fence',
      stage: 2,
      text: "Pip was right — annoyingly. The lamb's flock got out through a rotted gate in an old fence nobody has mended in years, and the lamb simply could not find its way back through. The whole flock is here, milling about, vaguely embarrassed, the lamb among them.",
      choices: [
        {
          id: 'mend-gate',
          text: 'Mend the gate and shepherd the whole flock home',
          check: { stat: 'dex', skill: 'smithing', dc: 13 },
          success: {
            text: 'Patient hooves and clever knots: you wire the old gate true, then sweep the entire silly flock back through it where they belong. Not one lamb but a dozen, delivered.',
            next: 'finale-flock',
          },
          failure: {
            text: 'The gate defeats you — too far gone to mend in a morning. So you do the next best thing: collar the lost lamb itself and leave the rest to drift home on their own time.',
            next: 'finale-clean',
          },
        },
        {
          id: 'grab-lamb',
          text: 'Just collect the lamb and go',
          success: {
            text: 'No sense fixing a fence that is not yours. You pluck the one lamb that wandered, leave the flock to its milling, and turn for home.',
            next: 'finale-clean',
          },
        },
      ],
    },

    // FINALE — all routes converge here, but which finale you reach (and so the flavor + reward) is
    // decided entirely by the flags you carried in. Each is a terminal "head home" beat.
    'finale-bonded': {
      id: 'finale-bonded',
      stage: 3,
      text: 'You bring the lamb back over the last rise, where a frankly hysterical ewe is waiting. The reunion is loud, undignified, and brief — the lamb, reunited, immediately pretends it was never lost at all. Then it turns, trots back, and headbutts your soothing horse square in the knee: the highest honour a sheep can bestow.',
      choices: [
        {
          id: 'home',
          text: 'Head home, honoured',
          success: {
            text: 'You walk home a little taller, with a story and the warm, ridiculous glow of having been chosen by a sheep.',
            items: [{ id: 'plant-fiber', qty: 2 }],
            cubes: 35,
            next: 'end',
          },
        },
      ],
    },
    'finale-clean': {
      id: 'finale-clean',
      stage: 3,
      text: 'You bring the lamb back over the last rise, where a frankly hysterical ewe is waiting. The reunion is loud, undignified, and brief — the lamb, reunited, immediately pretends it was never lost at all.',
      choices: [
        {
          id: 'home',
          text: 'Head home',
          success: {
            text: 'A good turn done and a clean job of it. You amble home in the long gold light, well pleased.',
            items: [{ id: 'plant-fiber', qty: 2 }],
            cubes: 25,
            next: 'end',
          },
        },
      ],
    },
    'finale-soggy': {
      id: 'finale-soggy',
      stage: 3,
      text: 'You bring the lamb back over the last rise, where a frankly hysterical ewe is waiting. The reunion is loud, undignified, and brief. You all look like you lost a fight with the weather; the ewe does not seem to care in the slightest.',
      choices: [
        {
          id: 'home',
          text: 'Limp home, soggy but victorious',
          success: {
            text: 'Wet, scratched, and thoroughly bedraggled — but the lamb is home, and that is the whole of the job. You will dry out. You always do.',
            items: [{ id: 'plant-fiber', qty: 2 }],
            cubes: 25,
            next: 'end',
          },
        },
      ],
    },
    'finale-flock': {
      id: 'finale-flock',
      stage: 3,
      text: 'You bring not one lamb but an entire flock back over the last rise, where a frankly hysterical ewe — and a frankly astonished shepherd — are waiting. An entire flock, reunited, by you. The shepherd will tell this story wrong for years.',
      choices: [
        {
          id: 'home',
          text: 'Head home, a legend (inaccurately)',
          success: {
            text: 'The shepherd presses a proper reward on you and shakes every hoof twice. You head home rich in coin and richer in a story that will only grow in the telling.',
            items: [
              { id: 'plant-fiber', qty: 3 },
              { id: 'marsh-sage', qty: 1 },
            ],
            cubes: 50,
            next: 'end',
          },
        },
      ],
    },
    'finale-bank': {
      id: 'finale-bank',
      stage: 3,
      text: 'You head home without the lamb, but not empty-handed — there is always something to forage on a slow walk back, and no shame in knowing a job was beyond the day.',
      choices: [
        {
          id: 'home',
          text: 'Amble home',
          success: {
            text: 'A modest day, honestly spent. Somewhere behind you a ewe will sort out her own affairs; she usually does.',
            items: [{ id: 'plant-fiber', qty: 1 }],
            cubes: 8,
            next: 'end',
          },
        },
      ],
    },
  },
};

export const ADVENTURE_SCRIPTS: AdventureScript[] = [
  // Green Grass
  SUNNY_HOLLOW,
  HERB_HUNT,
  BRAMBLE_GATE,
  FROGMARCH_POND,
  LOST_LAMB,
  HOLLOW_KEEPER,
  // Dusty Dunes
  BLEACHING_WASH,
  WHIRLING_WASTE,
  GLASSLANDS,
  SANDSTONE_SENTINEL,
  // Weird Woods
  LANTERN_FLY_HUNT,
  TOLL_KEEPER,
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
