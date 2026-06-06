import { hexToHsl, hslToHex } from '@blorse/genetics';
import type { Phenotype } from '@blorse/genetics';
import { transformHex } from './glitch.js';
import * as PM from './palette-map.js';
import type { BuildSpecOptions, LegSpec, RenderSpec, ShadingSpec } from './types.js';

const isHex = (s: string | null | undefined): s is string =>
  typeof s === 'string' && /^#[0-9a-fA-F]{6}$/.test(s);

/** Which leg variant + point color (null = no point layer; coat covers the legs). */
function legSpec(r: Phenotype): LegSpec | null {
  const pts = (r.traits.points ?? '').toLowerCase();
  const blackPts = /black/.test(pts);

  if (r.traits.primitiveMarkings) {
    // Any dun → the barred dun-leg layer.
    let color: string;
    if (blackPts) {
      color = PM.POINT_BLACK; // bay/seal dun keep black points
    } else {
      const c = hexToHsl(isHex(r.swatch) ? r.swatch : PM.FALLBACK_SWATCH); // red dun / grullo
      color = hslToHex(c.h, c.s, Math.max(12, c.l * 0.5));
    }
    return { variant: 'dun', color };
  }

  let color: string | null = null;
  if (blackPts) color = PM.POINT_BLACK;
  else if (/diluted|not black/.test(pts)) color = PM.POINT_CHOCOLATE;
  else if (/rusty|ivory/.test(pts)) color = PM.POINT_PALE_RUSTY;
  if (!color) return null; // chestnut / palomino / cremello — no dark points

  return { variant: r.baseKey === 'seal_brown' ? 'seal' : 'bay', color };
}

function maneColor(desc: string | null): string | null {
  if (!desc) return null;
  const d = desc.toLowerCase();
  if (/not black|diluted/.test(d)) return PM.MANE_CHOCOLATE;
  if (/black/.test(d)) return PM.MANE_BLACK;
  if (/flax|cream|silver|ivory|gold/.test(d)) return PM.MANE_FLAXEN;
  if (/white/.test(d)) return PM.MANE_WHITE;
  return null; // 'matches body' / 'varies'
}

function hoovesColor(desc: string): string {
  const d = desc.toLowerCase();
  if (/chocolate/.test(d)) return PM.HOOVES_CHOCOLATE;
  if (/light|pale|amber/.test(d)) return PM.HOOVES_LIGHT;
  return PM.HOOVES_DARK; // dark / striped / default
}

/** A grey that keeps the base hue at ~5% saturation and the value of the body color. */
function desatGray(baseHex: string, valueHex: string): string {
  if (!isHex(baseHex)) return isHex(valueHex) ? valueHex : '#b8b4ad';
  const b = hexToHsl(baseHex);
  const v = hexToHsl(isHex(valueHex) ? valueHex : baseHex);
  return hslToHex(b.h, b.s * 0.05, v.l);
}

/**
 * Turn a resolved phenotype into a concrete RenderSpec (per-layer hexes + shading
 * params + glitch). Pure and deterministic: `(phenotype, opts)` → identical spec.
 * Beta scope (BLORSE_PLAN.md §4.5): bases + dilutions + sooty/mealy + dun + roan +
 * gray + foal-white + glitches. White-spotting & leopard are deferred.
 */
export function buildRenderSpec(r: Phenotype, opts: BuildSpecOptions = {}): RenderSpec {
  const seed = opts.seed ?? 0;
  const lifeStage = opts.lifeStage ?? 'adult';
  const glitch = opts.glitch ?? null;
  const isFoal = lifeStage === 'foal';

  const baseHex = isHex(r.swatch) ? r.swatch : PM.FALLBACK_SWATCH;
  const isWhite = r.flags.isWhiteMasked || r.flags.sabinoWhite;
  const isGray = r.flags.isGray || r.flags.isGraying;

  let coat = baseHex;
  let legs = legSpec(r);
  let maneTail = maneColor(r.traits.maneTail) ?? coat;
  const hooves = hoovesColor(r.traits.hooves ?? '');
  const shading: ShadingSpec = { sooty: null, mealy: false, dun: null, roan: false, gray: null };

  if (isWhite) {
    // Dominant white / sabino-white mask everything.
    coat = PM.COAT_WHITE;
    legs = null;
    maneTail = PM.COAT_WHITE;
  } else {
    const bh = hexToHsl(baseHex);
    if ((r.modifiers ?? []).some((m) => m.name === 'Sooty')) {
      shading.sooty = hslToHex(bh.h, Math.min(bh.s, 0.5), Math.max(6, bh.l * 0.26));
    }
    shading.mealy = (r.modifiers ?? []).some((m) => /mealy|pangar/i.test(m.name));
    shading.roan = (r.patterns ?? []).some((p) => p.glyph === 'roan' || /roan/i.test(p.name));

    if (r.traits.primitiveMarkings && legs) {
      const bc = hexToHsl(legs.color);
      shading.dun = { mark: legs.color, bars: hslToHex(bc.h, bc.s, Math.max(5, bc.l * 0.55)) };
    }

    if (isGray) {
      const fill = desatGray(baseHex, baseHex);
      const fhh = hexToHsl(fill);
      shading.gray = {
        stage: 'dapple',
        dappleDark: hslToHex(bh.h, bh.s * 0.22, Math.max(8, fhh.l - 8)),
        dappleLight: hslToHex(bh.h, bh.s * 0.05, Math.min(96, fhh.l + 11)),
        fill,
      };
      // Gray desaturates the whole coat + drops the dark points.
      coat = fill;
      legs = null;
      maneTail = fill;
      shading.sooty = null;
      shading.mealy = false;
    }
  }

  // Glitch (BLORSE_PLAN.md §4.3b): transform the resolved palette — but only at
  // adulthood. A glitched foal still renders white; the glitch is the reveal beat.
  const applyGlitch = glitch !== null && !isFoal;
  if (applyGlitch) {
    coat = transformHex(coat, glitch);
    maneTail = transformHex(maneTail, glitch);
    if (legs) legs = { ...legs, color: transformHex(legs.color, glitch) };
    if (shading.sooty) shading.sooty = transformHex(shading.sooty, glitch);
    if (shading.dun) {
      shading.dun = {
        mark: transformHex(shading.dun.mark, glitch),
        bars: transformHex(shading.dun.bars, glitch),
      };
    }
    if (shading.gray) {
      shading.gray = {
        ...shading.gray,
        dappleDark: transformHex(shading.gray.dappleDark, glitch),
        dappleLight: transformHex(shading.gray.dappleLight, glitch),
        fill: transformHex(shading.gray.fill, glitch),
      };
    }
  }

  return {
    displayName: r.displayName,
    foalWhite: isFoal,
    coat,
    maneTail,
    hooves: applyGlitch ? transformHex(hooves, glitch) : hooves,
    legs,
    mealyMuzzle: shading.mealy,
    shading,
    glitch,
    seed,
  };
}
