/**
 * @blorse/genetics — typed ESM facade over the vendored equine-genetics engine.
 *
 * Same engine, fully typed, identical in Node (server = authority) and Vite
 * (client = preview only). The engine is vendored untouched in ./vendor and
 * wrapped here — never refactored (BLORSE_PLAN.md §5.1, CLAUDE.md golden rules).
 */
import engine from './engine.js';
import type { BreedResult, Genotype } from './types.js';

export const resolve = engine.resolve;
export const punnett = engine.punnett;
export const randomGenotype = engine.randomGenotype;

/**
 * Breed one foal. Exposed with BLORSE's `parentA` / `parentB` naming — pixel
 * horses have no sex (§5.4a); the engine's legacy `sire`/`dam` params are just
 * positional. The disjoint-ancestry gate is enforced in BLORSE's breeding
 * service BEFORE calling this; the foal never inherits a glitch.
 */
export function breedFoal(parentA: Genotype, parentB: Genotype, rand?: () => number): BreedResult {
  return engine.breedFoal(parentA, parentB, rand);
}

export const analyze = engine.analyze;
export const reverseLookup = engine.reverseLookup;
export const carriedAlleles = engine.carriedAlleles;
export const healthFlags = engine.healthFlags;

export const enumerateColors = engine.enumerateColors;
export const colorBySlug = engine.colorBySlug;

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
