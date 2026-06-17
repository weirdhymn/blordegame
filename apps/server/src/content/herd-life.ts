/**
 * The Living Herd's voice (§8) — the template library the autonomy sim narrates each day from.
 *
 * The mechanics decide WHAT happened (who met, who clicked, who soured, who wandered off, §8.1);
 * this file decides how it READS. Voice bar, locked: wry, fond, deadpan — and biased hard toward
 * the specific, slightly strange detail over generic friendliness. "Smelling of someone else's
 * clover" beats "had a nice time"; "a shared and total contempt for the new gate latch" beats
 * "fell into an easy friendship". Every beat is a base frame × a detail (× a personality
 * descriptor, where the frame asks for one), so a single event reads a hundred different ways
 * before the templates begin to wear — and the SAME event reads differently for a bold horse
 * than for an anxious one, which is how personality stays legible in the prose.
 *
 * All selection runs on the day's seeded rng (passed in), so a login catch-up narrates the same
 * herd-history every time — unpredictable to the player, deterministic to the server (§8).
 */

/** OCEAN-ish — only the five trait scores are read, so content stays free of service deps. */
type Pers = Record<string, number>;

/** A horse as the voice library needs it: a name and a temperament. */
export interface Mover {
  name: string;
  p: Pers;
}

/** The glyphs each beat wears in the Journal & Morning Post — flavour lives here with the words. */
export const HERD_GLYPH = {
  friend: '🤝',
  bonded: '💞',
  rival: '⚡',
  oddCouple: '✨',
  fallingOut: '💔',
  quirk: '🌿',
  escapade: '🌙',
} as const;

const pick = <T>(rng: () => number, arr: readonly T[]): T =>
  arr[Math.floor(rng() * arr.length)] as T;

const fill = (tpl: string, map: Record<string, string>): string =>
  tpl.replace(/\{(\w+)\}/g, (_, k: string) => map[k] ?? `{${k}}`);

// ── Personality descriptors: a horse's most pronounced trait, as a "who…" aside ──
// The dominant trait is the one furthest from the bland middle (50); ties resolve to the first
// key in OCEAN order, so the pick is deterministic. Woven into frames that ask for {ad}/{bd},
// these are what make an outcome legibly ABOUT the horses' temperaments.
const TRAIT_KEYS = ['o', 'c', 'e', 'a', 'n'] as const;

const DESCRIPTORS: Record<string, readonly string[]> = {
  'o+': [
    'who investigates everything twice',
    'full of strange ideas',
    'who will try any new thing once',
  ],
  'o-': [
    'who likes things exactly as they were',
    'suspicious of anything new',
    'a creature of firm habit',
  ],
  'c+': ['who is never late for anything', 'tidy to a fault', 'who has a system for grazing'],
  'c-': [
    'who loses track of its own feet',
    'gloriously disorganized',
    'who has never once been on time',
  ],
  'e+': ['who never met a stranger', 'who cannot sit still', 'who talks to the fence posts'],
  'e-': [
    'who prefers its own company',
    'who you forget is even there',
    'who hoards quiet like cubes',
  ],
  'a+': [
    'who would share its last oat',
    'soft as spring mud',
    'who cannot hold a grudge to save its life',
  ],
  'a-': ['who has opinions about everyone', 'prickly as a thistle', 'who negotiates over hay'],
  'n+': [
    'who worries about weather three days out',
    'highly strung',
    'who takes everything to heart',
  ],
  'n-': ['who cannot be ruffled', 'calm as a pond', 'unbothered by the entire world'],
};

function dominantTrait(p: Pers): string {
  let bestKey = 'o';
  let bestDev = -1;
  let bestHigh = true;
  for (const k of TRAIT_KEYS) {
    const dev = Math.abs((p[k] ?? 50) - 50);
    if (dev > bestDev) {
      bestDev = dev;
      bestKey = k;
      bestHigh = (p[k] ?? 50) >= 50;
    }
  }
  return `${bestKey}${bestHigh ? '+' : '-'}`;
}

const descriptor = (rng: () => number, p: Pers): string =>
  pick(rng, DESCRIPTORS[dominantTrait(p)] ?? ['who keeps its own counsel']);

// ── Shared frames: {a}/{b} are names, {ad} is a's descriptor, {x} the event's detail ──
// A frame is drawn first, then its detail, then a descriptor only if the frame asked for one —
// a fixed draw order, so twin herds with matching temperaments consume rng in lockstep.
function compose(
  rng: () => number,
  frames: readonly string[],
  details: readonly string[],
  a: Mover,
  b: Mover,
): string {
  const frame = pick(rng, frames);
  const x = pick(rng, details);
  const map: Record<string, string> = { a: a.name, b: b.name, x };
  if (frame.includes('{ad}')) map.ad = descriptor(rng, a.p);
  if (frame.includes('{bd}')) map.bd = descriptor(rng, b.p);
  return fill(frame, map);
}

// ── Friendship: a warming that makes sense — pull the WHY into the open ──
const FRIEND_FRAMES = [
  '{a} and {b} became friends — it started with {x}.',
  'It turns out {a} and {b} are friends now. The cause: {x}.',
  '{a} has decided {b} is alright, on the evidence of {x}.',
  'Something clicked between {a} and {b}: {x}.',
  '{a} and {b} keep turning up side by side lately, ever since {x}.',
  '{a}, {ad}, has taken up with {b} over {x}.',
  '{a} and {b} found each other across {x}, and that was that.',
];
const FRIEND_DETAILS = [
  'a shared and total contempt for the new gate latch',
  'ten irretrievable minutes agreeing about a smell',
  'the exact same low opinion of the pond',
  'a long quiet standoff that somehow ended in friendship',
  'discovering they both hate being rushed at breakfast',
  'an argument about the best fence post that neither will admit they enjoyed',
  'a mutual and unexplained interest in one particular cloud',
  'standing in the same patch of sun until it became a principle',
];

// ── Bonded: friendship hardened into something the whole herd can see ──
const BOND_FRAMES = [
  '{a} and {b} became inseparable. {x}',
  '{a} and {b} have crossed over into inseparable. {x}',
  'There is no longer a {a} without a {b}. {x}',
  '{a} and {b} are a fixed pair now. {x}',
  'It is official, in the way these things are: {a} and {b}. {x}',
  '{a} and {b} have stopped being two horses about it. {x}',
];
const BOND_DETAILS = [
  'Nobody has seen one without the other since.',
  'They have started grazing in the same direction without checking.',
  'They share a single opinion on everything now, and defend it.',
  'Where one goes, the other is already waiting, looking smug.',
  'They have begun finishing each other’s naps.',
  'The herd has quietly started counting them as one entry.',
];

// ── Rivalry: a feud of immense dignity and (usually) no discernible cause ──
const RIVAL_FRAMES = [
  '{a} and {b} are at odds. {x}',
  'A coolness has settled between {a} and {b}. {x}',
  '{a} and {b} have fallen out, and stylishly. {x}',
  '{a}, {ad}, and {b} are not speaking. {x}',
  'There is a feud now: {a} versus {b}. {x}',
  '{a} and {b} have taken opposite sides of something. {x}',
];
const RIVAL_DETAILS = [
  'It is about the gate. It is always about the gate.',
  'Neither will say what started it, which means it was something tiny.',
  'They graze with their backs pointedly to each other.',
  'A grievance of great seriousness and no recoverable origin.',
  'They have divided the pasture along lines only they can see.',
  'Each is, by its own account, entirely the wronged party.',
];

// ── Odd couple: the surprise — two horses who should not work, thick as thieves ──
const ODD_FRAMES = [
  '{a} and {b} have become friends, which nobody saw coming. {x}',
  'Against all the odds and most of the evidence, {a} and {b} are friends. {x}',
  '{a}, {ad}, and {b}, {bd}, have somehow become inseparable. {x}',
  'The least likely pairing in the herd: {a} and {b}. {x}',
  '{a} and {b} have struck up an unlikely friendship. {x}',
  'Somehow — and it really shouldn’t — {a} and {b} works. {x}',
];
const ODD_DETAILS = [
  'On paper it should not work. The paper has been overruled.',
  'Everyone assumed they would loathe each other. Everyone was wrong.',
  'Two horses with nothing in common, and you cannot separate them.',
  'It makes no sense, and they could not care less.',
  'The herd is still adjusting. The pair is not.',
  'Whatever the two of them have found, the rest of us are not invited.',
];

// ── Falling-out: a bond gone cold — the warmest beats make the saddest ones ──
const FALL_FRAMES = [
  '{a} and {b} aren’t what they were. {x}',
  'Something has gone cold between {a} and {b}. {x}',
  'The famous friendship of {a} and {b} has hit a frost. {x}',
  '{a} and {b}, once inseparable, are keeping their distance. {x}',
  'A rift has opened between {a} and {b}. {x}',
  '{a} and {b} have quietly stopped being a pair. {x}',
];
const FALL_DETAILS = [
  'Nobody is talking about it. Everybody is talking about it.',
  'Something was said at the water trough. That is all anyone will confirm.',
  'They were inseparable a week ago. Now there is weather between them.',
  'A friendship of long standing, suddenly keeping strict office hours.',
  'Whatever it was, both of them are plainly in the right about it.',
  'The herd is choosing sides, badly and on no information.',
];

// ── Quirks: cosmetic habits a horse picks up living here (§8). Persistent, flavour-only. ──
// The PHRASE is what gets stored and worn on the horse sheet; it reads as a predicate so it can
// also drop straight into a beat ("{name} {phrase} now."). A horse holds at most HORSE_MAX_QUIRKS.
export const QUIRK_PHRASES = [
  'won’t cross a stream without checking its reflection first',
  'insists on being the last one through any gate',
  'hoards flat stones for reasons it will not disclose',
  'greets the sunrise with one short, businesslike snort',
  'refuses to graze anywhere it can see the fence',
  'has strong and private opinions about which trough is correct',
  'naps only in perfect circles of trampled grass',
  'follows the smell of rain for as long as anyone allows',
  'has started collecting the herd’s lost ribbons',
  'stands guard over one particular unremarkable rock',
  'will not be hurried past an interesting puddle',
  'answers to a nickname only it knows',
  'checks the same empty corner every morning, finds nothing, is satisfied',
  'has decided one specific cloud is its personal responsibility',
  'sleeps facing north, always, and won’t be talked out of it',
  'keeps up an ongoing disagreement with its own shadow',
] as const;

const QUIRK_FRAMES = [
  '{a} {q} now. Nobody taught it that.',
  '{a} has picked up a habit: it {q}.',
  'New this week: {a} {q}.',
  '{a} {q} these days. The herd has stopped questioning it.',
  'These days {a} {q}, and the herd has made its peace with it.',
];

// ── Escapades: a solo wander, no lasting state — just a horse and a small private adventure ──
const ESCAPADE_FRAMES = [
  '{a} went wandering after dark and came back {x}.',
  '{a} slipped the fence overnight. By morning it had returned, {x}.',
  'Nobody could find {a} for an hour. It turned up later, {x}.',
  '{a} took itself off on a private expedition and came back {x}.',
  '{a} vanished at dusk and reappeared at dawn, {x}.',
  '{a}, {ad}, disappeared for the evening and strolled back {x}.',
];
const ESCAPADE_DETAILS = [
  'smelling of someone else’s clover',
  'with a burr in its mane and an air of great accomplishment',
  'having apparently befriended an owl',
  'wet to the knees and refusing to explain',
  'with a new and unplaceable confidence',
  'carrying a stick it now considers essential',
  'having watched the entire moon cross the sky, on purpose',
  'with mud in a pattern that almost spells something',
  'suspiciously on time for breakfast',
  'and has not said one word about it since',
  'looking like it knows something the rest of us don’t',
  'having found the one warm spot in the whole county',
];

// ── The composer the sim calls. Each returns the finished journal line. ──
export const friendshipBeat = (rng: () => number, a: Mover, b: Mover): string =>
  compose(rng, FRIEND_FRAMES, FRIEND_DETAILS, a, b);
export const bondBeat = (rng: () => number, a: Mover, b: Mover): string =>
  compose(rng, BOND_FRAMES, BOND_DETAILS, a, b);
export const rivalryBeat = (rng: () => number, a: Mover, b: Mover): string =>
  compose(rng, RIVAL_FRAMES, RIVAL_DETAILS, a, b);
export const oddCoupleBeat = (rng: () => number, a: Mover, b: Mover): string =>
  compose(rng, ODD_FRAMES, ODD_DETAILS, a, b);
export const fallingOutBeat = (rng: () => number, a: Mover, b: Mover): string =>
  compose(rng, FALL_FRAMES, FALL_DETAILS, a, b);
export const escapadeBeat = (rng: () => number, a: Mover): string =>
  compose(rng, ESCAPADE_FRAMES, ESCAPADE_DETAILS, a, a);

/** Pick an unowned quirk for a horse (deterministic from rng); null if it already has them all. */
export function pickQuirk(rng: () => number, owned: readonly string[]): string | null {
  const available = QUIRK_PHRASES.filter((q) => !owned.includes(q));
  if (available.length === 0) return null;
  return pick(rng, available);
}

/** The journal line announcing a freshly-acquired quirk. */
export function quirkBeat(rng: () => number, name: string, phrase: string): string {
  const frame = pick(rng, QUIRK_FRAMES);
  // The "{qbare}/{q2short}" frame wants the bare verb-phrase twice; fall back gracefully.
  return fill(frame, { a: name, q: phrase, qbare: phrase, q2short: 'the herd just lets it' });
}

/**
 * Distinct base line-variations per event type, BEFORE names and personality descriptors are
 * woven in (those multiply friend/odd-couple/rivalry/escapade further). Surfaced so the design
 * doc and play-test notes can cite how long the journal goes before it starts to repeat.
 */
export const HERD_LINE_VARIETY = {
  friend: FRIEND_FRAMES.length * FRIEND_DETAILS.length, // 7 × 8 = 56
  bonded: BOND_FRAMES.length * BOND_DETAILS.length, // 6 × 6 = 36
  rival: RIVAL_FRAMES.length * RIVAL_DETAILS.length, // 6 × 6 = 36
  oddCouple: ODD_FRAMES.length * ODD_DETAILS.length, // 6 × 6 = 36
  fallingOut: FALL_FRAMES.length * FALL_DETAILS.length, // 6 × 6 = 36
  quirk: QUIRK_PHRASES.length * QUIRK_FRAMES.length, // 16 × 5 = 80
  escapade: ESCAPADE_FRAMES.length * ESCAPADE_DETAILS.length, // 6 × 12 = 72
} as const;
