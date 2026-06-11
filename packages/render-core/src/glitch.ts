import type { GlitchKind } from './types.js';

/**
 * Glitch transforms (BLORSE_PLAN.md §4.3b): non-heritable, render-time color
 * transforms applied per palette hex so they compose with genes + shading.
 *
 * - inverted (shipping): invert each channel (#RRGGBB → #(255−R)(255−G)(255−B))
 * - screen (planned): albinism-like — push toward white
 * - shade (planned): melanism-like — push toward black
 *
 * Non-hex tokens (rare engine descriptors) pass through unchanged.
 */

/** Every implemented glitch, in one runtime list (the type stays the source of truth).
 *  Anything that rolls or offers a glitch — the mint roll, the Debug Shrine — draws from this. */
export const GLITCH_KINDS: readonly GlitchKind[] = ['inverted', 'screen', 'shade'];

const SCREEN_AMOUNT = 0.55;
const SHADE_AMOUNT = 0.55;

function clampByte(n: number): number {
  const r = Math.round(n);
  return r < 0 ? 0 : r > 255 ? 255 : r;
}

function parseHex(hex: string): [number, number, number] | null {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (!m?.[1]) return null;
  const n = Number.parseInt(m[1], 16);
  return [(n >> 16) & 0xff, (n >> 8) & 0xff, n & 0xff];
}

function toHex(r: number, g: number, b: number): string {
  return '#' + [r, g, b].map((c) => clampByte(c).toString(16).padStart(2, '0')).join('');
}

export function transformHex(hex: string, glitch: GlitchKind): string {
  const rgb = parseHex(hex);
  if (!rgb) return hex;
  const [r, g, b] = rgb;
  switch (glitch) {
    case 'inverted':
      return toHex(255 - r, 255 - g, 255 - b);
    case 'screen':
      return toHex(
        r + (255 - r) * SCREEN_AMOUNT,
        g + (255 - g) * SCREEN_AMOUNT,
        b + (255 - b) * SCREEN_AMOUNT,
      );
    case 'shade':
      return toHex(r * (1 - SHADE_AMOUNT), g * (1 - SHADE_AMOUNT), b * (1 - SHADE_AMOUNT));
  }
}
