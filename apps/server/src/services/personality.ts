import {
  AFFINITY_STEP,
  PERSONALITY_INHERIT,
  PERSONALITY_KEYS,
  type PersonalityKey,
} from '@blorse/balance';

export type Personality = Record<PersonalityKey, number>;

function gaussian(rng: () => number): number {
  const u = Math.max(1e-9, rng());
  const v = rng();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}
const clampPers = (n: number): number => Math.max(0, Math.min(100, Math.round(n)));

/** Wild personality — each OCEAN trait a fresh roll (mean 50, sd 18; §14.2). */
export function rollWildPersonality(rng: () => number): Personality {
  const p = {} as Personality;
  for (const k of PERSONALITY_KEYS) p[k] = clampPers(50 + 18 * gaussian(rng));
  return p;
}

/** Bred personality — mostly random with a small parental nudge, so it can't be hard-bred (§14.2). */
export function inheritPersonality(
  pa: Personality,
  pb: Personality,
  rng: () => number,
): Personality {
  const p = {} as Personality;
  for (const k of PERSONALITY_KEYS) {
    const avg = ((pa[k] ?? 50) + (pb[k] ?? 50)) / 2;
    p[k] = clampPers(50 + 18 * gaussian(rng) + PERSONALITY_INHERIT * (avg - 50));
  }
  return p;
}

/**
 * Per-tick affinity delta from two horses' OCEAN proximity (§8.1): closeness +
 * agreeableness/extraversion drive friendship; neuroticism feeds friction. Positive
 * → toward friendship/bonded, negative → toward rivalry.
 */
export function compatibility(pa: Personality, pb: Personality): number {
  const dist =
    PERSONALITY_KEYS.reduce((s, k) => s + Math.abs((pa[k] ?? 50) - (pb[k] ?? 50)), 0) /
    PERSONALITY_KEYS.length;
  const proximity = 1 - dist / 100;
  const sociability = (((pa.e ?? 50) + (pb.e ?? 50)) / 2 + ((pa.a ?? 50) + (pb.a ?? 50)) / 2) / 200;
  const friction = ((pa.n ?? 50) + (pb.n ?? 50)) / 2 / 100;
  return Math.round(AFFINITY_STEP * (0.5 * proximity + 0.6 * sociability - 0.5 * friction));
}
