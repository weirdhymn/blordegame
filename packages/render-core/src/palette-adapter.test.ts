import { describe, expect, it } from 'vitest';
import { OFF, resolve, type Genotype } from '@blorse/genetics';
import { buildRenderSpec } from './palette-adapter.js';
import type { BuildSpecOptions } from './types.js';

const spec = (over: Genotype, opts?: BuildSpecOptions) =>
  buildRenderSpec(resolve({ ...OFF, ...over }), opts);

describe('palette adapter (§4.3)', () => {
  it('bay → black points on the bay leg variant', () => {
    const s = spec({ E: 'Ee', A: 'Aa' });
    expect(s.legs?.variant).toBe('bay');
    expect(s.legs?.color).toBe('#1c1a17');
    expect(s.coat).toMatch(/^#[0-9a-f]{6}$/i);
  });

  it('chestnut → no point layer (coat covers the legs)', () => {
    expect(spec({ E: 'ee', A: 'aa' }).legs).toBeNull();
  });

  it('seal brown → seal leg variant', () => {
    expect(spec({ E: 'Ee', A: 'Ata' }).legs?.variant).toBe('seal');
  });

  it('dun (grullo) → dun legs + a dorsal stripe', () => {
    const s = spec({ E: 'Ee', A: 'aa', D: 'Dd' });
    expect(s.legs?.variant).toBe('dun');
    expect(s.shading.dun).not.toBeNull();
  });

  it('gray → desaturated coat, points dropped', () => {
    const s = spec({ E: 'Ee', A: 'aa', G: 'Gg' });
    expect(s.shading.gray).not.toBeNull();
    expect(s.legs).toBeNull();
  });

  it('foal → solid-white silhouette regardless of genotype', () => {
    expect(spec({ E: 'Ee', A: 'Aa' }, { lifeStage: 'foal' }).foalWhite).toBe(true);
  });

  it('inverted glitch flips the coat hex at adulthood', () => {
    const base = spec({ E: 'Ee', A: 'aa' }); // black
    const glitched = spec({ E: 'Ee', A: 'aa' }, { glitch: 'inverted' });
    expect(glitched.coat).not.toBe(base.coat);
    expect(glitched.glitch).toBe('inverted');
  });

  it('a glitched foal still renders white (reveal at adulthood)', () => {
    const s = spec({ E: 'Ee', A: 'aa' }, { lifeStage: 'foal', glitch: 'inverted' });
    expect(s.foalWhite).toBe(true);
    expect(s.glitch).toBe('inverted'); // carried, not yet shown
  });

  it('is deterministic: same input → identical spec', () => {
    const a = spec({ E: 'Ee', A: 'Aa', C: 'CCr' }, { seed: 7 });
    const b = spec({ E: 'Ee', A: 'Aa', C: 'CCr' }, { seed: 7 });
    expect(a).toEqual(b);
  });
});
