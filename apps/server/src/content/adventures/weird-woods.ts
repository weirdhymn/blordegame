import type { AdventureScript } from './types.js';

// ── Weird Woods — "The Mistwood Mimic" (the region boss, §9.4c) ─────────────
const MISTWOOD_MIMIC: AdventureScript = {
  id: 'mistwood-mimic',
  name: 'The Mistwood Mimic',
  regionId: 'weird-woods',
  keeper: true,
  start: 'mimic-meeting',
  scenes: {
    'mimic-meeting': {
      id: 'mimic-meeting',
      stage: 1,
      text: 'Down in the mist-pooled hollow where the laughing lives, something waits for you wearing a friendly face: a lost-looking little horse, dappled and sweet, that calls you by a name it has no business knowing and tells you, oh so kindly, that there is nothing down here worth your trouble and the way home is right back the way you came. It is, of course, the Mistwood Mimic. The trick is to be quite rude about noticing.',
      choices: [
        {
          id: 'spot-the-tell',
          text: 'Watch it close until it slips — every mimic slips',
          check: { stat: 'wis', skill: 'foraging', dc: 13 },
          success: {
            text: 'You watch, and you wait, and there: it breathes out into the cold air and casts no fog at all. You point this out, loudly and rudely, and the sweet little face splits open ear to ear to ear.',
            next: 'mimic-revealed',
          },
          failure: {
            text: 'It is good — very good — and for a moment you almost turn for home. But its shadow falls the wrong way, just once, and once is plenty. You call it out. The grin spreads.',
            next: 'mimic-revealed',
          },
        },
        {
          id: 'refuse-trick',
          text: 'Refuse the bait flat — you know exactly what lives in mist like this',
          requires: { trait: 'c', min: 55 },
          success: {
            text: 'You do not chase the afterimages and you do not take one backward step toward that helpfully-offered exit. You simply name the thing for what it is, and the lost little horse stops bothering to pretend.',
            next: 'mimic-revealed',
          },
        },
        {
          id: 'flatter-it',
          text: 'Play along — then praise the act until it can’t resist a bow',
          check: { stat: 'cha', skill: 'performance', dc: 12, harmony: true },
          success: {
            text: 'You praise the disguise extravagantly — the dapples, the wobble in the voice, the sheer cheek of the name — until the Mimic, helpless against an appreciative audience, drops the act to take a delighted, many-mouthed bow.',
            next: 'mimic-revealed',
          },
          failure: {
            text: 'Your flattery is a touch overcooked and the Mimic narrows its borrowed eyes — but vanity wins, as it always does in the Weird Woods, and it shrugs off the little horse to show you what is really laughing.',
            next: 'mimic-revealed',
          },
        },
      ],
    },
    'mimic-revealed': {
      id: 'mimic-revealed',
      stage: 2,
      text: 'Unmasked, the Mistwood Mimic stops being one thing and becomes a dozen — a hollow full of grinning copies, your own faces among them, none of them ever quite where you look. But the spell is broken now: you know the game, and it knows you know. It waits, all its grins turned your way, to find out whether knowing is the same as winning.',
      choices: [
        {
          id: 'face-it',
          text: 'Hold your nerve, pick the real one, and have at it',
          success: {
            text: 'You stop chasing reflections, fix on the one grin that casts a shadow, and commit. The whole laughing crowd of it turns to meet you at once.',
            battle: 'ww-mistwood-mimic',
            next: 'end',
          },
        },
        {
          id: 'let-be',
          text: 'Decide that seeing through it was the real victory, and go',
          success: {
            text: 'You tip the Mimic the nod of one trickster to another and walk out unhurried, following your own true hoofprints. It lets you — it has rather enjoyed being properly SEEN for once — and leaves a few of its stranger treasures on the path by way of thanks.',
            items: [
              { id: 'timber', qty: 1 },
              { id: 'rare-gem', qty: 1 },
            ],
            cubes: 8,
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

// ── Weird Woods — "The Witch-Hazel" (a SHORT, urgent errand: the blooms last one hour at dusk, then
//    deny they ever happened. No fork, no fight — just be quick and be weird about it.) ───────────
const WITCH_HAZEL: AdventureScript = {
  id: 'witch-hazel',
  name: 'The Witch-Hazel',
  regionId: 'weird-woods',
  start: 'hazel-dusk',
  scenes: {
    'hazel-dusk': {
      id: 'hazel-dusk',
      stage: 1,
      text: 'The witch-hazel of the Weird Woods blooms backwards — closed all day, then for one hour at dusk it throws open a thousand thread-thin yellow flowers, glowing faintly, smelling of cold pennies and rain. When the hour ends the branch folds up and will, if asked, deny the whole affair. The hour has just begun.',
      choices: [
        {
          id: 'quick-pick',
          text: 'Pick fast and clean while they are open',
          check: { stat: 'dex', skill: 'foraging', dc: 11 },
          success: {
            text: 'Quick, light, no fumbling — you strip the open blooms by the fistful before a single one thinks to fold.',
            items: [
              { id: 'marsh-sage', qty: 2 },
              { id: 'plant-fiber', qty: 1 },
            ],
            next: 'hazel-hour',
          },
          failure: {
            text: 'Half of them snap shut the instant you breathe on them, offended. You salvage a respectable handful of the braver flowers.',
            items: [{ id: 'marsh-sage', qty: 1 }],
            next: 'hazel-hour',
          },
        },
        {
          id: 'coax-bloom',
          text: 'Hum to the shy ones and coax them to stay open',
          check: { stat: 'cha', skill: 'performance', dc: 12, harmony: true },
          success: {
            text: 'You sing the low note the woods likes, and the witch-hazel — flattered, suspicious — holds its blooms open a few minutes past its bedtime, just for you.',
            items: [
              { id: 'marsh-sage', qty: 3 },
              { id: 'timber', qty: 1 },
            ],
            next: 'hazel-hour',
          },
          failure: {
            text: 'The blooms are unmoved by your serenade and shut on schedule, primly. You gather what stayed.',
            items: [{ id: 'marsh-sage', qty: 1 }],
            next: 'hazel-hour',
          },
        },
        {
          id: 'pip-knows',
          text: '“Pip says THIS branch blooms last. Pip is usually right about wrong things.”',
          requires: { trait: 'o', min: 60 },
          success: {
            text: 'Your odd one leads you to a single crooked branch deep in the thicket that blooms a full quarter-hour after all the rest — the woods’ little secret, and tonight, yours.',
            items: [
              { id: 'marsh-sage', qty: 2 },
              { id: 'plant-fiber', qty: 2 },
            ],
            next: 'hazel-hour',
          },
        },
      ],
    },
    'hazel-hour': {
      id: 'hazel-hour',
      stage: 2,
      text: 'The light is nearly gone and the blooms are folding all around you with a sound like a hundred small books closing. There is one last bright fistful glowing at the top of the thicket, and about ninety seconds in which to want it.',
      choices: [
        {
          id: 'last-reach',
          text: 'Lunge for the last of the glow before it closes',
          check: { stat: 'wis', skill: 'foraging', dc: 12, harmony: true },
          success: {
            text: 'You take the last of it in the very last of the light, and walk home in the dark smelling of cold pennies, pockets faintly aglow.',
            items: [{ id: 'marsh-sage', qty: 1 }],
            cubes: 10,
            next: 'end',
          },
          failure: {
            text: 'It folds shut in your face with a soft, final snap, the branch already pretending it never bloomed at all. Cheek. You head home with the good handful you have.',
            next: 'end',
          },
        },
        {
          id: 'let-fold',
          text: 'Let it close, and leave the woods its secret',
          success: {
            text: 'You step back and let the last blooms fold in peace. The thicket goes dark and ordinary, and you carry home a fair share and the good manners of a welcome guest.',
            cubes: 6,
            next: 'end',
          },
        },
      ],
    },
  },
};

// ── Weird Woods — "The Long Way Round" (an UNCANNY MYSTERY: the woods has folded into a loop and
//    keeps returning you to the same log. Three ways to break it → three different escapes.) ──────
const LONG_WAY_ROUND: AdventureScript = {
  id: 'long-way-round',
  name: 'The Long Way Round',
  regionId: 'weird-woods',
  start: 'the-loop',
  scenes: {
    'the-loop': {
      id: 'the-loop',
      stage: 1,
      text: 'Here is the lightning-split log again. You are certain you have not passed it before, and equally certain you have passed nothing else. Whichever way you walk away from it, the path bends, politely and without apology, and brings you back. The Weird Woods has folded itself shut around you like a closed hand, and it is in no hurry to open.',
      choices: [
        {
          id: 'mark-trees',
          text: 'Blaze the trees and map the loop by hard logic',
          check: { stat: 'int', skill: 'foraging', dc: 13 },
          success: {
            text: 'Three loops, three blazes, and the truth: there is a SEAM, a place where two stretches of forest are stitched together wrong, the same six trees stamped twice like a misprint.',
            next: 'the-seam',
          },
          failure: {
            text: 'Your blazes start showing up on trees you have not reached yet, which is unhelpful and a little rude — but it does point, raggedly, at where the loop pinches tightest.',
            next: 'the-seam',
          },
        },
        {
          id: 'find-difference',
          text: 'Stop counting trees and watch for the ONE thing that changes',
          check: { stat: 'wis', dc: 12, harmony: true },
          success: {
            text: 'There. Every time around, a single pale moth sits one tree further along — the only thing in the whole folded wood that is keeping honest time. You decide to keep its company.',
            next: 'the-moth',
          },
          failure: {
            text: 'Everything changes and nothing does and it is enough to make a horse dizzy — but you do catch it: a pale flicker, always a little ahead, always a little different. Worth following.',
            next: 'the-moth',
          },
        },
        {
          id: 'trust-nose',
          text: 'Ignore the path entirely and bull straight off through the undergrowth',
          requires: { trait: 'c', min: 55 },
          success: {
            text: 'You refuse the path the courtesy of obeying it and crash dead-straight into the trackless green, antlers of bramble be damned. The loop, which only owns the PATH, loses its grip on you completely.',
            next: 'off-path',
          },
        },
      ],
    },
    'the-seam': {
      id: 'the-seam',
      stage: 2,
      text: 'The seam is a shimmer in the air between two birches that are, on close inspection, the same birch. Step through it at the wrong angle and you will simply arrive back at the log forever. Step through it right and you are out — and the woods, embarrassed at being caught, has left a little something tucked in the fold by way of apology.',
      choices: [
        {
          id: 'thread-seam',
          text: 'Read the angle and thread the whole party through clean',
          check: { stat: 'int', skill: 'athletics', dc: 13, harmony: true },
          success: {
            text: 'You line everyone up just so and walk them through the misprint in single file — and out into honest, un-folded forest, with a knot of strange smooth river-stones the seam had been hoarding.',
            items: [
              { id: 'rare-gem', qty: 1 },
              { id: 'timber', qty: 1 },
            ],
            cubes: 20,
            next: 'end',
          },
          failure: {
            text: 'You get the angle a few degrees wrong and arrive, with a lurch, back at the log — twice — before it takes. You are out, eventually, frazzled, clutching what the fold spat up on the way.',
            items: [{ id: 'timber', qty: 1 }],
            fatigue: 1,
            next: 'end',
          },
        },
      ],
    },
    'the-moth': {
      id: 'the-moth',
      stage: 2,
      text: 'The pale moth leads you off the bending path and down a stair of roots no loop could keep, to where it lives: a hollow stump packed with the soft cold light of a hundred of its kin, and the small bright debris of everything the folded wood has swallowed over the years.',
      choices: [
        {
          id: 'follow-true',
          text: 'Trust the moth all the way down and out',
          check: { stat: 'wis', skill: 'foraging', dc: 12 },
          success: {
            text: 'You follow it true, and it walks you straight out the wood’s back door — pausing, at the stump, to let you pocket a glittering tithe of the loop’s long forgetting. The trees behind you unclench with an almost-audible sigh.',
            items: [
              { id: 'rare-gem', qty: 1 },
              { id: 'plant-fiber', qty: 1 },
            ],
            cubes: 18,
            next: 'end',
          },
          failure: {
            text: 'You lose the moth twice in the dark and find it twice, and it gets you out in the end with fraying patience and a modest handful of its hoard for your trouble.',
            items: [{ id: 'plant-fiber', qty: 1 }],
            next: 'end',
          },
        },
      ],
    },
    'off-path': {
      id: 'off-path',
      stage: 2,
      text: 'Off the path the loop has no power, and you blunder, scratched and triumphant, straight into the thing it was folded around to hide: a still green glade with a fallen menhir at its heart, never meant to be found, thick with the rare growth that only thrives where nobody ever comes.',
      choices: [
        {
          id: 'glean-glade',
          text: 'Gather the hidden glade before the woods remembers you',
          check: { stat: 'str', skill: 'foraging', dc: 12, harmony: true },
          success: {
            text: 'You crop the secret glade quick and grateful — ore furred green with age, timber gone hard as iron, herbs with no names — and shoulder back out before the loop can re-fold behind you.',
            items: [
              { id: 'ore', qty: 2 },
              { id: 'timber', qty: 2 },
              { id: 'marsh-sage', qty: 1 },
            ],
            cubes: 16,
            next: 'end',
          },
          failure: {
            text: 'You feel the woods stir and re-fold and grab a quick armful on your way out rather than push your luck in a glade that does not want company. Wise.',
            items: [{ id: 'timber', qty: 1 }],
            fatigue: 1,
            next: 'end',
          },
        },
      ],
    },
  },
};

/** Weird Woods scripts, in the canonical ADVENTURE_SCRIPTS order. */
export const WEIRD_WOODS_SCRIPTS: AdventureScript[] = [
  LANTERN_FLY_HUNT,
  TOLL_KEEPER,
  WITCH_HAZEL,
  LONG_WAY_ROUND,
  MISTWOOD_MIMIC,
];
