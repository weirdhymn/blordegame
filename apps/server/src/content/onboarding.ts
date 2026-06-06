import type { Genotype } from '@blorse/genetics';

export interface StarterHorse {
  genotype: Genotype;
  /** Pinned so every new Herd's starters are deterministic (identical look + stats). */
  seed: number;
}

/**
 * The founder adults granted to every new Herd on signup (§6 onboarding, §5.4a).
 *
 * Both are plain real-coat bases with **no lethal allele** (no `W`/`O`), so the cross is
 * always viable; as parentless **founders** they share no ancestor and can therefore breed
 * immediately. Two different base coats (Bay, Chestnut) so a new player's first foals vary.
 * Names are assigned at mint time (random fruit/veg — cosmetic, §6).
 *
 * Keep this list length in sync with STARTER_HORSE_COUNT in @blorse/balance.
 */
export const STARTER_HORSES: StarterHorse[] = [
  { genotype: { E: 'Ee', A: 'Aa' }, seed: 0x57a1 }, // Bay
  { genotype: { E: 'ee' }, seed: 0xc4e5 }, // Chestnut
];
