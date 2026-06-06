import { useEffect, useRef, type ReactElement } from 'react';
import type { RenderSpec } from '@blorse/render-core';
import { compositeHorse } from './compositor.js';
import { loadLayerImages, type LayerImages } from './images.js';

const W = 150;
const H = 126;

// The layer bitmaps are identical for every horse — load them once and share the promise
// across all canvases on the page.
let imagesPromise: Promise<LayerImages> | null = null;
function sharedImages(): Promise<LayerImages> {
  imagesPromise ??= loadLayerImages();
  return imagesPromise;
}

/** Render a horse from its RenderSpec onto a crisp, nearest-neighbour canvas. */
export function HorseCanvas({
  spec,
  scale = 2,
}: {
  spec: RenderSpec;
  scale?: number;
}): ReactElement {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    let cancelled = false;
    void sharedImages()
      .then((images) => {
        if (cancelled) return;
        const ctx = ref.current?.getContext('2d');
        if (ctx) compositeHorse(ctx, spec, images, scale);
      })
      .catch((e: unknown) => console.error('layer load failed', e));
    return () => {
      cancelled = true;
    };
  }, [spec, scale]);

  return (
    <canvas
      ref={ref}
      width={W * scale}
      height={H * scale}
      className="horse-canvas"
      aria-label={spec.displayName}
    />
  );
}
