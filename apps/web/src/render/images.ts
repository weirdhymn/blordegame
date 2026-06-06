import { HORSE_MANIFEST } from '@blorse/render-core';

/** Loaded layer bitmaps, keyed `"<layerId>:<variant>"` (e.g. `"legs:dun"`). */
export type LayerImages = Map<string, HTMLImageElement>;

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error(`failed to load layer image: ${src}`));
    img.src = src;
  });
}

/** Preload every manifest layer variant once (PNGs served same-origin from /public). */
export async function loadLayerImages(): Promise<LayerImages> {
  const map: LayerImages = new Map();
  await Promise.all(
    HORSE_MANIFEST.layers.flatMap((layer) =>
      Object.entries(layer.variants).map(async ([variant, path]) => {
        const img = await loadImage(HORSE_MANIFEST.assetBase + path);
        map.set(`${layer.id}:${variant}`, img);
      }),
    ),
  );
  return map;
}
