import type { StatKey } from '@blorse/balance';

/**
 * Daily region omens (§7/§9.3) — the world's weather report, one per region per game day.
 * Cozy: an omen is a BUFF (a stat's checks come easier, or foragers find a little extra) or pure
 * flavor — never a penalty. Voice bar: sensory first, one dry line, fond not grim.
 */
export interface Omen {
  id: string;
  name: string;
  /** The voice line shown on Venture Out — the day's sky, in a sentence or two. */
  text: string;
  /** Checks of this stat in this region get OMEN_CHECK_BONUS off the DC today. */
  stat?: StatKey;
  /** Each daily-gather horse brings home OMEN_GATHER_BONUS_QTY extra of this item today. */
  bonusItem?: string;
}

const GREEN_GRASS_OMENS: Omen[] = [
  {
    id: 'gg-low-mist',
    name: 'Low Mist',
    text: 'The meadows wake under a quilt of mist, and the whole world holds its breath to listen. Quiet thoughts carry far today.',
    stat: 'wis',
  },
  {
    id: 'gg-skylark-morning',
    name: 'Skylark Morning',
    text: 'A skylark has been up since four singing its entire heart out, and everyone’s mood is helplessly improved.',
    stat: 'cha',
  },
  {
    id: 'gg-firm-going',
    name: 'Firm Going',
    text: 'Last week’s rain has packed the turf springy and true. Today the ground does half the lifting for you.',
    stat: 'str',
  },
  {
    id: 'gg-foragers-moon',
    name: 'Forager’s Moon',
    text: 'Last night’s moon rose fat and green-tinged, and every hedgerow took it personally. The fens are showing off.',
    bonusItem: 'marsh-sage',
  },
  {
    id: 'gg-east-wind',
    name: 'An East Wind',
    text: 'The wind is out of the east. The old horses say it means something. The old horses will not say what.',
  },
];

const DUSTY_DUNES_OMENS: Omen[] = [
  {
    id: 'dd-high-glare',
    name: 'High Glare',
    text: 'The sky is one white sheet of glare, and the desert respects nothing today except simply continuing to walk.',
    stat: 'con',
  },
  {
    id: 'dd-still-air',
    name: 'Still Air',
    text: 'Not one grain of sand is moving. Sure feet make no sound at all in weather like this.',
    stat: 'dex',
  },
  {
    id: 'dd-singing-dunes',
    name: 'Singing Dunes',
    text: 'The big dunes are humming their one low note, and everything out here is a little friendlier for the accompaniment.',
    stat: 'cha',
  },
  {
    id: 'dd-glint-day',
    name: 'Glint Day',
    text: 'The dawn light is striking the slopes at exactly the wrong angle for secrets — every buried seam is glittering.',
    bonusItem: 'ore',
  },
  {
    id: 'dd-red-sun',
    name: 'A Red Sun',
    text: 'The sun came up red as a brick. Magnificent, ominous, and — as far as anyone has ever established — entirely decorative.',
  },
];

const WEIRD_WOODS_OMENS: Omen[] = [
  {
    id: 'ww-thin-mist',
    name: 'Thin Mist',
    text: 'The mist is thin enough to see what things actually are, which in these woods is a rare professional courtesy.',
    stat: 'int',
  },
  {
    id: 'ww-friendly-shadows',
    name: 'Friendly Shadows',
    text: 'The shadows are all pointing the right way for once. Almost helpfully. Almost.',
    stat: 'wis',
  },
  {
    id: 'ww-soft-moss',
    name: 'Soft Moss',
    text: 'Overnight, every root and stone grew a fresh cushion of moss. The woods appear to have baby-proofed themselves.',
    stat: 'dex',
  },
  {
    id: 'ww-lantern-weather',
    name: 'Lantern Weather',
    text: 'The lantern-flies are out at noon, drowsy and bright, perched on every good piece of deadfall like tiny helpful signposts.',
    bonusItem: 'timber',
  },
  {
    id: 'ww-woods-humming',
    name: 'The Woods Are Humming',
    text: 'The whole forest is humming a tune nobody taught it. It is not a warning. It is probably not a warning.',
  },
];

export const OMENS_BY_REGION = new Map<string, Omen[]>([
  ['green-grass', GREEN_GRASS_OMENS],
  ['dusty-dunes', DUSTY_DUNES_OMENS],
  ['weird-woods', WEIRD_WOODS_OMENS],
]);
