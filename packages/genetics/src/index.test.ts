import { describe, expect, it } from 'vitest';
import {
  breedFoal,
  colorBySlug,
  enumerateColors,
  formatGenotype,
  OFF,
  parseGenotype,
  randomGenotype,
  rawEngine,
  resolve,
} from './index.js';

// Facade smoke tests — these exercise the SAME engine the 340-test node suite
// covers, but through the typed ESM facade under Vite/Vitest. Their job is to
// prove the facade loads and behaves identically in a bundler context (the
// "identical in both Node and Vite" acceptance check, BLORSE_PLAN.md §11 Phase 1).

describe('@blorse/genetics facade', () => {
  it('resolves a known base color (Ee Aa -> Bay)', () => {
    const r = resolve({ ...OFF, E: 'Ee', A: 'Aa' });
    expect(r.displayName).toBe('Bay');
    expect(r.baseKey).toBe('bay');
    expect(r.swatch).toMatch(/^#[0-9a-fA-F]{6}$/);
  });

  it('flags the WW dominant-white cross as non-viable', () => {
    const r = resolve({ ...OFF, W: 'WW' });
    expect(r.flags.isLethal).toBe(true);
    expect(r.flags.lethalReason).toBeTruthy();
  });

  it('breeds deterministically given an injected rand', () => {
    const a: typeof OFF = { ...OFF, E: 'Ee', A: 'Aa' };
    const b: typeof OFF = { ...OFF, E: 'ee', A: 'aa' };
    const rand = () => 0.5;
    const f1 = breedFoal(a, b, rand);
    const f2 = breedFoal(a, b, rand);
    expect(formatGenotype(f1.genotype)).toBe(formatGenotype(f2.genotype));
    expect(f1.viable).toBe(true);
  });

  it('round-trips genotype strings losslessly', () => {
    const g = { ...OFF, E: 'Ee', A: 'Aa', C: 'CCr' };
    const parsed = parseGenotype(formatGenotype(g));
    expect(parsed.ok).toBe(true);
    expect(resolve(parsed.genotype).displayName).toBe(resolve(g).displayName);
  });

  it('randomGenotype fills all 21 loci and respects a base-forcing freqOverride', () => {
    const g = randomGenotype({ E: { E: 1 }, A: { a: 1 } });
    expect(Object.keys(g)).toHaveLength(21); // 20 + the §7u Mushroom drop
    // E forced homozygous extension + A homozygous recessive => black base,
    // regardless of whatever dilutions/masks the other (random) loci add.
    expect(resolve(g).baseKey).toBe('black');
  });
});

// ── Gene drop §7u: Mushroom — the facade owns the look; the engine owns inheritance ──
describe('Mushroom (the §7u gene drop)', () => {
  it('expresses on a plain chestnut: name, sepia swatch, modifier', () => {
    const plain = rawEngine.resolve({ ...OFF, E: 'ee' });
    const shroom = resolve({ ...OFF, E: 'ee', My: 'mymy' });
    expect(shroom.displayName).toBe('Mushroom');
    expect(shroom.swatch).toMatch(/^#[0-9a-fA-F]{6}$/);
    expect(shroom.swatch).not.toBe(plain.swatch);
    expect(shroom.modifiers.some((m) => m.name === 'Mushroom')).toBe(true);
  });

  it('is carried silently on black-based coats and under masks', () => {
    const bay = resolve({ ...OFF, E: 'Ee', A: 'Aa', My: 'mymy' });
    expect(bay.displayName).toBe('Bay');
    expect(bay.modifiers.some((m) => m.name === 'Mushroom')).toBe(false);
    const gray = resolve({ ...OFF, E: 'ee', My: 'mymy', G: 'Gg' });
    expect(gray.modifiers.some((m) => m.name === 'Mushroom')).toBe(false);
  });

  it('a single copy changes nothing (recessive)', () => {
    const carrier = resolve({ ...OFF, E: 'ee', My: 'Mymy' });
    const plain = resolve({ ...OFF, E: 'ee' });
    expect(carrier.displayName).toBe(plain.displayName);
    expect(carrier.swatch).toBe(plain.swatch);
  });

  it('legacy genotypes (no My key) resolve EXACTLY as the raw engine does — pixel parity', () => {
    const legacy = { E: 'Ee', A: 'Aa', C: 'CCr' };
    const viaFacade = resolve(legacy);
    const viaEngine = rawEngine.resolve(legacy);
    expect(viaFacade.displayName).toBe(viaEngine.displayName);
    expect(viaFacade.swatch).toBe(viaEngine.swatch);
    expect(viaFacade.genotype).toEqual(viaEngine.genotype);
  });

  it('two carriers can breed a mushroom foal; legacy × carrier never crashes', () => {
    const carrier = { ...OFF, E: 'ee', My: 'Mymy' };
    let sawMushroom = false;
    for (let s = 1; s <= 64 && !sawMushroom; s++) {
      let x = s;
      const rand = () => {
        x = (x * 16807) % 2147483647;
        return x / 2147483647;
      };
      const foal = breedFoal(carrier, carrier, rand);
      if (foal.genotype.My === 'mymy') sawMushroom = true;
    }
    expect(sawMushroom).toBe(true);
    // A legacy parent without the locus breeds fine (OFF supplies MyMy).
    const legacyFoal = breedFoal({ E: 'Ee' }, carrier, () => 0.5);
    expect(legacyFoal.genotype.My).toBeTruthy();
  });

  it('reserves its Field Guide slot: catalog gains exactly one entry', () => {
    expect(enumerateColors().length).toBe(rawEngine.enumerateColors().length + 1);
    expect(colorBySlug('mushroom')?.name).toBe('Mushroom');
    expect(colorBySlug('bay')).toBeTruthy();
  });
});
