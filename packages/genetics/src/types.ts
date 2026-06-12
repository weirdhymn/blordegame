/**
 * Typed surface for the vendored equine-genetics engine.
 *
 * These mirror the engine's runtime shapes (see vendor/genetics.js `resolve`,
 * `breedFoal`, `punnett`, `randomGenotype`). Where the engine returns rich
 * internal structures BLORSE doesn't yet consume (analyze / reverseLookup /
 * carriedAlleles / healthFlags), the type is intentionally loose and will be
 * tightened as later phases use them.
 */

/** The loci, canonical display order (BLORSE_PLAN.md §5.2). `My` (Mushroom) is the first
 *  live-service gene drop (§7u) — recessive sepia dilution, expressed on chestnut. */
export type LocusKey =
  | 'W'
  | 'G'
  | 'E'
  | 'A'
  | 'C'
  | 'Ch'
  | 'D'
  | 'Z'
  | 'My'
  | 'F'
  | 'Pg'
  | 'Sty'
  | 'Rn'
  | 'Rb'
  | 'T'
  | 'Sb'
  | 'O'
  | 'SW1'
  | 'Lp'
  | 'PATN1'
  | 'PATN2';

export type BaseKey = 'chestnut' | 'bay' | 'seal_brown' | 'black';

/**
 * A genotype: per-locus two-allele strings, e.g. `{ E: 'Ee', A: 'Aa', C: 'CCr' }`.
 * Partial is valid everywhere — `withDefaults` fills omitted loci from the
 * all-recessive `OFF` baseline. This object is what BLORSE stores per horse.
 */
export type Genotype = Partial<Record<LocusKey, string>>;

/** A fully-specified genotype (every locus present), as returned by `withDefaults`. */
export type FullGenotype = Record<LocusKey, string>;

/**
 * Per-region rarity bias passed to `randomGenotype`: per-locus allele-frequency
 * maps that merge over the engine's default `rollFrequencies` (BLORSE_PLAN.md §5.5, §14.7).
 * e.g. `{ D: { D: 0.3, d: 0.7 }, C: { Cr: 0.12, C: 0.88 } }`.
 */
export type FreqOverride = Partial<Record<LocusKey, Record<string, number>>>;

export interface PhenotypeFlags {
  isLethal: boolean;
  lethalReason: string | null;
  isGray: boolean;
  isGraying: boolean;
  isWhiteMasked: boolean;
  isLeopard: boolean;
  hasRoan: boolean;
  sabinoWhite: boolean;
}

export interface PhenotypeTraits {
  eyes: string;
  skin: string;
  hooves: string;
  sclera: string;
  maneTail: string;
  points: string | null;
  primitiveMarkings: string | null;
}

/** One step in the "show your work" audit trail of gene name transforms. */
export interface LayerEntry {
  gene: string;
  from: string | null;
  to: string;
  kind?: string;
}

export interface PatternEntry {
  name: string;
  kind?: string;
  glyph?: string;
  desc?: string;
}

export interface ModifierEntry {
  name: string;
  label?: string;
  kind?: string;
  uncertain?: boolean;
}

/** The phenotype object the renderer / UI read (BLORSE_PLAN.md §5.4). */
export interface Phenotype {
  genotype: FullGenotype;
  displayName: string;
  underlyingName: string;
  baseKey: BaseKey | null;
  baseName: string | null;
  /** Hex — the single body color. */
  swatch: string;
  /** Hex — the color under any gray/white mask ("show your work"; not for aging). */
  underlyingSwatch: string;
  layers: LayerEntry[];
  patterns: PatternEntry[];
  modifiers: ModifierEntry[];
  notes: string[];
  traits: PhenotypeTraits;
  flags: PhenotypeFlags;
  written: string;
}

/** One foal from `breedFoal`. The ancestry gate lives in BLORSE, not here (§5.4a). */
export interface BreedResult {
  genotype: FullGenotype;
  resolved: Phenotype;
  viable: boolean;
  lethalReason: string | null;
}

export interface PunnettGenotypeShare {
  geno: string;
  p: number;
  pLive: number;
}

export interface PunnettColor {
  name: string;
  swatch: string;
  baseKey: BaseKey | null;
  p: number;
  pLive: number;
  genotypes: PunnettGenotypeShare[];
}

export interface PunnettCarrier {
  id: string;
  label: string;
  p: number;
  pLive: number;
}

export interface PunnettResult {
  distribution: PunnettColor[];
  carriers: PunnettCarrier[];
  lethalFraction: number;
  lethalReasons: Record<string, number>;
  liveTotal: number;
  method: 'exact' | 'factored' | 'monte-carlo';
  approximate: boolean;
  projected: number;
  sampleSize?: number;
}

export interface PunnettOpts {
  cap?: number;
  sampleSize?: number;
  crossCap?: number;
  force?: 'exact' | 'monte-carlo';
}

export interface ParseResult {
  genotype: Genotype;
  warnings: string[];
  ok: boolean;
}

/** A color-catalog entry (drives the Field Guide). Loosely typed for now. */
export interface ColorEntry {
  name: string;
  slug: string;
  swatch: string;
  genotype: Genotype;
  baseKey?: BaseKey;
  [k: string]: unknown;
}

export interface Locus {
  key: LocusKey;
  name?: string;
  alleles?: string[];
  genotypes?: string[];
  [k: string]: unknown;
}

export interface Hsl {
  h: number;
  s: number;
  l: number;
}

/**
 * The shape of the engine's global namespace (`window.HorseGenetics`).
 * Only the members BLORSE re-exports are typed; the engine exposes more.
 */
export interface RawEngine {
  resolve(genotype: Genotype): Phenotype;
  breedFoal(parentA: Genotype, parentB: Genotype, rand?: () => number): BreedResult;
  punnett(parentA: Genotype, parentB: Genotype, opts?: PunnettOpts): PunnettResult;
  randomGenotype(freqOverride?: FreqOverride): FullGenotype;
  analyze(genotype: Genotype): unknown;
  reverseLookup(genotype: Genotype, opts?: Record<string, unknown>): unknown;
  carriedAlleles(genotype: Genotype): unknown;
  healthFlags(genotype: Genotype): unknown;
  enumerateColors(): ColorEntry[];
  colorBySlug(slug: string): ColorEntry | null;
  varySwatch(resolved: Phenotype, seed: number): string;
  paletteSwatches(resolved: Phenotype, n?: number): string[];
  gradientColorAt(resolved: Phenotype, t: number): string;
  parseGenotype(input: string): ParseResult;
  formatGenotype(genotype: Genotype): string;
  cleanGenotype(genotype: Genotype): Genotype;
  writtenGenotype(genotype: Genotype): string;
  withDefaults(genotype: Genotype): FullGenotype;
  defaultGenotype(): FullGenotype;
  offGenotype(): FullGenotype;
  creamState(genotype: Genotype): string;
  slugify(s: string): string;
  hexToHsl(hex: string): Hsl;
  hslToHex(h: number, s: number, l: number): string;
  OFF: FullGenotype;
  LOCI: Locus[];
  LOCUS_BY_KEY: Record<string, Locus>;
  DOM_TOKEN: Record<string, string>;
}
