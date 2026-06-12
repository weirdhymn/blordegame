import type { Phenotype } from '@blorse/genetics';

/**
 * The Studbook (§7m) — the Registrar's standing breeding goals. A fixed ladder, not a
 * rotation: no timers, no FOMO, complete at your own pace (cozy-first). Each goal is
 * fulfilled ONCE per herd, by a foal of your own breeding (`origin === 'bred'`) at the
 * moment its coat reveals (foal → adult). Every goal is reachable with the beta loci
 * the three regions actually roll (bases, cream/pearl, dun, champagne, sooty, roan,
 * gray); deferred white-spotting/leopard loci appear in no goal.
 */
export interface StudbookGoal {
  id: string;
  /** 1 Novice · 2 Journeyman · 3 Master — reward = STUDBOOK_TIER_CUBES[tier]. */
  tier: 1 | 2 | 3;
  title: string;
  /** The Registrar's dry one-liner — doubles as the requirement, in plain words. */
  flavor: string;
  test: (p: Phenotype) => boolean;
}

/** Count a multi-char allele token in a locus genotype string (e.g. 'Cr' in 'CrCr' → 2). */
const tokens = (geno: string | undefined, token: string): number =>
  geno ? (geno.match(new RegExp(token, 'g'))?.length ?? 0) : 0;
/** Count a single-char dominant allele by exact case (e.g. 'D' in 'Dd' → 1). */
const chars = (geno: string | undefined, ch: string): number =>
  geno ? geno.split('').filter((c) => c === ch).length : 0;

const cream = (p: Phenotype): number => tokens(p.genotype.C, 'Cr');
const pearl = (p: Phenotype): number => tokens(p.genotype.C, 'prl');
const dun = (p: Phenotype): number => chars(p.genotype.D, 'D');
const champagne = (p: Phenotype): number => tokens(p.genotype.Ch, 'Ch');
const sooty = (p: Phenotype): number => tokens(p.genotype.Sty, 'Sty');
const gray = (p: Phenotype): boolean => p.flags.isGray || p.flags.isGraying;
/** The §7u drop: mushroom expressed = mymy on a chestnut base (the facade names it). */
const mushroom = (p: Phenotype): boolean =>
  (p.genotype.My ?? 'MyMy') === 'mymy' && p.baseKey === 'chestnut';
/** Undiluted: the base color showing as itself — no cream/pearl/dun/champagne/mushroom,
 *  not graying. (Sooty/mealy still count: a smudged bay is still, to the Registrar, a bay.)
 *  The Novice page asks for the base itself, so a Dunalino is not "a chestnut". */
const plain = (p: Phenotype): boolean =>
  cream(p) === 0 &&
  pearl(p) === 0 &&
  dun(p) === 0 &&
  champagne(p) === 0 &&
  !gray(p) &&
  !mushroom(p);

export const STUDBOOK_GOALS: StudbookGoal[] = [
  // ── Page one: Novice (the Registrar teaches the loop) ──
  {
    id: 'open-the-book',
    tier: 1,
    title: 'Open the Book',
    flavor: 'Every line starts somewhere. Any foal of your own breeding, revealed.',
    test: () => true,
  },
  {
    id: 'the-classic',
    tier: 1,
    title: 'The Classic',
    flavor: 'A plain bay. The Registrar has seen ten thousand and would like one more.',
    test: (p) => p.baseKey === 'bay' && plain(p),
  },
  {
    id: 'ink-dark',
    tier: 1,
    title: 'Ink-Dark',
    flavor: "An honest black coat, dark as the ledger's own ink.",
    test: (p) => p.baseKey === 'black' && plain(p),
  },
  {
    id: 'copper-penny',
    tier: 1,
    title: 'A Copper Penny',
    flavor: 'A true chestnut, bright as a coin left in the sun.',
    test: (p) => p.baseKey === 'chestnut' && plain(p),
  },
  // ── Page two: Journeyman (one deliberate gene) ──
  {
    id: 'touched-by-gold',
    tier: 2,
    title: 'Touched by Gold',
    flavor: 'One cream gene, worn lightly — a palomino, buckskin, or smoky black.',
    test: (p) => cream(p) === 1 && pearl(p) === 0,
  },
  {
    id: 'wearing-the-stripe',
    tier: 2,
    title: 'Wearing the Stripe',
    flavor: 'A dun, dorsal stripe and all. The desert sends its regards.',
    test: (p) => dun(p) >= 1,
  },
  {
    id: 'frosted',
    tier: 2,
    title: 'Frosted',
    flavor: 'A roan — white hairs salted clean through the coat.',
    test: (p) => p.flags.hasRoan,
  },
  {
    id: 'smudged',
    tier: 2,
    title: 'Smudged',
    flavor: 'A sooty coat. The Registrar does not ask where the soot came from.',
    test: (p) => sooty(p) >= 1,
  },
  {
    id: 'bubbles',
    tier: 2,
    title: 'Bubbles',
    flavor: 'A champagne. The Registrar will note it down without comment.',
    test: (p) => champagne(p) >= 1,
  },
  // ── Page three: Master (the combinations breeding exists for) ──
  {
    id: 'the-pale-page',
    tier: 3,
    title: 'The Pale Page',
    flavor: 'Two cream genes — cremello, perlino, or smoky cream. Pale as an unwritten page.',
    test: (p) => cream(p) === 2,
  },
  {
    id: 'stripe-on-gold',
    tier: 3,
    title: 'Stripe on Gold',
    flavor: "Dun over cream. Two regions' worth of weather on one horse.",
    test: (p) => dun(p) >= 1 && cream(p) >= 1,
  },
  {
    id: 'born-to-fade',
    tier: 3,
    title: 'Born to Fade',
    flavor: 'A gray — born to a coat it will not keep.',
    test: (p) => gray(p),
  },
  {
    id: 'hidden-gem',
    tier: 3,
    title: 'The Hidden Gem',
    flavor: "A pearl, expressed — the gene that hides until one day it doesn't.",
    test: (p) => pearl(p) === 2 || (pearl(p) === 1 && cream(p) >= 1),
  },
  {
    id: 'something-new',
    tier: 3,
    title: 'Something New',
    flavor: 'A mushroom coat — the Woods grew it first; now your line does.',
    test: mushroom,
  },
];

export const STUDBOOK_GOAL_BY_ID = new Map(STUDBOOK_GOALS.map((g) => [g.id, g]));
