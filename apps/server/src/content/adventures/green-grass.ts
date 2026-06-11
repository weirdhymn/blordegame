import type { AdventureScript } from './types.js';

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
  keeper: true,
  start: 'keeper-threshold',
  scenes: {
    'keeper-threshold': {
      id: 'keeper-threshold',
      stage: 1,
      text: 'You came on purpose this time, down through the green dark to the still heart of the hollow — and there it is: the Hollow-Keeper, the great mossy stag of the oldest stories, fast asleep. Lichen has grown up its flanks. A wren is nesting in the crown of its antlers. It has plainly been waiting a hundred quiet years for someone to come and challenge it, and somewhere in there it has stopped expecting anyone. First, then: you will have to wake it.',
      choices: [
        {
          id: 'announce-grand',
          text: 'Announce yourself — loud, grand, and frankly a little rude',
          check: { stat: 'cha', skill: 'performance', dc: 12, harmony: true },
          success: {
            text: 'You plant your hooves and bellow a challenge fit for a ballad, with several pointed remarks about moss and idleness. The Keeper’s ear swivels. Then, slowly, delightedly, one ancient eye opens.',
            next: 'keeper-roused',
          },
          failure: {
            text: 'Your grand speech cracks on the high note and rolls off into the green, faintly ridiculous — but the Keeper has heard worse, and stirs anyway, curious who is making such a racket.',
            next: 'keeper-roused',
          },
        },
        {
          id: 'prod-it',
          text: 'Skip the speeches and simply shove the old monument awake',
          check: { stat: 'str', skill: 'athletics', dc: 12 },
          success: {
            text: 'You set a shoulder to its mossy flank and HEAVE. The wren departs, swearing. The Keeper comes awake all at once, affronted and enormous and — unmistakably — pleased.',
            next: 'keeper-roused',
          },
          failure: {
            text: 'It is a great deal heavier and mossier than it looks, and your shove mostly moves you. But the sheer indignity of being leaned on does the trick: it rouses, grumbling, to see who dares.',
            next: 'keeper-roused',
          },
        },
        {
          id: 'speak-name',
          text: 'Speak its forgotten name into the quiet',
          requires: { trait: 'o', min: 55 },
          success: {
            text: 'Your strangest one knows the old word for it — the true one, from before the herds went quiet about this place — and speaks it once, gently. The whole hollow inhales. The Keeper opens both eyes at once, and there is something in them that has been gone a very long time: recognition.',
            next: 'keeper-roused',
          },
        },
      ],
    },
    'keeper-roused': {
      id: 'keeper-roused',
      stage: 2,
      text: 'The Hollow-Keeper wakes the way a hill might wake — slowly, then all at once. Lichen sloughs off it in green sheets as it unfolds to its full and frankly unreasonable height. It regards you with an eye like a deep clear pond and asks, in a voice you feel in your teeth more than hear, whether you have come down here to WASTE the little waking it has left — or to give it, at long last, the fight it has spent a century without.',
      choices: [
        {
          id: 'declare',
          text: 'Tell it you came for the fight — and mean it',
          success: {
            text: 'You tell it the truth, and the truth is yes. Something old and glad kindles in the great stag, and the clearing draws its breath as those antlers come down to meet you.',
            battle: 'gg-hollow-keeper',
            next: 'end',
          },
        },
        {
          id: 'bow-out',
          text: 'Bow, leave it the dignity of having been asked, and go',
          success: {
            text: 'You bow low and tell it, honestly, that today is not the day. The Keeper takes this better than you feared — being woken and asked was most of what it wanted — and nudges a season’s windfall your way before settling back into its long green dreaming.',
            items: [
              { id: 'plant-fiber', qty: 2 },
              { id: 'timber', qty: 1 },
            ],
            cubes: 8,
            next: 'end',
          },
        },
      ],
    },
  },
};

// ── Green Grass — "The Windfall" (a SHORT, cozy errand: no fork, no winding deep, no fight — just a
//    quick gather against the failing light, in and out before dark. The deliberately-brief shape.) ─
const WINDFALL: AdventureScript = {
  id: 'windfall',
  name: 'The Windfall',
  regionId: 'green-grass',
  start: 'windfall-slope',
  scenes: {
    'windfall-slope': {
      id: 'windfall-slope',
      stage: 1,
      text: "Last night's wind did half your work for you. An old orchard tumbles down the hillside here, gone wild years ago, and the gale has shaken a whole season of fruit and good deadfall loose across the slope. It is all just lying there in the long grass, smelling of cider and rain — and the light is going fast.",
      choices: [
        {
          id: 'sweep-low',
          text: 'Sweep the long grass quick while you can still see',
          check: { stat: 'dex', skill: 'foraging', dc: 10 },
          success: {
            text: 'Nimble and fast, you comb the slope clean before the dusk does, hooves sure among the windfall.',
            items: [
              { id: 'plant-fiber', qty: 2 },
              { id: 'timber', qty: 1 },
            ],
            next: 'windfall-dusk',
          },
          failure: {
            text: 'Half of it has rolled downhill into the bramble, of course. You salvage a respectable armful and leave the rest to feed the foxes.',
            items: [{ id: 'plant-fiber', qty: 1 }],
            next: 'windfall-dusk',
          },
        },
        {
          id: 'reach-high',
          text: 'Shoulder the old boughs for the good fruit still hanging',
          check: { stat: 'str', skill: 'athletics', dc: 11 },
          success: {
            text: 'You set a shoulder to the trunk and rock it, and a soft drumroll of the very best fruit comes down around your ears.',
            items: [
              { id: 'plant-fiber', qty: 3 },
              { id: 'timber', qty: 1 },
            ],
            next: 'windfall-dusk',
          },
          failure: {
            text: 'The bough is stubborn and the bark is slick with rain. You come away with one good straight branch and a faceful of wet leaves.',
            items: [{ id: 'timber', qty: 1 }],
            next: 'windfall-dusk',
          },
        },
        {
          id: 'pip-cache',
          text: '“Pip has found something. Pip is extremely pleased about it.”',
          requires: { trait: 'o', min: 60 },
          success: {
            text: "Your nosiest one excavates a fox's private hoard from under the roots — the choicest windfall in the orchard, already gathered and sorted and now regrettably yours. The fox will be furious. The fox is not here.",
            items: [
              { id: 'plant-fiber', qty: 2 },
              { id: 'marsh-sage', qty: 1 },
            ],
            next: 'windfall-dusk',
          },
        },
      ],
    },
    'windfall-dusk': {
      id: 'windfall-dusk',
      stage: 2,
      text: 'And just like that the light is gone — the slope blue and cooling, the last of the windfall a guess in the dark. A short day; a good one. There is maybe one more armful in it, if you fancy groping about by smell.',
      choices: [
        {
          id: 'last-armful',
          text: 'Gather one last armful by feel',
          check: { stat: 'con', skill: 'foraging', dc: 11, harmony: true },
          success: {
            text: 'Working nose-first in the dusk, shoulder to warm shoulder, you turn up a last good haul and head home in the dark, thoroughly pleased with yourselves.',
            items: [{ id: 'plant-fiber', qty: 2 }],
            cubes: 8,
            next: 'end',
          },
          failure: {
            text: 'You find a great deal of wet grass and one deeply startled toad. Enough. You head home with the good haul you already have.',
            next: 'end',
          },
        },
        {
          id: 'call-it',
          text: 'Call it a good day and amble home',
          success: {
            text: 'No sense being greedy with a gift. You turn for home under the first stars, baskets full, the orchard already settling back to sleep behind you.',
            cubes: 5,
            next: 'end',
          },
        },
      ],
    },
  },
};

// ── Green Grass — "The Singing Stones" (a MYSTERY: not a gather, not a fight — investigate a strange
//    phenomenon. Three approaches branch to three genuinely different findings.) ─────────────────
const SINGING_STONES: AdventureScript = {
  id: 'singing-stones',
  name: 'The Singing Stones',
  regionId: 'green-grass',
  start: 'stone-ring',
  scenes: {
    'stone-ring': {
      id: 'stone-ring',
      stage: 1,
      text: "The old ring of standing stones has always just stood there, lichened and patient, minding its own business at the meadow's edge. Tonight it is humming — one low, even note you feel in your teeth before you hear it, rising off the stones like heat off a road. It was not doing this yesterday.",
      choices: [
        {
          id: 'listen-close',
          text: 'Press an ear to the cold stone and hunt the source',
          check: { stat: 'wis', skill: 'foraging', dc: 11 },
          success: {
            text: 'The note is not in the stone. It is under it — coming up through the roots of the ring from something buried, patient, and awake.',
            next: 'beneath',
          },
          failure: {
            text: 'The hum is everywhere and nowhere, maddening, and gives up nothing. You step back, ears ringing, none the wiser — but the ground underhoof thrums hardest by the leaning stone.',
            next: 'beneath',
          },
        },
        {
          id: 'sound-it',
          text: 'Hum back, and find the note that answers',
          check: { stat: 'cha', skill: 'performance', dc: 12, harmony: true },
          success: {
            text: 'You match the stones pitch for pitch, and the ring *answers* — the note doubling, warming, and somewhere out in the dark grass something large turns toward the sound and begins, unhurried, to come.',
            next: 'answering',
          },
          failure: {
            text: 'You sing flat. The stones do not care for it; the hum sours, wavers, and as it does a shape out in the grass lifts its head, curious despite your noise.',
            next: 'answering',
          },
        },
        {
          id: 'old-marks',
          text: 'Read the worn carvings for what the ring is FOR',
          requires: { trait: 'c', min: 55 },
          success: {
            text: 'Your careful one traces the carvings the others walk past — a spiral, a seed, a sun — and reads them right: this was never a temple. It is a granary marker. The old folk buried their best seed here and set the stones to remember the spot.',
            next: 'record',
          },
        },
      ],
    },
    beneath: {
      id: 'beneath',
      stage: 2,
      text: 'The leaning stone tilts over a patch of ground that hums like a hive. Something is down there, resonating in its sleep — and whatever it is, the old folk thought it worth a ring of stones to mark.',
      choices: [
        {
          id: 'dig-down',
          text: 'Shoulder the stone aside and dig to the note',
          check: { stat: 'str', skill: 'athletics', dc: 13 },
          success: {
            text: 'You heave the old marker over and dig — and there it is: a fist of raw crystal still ringing faintly, and around it a cache the burying-folk left for luck. The hum fades to a contented murmur, as if glad to be found.',
            items: [
              { id: 'rare-gem', qty: 1 },
              { id: 'clay', qty: 2 },
            ],
            cubes: 18,
            next: 'end',
          },
          failure: {
            text: 'The stone will not be moved by the likes of you tonight. You scrape up what loose treasure the roots have pushed near the surface and leave the rest to its long song.',
            items: [{ id: 'clay', qty: 1 }],
            fatigue: 1,
            next: 'end',
          },
        },
        {
          id: 'let-it-sing',
          text: 'Leave it to its song and simply listen a while',
          success: {
            text: 'Some things are not yours to dig up. You bed down in the ring and let the old note rock you, and in the morning the grass is thick with the marsh-sage that only grows where the ground is glad.',
            items: [{ id: 'marsh-sage', qty: 2 }],
            next: 'end',
          },
        },
      ],
    },
    answering: {
      id: 'answering',
      stage: 2,
      text: 'It steps into the ring on the last of the note — a wild horse, moon-pale and unafraid, drawn miles by a song it has clearly been waiting its whole life to hear. It looks at you as though you are the ones who are lost.',
      choices: [
        {
          id: 'hold-note',
          text: 'Hold the note and let it choose you',
          check: { stat: 'cha', skill: 'performance', dc: 13, harmony: true },
          success: {
            text: 'You hold the chord, gentle and sure, and the wild one walks the rest of the way in and leans its head to your shoulder. Wherever it was going, it has decided it would rather go with you.',
            wild: true,
            next: 'end',
          },
          failure: {
            text: 'The note slips; the spell with it. The wild one tosses its head, unimpressed, and melts back into the dark — but it leaves the ring still ringing, and the resonant sage it bruised underfoot is yours.',
            items: [{ id: 'marsh-sage', qty: 1 }],
            next: 'end',
          },
        },
        {
          id: 'step-back',
          text: 'Step back and let the wild thing be wild',
          success: {
            text: 'You lower your voice and bow it out. The pale horse drinks the song a moment longer, then turns and is gone — and where it stood, the grass has gone to silver seed-heads worth the gathering.',
            items: [
              { id: 'plant-fiber', qty: 2 },
              { id: 'marsh-sage', qty: 1 },
            ],
            next: 'end',
          },
        },
      ],
    },
    record: {
      id: 'record',
      stage: 2,
      text: 'The carvings agree with each other the way only true things do: nine paces from the sun-stone, dig where the hum is sweetest. The ring has kept a granary safe for longer than anyone has been alive to rob it.',
      choices: [
        {
          id: 'read-true',
          text: 'Pace it out and lift the old seed-cache',
          check: { stat: 'wis', skill: 'foraging', dc: 12 },
          success: {
            text: 'Nine paces, and your hooves find the soft spot. Up comes a sealed crock of heirloom seed and the burying-folk’s tithe beside it — dry, whole, and astonishing after all these years.',
            items: [
              { id: 'plant-fiber', qty: 3 },
              { id: 'marsh-sage', qty: 1 },
            ],
            cubes: 16,
            next: 'end',
          },
          failure: {
            text: 'You miscount in the dark and dig three good holes in entirely the wrong places. The ring, you feel, is laughing at you. You pocket a handful of spilled seed and call it square.',
            items: [{ id: 'plant-fiber', qty: 1 }],
            next: 'end',
          },
        },
        {
          id: 'mark-leave',
          text: 'Note the spot, take only your share, and leave the rest marked',
          success: {
            text: 'You take a careful tithe and re-set the sun-stone for the next hungry year — old courtesy, kept. The ring hums its single satisfied note behind you all the way home.',
            items: [{ id: 'plant-fiber', qty: 2 }],
            cubes: 10,
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

/** Green Grass scripts, in the canonical ADVENTURE_SCRIPTS order (the barrel concatenates). */
export const GREEN_GRASS_SCRIPTS: AdventureScript[] = [
  SUNNY_HOLLOW,
  HERB_HUNT,
  WINDFALL,
  SINGING_STONES,
  FROGMARCH_POND,
  LOST_LAMB,
  HOLLOW_KEEPER,
];
