import { describe, expect, it } from 'vitest';
import type { Relationship } from '../api/social.js';
import { bondBadge, companionsOf, dailyVignette } from './herdmates.js';

const rel = (
  horseA: string,
  horseB: string,
  type: string | null,
  affinity: number,
): Relationship => ({ id: `${horseA}-${horseB}`, horseA, horseB, affinity, type });

const names: Record<string, string> = { a: 'Apricot', b: 'Juniper', c: 'Pumpkin' };
const nameOf = (id: string): string => names[id] ?? 'a herdmate';

describe('bondBadge', () => {
  it('wears the strongest tie: bonded beats friend beats rival', () => {
    const rels = [rel('a', 'b', 'friend', 30), rel('a', 'c', 'bonded', 60)];
    expect(bondBadge('a', rels)?.glyph).toBe('💞');
    expect(bondBadge('b', rels)?.glyph).toBe('🤝');
  });
  it('is null for untyped or uninvolved horses', () => {
    const rels = [rel('a', 'b', null, 5)];
    expect(bondBadge('a', rels)).toBeNull();
    expect(bondBadge('zz', [rel('a', 'b', 'rival', -20)])).toBeNull();
  });
});

describe('companionsOf', () => {
  it('lists typed companions, best affinity first, names resolved', () => {
    const rels = [
      rel('a', 'b', 'friend', 30),
      rel('c', 'a', 'bonded', 60),
      rel('a', 'b', null, 2), // untyped — never listed
    ];
    const out = companionsOf('a', rels, nameOf);
    expect(out.map((x) => x.name)).toEqual(['Pumpkin', 'Juniper']);
    expect(out[0]?.type).toBe('bonded');
  });
});

describe('dailyVignette', () => {
  const rels = [rel('a', 'b', 'friend', 30), rel('a', 'c', 'rival', -25)];
  it('is stable for the same day seed', () => {
    expect(dailyVignette(rels, nameOf, 19_000)).toBe(dailyVignette(rels, nameOf, 19_000));
  });
  it('varies across days', () => {
    const seen = new Set<string>();
    for (let d = 0; d < 8; d++) seen.add(dailyVignette(rels, nameOf, d) ?? '');
    expect(seen.size).toBeGreaterThan(1);
  });
  it('uses the real names', () => {
    expect(dailyVignette(rels, nameOf, 1)).toMatch(/Apricot|Juniper|Pumpkin/);
  });
  it('is null with no typed ties yet', () => {
    expect(dailyVignette([rel('a', 'b', null, 3)], nameOf, 5)).toBeNull();
  });
});
