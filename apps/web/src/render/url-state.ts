import { formatGenotype, parseGenotype, type Genotype } from '@blorse/genetics';
import type { GlitchKind, LifeStage } from '@blorse/render-core';

/** The full, shareable description of one rendered horse (BLORSE_PLAN.md §4.3 "Copy link"). */
export interface HorseState {
  genotype: Genotype;
  seed: number;
  glitch: GlitchKind | null;
  lifeStage: LifeStage;
}

const GLITCHES: readonly GlitchKind[] = ['inverted', 'screen', 'shade'];

export function encodeState(s: HorseState): string {
  const p = new URLSearchParams();
  p.set('g', formatGenotype(s.genotype));
  p.set('s', String(s.seed));
  if (s.glitch) p.set('x', s.glitch);
  if (s.lifeStage === 'foal') p.set('l', 'foal');
  return p.toString();
}

export function decodeState(hash: string): HorseState | null {
  const p = new URLSearchParams(hash.replace(/^#/, ''));
  const g = p.get('g');
  if (!g) return null;
  const x = p.get('x');
  return {
    genotype: parseGenotype(g).genotype,
    seed: Number.parseInt(p.get('s') ?? '0', 10) || 0,
    glitch: x && GLITCHES.includes(x as GlitchKind) ? (x as GlitchKind) : null,
    lifeStage: p.get('l') === 'foal' ? 'foal' : 'adult',
  };
}
