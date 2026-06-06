/**
 * render-core types — the framework-agnostic genetics→art bridge (BLORSE_PLAN.md §4).
 *
 * `buildRenderSpec(phenotype)` turns the engine's descriptive `resolve()` output
 * into a concrete `RenderSpec` (per-layer hex colors + shading params + glitch).
 * A rendering backend (Canvas 2D today; PixiJS possible later) consumes the spec
 * and the manifest to composite pixels — it knows geometry, render-core knows color.
 */

/** Non-heritable render-time mutations (BLORSE_PLAN.md §4.3b, §5.7). */
export type GlitchKind = 'inverted' | 'screen' | 'shade';

export type LegVariant = 'bay' | 'seal' | 'dun';
export type LifeStage = 'foal' | 'adult';
export type ColorRole = 'coat' | 'points' | 'hooves' | 'maneTail' | 'muzzle' | 'none';

/** Which lower-leg variant to draw and the hex to tint its points (null = no points). */
export interface LegSpec {
  variant: LegVariant;
  color: string;
}

export interface GraySpec {
  stage: string;
  dappleDark: string;
  dappleLight: string;
  fill: string;
}

export interface DunSpec {
  /** Dorsal-stripe color. */
  mark: string;
  /** Leg-bar color. */
  bars: string;
}

/** Procedural shading params (BLORSE_PLAN.md §4.3a) — gradients/passes, not art layers. */
export interface ShadingSpec {
  /** Sooty topline-darkening color, or null. */
  sooty: string | null;
  /** Pangaré/mealy belly-lightening pass. */
  mealy: boolean;
  /** Dun dorsal stripe + leg bars, or null. */
  dun: DunSpec | null;
  /** Roan white-intermix pass (sparing head/legs). */
  roan: boolean;
  /** Gray dapples + desaturated fill, or null. */
  gray: GraySpec | null;
}

/** Everything a backend needs to composite one horse at one life stage. */
export interface RenderSpec {
  displayName: string;
  /** Foal & not dominant-white → render a solid-white silhouette (BLORSE_PLAN.md §4.2). */
  foalWhite: boolean;
  coat: string;
  maneTail: string;
  hooves: string;
  legs: LegSpec | null;
  mealyMuzzle: boolean;
  shading: ShadingSpec;
  glitch: GlitchKind | null;
  seed: number;
}

export interface BuildSpecOptions {
  /** Per-individual seed for color jitter (BLORSE_PLAN.md §4.3). */
  seed?: number;
  lifeStage?: LifeStage;
  glitch?: GlitchKind | null;
}

export interface ManifestLayer {
  id: string;
  /** Explicit z-index (deliberate, not filename order). */
  z: number;
  colorRole: ColorRole;
  /** Which genotype-derived value picks the variant (only `legs` uses one). */
  selector?: 'legVariant';
  /** Variant key → PNG path (relative to `assetBase`). Single-variant layers use `default`. */
  variants: Record<string, string>;
}

export interface LayerManifest {
  canvas: { width: number; height: number };
  assetBase: string;
  layers: ManifestLayer[];
}
