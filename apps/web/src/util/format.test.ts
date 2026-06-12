import { describe, expect, it } from 'vitest';
import { formatCubes, pretty } from './format.js';

describe('formatCubes (§7n Proper Change)', () => {
  it('splits copper-equivalent into the three metals', () => {
    expect(formatCubes(1_275)).toBe('12s 75c');
    expect(formatCubes(23_450)).toBe('2g 34s 50c');
    expect(formatCubes(10_000)).toBe('1g');
  });
  it('keeps small purses plain and zero honest', () => {
    expect(formatCubes(99)).toBe('99c');
    expect(formatCubes(0)).toBe('0c');
    expect(formatCubes(-5)).toBe('0c'); // defensive — balances never go negative (§11)
  });
});

describe('pretty', () => {
  it('title-cases dashed ids (accomplishment chips ride this)', () => {
    expect(pretty('skilled-reading')).toBe('Skilled Reading');
  });
});
