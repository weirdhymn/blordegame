/**
 * @blorse/genetics — typed ESM facade over the vendored equine-genetics engine.
 *
 * Same engine, fully typed, identical in Node (server = authority) and Vite
 * (client = preview only). The engine is vendored untouched in ./vendor and
 * wrapped here — never refactored (BLORSE_PLAN.md §5.1, CLAUDE.md golden rules).
 */
import engine from './engine.js';
import type { BreedResult, ColorEntry, Genotype, Phenotype } from './types.js';

/* ────────────────────────────────────────────────────────────────────────────
   Gene drop §7u: Mushroom (`My`, recessive `my`) — the first live-service gene.
   The vendored engine carries it as a DATA entry (inheritance, punnett, written
   genotype, wild rolls) but its LOOK and NAMING live here, in the facade — the
   engine's resolver is never edited for a drop (GENE_DROP_RUNBOOK.md). Expressed
   only on a plain chestnut base (real-world: sepia-taupe over red pigment);
   carried silently everywhere else. Every consumer already imports `resolve`
   from this facade, so the post-pass is universal — server, web, tests alike.
   ──────────────────────────────────────────────────────────────────────────── */

function mushroomExpressed(p: Phenotype): boolean {
  if ((p.genotype.My ?? 'MyMy') !== 'mymy') return false;
  return (
    p.baseKey === 'chestnut' &&
    !p.flags.isGray &&
    !p.flags.isGraying &&
    !p.flags.isWhiteMasked &&
    engine.creamState(p.genotype) === 'none'
  );
}

/** Sepia-taupe shift (§4.3a procedural pass): desaturate hard, lift lightness a
 *  touch, settle the hue on warm gray. Handles either HSL scale the engine uses. */
function sepia(hex: string): string {
  const { s, l } = engine.hexToHsl(hex);
  const pct = l > 1 || s > 1; // 0..100 scale
  const ns = s * 0.35;
  const nl = pct ? l + (100 - l) * 0.22 : l + (1 - l) * 0.22;
  return engine.hslToHex(28, ns, nl);
}

function mushroomize(p: Phenotype): Phenotype {
  if (!mushroomExpressed(p)) return p;
  const displayName = p.displayName.includes('Chestnut')
    ? p.displayName.replace('Chestnut', 'Mushroom')
    : `Mushroom ${p.displayName}`;
  return {
    ...p,
    displayName,
    swatch: sepia(p.swatch),
    modifiers: [...p.modifiers, { name: 'Mushroom', label: 'mushroom', kind: 'dilution' }],
    notes: [...p.notes, 'Mushroom: red pigment dulled to sepia-taupe. The Woods grew it first.'],
  };
}

export function resolve(genotype: Genotype): Phenotype {
  return mushroomize(engine.resolve(genotype));
}

export const punnett = engine.punnett;
export const randomGenotype = engine.randomGenotype;

/**
 * Breed one foal. Exposed with BLORSE's `parentA` / `parentB` naming — pixel
 * horses have no sex (§5.4a); the engine's legacy `sire`/`dam` params are just
 * positional. The disjoint-ancestry gate is enforced in BLORSE's breeding
 * service BEFORE calling this; the foal never inherits a glitch.
 */
export function breedFoal(parentA: Genotype, parentB: Genotype, rand?: () => number): BreedResult {
  const r = engine.breedFoal(parentA, parentB, rand);
  return { ...r, resolved: mushroomize(r.resolved) };
}

export const analyze = engine.analyze;
export const reverseLookup = engine.reverseLookup;
export const carriedAlleles = engine.carriedAlleles;
export const healthFlags = engine.healthFlags;

// The drop reserves its Field Guide slot here (runbook §6): one catalog entry,
// appended facade-side so the engine's own catalog stays untouched.
let mushroomEntry: ColorEntry | null = null;
function theMushroomEntry(): ColorEntry {
  if (!mushroomEntry) {
    mushroomEntry = {
      name: 'Mushroom',
      slug: 'mushroom',
      swatch: sepia(engine.resolve({ E: 'ee' }).swatch),
      genotype: { E: 'ee', My: 'mymy' },
      baseKey: 'chestnut',
    };
  }
  return mushroomEntry;
}

export function enumerateColors(): ColorEntry[] {
  return [...engine.enumerateColors(), theMushroomEntry()];
}
export function colorBySlug(slug: string): ColorEntry | null {
  return slug === 'mushroom' ? theMushroomEntry() : engine.colorBySlug(slug);
}

export const varySwatch = engine.varySwatch;
export const paletteSwatches = engine.paletteSwatches;
export const gradientColorAt = engine.gradientColorAt;

export const parseGenotype = engine.parseGenotype;
export const formatGenotype = engine.formatGenotype;
export const cleanGenotype = engine.cleanGenotype;
export const writtenGenotype = engine.writtenGenotype;

export const withDefaults = engine.withDefaults;
export const defaultGenotype = engine.defaultGenotype;
export const offGenotype = engine.offGenotype;
export const creamState = engine.creamState;
export const slugify = engine.slugify;
export const hexToHsl = engine.hexToHsl;
export const hslToHex = engine.hslToHex;

export const OFF = engine.OFF;
export const LOCI = engine.LOCI;
export const LOCUS_BY_KEY = engine.LOCUS_BY_KEY;
export const DOM_TOKEN = engine.DOM_TOKEN;

/** Escape hatch: the raw engine namespace (for members not surfaced above). */
export { default as rawEngine } from './engine.js';

export type * from './types.js';
