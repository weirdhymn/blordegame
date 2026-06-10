import { and, eq, sql } from 'drizzle-orm';
import {
  HERD_TIER_BY_LEVEL,
  HERD_TIERS,
  herdCapForLevel,
  jobSlotsForLevel,
  type HerdTierGate,
} from '@blorse/balance';
import type { Genotype } from '@blorse/genetics';
import type { DB } from '../db/client.js';
import { battles, herds, horses } from '../db/schema.js';
import { pastureCapacity } from './pasture.js';
import { isQuestCompleted } from './quests.js';
import { coatRarityScore } from './upload.js';

// ── Milestone detection (the tier-jump gates) ───────────────────────────────

/** Has this herd won a battle against the given (boss) enemy id? */
async function hasBeatenBoss(db: DB, herdId: string, enemyId: string): Promise<boolean> {
  const won = await db
    .select({ enemies: battles.enemies })
    .from(battles)
    .where(and(eq(battles.herdId, herdId), eq(battles.status, 'won')));
  return won.some((b) => b.enemies.includes(enemyId));
}

/** Does this herd own a horse whose coat rarity meets the bar? (computed on demand, never stored) */
async function ownsRareCoat(db: DB, herdId: string, minRarity: number): Promise<boolean> {
  const owned = await db
    .select({ genotype: horses.genotype })
    .from(horses)
    .where(eq(horses.herdId, herdId));
  return owned.some((h) => coatRarityScore(h.genotype as Genotype) >= minRarity);
}

async function gateMet(db: DB, herdId: string, gate: HerdTierGate): Promise<boolean> {
  switch (gate.kind) {
    case 'quest':
      return isQuestCompleted(db, herdId, gate.questId);
    case 'boss':
      return hasBeatenBoss(db, herdId, gate.enemyId);
    case 'rareCoat':
      return ownsRareCoat(db, herdId, gate.minRarity);
  }
}

/** Total horses a herd holds (foals + adults — both occupy a roster slot against the cap). */
export async function herdHorseCount(db: DB, herdId: string): Promise<number> {
  const rows = await db.select({ id: horses.id }).from(horses).where(eq(horses.herdId, herdId));
  return rows.length;
}

// ── The progression view + the upgrade ──────────────────────────────────────

export interface ProgressionView {
  tier: number;
  tierName: string;
  herdCap: number;
  jobSlots: number;
  structureSlots: number;
  herdSize: number;
  cubes: number;
  /** null = at the top tier. */
  next: {
    tier: number;
    name: string;
    cost: number;
    canAfford: boolean;
    gates: { label: string; met: boolean }[];
    gatesMet: boolean;
    unlocks: { herdCap: number; jobSlots: number; structureSlots: number };
  } | null;
}

export async function getProgression(db: DB, herdId: string): Promise<ProgressionView | null> {
  const herd = await db.query.herds.findFirst({ where: eq(herds.id, herdId) });
  if (!herd) return null;
  const cur = HERD_TIER_BY_LEVEL.get(herd.level) ?? HERD_TIERS[0]!;
  const herdSize = await herdHorseCount(db, herdId);
  const nextTier = HERD_TIER_BY_LEVEL.get(herd.level + 1) ?? null;

  let next: ProgressionView['next'] = null;
  if (nextTier) {
    const gates = await Promise.all(
      nextTier.gates.map(async (g) => ({ label: g.label, met: await gateMet(db, herdId, g) })),
    );
    next = {
      tier: nextTier.tier,
      name: nextTier.name,
      cost: nextTier.cost,
      canAfford: herd.cubes >= nextTier.cost,
      gates,
      gatesMet: gates.every((g) => g.met),
      unlocks: {
        herdCap: nextTier.herdCap,
        jobSlots: nextTier.jobSlots,
        structureSlots: pastureCapacity(nextTier.tier),
      },
    };
  }

  return {
    tier: cur.tier,
    tierName: cur.name,
    herdCap: cur.herdCap,
    jobSlots: cur.jobSlots,
    structureSlots: pastureCapacity(herd.level),
    herdSize,
    cubes: herd.cubes,
    next,
  };
}

export type UpgradeResult =
  | { ok: true; tier: number; tierName: string; herdCap: number; jobSlots: number }
  | {
      ok: false;
      code: 'maxed' | 'gated' | 'cant_afford';
      message: string;
      gates?: { label: string; met: boolean }[];
    };

/** Spend Cubes + clear the gates → advance herds.level by one tier (the Cubes sink). */
export async function upgradeHerd(db: DB, herdId: string): Promise<UpgradeResult> {
  const herd = await db.query.herds.findFirst({ where: eq(herds.id, herdId) });
  if (!herd) return { ok: false, code: 'maxed', message: 'No herd.' };
  const nextTier = HERD_TIER_BY_LEVEL.get(herd.level + 1);
  if (!nextTier) {
    return { ok: false, code: 'maxed', message: 'Your herd is already a Dynasty — the top tier.' };
  }
  const gates = await Promise.all(
    nextTier.gates.map(async (g) => ({ label: g.label, met: await gateMet(db, herdId, g) })),
  );
  if (!gates.every((g) => g.met)) {
    const missing = gates.filter((g) => !g.met).map((g) => g.label);
    return {
      ok: false,
      code: 'gated',
      message: `Tier ${nextTier.tier} (${nextTier.name}) needs: ${missing.join('; ')}.`,
      gates,
    };
  }
  if (herd.cubes < nextTier.cost) {
    return {
      ok: false,
      code: 'cant_afford',
      message: `Tier ${nextTier.tier} (${nextTier.name}) costs ${nextTier.cost} ⬡ — you have ${herd.cubes}.`,
    };
  }
  // Pay + level in ONE conditional statement (§11 hardening): `cubes >= cost` blocks an overdraw
  // and `level = current` blocks a racing double-upgrade — the loser of a race simply no-ops.
  const upgraded = await db
    .update(herds)
    .set({ level: nextTier.tier, cubes: sql`${herds.cubes} - ${nextTier.cost}` })
    .where(
      sql`${herds.id} = ${herdId} and ${herds.level} = ${herd.level} and ${herds.cubes} >= ${nextTier.cost}`,
    )
    .returning({ level: herds.level });
  if (upgraded.length === 0) {
    return {
      ok: false,
      code: 'cant_afford',
      message: `Tier ${nextTier.tier} (${nextTier.name}) costs ${nextTier.cost} ⬡ — try again.`,
    };
  }
  return {
    ok: true,
    tier: nextTier.tier,
    tierName: nextTier.name,
    herdCap: nextTier.herdCap,
    jobSlots: nextTier.jobSlots,
  };
}

// ── Capacity gates (the blocked-at-cap moment — motivating, never a dead end) ──

export type CapacityCheck =
  | { ok: true }
  | {
      ok: false;
      code: 'herd_full' | 'jobs_full';
      message: string;
      /** Where to send the player to act on it (the progression panel lives on the Pasture). */
      nextTier: number | null;
      cost: number | null;
    };

/** Can the herd hold one more horse? If not, returns a motivating "next tier unlocks N for X" result. */
export async function checkHerdCapacity(db: DB, herdId: string): Promise<CapacityCheck> {
  const herd = await db.query.herds.findFirst({ where: eq(herds.id, herdId) });
  if (!herd) return { ok: true };
  const cap = herdCapForLevel(herd.level);
  const size = await herdHorseCount(db, herdId);
  if (size < cap) return { ok: true };
  const cur = HERD_TIER_BY_LEVEL.get(herd.level);
  const nextTier = HERD_TIER_BY_LEVEL.get(herd.level + 1);
  if (!nextTier) {
    return {
      ok: false,
      code: 'herd_full',
      message: `Your ${cur?.name ?? 'herd'} is full (${size}/${cap}) and already a Dynasty — upload or trade a horse to make room.`,
      nextTier: null,
      cost: null,
    };
  }
  return {
    ok: false,
    code: 'herd_full',
    message: `Your ${cur?.name ?? 'herd'} is full (${size}/${cap}). Reach Tier ${nextTier.tier} (${nextTier.name}) to raise it to ${nextTier.herdCap} horses — ${nextTier.cost} ⬡.`,
    nextTier: nextTier.tier,
    cost: nextTier.cost,
  };
}

/** Can the herd assign one more autonomy job? `activeJobs` = jobs already assigned. */
export async function checkJobSlots(
  db: DB,
  herdId: string,
  activeJobs: number,
): Promise<CapacityCheck> {
  const herd = await db.query.herds.findFirst({ where: eq(herds.id, herdId) });
  if (!herd) return { ok: true };
  const slots = jobSlotsForLevel(herd.level);
  if (activeJobs < slots) return { ok: true };
  const nextTier = HERD_TIER_BY_LEVEL.get(herd.level + 1);
  if (!nextTier) {
    return {
      ok: false,
      code: 'jobs_full',
      message: `All ${slots} work slots are filled, and your herd is at the top tier.`,
      nextTier: null,
      cost: null,
    };
  }
  return {
    ok: false,
    code: 'jobs_full',
    message: `All ${slots} work slots are filled. Reach Tier ${nextTier.tier} (${nextTier.name}) for a ${nextTier.jobSlots}th worker — ${nextTier.cost} ⬡.`,
    nextTier: nextTier.tier,
    cost: nextTier.cost,
  };
}
