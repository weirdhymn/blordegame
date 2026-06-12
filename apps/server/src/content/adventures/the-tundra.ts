import type { AdventureScript } from './types.js';

/**
 * The Tundra (§7v) — the cold edge of the map, unlocked through the Woods. Two pool
 * expeditions with deliberately different shapes (a long quiet night-walk; a short warm
 * social pocket with an optional scrap) plus the earned Keeper challenge — the Rogue's
 * boss at last. Voice bar per ./types.ts: sensory first, one dry line, fond not grim.
 */

// ── "The Aurora Road" — a long, quiet night-walk; no combat, one stranger ──
const AURORA_ROAD: AdventureScript = {
  id: 'aurora-road',
  name: 'The Aurora Road',
  regionId: 'the-tundra',
  start: 'first-ribbon',
  scenes: {
    'first-ribbon': {
      id: 'first-ribbon',
      stage: 1,
      text: 'Night comes early here and brings company: a ribbon of green light unrolls across the sky, soundless, patient, going somewhere. The snow picks the color up and holds it, so the whole world is faintly lit from above and below at once. The road north glows. It would be rude not to.',
      choices: [
        {
          id: 'read-the-sky',
          text: 'Read the lights the way you’d read weather — where are they going?',
          check: { stat: 'wis', skill: 'foraging', dc: 12 },
          success: {
            text: 'The ribbon bends over a far ridge and pools there, circling, like water finding a drain. That is not weather. That is a destination. You make good time on lit snow, picking up glinting stones as you go.',
            items: [{ id: 'ore', qty: 2 }],
            next: 'frozen-ford',
          },
          failure: {
            text: 'The lights keep their own counsel, but the walking is easy and bright, and the snow gives up a little glitter on the way.',
            items: [{ id: 'ore', qty: 1 }],
            next: 'frozen-ford',
          },
        },
        {
          id: 'walk-in-wonder',
          text: 'Forget navigation — just walk under it for a while',
          requires: { trait: 'o', min: 60 },
          success: {
            text: 'You stop being travelers for half a mile and just watch. The ribbon folds, unfolds, goes green to violet and back, showing off for an audience of upturned faces. Something in the party untangles. The road, when you remember it, feels shorter.',
            cubes: 8,
            next: 'frozen-ford',
          },
        },
      ],
    },
    'frozen-ford': {
      id: 'frozen-ford',
      stage: 2,
      text: 'The road crosses a river that has stopped to think. Black ice, swept clean by the wind, a long groan running through it now and then like a door in an old house. On the far bank the aurora pools brighter. Underhoof, the ice rings faintly — a struck bell, asking how much you weigh.',
      choices: [
        {
          id: 'dance-across',
          text: 'Cross light and quick, reading the ice as you go',
          check: { stat: 'dex', dc: 13, harmony: true },
          success: {
            text: 'You go one at a time, soft-footed, weight rolling heel to toe, and the bell-notes stay polite the whole way over. On the far side, frozen into the surface like a museum exhibit, a vein of something glitters — close enough to chip free.',
            items: [
              { id: 'ore', qty: 2 },
              { id: 'rare-gem', qty: 1 },
            ],
            next: 'ridge-pool',
          },
          failure: {
            text: 'Halfway over, the ice clears its throat — a CRACK like a tree losing an argument — and the last of you finishes the crossing at a highly undignified scramble. Everyone is fine. Nobody is graceful. The river keeps a souvenir horseshoe-shaped dent.',
            fatigue: 1,
            next: 'ridge-pool',
          },
        },
        {
          id: 'long-way-round',
          text: 'Respect the river — take the long bank home with what you have',
          success: {
            text: 'The ice groans again, longer this time, and you decide that is a whole sentence. You follow the bank back south, pockets modestly heavy, dignity intact. The lights see you home.',
            cubes: 10,
            next: 'end',
          },
        },
      ],
    },
    'ridge-pool': {
      id: 'ridge-pool',
      stage: 3,
      text: 'The ridge, when you crest it, is where the aurora has been going all night: it pools here, low and bright, close enough to grayscale the stars. And standing in the middle of the pooled light, head down, perfectly at home, is a horse you have never met — coat washed pale by the glow, watching you arrive the way locals watch tourists.',
      choices: [
        {
          id: 'stand-quietly',
          text: 'Stand quietly in the light and let it decide about you',
          check: { stat: 'cha', dc: 13 },
          success: {
            text: 'You do not approach. You just stand in the same light, the way you would share a fire. After a while it drifts over, breath frosting green, and leans — very slightly, very deliberately — against your shoulder. It walks home with you like it had always been going to.',
            wild: true,
            next: 'end',
          },
          failure: {
            text: 'It considers you for a long, lit minute — then snorts twin plumes of green frost, fond and unconvinced, and walks off into the dark with the lights trailing after it like gulls after a boat. The ridge, by way of apology, gives up its loose stones easily.',
            items: [
              { id: 'ore', qty: 2 },
              { id: 'bone', qty: 1 },
            ],
            next: 'end',
          },
        },
        {
          id: 'leave-it-be',
          text: 'Leave it its ridge — some things are better waved at',
          success: {
            text: 'You nod, the way you would to a neighbor across a fence, and it nods back — you are nearly sure. You head south with full pockets and the particular warmth of an encounter nobody ruined.',
            cubes: 12,
            items: [{ id: 'ore', qty: 1 }],
            next: 'end',
          },
        },
      ],
    },
  },
};

// ── "The Hot Spring Hollow" — short and warm; the deep push is a scrap ──
const HOT_SPRING_HOLLOW: AdventureScript = {
  id: 'hot-spring-hollow',
  name: 'The Hot Spring Hollow',
  regionId: 'the-tundra',
  start: 'steam-curtain',
  scenes: {
    'steam-curtain': {
      id: 'steam-curtain',
      stage: 1,
      text: 'You smell it before you see it: minerals and warmth, a green smell in a white country. A hollow opens below the trail where the ground has opinions about being frozen — steam stands up out of blue pools in fat columns, and around the rims, improbably, things grow. Half the Tundra’s small wildlife is down there pretending not to look at the other half.',
      choices: [
        {
          id: 'ease-in',
          text: 'Pick your way down politely — it’s clearly somebody’s living room',
          check: { stat: 'cha', dc: 12, harmony: true },
          success: {
            text: 'You file down slow and obvious, no sudden anything, and the hollow decides you can stay. A fat ptarmigan budges up to make room at the second pool. By the rims, warm-loving herbs grow thick enough to gather.',
            items: [{ id: 'marsh-sage', qty: 2 }],
            next: 'warm-shelf',
          },
          failure: {
            text: 'A marmot whistles the alarm and the whole hollow does a synchronized disappearing act. You wait out the awkwardness at the pool edge until, one nose at a time, the locals forgive you.',
            items: [{ id: 'marsh-sage', qty: 1 }],
            next: 'warm-shelf',
          },
        },
        {
          id: 'soak-first',
          text: 'Diplomacy later — get IN the warm water immediately',
          requires: { trait: 'e', min: 55 },
          success: {
            text: 'Strategy can wait; you wade in to the hocks and let the heat climb. The locals, recognizing a fellow connoisseur, go back to their soaking. Best diplomacy there is.',
            cubes: 8,
            fatigue: 0,
            next: 'warm-shelf',
          },
        },
      ],
    },
    'warm-shelf': {
      id: 'warm-shelf',
      stage: 2,
      text: 'Behind the largest pool, a mineral shelf glitters where the steam has been painting the rock for a thousand years — crusted ore, and deeper in, something clearer winking out of a seam. Above it, though, the air has gone needly and cold: a sleet-wisp has claimed the back of the hollow, sulking at all this unauthorized warmth.',
      choices: [
        {
          id: 'work-the-shelf',
          text: 'Chip at the near shelf, quick and quiet, and settle for the easy ore',
          check: { stat: 'str', dc: 12 },
          success: {
            text: 'You work fast, hooves braced on warm rock, and come away with saddlebags full before the cold corner takes any notice. The wisp keeps sulking. Everybody wins, sort of.',
            items: [{ id: 'ore', qty: 3 }],
            next: 'end',
          },
          failure: {
            text: 'The crust is tougher than it looks and you mostly mine yourself a profound respect for geology — but a couple of good chunks come loose on the way out.',
            items: [{ id: 'ore', qty: 1 }],
            fatigue: 1,
            next: 'end',
          },
        },
        {
          id: 'face-the-wisp',
          text: 'The deep seam is worth a scrap — go ask the wisp to share',
          success: {
            text: 'You bank what you’ve gathered, square up in the steam, and address the cold corner directly. The sleet stops falling. Then it starts circling.',
            battle: 'sleet-wisp',
            next: 'end',
          },
        },
        {
          id: 'warm-and-home',
          text: 'One more soak, then home — the hollow has been generous enough',
          success: {
            text: 'You leave the deep seam for braver weather, stand in the warmest pool until everyone’s knees go pleasantly stupid, and start the walk home steaming gently the whole way.',
            cubes: 10,
            next: 'end',
          },
        },
      ],
    },
  },
};

// ── The Tundra Keeper — "The Glacier-Shepherd" (the Rogue's boss, §9.4c) ──
const GLACIER_SHEPHERD: AdventureScript = {
  id: 'glacier-shepherd',
  name: 'The Glacier-Shepherd',
  regionId: 'the-tundra',
  keeper: true,
  start: 'valley-head',
  scenes: {
    'valley-head': {
      id: 'valley-head',
      stage: 1,
      text: 'The valley narrows until the glacier is the whole horizon — a wall of old blue light, creaking to itself at the speed of centuries. Walking ahead of it, tending it, is the Shepherd: tall as weather, clear as deep ice, patient as the thing it herds. Your road runs under its flock. It turns to consider you, which takes a while, and is worth waiting for.',
      choices: [
        {
          id: 'walk-the-seams',
          text: 'Scout the ice on quick feet — find where the old blue is seamed',
          check: { stat: 'dex', dc: 13 },
          success: {
            text: 'You skip a wide arc across the glacier’s toe, reading it like a map: pressure ridges, melt-cracks, seams where ten thousand winters disagreed with each other. The Shepherd tracks you, slow as a clock’s hour hand. You are faster than that. You are sure you are faster than that.',
            next: 'shepherds-answer',
          },
          failure: {
            text: 'The ice is less map than maze, and one seam ends in a wind-scoured dead end that costs you the better line. Still — you saw enough. Old ice is honest about its weaknesses if you ask it at speed.',
            next: 'shepherds-answer',
          },
        },
        {
          id: 'announce-yourselves',
          text: 'Walk up plainly and state your business — it respects a straight line',
          requires: { trait: 'c', min: 55 },
          success: {
            text: 'You walk the middle of the valley where it can watch you come, and you tell it, plainly, that the road runs through. It inclines its head a degree — which, at its timescale, is practically a handshake — and waits to see if you mean it.',
            next: 'shepherds-answer',
          },
        },
      ],
    },
    'shepherds-answer': {
      id: 'shepherds-answer',
      stage: 2,
      text: 'The Shepherd plants itself between you and the pass, gentle and total, like winter closing a door. There is nothing cruel in it. It has herded this ice since before your pasture had a name, and it sees no reason a road should change that. The seams in the old blue glitter behind it. Quick feet could thread them — if quick feet are what you brought.',
      choices: [
        {
          id: 'thread-the-ice',
          text: 'Take it on — thread the seams and teach the old ice some new footwork',
          success: {
            text: 'You bank your courage and your saddlebags both, pick your line through the glittering cracks, and go. The Shepherd sighs — a sound like a season ending — and reaches for you, slow and absolutely certain you will still be there.',
            battle: 'tn-glacier-shepherd',
            next: 'end',
          },
        },
        {
          id: 'another-winter',
          text: 'Bow out — let it keep its pass another winter',
          success: {
            text: 'You touch your nose to the cold air in something like a salute, and turn for home. The Shepherd watches you all the way down the valley, and the aurora comes out early, and nobody has lost a single thing today except the argument.',
            cubes: 12,
            next: 'end',
          },
        },
      ],
    },
  },
};

export const THE_TUNDRA_SCRIPTS: AdventureScript[] = [
  AURORA_ROAD,
  HOT_SPRING_HOLLOW,
  GLACIER_SHEPHERD,
];
