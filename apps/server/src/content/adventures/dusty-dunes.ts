import type { AdventureScript } from './types.js';

// ── Dusty Dunes — "The Salt Pan" (a SHORT, hot errand: be quick, beat the noon glare, no fork, no
//    fight — the desert's version of the deliberately-brief shape) ───────────────────────────────
const SALT_PAN: AdventureScript = {
  id: 'salt-pan',
  name: 'The Salt Pan',
  regionId: 'dusty-dunes',
  start: 'pan-dawn',
  scenes: {
    'pan-dawn': {
      id: 'pan-dawn',
      stage: 1,
      text: 'At dawn the salt pan is a white sheet to the horizon, cool and crusted and quiet, every cracked plate of it edged with last night’s frost. By noon it will be a furnace and a mirage and no use to anyone. So: be quick.',
      choices: [
        {
          id: 'scrape-crust',
          text: 'Scrape and lever the crust while it is still cool',
          check: { stat: 'str', skill: 'athletics', dc: 10 },
          success: {
            text: 'You work fast in the frost-cool, prising up clean slabs of sun-dried clay and a crust of good salt besides.',
            items: [
              { id: 'clay', qty: 3 },
              { id: 'ore', qty: 1 },
            ],
            next: 'pan-noon',
          },
          failure: {
            text: 'The crust is stuck fast to the morning chill; you crack loose a respectable load and a sweat for it.',
            items: [{ id: 'clay', qty: 1 }],
            next: 'pan-noon',
          },
        },
        {
          id: 'read-pan',
          text: 'Read the pan for where the good seams hide',
          check: { stat: 'wis', skill: 'foraging', dc: 12 },
          success: {
            text: 'You read the salt the way a fisher reads water and walk straight to the rich seam the old floods buried — clean ore, no wasted digging.',
            items: [
              { id: 'ore', qty: 2 },
              { id: 'clay', qty: 1 },
            ],
            next: 'pan-noon',
          },
          failure: {
            text: 'The pan keeps its secrets behind the glare. You dig honestly and come up with an honest, ordinary load.',
            items: [{ id: 'clay', qty: 1 }],
            next: 'pan-noon',
          },
        },
        {
          id: 'pip-mirage',
          text: '“Pip is walking INTO the shimmer. Pip, no — ”',
          requires: { trait: 'o', min: 60 },
          success: {
            text: 'Your strangest one strolls calmly into the rising mirage and out the other side, dragging a wind-buried trade-crate the heat-haze had been politely hiding from everyone sensible.',
            items: [
              { id: 'ore', qty: 1 },
              { id: 'clay', qty: 2 },
            ],
            cubes: 12,
            next: 'pan-noon',
          },
        },
      ],
    },
    'pan-noon': {
      id: 'pan-noon',
      stage: 2,
      text: 'The frost is gone, the white going blinding, the far edge of the pan already lifting and rippling into mirage. The heat is minutes away from unbearable. There is maybe one good seam left if you are fast and you are willing to bake for it.',
      choices: [
        {
          id: 'one-more',
          text: 'One more seam before the heat lands',
          check: { stat: 'con', skill: 'athletics', dc: 12, harmony: true },
          success: {
            text: 'You crack the last seam shoulder to shoulder and are off the pan before the worst of the day, baskets heavy and skins barely scorched.',
            items: [{ id: 'ore', qty: 2 }],
            cubes: 10,
            next: 'end',
          },
          failure: {
            text: 'The heat wins the race. You retreat off the white with what you have and your eyebrows mostly intact. Enough is enough.',
            fatigue: 1,
            next: 'end',
          },
        },
        {
          id: 'beat-heat',
          text: 'Quit while you are ahead and walk off the white',
          success: {
            text: 'No sense cooking for a few more lumps of clay. You amble off the pan into the long shadows of the dunes, a tidy morning’s work behind you.',
            cubes: 6,
            next: 'end',
          },
        },
      ],
    },
  },
};

// ── Dusty Dunes — "The Lost Caravan" (a RESCUE: a stranded pack-beast, three approaches to three
//    different reunions — find the caravan, dig it out, or discover it was never lost at all) ─────
const LOST_CARAVAN: AdventureScript = {
  id: 'lost-caravan',
  name: 'The Lost Caravan',
  regionId: 'dusty-dunes',
  start: 'stranded-tortoise',
  scenes: {
    'stranded-tortoise': {
      id: 'stranded-tortoise',
      stage: 1,
      text: 'A pack-tortoise stands alone in the lee of a dune, vast and patient and hopelessly overloaded, swaying under a tower of trade-crates lashed on by someone who is no longer here. It regards you with the mild, total despair of a creature that has been left behind by its caravan and intends to feel every minute of it.',
      choices: [
        {
          id: 'read-tracks',
          text: 'Cast about for the caravan’s trail',
          check: { stat: 'wis', skill: 'foraging', dc: 12 },
          success: {
            text: 'Wind has scoured most of it, but you find the thread of it — cart-ruts and dung and dropped twine — and follow it off into the dunes.',
            next: 'follow-trail',
          },
          failure: {
            text: 'The wind has eaten the tracks entirely. You strike off on the freshest scuff you can find and hope.',
            next: 'follow-trail',
          },
        },
        {
          id: 'climb-dune',
          text: 'Climb the high dune for a look across the waste',
          check: { stat: 'str', skill: 'athletics', dc: 12 },
          success: {
            text: 'You haul up the soft sand to the crest and there it is — a smudge of dust and canvas a mile off, and between it and you, a glint of trouble.',
            next: 'spot-dust',
          },
          failure: {
            text: 'The dune slides out from under you half the way up. From where you finally crest, the waste is just waste — but a thread of smoke says someone is out there somewhere.',
            next: 'spot-dust',
          },
        },
        {
          id: 'calm-beast',
          text: 'Settle the poor beast first, and listen to what it wants',
          requires: { trait: 'a', min: 55 },
          success: {
            text: 'Your kindest one leans against the great warm shell and just breathes with it a while, until the tortoise stops despairing long enough to do the one thing nobody had let it do: turn around and plod off, with enormous purpose, in a direction entirely its own.',
            next: 'beast-leads',
          },
        },
      ],
    },
    'follow-trail': {
      id: 'follow-trail',
      stage: 2,
      text: 'The trail bends around a thornbrake and there is the caravan, halted, fretting, a knot of traders arguing about whether to go back for the tortoise they could not afford to wait for. Their faces, when they see it ambling up behind you, are worth the whole trip.',
      choices: [
        {
          id: 'deliver',
          text: 'Hand the great beast back to its people',
          check: { stat: 'cha', skill: 'performance', dc: 11, harmony: true },
          success: {
            text: 'The reunion is loud and undignified and involves the tortoise being kissed on the nose by a weeping caravan-master. They press ore and good coin on you and will not hear a word against it.',
            items: [{ id: 'ore', qty: 2 }],
            cubes: 20,
            next: 'end',
          },
          failure: {
            text: 'You bungle the handover, the tortoise takes offence, and it is a full half-hour of coaxing before everyone is reunited and only mildly cross. They thank you anyway, and pay in the small coin of the genuinely grateful.',
            items: [{ id: 'clay', qty: 1 }],
            cubes: 8,
            next: 'end',
          },
        },
      ],
    },
    'spot-dust': {
      id: 'spot-dust',
      stage: 2,
      text: 'From the height you saw it clear: the caravan is not moving on. It is bogged to the axles in a sink of soft sand, going nowhere, and the longer it sits the deeper it drinks. They did not abandon the tortoise. They lost the race to the sand.',
      choices: [
        {
          id: 'dig-them-out',
          text: 'Bring the tortoise down and dig the caravan free',
          check: { stat: 'str', skill: 'athletics', dc: 13, harmony: true },
          success: {
            text: 'Tortoise, party, and traders all hauling as one, you walk the bogged carts up out of the sink board by board. The caravan-master opens the very best crate by way of thanks — the kind of stone the deep desert only gives up once a season.',
            items: [
              { id: 'rare-gem', qty: 1 },
              { id: 'ore', qty: 1 },
            ],
            cubes: 18,
            next: 'end',
          },
          failure: {
            text: 'The sink is greedy and the day is long, but between the lot of you the worst cart comes free at last. The traders share what they can spare, which is honest and not nothing.',
            items: [{ id: 'ore', qty: 1 }],
            fatigue: 1,
            cubes: 10,
            next: 'end',
          },
        },
      ],
    },
    'beast-leads': {
      id: 'beast-leads',
      stage: 2,
      text: 'The tortoise leads you, with the unhurried certainty of the very old, not toward any caravan at all — but to a slot in the rocks where a seep of green water hides, and a cache of trade-goods tucked in the shade beside it. It was never lost. It had simply found something better and could not work out how to tell anyone.',
      choices: [
        {
          id: 'share-find',
          text: 'Take a fair share of the tortoise’s good fortune',
          check: { stat: 'wis', skill: 'foraging', dc: 11 },
          success: {
            text: 'You water everyone, the tortoise included, and divide the cached goods by the old desert law of finders. It sees you off with what passes, in a tortoise, for a fond farewell.',
            items: [
              { id: 'marsh-sage', qty: 1 },
              { id: 'clay', qty: 2 },
              { id: 'ore', qty: 1 },
            ],
            cubes: 14,
            next: 'end',
          },
          failure: {
            text: 'You are too polite by half and take almost nothing, which the tortoise finds baffling and a little insulting. Still — you leave watered, rested, and richer in goodwill than in ore.',
            items: [{ id: 'marsh-sage', qty: 1 }],
            cubes: 6,
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
  keeper: true,
  start: 'sentinel-proving',
  scenes: {
    'sentinel-proving': {
      id: 'sentinel-proving',
      stage: 1,
      text: 'At the dead end of the red slot canyon the Sandstone Sentinel waits, buried to the shoulders in its own slow dune, vast and patient and watching. It does not rise for everyone. All around its feet stand the wind-worn shapes of those who came unready — not dead, the desert is not so unkind, just turned politely to standing stone and left a long while to think about it. The Sentinel will not stand for you until you have shown it you are worth standing for.',
      choices: [
        {
          id: 'stand-the-heat',
          text: 'Stand in the canyon’s furnace and do not flinch while it watches',
          check: { stat: 'con', skill: 'athletics', dc: 13 },
          success: {
            text: 'You hold the killing red heat without a backward step, sweat-blind and steady, until a long crack opens across the Sentinel’s brow that might, in stone, be approval.',
            next: 'sentinel-rises',
          },
          failure: {
            text: 'The heat nearly folds you and you give a step — but you do not break and you do not run, and the Sentinel has watched far better give far more. It allows it.',
            fatigue: 1,
            next: 'sentinel-rises',
          },
        },
        {
          id: 'read-glyphs',
          text: 'Read the challenge-glyphs worn into its base, and answer them true',
          requires: { trait: 'c', min: 55 },
          success: {
            text: 'The glyphs are a question the Sentinel has put to a thousand challengers, and you are perhaps the hundredth to bother reading it before answering. You answer it right. The sand at its shoulders begins, grain by grain, to shift.',
            next: 'sentinel-rises',
          },
        },
        {
          id: 'declare-true',
          text: 'Look it in its great blank face and say, plainly, why you have come',
          check: { stat: 'cha', skill: 'performance', dc: 12, harmony: true },
          success: {
            text: 'No flourishes, no boasting — just the plain true reason, spoken to a thing that has heard ten thousand lies. It weighs your honesty like ore, and finds enough of it.',
            next: 'sentinel-rises',
          },
          failure: {
            text: 'Your words come out tangled under that ancient stare, but the marrow of them is true, and the Sentinel takes marrow over polish. It deigns to consider you.',
            next: 'sentinel-rises',
          },
        },
      ],
    },
    'sentinel-rises': {
      id: 'sentinel-rises',
      stage: 2,
      text: 'Found worthy — or near enough — the Sandstone Sentinel hauls itself up out of a century of dune, sand sheeting from shoulders of red stone, until it blots out the strip of sky at the top of the slot. It raises one fist the size of a millstone: not in threat, but in offer — the fight you have just proved you earned the right to lose.',
      choices: [
        {
          id: 'meet-it',
          text: 'Set your hooves and meet the colossus',
          success: {
            text: 'You square up to the mountain in the hot red sand. It comes down to meet you, and the whole canyon rings like a struck bell.',
            battle: 'dd-sandstone-sentinel',
            next: 'end',
          },
        },
        {
          id: 'yield',
          text: 'Salute it, decline the honour for today, and withdraw',
          success: {
            text: 'You salute it the way one salutes a worthy thing and step back out of the slot. The Sentinel inclines its great head a fraction — respect, from a mountain — and presses a fistful of the deep canyon’s ore on you before it settles back to wait for braver weather.',
            items: [
              { id: 'ore', qty: 2 },
              { id: 'rare-gem', qty: 1 },
            ],
            cubes: 10,
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

/** Dusty Dunes scripts, in the canonical ADVENTURE_SCRIPTS order. */
export const DUSTY_DUNES_SCRIPTS: AdventureScript[] = [
  SALT_PAN,
  LOST_CARAVAN,
  WHIRLING_WASTE,
  GLASSLANDS,
  SANDSTONE_SENTINEL,
];
