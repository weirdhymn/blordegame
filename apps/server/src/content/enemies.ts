import type { Approach } from '@blorse/balance';

// ── Combat enemies (§9.4) ────────────────────────────────────────────────────
// Authored stat-blocks, the same way adventures are authored content. A battle instantiates one
// Combatant per enemy id passed in (so "1–2 enemies" is just a list). Cozy framing: these are
// grumpy obstacles, not villains — at 0 HP they huff off, never die.
//
// NOTE (v1 minimum): `weakness` / `resist` / `tell` are authored now for forward-compat but the
// minimum's generic Attack does NOT read them yet — the approach/weakness layer turns them on. The
// region boss (the Hollow-Keeper) debuts *with* that layer so its puzzle isn't spoiled here.
// Names are PLACEHOLDERS pending LORE.md (per the "ask before inventing names" rule).

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
];

export const ENEMY_BY_ID = new Map(ENEMIES.map((e) => [e.id, e]));
