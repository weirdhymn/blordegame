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

/** Render a horse from its RenderSpec onto a crisp, nearest-neighbour canvas. Sprites are capped to
 *  the native 150×126 at INTEGER scale only (1×, 2×, 3× …) — the bitmap is composited at `s×` with
 *  smoothing off, and the CSS display size is locked to the bitmap size, so the browser never
 *  fractionally rescales (which is what blurred upscaled pixel art). */
export function HorseCanvas({
  spec,
  scale = 2,
}: {
  spec: RenderSpec;
  scale?: number;
}): ReactElement {
  const s = Math.max(1, Math.round(scale)); // integer multiples of native only — never fractional
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    let cancelled = false;
    void sharedImages()
      .then((images) => {
        if (cancelled) return;
        const ctx = ref.current?.getContext('2d');
        if (ctx) compositeHorse(ctx, spec, images, s);
      })
      .catch((e: unknown) => console.error('layer load failed', e));
    return () => {
      cancelled = true;
    };
  }, [spec, s]);

  return (
    <canvas
      ref={ref}
      width={W * s}
      height={H * s}
      style={{ width: `${W * s}px`, height: `${H * s}px` }}
      className="horse-canvas"
      aria-label={spec.displayName}
    />
  );
}
