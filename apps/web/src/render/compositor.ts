import { paletteMap, type RenderSpec } from '@blorse/render-core';
import type { LayerImages } from './images.js';

const W = 150;
const H = 126;

function makeCanvas(
  w: number,
  h: number,
): { canvas: HTMLCanvasElement; ctx: CanvasRenderingContext2D } {
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('2D canvas context unavailable');
  return { canvas, ctx };
}

function rgba(hex: string, a: number): string {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex);
  if (!m?.[1]) return hex;
  const n = Number.parseInt(m[1], 16);
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${a})`;
}

/** Flat-tint a grayscale layer to an exact color, preserving its alpha silhouette. */
function tintLayer(img: HTMLImageElement, color: string): HTMLCanvasElement {
  const { canvas, ctx } = makeCanvas(W, H);
  ctx.drawImage(img, 0, 0, W, H);
  ctx.globalCompositeOperation = 'source-in';
  ctx.fillStyle = color;
  ctx.fillRect(0, 0, W, H);
  return canvas;
}

// Dapple cluster centers (ported from the prototype, horse-space 150×126).
const GRAY_DARK: ReadonlyArray<readonly [number, number]> = [
  [60, 50],
  [78, 48],
  [96, 50],
  [110, 56],
  [68, 62],
  [88, 62],
  [104, 64],
  [54, 55],
];
const GRAY_LIGHT: ReadonlyArray<readonly [number, number]> = [
  [70, 47],
  [86, 50],
  [100, 56],
  [62, 56],
  [80, 58],
  [96, 61],
  [112, 60],
  [74, 64],
];

/** Procedural shading (§4.3a), rendered then clipped to the coat silhouette. */
function buildShading(spec: RenderSpec, coatImg: HTMLImageElement): HTMLCanvasElement | null {
  const sh = spec.shading;
  if (!sh.sooty && !sh.mealy && !sh.roan && !sh.gray && !sh.dun) return null;
  const { canvas, ctx } = makeCanvas(W, H);

  if (sh.gray) {
    ctx.save();
    ctx.filter = 'blur(3.5px)';
    ctx.fillStyle = rgba(sh.gray.dappleDark, 0.44);
    for (const [cx, cy] of GRAY_DARK) {
      ctx.beginPath();
      ctx.arc(cx, cy, 7.5, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.fillStyle = rgba(sh.gray.dappleLight, 0.4);
    for (const [cx, cy] of GRAY_LIGHT) {
      ctx.beginPath();
      ctx.arc(cx, cy, 7.5, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }
  if (sh.sooty) {
    const g = ctx.createRadialGradient(68, 0, 0, 68, 0, 84);
    g.addColorStop(0, rgba(sh.sooty, 0.55));
    g.addColorStop(0.5, rgba(sh.sooty, 0.3));
    g.addColorStop(1, rgba(sh.sooty, 0));
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);
  }
  if (sh.mealy) {
    const g = ctx.createRadialGradient(80, 98, 0, 80, 98, 56);
    g.addColorStop(0, rgba(paletteMap.MEALY_WASH, 0.62));
    g.addColorStop(0.5, rgba(paletteMap.MEALY_WASH, 0.36));
    g.addColorStop(1, rgba(paletteMap.MEALY_WASH, 0));
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);
  }
  if (sh.roan) {
    const g = ctx.createRadialGradient(82, 55, 0, 82, 55, 70);
    g.addColorStop(0, rgba(paletteMap.ROAN_WASH, 0.52));
    g.addColorStop(0.7, rgba(paletteMap.ROAN_WASH, 0.42));
    g.addColorStop(1, rgba(paletteMap.ROAN_WASH, 0));
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);
  }
  if (sh.dun) {
    ctx.save();
    ctx.filter = 'blur(1.6px)';
    ctx.fillStyle = rgba(sh.dun.mark, 0.85);
    ctx.beginPath();
    ctx.roundRect(52, 30, 84, 5, 2.5); // dorsal stripe along the topline
    ctx.fill();
    ctx.restore();
  }

  ctx.globalCompositeOperation = 'destination-in';
  ctx.drawImage(coatImg, 0, 0, W, H);
  return canvas;
}

function drawDunBars(
  target: CanvasRenderingContext2D,
  legImg: HTMLImageElement,
  color: string,
): void {
  const { canvas, ctx } = makeCanvas(W, H);
  ctx.fillStyle = rgba(color, 0.85);
  for (const lx of [54, 127]) {
    for (const yy of [100, 106, 112]) {
      ctx.beginPath();
      ctx.roundRect(lx - 5, yy, 10, 2, 1);
      ctx.fill();
    }
  }
  ctx.globalCompositeOperation = 'destination-in';
  ctx.drawImage(legImg, 0, 0, W, H);
  target.drawImage(canvas, 0, 0);
}

/** Composite a horse onto `target` at `scale`× (crisp, nearest-neighbour). */
export function compositeHorse(
  target: CanvasRenderingContext2D,
  spec: RenderSpec,
  images: LayerImages,
  scale = 1,
): void {
  const get = (id: string, variant = 'default'): HTMLImageElement | undefined =>
    images.get(`${id}:${variant}`);
  const coat = get('coat');
  const lineArt = get('lineArt');
  const { canvas: work, ctx } = makeCanvas(W, H);

  if (coat) {
    if (spec.foalWhite) {
      ctx.drawImage(tintLayer(coat, paletteMap.COAT_WHITE), 0, 0);
    } else {
      ctx.drawImage(tintLayer(coat, spec.coat), 0, 0);

      const shade = buildShading(spec, coat);
      if (shade) ctx.drawImage(shade, 0, 0);

      const muzzle = get('muzzle');
      if (spec.mealyMuzzle && muzzle) {
        ctx.globalAlpha = 0.44;
        ctx.drawImage(tintLayer(muzzle, paletteMap.MEALY_WASH), 0, 0);
        ctx.globalAlpha = 1;
      }

      if (spec.legs) {
        const legImg = get('legs', spec.legs.variant);
        if (legImg) {
          ctx.drawImage(tintLayer(legImg, spec.legs.color), 0, 0);
          if (spec.shading.dun) drawDunBars(ctx, legImg, spec.shading.dun.bars);
        }
      }

      const hooves = get('hooves');
      if (hooves) ctx.drawImage(tintLayer(hooves, spec.hooves), 0, 0);

      const mane = get('maneTail');
      if (mane) {
        ctx.drawImage(tintLayer(mane, spec.maneTail), 0, 0);
        if (spec.shading.roan) {
          ctx.globalAlpha = 0.18;
          ctx.drawImage(tintLayer(mane, paletteMap.ROAN_WASH), 0, 0);
          ctx.globalAlpha = 1;
        }
      }
    }
  }
  if (lineArt) ctx.drawImage(lineArt, 0, 0, W, H);

  target.imageSmoothingEnabled = false;
  target.clearRect(0, 0, W * scale, H * scale);
  target.drawImage(work, 0, 0, W * scale, H * scale);
}

export interface ExportOpts {
  name?: string;
}

/** Render at 5× and trigger a PNG download (same-origin layers → no canvas taint). */
export function exportHorsePNG(spec: RenderSpec, images: LayerImages, opts: ExportOpts = {}): void {
  const SC = 5;
  const { canvas, ctx } = makeCanvas(W * SC, H * SC);
  compositeHorse(ctx, spec, images, SC);
  canvas.toBlob((blob) => {
    if (!blob) return;
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    const base =
      (opts.name ?? spec.displayName ?? 'horse')
        .replace(/[^\w\- ]+/g, '')
        .trim()
        .replace(/\s+/g, '-') || 'horse';
    a.download = `${base}.png`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1500);
  }, 'image/png');
}
