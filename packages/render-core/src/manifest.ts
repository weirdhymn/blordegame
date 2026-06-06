import type { LayerManifest } from './types.js';

/**
 * The runtime layer set: 9 uniform 150×126 PNGs (BLORSE_PLAN.md §4.1), composited
 * bottom→top by `z`. Data-driven so live-service gene drops register overlays here
 * without renderer changes (§5.6). `colorRole: 'none'` layers are not tinted
 * (line-art stays black). `face` markings are deferred (white-spotting, §4.5).
 */
export const HORSE_MANIFEST: LayerManifest = {
  canvas: { width: 150, height: 126 },
  assetBase: '/assets/horse/',
  layers: [
    { id: 'coat', z: 0, colorRole: 'coat', variants: { default: 'coat.png' } },
    { id: 'muzzle', z: 15, colorRole: 'muzzle', variants: { default: 'muzzle.png' } },
    {
      id: 'legs',
      z: 20,
      colorRole: 'points',
      selector: 'legVariant',
      variants: { bay: 'legs-bay.png', seal: 'legs-seal.png', dun: 'legs-dun.png' },
    },
    { id: 'hooves', z: 30, colorRole: 'hooves', variants: { default: 'hooves.png' } },
    { id: 'maneTail', z: 40, colorRole: 'maneTail', variants: { default: 'mane-tail.png' } },
    { id: 'face', z: 50, colorRole: 'none', variants: { default: 'face.png' } },
    { id: 'lineArt', z: 100, colorRole: 'none', variants: { default: 'line-art.png' } },
  ],
};
