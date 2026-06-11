/**
 * @blorse/render-core — the genetics→art bridge (BLORSE_PLAN.md §4).
 * Pure, framework-agnostic: turns `resolve()` output into a `RenderSpec` a
 * compositor can paint. No PixiJS/Canvas here — only color + shading params.
 */
export * from './types.js';
export { HORSE_MANIFEST } from './manifest.js';
export { buildRenderSpec } from './palette-adapter.js';
export { GLITCH_KINDS, transformHex } from './glitch.js';
export * as paletteMap from './palette-map.js';
