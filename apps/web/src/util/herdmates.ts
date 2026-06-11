import type { Relationship } from '../api/social.js';

/**
 * Living-Herd surfacing helpers (§8) — pure functions over the relationship rows the server
 * already exposes. The herd's social life is simulated server-side; this is just how the
 * Pasture wears it.
 */

export interface BondBadge {
  glyph: string;
  label: string;
}

// Same glyph language as the autonomy journal (💞 bonded · 🤝 friend · ⚡ rival).
const BADGE: Record<string, BondBadge> = {
  bonded: { glyph: '💞', label: 'Inseparable from a herdmate' },
  friend: { glyph: '🤝', label: 'Fast friends with a herdmate' },
  rival: { glyph: '⚡', label: 'At odds with a herdmate' },
};
const PRECEDENCE = ['bonded', 'friend', 'rival'] as const;

/** The strongest tie a horse wears on its card (bonded > friend > rival), or null. */
export function bondBadge(horseId: string, rels: Relationship[]): BondBadge | null {
  const mine = rels.filter((r) => (r.horseA === horseId || r.horseB === horseId) && r.type);
  for (const t of PRECEDENCE) {
    if (mine.some((r) => r.type === t)) return BADGE[t] ?? null;
  }
  return null;
}

export interface Companion {
  horseId: string;
  name: string;
  type: string;
  affinity: number;
}

/** A horse's typed companions (best affinity first), names resolved by the caller's herd list. */
export function companionsOf(
  horseId: string,
  rels: Relationship[],
  nameOf: (id: string) => string,
): Companion[] {
  return rels
    .filter((r) => (r.horseA === horseId || r.horseB === horseId) && r.type)
    .map((r) => {
      const other = r.horseA === horseId ? r.horseB : r.horseA;
      return { horseId: other, name: nameOf(other), type: r.type ?? '', affinity: r.affinity };
    })
    .sort((a, b) => b.affinity - a.affinity);
}

// A couple of variants per tie, in the voice — fond, dry, never grim.
const VIGNETTES: Record<string, ((a: string, b: string) => string)[]> = {
  bonded: [
    (a, b) => `${a} and ${b} are inseparable today — one shadow, eight legs.`,
    (a, b) => `${a} is grooming ${b}’s mane with tremendous concentration.`,
  ],
  friend: [
    (a, b) => `${a} and ${b} are sharing a fence post and a comfortable silence.`,
    (a, b) => `${a} saved ${b} the sunny patch by the trough.`,
  ],
  rival: [
    (a, b) => `${a} and ${b} are pointedly grazing at opposite ends of the same field.`,
    (a, b) => `${a} and ${b} both had opinions about one patch of clover. The clover is fine.`,
  ],
};

/**
 * One ambient line for the Pasture, stable for the whole day (pass a day-grained seed) so it
 * reads as the day's little scene, not a slot machine. Null when no typed ties exist yet.
 */
export function dailyVignette(
  rels: Relationship[],
  nameOf: (id: string) => string,
  daySeed: number,
): string | null {
  const typed = rels.filter((r) => r.type && VIGNETTES[r.type]);
  if (typed.length === 0) return null;
  const pick = typed[Math.abs(daySeed) % typed.length]!;
  const variants = VIGNETTES[pick.type!]!;
  const variant = variants[Math.abs(daySeed * 7 + 3) % variants.length]!;
  return variant(nameOf(pick.horseA), nameOf(pick.horseB));
}
