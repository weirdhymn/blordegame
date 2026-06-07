import type { Approach } from '@blorse/balance';

// ── Combat enemies (§9.4) ────────────────────────────────────────────────────
// Authored stat-blocks, the same way adventures are authored content. A battle instantiates one
// Combatant per enemy id passed in (so "1–2 enemies" is just a list). Cozy framing: these are
// grumpy obstacles, not villains — at 0 HP they huff off, never die.
//
// `weakness` / `resist` (an Approach) drive the class/approach puzzle (§9.4a/b): a class that attacks
// the weakness hits ×WEAKNESS, a resisted one ×RESIST; the `tell` is the readable hint. The region
// boss, the Hollow-Keeper (§9.4c), is the climax of a deep adventure. Names are PLACEHOLDERS pending
// LORE.md (per the "ask before inventing names" rule).

export interface EnemyMove {
  id: string;
  /** v1: single-target `strike` or a lighter `sweep` that also nicks a second horse. */
  kind: 'strike' | 'sweep';
  weight: number; // seeded weighted pick
  text: string; // flavor when it uses this move
}

export interface EnemyDef {
  id: string;
  name: string;
  maxHp: number;
  power: number; // its attack stat (rolled like a horse's)
  guard: number; // DC to land a clean blow on it
  speed: number; // its DEX, for turn order
  /** The approach it's vulnerable to (×WEAKNESS_MULT) — read by the approach layer, not the minimum. */
  weakness: Approach;
  /** An approach it shrugs off (×RESIST_MULT) — likewise deferred. */
  resist?: Approach;
  /** Scene-set when the battle opens (Sunny Hollow voice). */
  intro: string;
  /** A read on its weakness, surfaced for the player (used once approaches land). */
  tell: string;
  moves: EnemyMove[];
  reward: { cubes?: number; items?: { id: string; qty: number }[] };
}

export const ENEMIES: EnemyDef[] = [
  {
    id: 'bramble-tangle',
    name: 'a Bramble-Tangle',
    maxHp: 48,
    power: 12,
    guard: 11,
    speed: 8,
    weakness: 'confront', // a thornbush you genuinely can just muscle through
    resist: 'soothe', // …but there is no sweet-talking a thornbush
    intro:
      'The path knots shut ahead of you — a whole thicket of bramble hauls itself upright, shakes off the dirt, and considers your party with what can only be described as territorial intent. It is not malicious. It is just extremely a bramble.',
    tell: 'All thorn and bluster — no cunning to outwit, no heart to soothe. But it is brittle: put a shoulder into it and it comes apart.',
    moves: [
      {
        id: 'thorn-lash',
        kind: 'strike',
        weight: 3,
        text: 'A whip-thin runner of thorns lashes out.',
      },
      {
        id: 'snare',
        kind: 'sweep',
        weight: 1,
        text: 'It throws out a low tangle, snagging more than one of you at once.',
      },
    ],
    reward: { cubes: 25, items: [{ id: 'plant-fiber', qty: 2 }] },
  },
  {
    id: 'thistle-whirl',
    name: 'a Thistle-Whirl',
    maxHp: 26,
    power: 11,
    guard: 10,
    speed: 14,
    weakness: 'outwit', // quick and silly; feint and it over-commits
    intro:
      'A knot of dry thistle catches the wind, spins itself into a waist-high whirl of prickles, and comes bowling at you with the directionless enthusiasm of a thing that has never once had a thought.',
    tell: 'It careens about with no plan whatsoever — a feint would send it spinning off into the reeds.',
    moves: [
      { id: 'prickle', kind: 'strike', weight: 1, text: 'It bowls through, scattering prickles.' },
    ],
    reward: { cubes: 10 },
  },
  {
    id: 'snappish-gander',
    name: 'a Snappish Gander',
    maxHp: 40,
    power: 12,
    guard: 11,
    speed: 12,
    weakness: 'soothe', // all bluster — a kind word settles it where a shove only makes it worse
    resist: 'confront', // meet its aggression head-on and it just digs in, wings out
    intro:
      'A great grey gander erupts from the reeds with its neck low and its wings spread, hissing like a kettle that has taken everything personally. It has decided, on no evidence whatsoever, that you are the enemy.',
    tell: 'All hiss and raised hackles — spoiling for a fight it does not really want. Shove back and it only digs in; a gentle, steady word might be another matter entirely.',
    moves: [
      { id: 'wing-buffet', kind: 'strike', weight: 3, text: 'It batters out with both wings.' },
      {
        id: 'honk',
        kind: 'sweep',
        weight: 1,
        text: 'It looses a honk that rattles the whole party.',
      },
    ],
    reward: { cubes: 22, items: [{ id: 'plant-fiber', qty: 1 }] },
  },
  {
    id: 'mossback-tortoise',
    name: 'a Mossback Tortoise',
    maxHp: 52,
    power: 10,
    guard: 12,
    speed: 6,
    weakness: 'skirmish', // too slow to stop a nimble Rogue finding the gaps in its shell
    resist: 'confront', // and far too armoured to simply bash head-on
    intro:
      'Something the size of a coffee table heaves itself into the path: an ancient tortoise, its shell furred with moss, regarding you with the unbothered contempt of a creature that has outlived every problem it has ever had.',
    tell: 'Slow as continental drift and armoured like a vault — a head-on charge would only bruise your pride. But it cannot turn for toffee; quick feet could dance circles round it.',
    moves: [
      {
        id: 'shell-slam',
        kind: 'strike',
        weight: 3,
        text: 'It heaves up and drops its whole shell at you.',
      },
      { id: 'snap', kind: 'strike', weight: 1, text: 'A surprisingly fast snap of its beak.' },
    ],
    reward: { cubes: 28, items: [{ id: 'plant-fiber', qty: 1 }] },
  },
  {
    // The Green Grass region boss (§9.4c) — the climax of a deep adventure. Weak to a Cleric's
    // Soothe, resists a Knight's Confront: the reading-the-foe puzzle, debuting at boss scale.
    id: 'gg-hollow-keeper',
    name: 'the Hollow-Keeper',
    maxHp: 92,
    power: 14,
    guard: 13,
    speed: 9,
    weakness: 'soothe', // it does not want a fight, only respect — a Cleric settles it
    resist: 'confront', // a Knight just gives it the brawl it has been spoiling for
    intro:
      'The hollow narrows, the green closes overhead, and there it is: an enormous old stag, bedded down across the only way through, regarding you with the patience of geology. It does not look angry. It looks like it has been waiting a very long time for someone to be rude to it.',
    tell: 'It lowers that vast rack of antlers and huffs — it *wants* the charge. Something tells you the worst thing you could do is give it the fight it is spoiling for; a calm, respectful word might move it where muscle never will.',
    moves: [
      {
        id: 'antler-sweep',
        kind: 'strike',
        weight: 3,
        text: 'It sweeps that great rack of antlers in a slow, contemptuous arc.',
      },
      {
        id: 'bugle',
        kind: 'sweep',
        weight: 1,
        text: 'It throws back its head and BUGLES — a sound that rattles your back teeth.',
      },
    ],
    reward: {
      cubes: 120,
      items: [
        { id: 'rare-gem', qty: 1 },
        { id: 'marsh-sage', qty: 2 },
      ],
    },
  },
  {
    // The Dusty Dunes region boss (§9.4c) — weak to a Knight's Confront (it is cracked rock you can
    // shatter), resists a Cleric's Soothe (no heart in a landslide). The Knight's boss.
    id: 'dd-sandstone-sentinel',
    name: 'the Sandstone Sentinel',
    maxHp: 100,
    power: 15,
    guard: 14,
    speed: 7,
    weakness: 'confront', // solid rock cracked clean through — a hard, honest charge shatters it
    resist: 'soothe', // there is no heart in a landslide to soothe
    intro:
      'The canyon narrows to a slot, and the slot is filled: a weathered colossus of red sandstone hauls itself up out of the dune it was pretending to be, sand sheeting off its shoulders, and fixes you with two eyes like chips of flint.',
    tell: 'All grit and grind, no give and no guile — but look closer: it is cracked clean through, fault-lines running deep. No charming a landslide; just a hard, honest shove at the right seam.',
    moves: [
      {
        id: 'boulder-fist',
        kind: 'strike',
        weight: 3,
        text: 'It brings a fist the size of a millstone down in a slow, grinding arc.',
      },
      {
        id: 'sandblast',
        kind: 'sweep',
        weight: 1,
        text: 'It sloughs a wave of scouring sand across the whole party.',
      },
    ],
    reward: {
      cubes: 130,
      items: [
        { id: 'rare-gem', qty: 1 },
        { id: 'ore', qty: 3 },
      ],
    },
  },
  {
    // The Weird Woods region boss (§9.4c) — weak to a Wizard's Outwit (its tricks have a logic),
    // resists a Knight's Confront (you only ever hit afterimage). The Wizard's boss.
    id: 'ww-mistwood-mimic',
    name: 'the Mistwood Mimic',
    maxHp: 88,
    power: 14,
    guard: 13,
    speed: 13,
    weakness: 'outwit', // its trick has a pattern — read it and the real one stands plain
    resist: 'confront', // meet it head-on and you hit fog and afterimage
    intro:
      'The trees lean in, the mist thickens to soup, and something steps out of it — and then out of it again, a little to the left, wearing a slightly different face. The Mistwood Mimic considers you with several sets of eyes, none of which are quite where you are looking.',
    tell: 'It flickers and doubles and grins from three places at once; meet it head-on and you will only ever hit afterimage. But the trick has a pattern — read it, and the real one stands suddenly, obviously plain.',
    moves: [
      {
        id: 'phantom-rush',
        kind: 'strike',
        weight: 3,
        text: 'A dozen copies rush in; only one of them is real.',
      },
      {
        id: 'bewilder',
        kind: 'sweep',
        weight: 1,
        text: 'It splits into a baffling crowd and rattles the whole party at once.',
      },
    ],
    reward: {
      cubes: 140,
      items: [
        { id: 'rare-gem', qty: 1 },
        { id: 'timber', qty: 3 },
      ],
    },
  },
];

export const ENEMY_BY_ID = new Map(ENEMIES.map((e) => [e.id, e]));
