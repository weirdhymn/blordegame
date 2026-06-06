import { describe, expect, it } from 'vitest';
import { breedFoal, formatGenotype, OFF, parseGenotype, randomGenotype, resolve } from './index.js';

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

  it('randomGenotype fills all 20 loci and respects a base-forcing freqOverride', () => {
    const g = randomGenotype({ E: { E: 1 }, A: { a: 1 } });
    expect(Object.keys(g)).toHaveLength(20);
    // E forced homozygous extension + A homozygous recessive => black base,
    // regardless of whatever dilutions/masks the other (random) loci add.
    expect(resolve(g).baseKey).toBe('black');
  });
});
