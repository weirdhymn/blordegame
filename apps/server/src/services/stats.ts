import { eq } from 'drizzle-orm';
import {
  abilityMod,
  LUCK_INHERIT,
  luckMod,
  SKILL_KEYS,
  SKILL_MAX,
  SKILL_STAT,
  SKILL_XP_PER_LEVEL,
  STAT_INHERIT,
  STAT_KEYS,
  STAT_MAX,
  STAT_MIN,
  STAT_TRAIN_SOFTCAP,
  type SkillKey,
  type StatKey,
} from '@blorse/balance';
import type { DB } from '../db/client.js';
import { horses } from '../db/schema.js';
import { inheritPersonality, rollWildPersonality, type Personality } from './personality.js';

export type StatBlock = Record<StatKey, number>;
export type SkillBlock = Record<SkillKey, { level: number; xp: number }>;

export interface GeneratedStats {
  stats: StatBlock;
  luck: number;
  skills: SkillBlock;
  accomplishments: string[];
  personality: Personality;
}

// Rounded-normal sampler (Box–Muller) on an injected, seeded RNG (server-authoritative).
function gaussian(rng: () => number): number {
  const u = Math.max(1e-9, rng());
  const v = rng();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}
function rollN(mean: number, sd: number, rng: () => number): number {
  return mean + sd * gaussian(rng);
}
const clampStat = (n: number): number => Math.max(STAT_MIN, Math.min(STAT_MAX, Math.round(n)));

export function emptySkills(): SkillBlock {
  const s = {} as SkillBlock;
  for (const k of SKILL_KEYS) s[k] = { level: 0, xp: 0 };
  return s;
}

function rollWildStats(rng: () => number): StatBlock {
  const s = {} as StatBlock;
  for (const k of STAT_KEYS) s[k] = clampStat(rollN(10.5, 3, rng));
  return s;
}

// §14.2: stat = clamp(round(0.70·avg(parents) + 0.30·roll(10.5, 3))).
function inheritStats(pa: StatBlock, pb: StatBlock, rng: () => number): StatBlock {
  const s = {} as StatBlock;
  for (const k of STAT_KEYS) {
    const avg = ((pa[k] ?? 10) + (pb[k] ?? 10)) / 2;
    s[k] = clampStat(STAT_INHERIT * avg + (1 - STAT_INHERIT) * rollN(10.5, 3, rng));
  }
  return s;
}

const rollWildLuck = (rng: () => number): number => clampStat(rollN(10.5, 4, rng));
const inheritLuck = (pa: number, pb: number, rng: () => number): number =>
  clampStat(LUCK_INHERIT * ((pa + pb) / 2) + (1 - LUCK_INHERIT) * rollN(10.5, 4, rng));

/** Generate a stat block at birth — inherited from parents (bred) or fully rolled (wild). */
export async function generateStatBlock(
  db: DB,
  parentAId: string | null | undefined,
  parentBId: string | null | undefined,
  rng: () => number,
): Promise<GeneratedStats> {
  if (parentAId && parentBId) {
    const pa = await db.query.horses.findFirst({ where: eq(horses.id, parentAId) });
    const pb = await db.query.horses.findFirst({ where: eq(horses.id, parentBId) });
    if (pa && pb) {
      return {
        stats: inheritStats(pa.stats as StatBlock, pb.stats as StatBlock, rng),
        luck: inheritLuck(pa.luck, pb.luck, rng),
        skills: emptySkills(),
        accomplishments: [],
        personality: inheritPersonality(
          pa.personality as Personality,
          pb.personality as Personality,
          rng,
        ),
      };
    }
  }
  return {
    stats: rollWildStats(rng),
    luck: rollWildLuck(rng),
    skills: emptySkills(),
    accomplishments: [],
    personality: rollWildPersonality(rng),
  };
}

// ── Dice (§9.1, §14.5) ──────────────────────────────────────────────────────
export interface CheckResult {
  d20: number;
  total: number;
  dc: number;
  success: boolean;
  margin: number;
  crit: boolean;
}

export function skillCheck(
  statValue: number,
  skillLevel: number,
  luckValue: number,
  dc: number,
  rng: () => number,
): CheckResult {
  const d20 = 1 + Math.floor(rng() * 20);
  const total = d20 + abilityMod(statValue) + skillLevel + luckMod(luckValue);
  const margin = total - dc;
  const crit = d20 === 20 || margin >= 10;
  return { d20, total, dc, success: total >= dc, margin, crit };
}

// ── Leveling ────────────────────────────────────────────────────────────────
export function xpForNext(level: number): number {
  return SKILL_XP_PER_LEVEL * (level + 1);
}

export interface LevelUp {
  skill: SkillKey;
  newLevel: number;
  statTrained: StatKey | null;
}

/** Add XP to a skill (mutates blocks): level up to the cap + train its governing stat. */
export function grantSkillXp(
  skills: SkillBlock,
  stats: StatBlock,
  skill: SkillKey,
  xp: number,
): LevelUp[] {
  const s = skills[skill] ?? { level: 0, xp: 0 };
  s.xp += xp;
  const ups: LevelUp[] = [];
  while (s.level < SKILL_MAX && s.xp >= xpForNext(s.level)) {
    s.xp -= xpForNext(s.level);
    s.level += 1;
    const stat = SKILL_STAT[skill];
    let trained: StatKey | null = null;
    if ((stats[stat] ?? 0) < STAT_TRAIN_SOFTCAP) {
      stats[stat] = (stats[stat] ?? 0) + 1; // training tops out at the soft cap (§14.2)
      trained = stat;
    }
    ups.push({ skill, newLevel: s.level, statTrained: trained });
  }
  skills[skill] = s;
  return ups;
}

export function accomplishmentsForLevel(skill: SkillKey, level: number): string[] {
  const out: string[] = [];
  if (level >= 5) out.push(`skilled-${skill}`);
  if (level >= 10) out.push(`master-${skill}`);
  return out;
}
