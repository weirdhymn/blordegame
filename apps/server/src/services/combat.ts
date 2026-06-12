import { randomInt } from 'node:crypto';
import { and, eq, inArray } from 'drizzle-orm';
import {
  abilityMod,
  type Approach,
  APPROACH_SKILL,
  APPROACH_STAT,
  APPROACHES,
  CLASS_APPROACH,
  CLERIC_MEND_BASE,
  type HorseClass,
  COMBAT_DEFEND_MULT,
  COMBAT_DMG_BASE,
  COMBAT_DMG_CRIT_BONUS,
  COMBAT_DMG_GLANCE,
  COMBAT_FLEE_DC,
  COMBAT_GUARD_BASE,
  COMBAT_RESIST_MULT,
  COMBAT_WEAKNESS_MULT,
  HP_BASE,
  HP_PER_CON,
  KINDNESS_STAT_DIV,
  MOOD_RATTLED,
  PARTY_MAX,
  POTION_HEAL_HP,
  POTION_REVIVE_HP,
  REWARD_RETREAT_FRACTION,
  STAT_MAX,
  STAT_MIN,
} from '@blorse/balance';
import { ENEMY_BY_ID, type EnemyDef } from '../content/enemies.js';
import type { DB } from '../db/client.js';
import {
  battles,
  horses,
  type BattleSnapshot,
  type Combatant,
  type HorseRow,
} from '../db/schema.js';
import { mulberry32 } from '../util/rng.js';
import { getMealBuff } from './care-hub.js';
import { getHorse } from './horse.js';
import { consumeItems, grantItems, itemQty, type ItemStack } from './inventory.js';
import { skillCheck } from './stats.js';
import { creditCubes } from './wallet.js';

// ── Combat engine (§9.4) ─────────────────────────────────────────────────────
// Server-authoritative, seeded, persisted like an adventure run: the whole fight lives in
// `battles.state`, every roll is derived from (seed, round, turnIndex) so a battle is replayable
// and survives a restart. Cozy: 0 HP = "spooked" (out for the fight, fine after); a full wipe is a
// retreat with reduced rewards — never a loss. HP is battle-scoped (fresh full HP every fight).
//
// A horse's **class** (Knight/Wizard/Rogue/Cleric, §9.4b) fixes its attack to a signature
// **approach** (Confront/Outwit/Skirmish/Soothe) and earns the foe's weakness ×WEAKNESS / resist
// ×RESIST multiplier — the tactical heart. A class's effectiveness scales with the horse's STATS
// (a high-STR Knight hits hard); Soothe keys off **kindness** (Agreeableness), so a Cleric gives
// Benevolent horses a real role (+ the Mend heal). Plus Item, Defend, Flee, two-sided HP, KO +
// retreat. Deferred: statuses, harmony, the rest of each class's ability kit, the run→battle handoff.

const POTION_ID = 'healing-potion';
const MAX_LOG = 60;

// Distinct salts so independent sub-rolls in one turn don't correlate.
const ORDER_SALT = 0x1b56c4f9;
const ATTACK_SALT = 0x9e3779b9;
const ENEMY_MOVE_SALT = 0x85ebca6b;
const ENEMY_TARGET_SALT = 0xc2b2ae35;
const FLEE_SALT = 0x27d4eb2f;

/** Deterministic per-(round, turn) RNG — same inputs, same dice (testable + resumable). */
function rngAt(seed: number, round: number, turnIndex: number, salt: number): () => number {
  return mulberry32((seed ^ Math.imul(round * 101 + turnIndex + 1, salt)) >>> 0);
}

export type BattleAction =
  | { type: 'attack'; targetId: string; approach?: Approach }
  | { type: 'mend'; targetId: string } // Cleric class ability — heal/revive an ally
  | { type: 'item'; itemId: string; targetId: string }
  | { type: 'defend' }
  | { type: 'flee' };

export type BattleOutcome = 'active' | 'won' | 'retreated' | 'fled';

// ── combatant construction ───────────────────────────────────────────────────
function partyCombatant(h: HorseRow): Combatant {
  const stats = h.stats as Record<string, number>;
  const skills: Record<string, number> = {};
  for (const [k, v] of Object.entries(h.skills as Record<string, { level: number }>)) {
    skills[k] = v.level;
  }
  const maxHp = HP_BASE + HP_PER_CON * (stats.con ?? 10);
  return {
    id: h.id,
    side: 'party',
    name: h.name ?? 'Your horse',
    maxHp,
    hp: maxHp,
    ko: false,
    stats,
    skills,
    luck: h.luck,
    kindness: (h.personality as Record<string, number>).a ?? 50, // Benevolence drives Soothe (§9.4a)
    class: h.class ?? undefined, // combat class fixes its signature approach (§9.4b)
    statuses: [],
    defending: false,
  };
}

function enemyCombatant(def: EnemyDef, index: number): Combatant {
  return {
    id: `foe${index}`,
    side: 'foe',
    name: def.name,
    maxHp: def.maxHp,
    hp: def.maxHp,
    ko: false,
    stats: {},
    skills: {},
    luck: 10,
    statuses: [],
    defending: false,
    enemyId: def.id,
    weakness: def.weakness,
    resist: def.resist,
  };
}

const enemyDefOf = (c: Combatant): EnemyDef | undefined =>
  c.enemyId ? ENEMY_BY_ID.get(c.enemyId) : undefined;

const byId = (snap: BattleSnapshot, id: string | undefined): Combatant | undefined =>
  id ? snap.combatants.find((c) => c.id === id) : undefined;

/** Turn-order speed: a horse's DEX, or an enemy's authored speed. */
function speedOf(c: Combatant): number {
  return c.side === 'foe' ? (enemyDefOf(c)?.speed ?? 10) : (c.stats.dex ?? 10);
}

/** The DC to land a clean blow: a horse's CON-derived guard, or an enemy's authored guard. */
function guardOf(c: Combatant): number {
  if (c.side === 'foe') return enemyDefOf(c)?.guard ?? 10;
  return COMBAT_GUARD_BASE + abilityMod(c.stats.con ?? 10);
}

/** Soothe is the **kind** approach — its power is Benevolence (Agreeableness ÷ DIV, on the 0–20 stat
 *  scale), so kind/Benevolent horses get a real combat role. (§9.4a) */
export function kindnessStat(agreeableness: number): number {
  return Math.max(STAT_MIN, Math.min(STAT_MAX, Math.round(agreeableness / KINDNESS_STAT_DIV)));
}

/** Damage ×: WEAKNESS if the approach hits the foe's weakness, RESIST if it's resisted, else 1. Pure. */
export function approachMultiplier(
  weakness: Approach | undefined,
  resist: Approach | undefined,
  approach: Approach,
): number {
  if (weakness === approach) return COMBAT_WEAKNESS_MULT;
  if (resist === approach) return COMBAT_RESIST_MULT;
  return 1;
}

/** A combatant's attack value for one approach: the approach's stat (Soothe = kindness) + its skill. */
function approachAttack(
  c: Combatant,
  approach: Approach,
): { statValue: number; skillLevel: number } {
  const skillLevel = c.skills[APPROACH_SKILL[approach]] ?? 0;
  if (approach === 'soothe') return { statValue: kindnessStat(c.kindness ?? 50), skillLevel };
  return { statValue: c.stats[APPROACH_STAT[approach]] ?? 10, skillLevel };
}

/** The approach a horse is naturally best at — used when the player doesn't pick one. */
function bestApproach(c: Combatant): Approach {
  let best: Approach = APPROACHES[0]!;
  let bestVal = -Infinity;
  for (const ap of APPROACHES) {
    const v = approachAttack(c, ap).statValue;
    if (v > bestVal) {
      bestVal = v;
      best = ap;
    }
  }
  return best;
}

const APPROACH_VERB: Record<Approach, string> = {
  confront: 'charges',
  outwit: 'outfoxes',
  skirmish: 'harries',
  soothe: 'gentles',
};

// Class-themed flavor for the combat log (§9.4b) — heroic structure, our wry voice.
export const CLASS_LABEL: Record<HorseClass, string> = {
  knight: 'Knight',
  wizard: 'Wizard',
  rogue: 'Rogue',
  cleric: 'Cleric',
};
const CLASS_ATTACK_VERB: Record<HorseClass, string> = {
  knight: 'cleaves into',
  wizard: 'looses a hex at',
  rogue: 'darts in at',
  cleric: 'soothes',
};

function pushEvent(snap: BattleSnapshot, text: string, kind?: string): void {
  snap.log.push({ round: snap.round, text, kind });
  if (snap.log.length > MAX_LOG) snap.log.splice(0, snap.log.length - MAX_LOG);
}

/** Apply damage; return true if this blow just spooked (KO'd) the target. */
function applyDamage(target: Combatant, dmg: number): boolean {
  target.hp = Math.max(0, target.hp - dmg);
  if (target.hp === 0 && !target.ko) {
    target.ko = true;
    return true;
  }
  return false;
}

/** A single strike (reuses skillCheck): clean hit scales with the attacker's stat mod + crit; a miss
 *  still chips (cozy). A **party** attack picks an *approach* and earns the foe's weakness/resist
 *  multiplier; a foe just swings with its power. A Defending target halves it. A resisted hit still
 *  lands for ≥1 (never a 0-damage punish). */
function resolveStrike(
  attacker: Combatant,
  target: Combatant,
  rng: () => number,
  approach?: Approach,
  mealBuff: Record<string, number> = {},
): { dmg: number; crit: boolean; mult: number; approach: Approach | null } {
  let statValue: number;
  let skillLevel: number;
  let used: Approach | null = null;
  let mult = 1;
  if (attacker.side === 'foe') {
    statValue = enemyDefOf(attacker)?.power ?? 10;
    skillLevel = 0;
  } else {
    used = approach ?? bestApproach(attacker);
    ({ statValue, skillLevel } = approachAttack(attacker, used));
    if (target.side === 'foe') mult = approachMultiplier(target.weakness, target.resist, used);
  }
  // The morning meal buffs party attacks whose approach uses the cooked stat (§7) — a guard reduction.
  const meal = used ? (mealBuff[APPROACH_STAT[used]] ?? 0) : 0;
  const check = skillCheck(statValue, skillLevel, attacker.luck, guardOf(target) - meal, rng);
  let dmg = check.success
    ? COMBAT_DMG_BASE +
      Math.max(0, abilityMod(statValue)) +
      (check.crit ? COMBAT_DMG_CRIT_BONUS : 0)
    : COMBAT_DMG_GLANCE;
  dmg = dmg * mult;
  if (target.defending) dmg = dmg * COMBAT_DEFEND_MULT;
  return {
    dmg: Math.max(1, Math.round(dmg)),
    crit: check.success && check.crit,
    mult,
    approach: used,
  };
}

// ── round / turn flow ────────────────────────────────────────────────────────
function recomputeOrder(snap: BattleSnapshot, seed: number): void {
  const rng = rngAt(seed, snap.round, 0, ORDER_SALT);
  const keyed = snap.combatants
    .filter((c) => !c.ko)
    .map((c) => ({ id: c.id, speed: speedOf(c), tie: rng() }));
  keyed.sort((a, b) => b.speed - a.speed || b.tie - a.tie); // DEX desc, ties by seeded RNG
  snap.order = keyed.map((k) => k.id);
  snap.turnIndex = 0;
}

function checkEnd(snap: BattleSnapshot): 'won' | 'retreated' | null {
  const foes = snap.combatants.filter((c) => c.side === 'foe');
  const party = snap.combatants.filter((c) => c.side === 'party');
  if (foes.every((c) => c.ko)) return 'won';
  if (party.every((c) => c.ko)) return 'retreated';
  return null;
}

function weightedMove(def: EnemyDef, rng: () => number): EnemyDef['moves'][number] {
  const total = def.moves.reduce((s, m) => s + m.weight, 0);
  let r = rng() * total;
  for (const m of def.moves) {
    r -= m.weight;
    if (r <= 0) return m;
  }
  return def.moves[0]!;
}

function resolveEnemyTurn(snap: BattleSnapshot, foe: Combatant, seed: number): void {
  foe.defending = false;
  const def = enemyDefOf(foe);
  if (!def) return;
  const targets = snap.combatants.filter((c) => c.side === 'party' && !c.ko);
  if (targets.length === 0) return;

  const move = weightedMove(def, rngAt(seed, snap.round, snap.turnIndex, ENEMY_MOVE_SALT));
  const tRng = rngAt(seed, snap.round, snap.turnIndex, ENEMY_TARGET_SALT);
  const primary = targets[Math.floor(tRng() * targets.length)]!;
  const { dmg } = resolveStrike(foe, primary, rngAt(seed, snap.round, snap.turnIndex, ATTACK_SALT));
  const ko = applyDamage(primary, dmg);
  pushEvent(snap, `${move.text} ${primary.name} takes ${dmg}.`, 'enemy');
  if (ko) pushEvent(snap, `${primary.name} is spooked! (Out cold — back by supper.)`, 'ko');

  if (move.kind === 'sweep') {
    const second = targets.find((c) => c.id !== primary.id && !c.ko);
    if (second) {
      const splash = Math.ceil(dmg * 0.5);
      const ko2 = applyDamage(second, splash);
      pushEvent(snap, `…catching ${second.name} for ${splash} too.`, 'enemy');
      if (ko2) pushEvent(snap, `${second.name} is spooked! (Out cold — back by supper.)`, 'ko');
    }
  }
}

/** Advance through KO'd slots, resolve any enemy turns, roll into new rounds — stop at the next
 *  conscious party turn (await input) or a battle end. */
function settle(snap: BattleSnapshot, seed: number): BattleOutcome {
  for (let guard = 0; guard < 500; guard++) {
    const end = checkEnd(snap);
    if (end) return end;
    if (snap.turnIndex >= snap.order.length) {
      snap.round += 1;
      recomputeOrder(snap, seed);
      continue;
    }
    const cur = byId(snap, snap.order[snap.turnIndex]);
    if (!cur || cur.ko) {
      snap.turnIndex += 1;
      continue;
    }
    if (cur.side === 'foe') {
      resolveEnemyTurn(snap, cur, seed);
      snap.turnIndex += 1;
      continue;
    }
    return 'active'; // a conscious party member is up — await their action
  }
  return 'active';
}

/** Apply the current party member's action, then settle to the next decision point. PURE over the
 *  snapshot (the caller handles inventory + reward side-effects). */
function applyAct(
  snap: BattleSnapshot,
  seed: number,
  action: BattleAction,
): { outcome: BattleOutcome; error?: string } {
  const cur = byId(snap, snap.order[snap.turnIndex]);
  if (!cur || cur.side !== 'party' || cur.ko) return { outcome: 'active', error: 'not_your_turn' };
  cur.defending = false; // its turn begins → last round's brace lapses

  if (action.type === 'attack') {
    const target = byId(snap, action.targetId);
    if (!target || target.side !== 'foe' || target.ko)
      return { outcome: 'active', error: 'bad_target' };
    // A classed horse always attacks with its class's signature approach; unclassed → best stat.
    const approach = cur.class ? CLASS_APPROACH[cur.class] : action.approach;
    const res = resolveStrike(
      cur,
      target,
      rngAt(seed, snap.round, snap.turnIndex, ATTACK_SALT),
      approach,
      snap.mealBuff ?? {},
    );
    applyDamage(target, res.dmg);
    const verb = cur.class
      ? CLASS_ATTACK_VERB[cur.class]
      : res.approach
        ? APPROACH_VERB[res.approach]
        : 'strikes';
    let line: string;
    let kind: string;
    if (res.mult > 1) {
      line = `${cur.name} ${verb} ${target.name} — ${res.dmg} damage! ★ A glaring weakness.`;
      kind = 'weak';
    } else if (res.mult < 1) {
      line = `${cur.name} ${verb} ${target.name} — ${res.dmg} damage. ◦ Barely scratched.`;
      kind = 'resist';
    } else if (res.crit) {
      line = `${cur.name} ${verb} ${target.name} — ${res.dmg} damage! A clean hit.`;
      kind = 'attack';
    } else {
      line = `${cur.name} ${verb} ${target.name} — ${res.dmg} damage.`;
      kind = 'attack';
    }
    pushEvent(snap, line, kind);
    if (target.ko) pushEvent(snap, `${target.name} throws in the towel and shuffles off.`, 'ko');
  } else if (action.type === 'mend') {
    if (cur.class !== 'cleric') return { outcome: 'active', error: 'bad_action' };
    const target = byId(snap, action.targetId);
    if (!target || target.side !== 'party') return { outcome: 'active', error: 'bad_target' };
    const heal = CLERIC_MEND_BASE + kindnessStat(cur.kindness ?? 50);
    if (target.ko) {
      target.ko = false;
      target.hp = Math.min(target.maxHp, heal);
      pushEvent(
        snap,
        `${cur.name} lays on hooves — ${target.name} staggers back to its feet (+${target.hp} HP).`,
        'item',
      );
    } else {
      const before = target.hp;
      target.hp = Math.min(target.maxHp, target.hp + heal);
      pushEvent(snap, `${cur.name} mends ${target.name} — +${target.hp - before} HP.`, 'item');
    }
  } else if (action.type === 'defend') {
    cur.defending = true;
    pushEvent(snap, `${cur.name} raises its guard.`, 'defend');
  } else if (action.type === 'flee') {
    const check = skillCheck(
      cur.stats.dex ?? 10,
      cur.skills.baking ?? 0,
      cur.luck,
      COMBAT_FLEE_DC,
      rngAt(seed, snap.round, snap.turnIndex, FLEE_SALT),
    );
    if (check.success) {
      pushEvent(
        snap,
        `${cur.name} calls the retreat — the party makes a tactical withdrawal.`,
        'flee',
      );
      return { outcome: 'fled' };
    }
    pushEvent(
      snap,
      `${cur.name} looks for an opening to break off — the moment slips away.`,
      'flee',
    );
  } else if (action.type === 'item') {
    const target = byId(snap, action.targetId);
    if (!target || target.side !== 'party') return { outcome: 'active', error: 'bad_target' };
    if (target.ko) {
      target.ko = false;
      target.hp = Math.min(target.maxHp, POTION_REVIVE_HP);
      pushEvent(
        snap,
        `A Healing Potion hauls ${target.name} back to its hooves (+${target.hp} HP).`,
        'item',
      );
    } else {
      const before = target.hp;
      target.hp = Math.min(target.maxHp, target.hp + POTION_HEAL_HP);
      pushEvent(
        snap,
        `${target.name} quaffs a Healing Potion — +${target.hp - before} HP.`,
        'item',
      );
    }
  }

  const end = checkEnd(snap);
  if (end) return { outcome: end };
  snap.turnIndex += 1; // consume this party turn, then play out foes / new rounds
  return { outcome: settle(snap, seed) };
}

// ── views ────────────────────────────────────────────────────────────────────
export interface CombatantView {
  id: string;
  side: 'party' | 'foe';
  name: string;
  hp: number;
  maxHp: number;
  ko: boolean;
  defending: boolean;
  /** Foe only — the readable hint at its weakness, so the puzzle isn't blind guesswork (§9.4a). */
  tell?: string;
  /** Party only — this horse's attack value per approach, so the player can match horse↔approach. */
  approaches?: Record<Approach, number>;
  /** Party only — combat class (§9.4b); drives its signature approach + abilities. */
  class?: HorseClass;
}
export interface BattleView {
  battleId: string;
  status: BattleOutcome;
  round: number;
  turnId: string | null; // current actor (null when ended)
  isPartyTurn: boolean;
  combatants: CombatantView[];
  log: { text: string; kind?: string }[];
  potions: number; // herd's Healing Potion count (gates the Item action)
  reward: { cubes: number; items: ItemStack[] } | null; // what a terminal battle banked
}

function combatantView(c: Combatant): CombatantView {
  const base = {
    id: c.id,
    side: c.side,
    name: c.name,
    hp: c.hp,
    maxHp: c.maxHp,
    ko: c.ko,
    defending: c.defending,
  };
  if (c.side === 'foe') return { ...base, tell: enemyDefOf(c)?.tell };
  return {
    ...base,
    class: c.class,
    approaches: {
      confront: approachAttack(c, 'confront').statValue,
      outwit: approachAttack(c, 'outwit').statValue,
      skirmish: approachAttack(c, 'skirmish').statValue,
      soothe: approachAttack(c, 'soothe').statValue,
    },
  };
}

function battleView(
  battleId: string,
  snap: BattleSnapshot,
  status: BattleOutcome,
  potions: number,
  reward: { cubes: number; items: ItemStack[] } | null,
): BattleView {
  const turnId = status === 'active' ? (snap.order[snap.turnIndex] ?? null) : null;
  const cur = byId(snap, turnId ?? undefined);
  return {
    battleId,
    status,
    round: snap.round,
    turnId,
    isPartyTurn: status === 'active' && !!cur && cur.side === 'party' && !cur.ko,
    combatants: snap.combatants.map(combatantView),
    log: snap.log.slice(-16).map((e) => ({ text: e.text, kind: e.kind })),
    potions,
    reward,
  };
}

// ── reward ───────────────────────────────────────────────────────────────────
function totalReward(enemyIds: string[]): { cubes: number; items: ItemStack[] } {
  let cubes = 0;
  const items = new Map<string, number>();
  for (const id of enemyIds) {
    const def = ENEMY_BY_ID.get(id);
    if (!def) continue;
    cubes += def.reward.cubes ?? 0;
    for (const it of def.reward.items ?? []) items.set(it.id, (items.get(it.id) ?? 0) + it.qty);
  }
  return { cubes, items: [...items].map(([id, qty]) => ({ id, qty })) };
}

/** A full-party retreat leaves the party in a rough mood (§7) — cosmetic; the evening groom soothes
 *  it. No stat penalty (cozy): a rattled horse just had a hard day and wants tucking in. */
async function markRetreatMood(
  db: DB,
  snap: BattleSnapshot,
  outcome: BattleOutcome,
): Promise<void> {
  if (outcome !== 'retreated') return;
  const ids = snap.combatants.filter((c) => c.side === 'party').map((c) => c.id);
  if (ids.length > 0) {
    await db.update(horses).set({ mood: MOOD_RATTLED }).where(inArray(horses.id, ids));
  }
}

/** Pay the battle's prize. The caller has ALREADY claimed the terminal status (conditional
 *  write) — this runs once per battle by construction; Cubes ride the kernel. */
async function grantReward(
  db: DB,
  herdId: string,
  outcome: BattleOutcome,
  enemyIds: string[],
): Promise<{ cubes: number; items: ItemStack[] } | null> {
  if (outcome === 'won') {
    const r = totalReward(enemyIds);
    if (r.items.length) await grantItems(db, herdId, r.items);
    if (r.cubes > 0) await creditCubes(db, herdId, r.cubes);
    return r;
  }
  if (outcome === 'retreated') {
    const full = totalReward(enemyIds);
    const cubes = Math.floor(full.cubes * REWARD_RETREAT_FRACTION);
    if (cubes > 0) await creditCubes(db, herdId, cubes);
    return { cubes, items: [] };
  }
  return null; // fled: cozy, you simply left — no battle reward
}

// ── lifecycle ────────────────────────────────────────────────────────────────
async function loadParty(db: DB, herdId: string, ids: string[]): Promise<HorseRow[] | null> {
  const party: HorseRow[] = [];
  for (const id of ids) {
    const h = await getHorse(db, id);
    if (!h || h.herdId !== herdId || h.lifeStage !== 'adult') return null;
    party.push(h);
  }
  return party;
}

export type StartBattleResult =
  | { ok: false; code: 'bad_party' | 'bad_enemy'; message: string }
  | { ok: true; battleId: string; view: BattleView };

export interface StartBattleOptions {
  seed?: number;
  runId?: string | null;
}

/** Begin a battle: snapshot the party from CON-derived HP, instantiate the enemies, seed it, and
 *  settle to the first party decision (fast enemies may act first — speed matters). */
export async function startBattle(
  db: DB,
  herdId: string,
  enemyIds: string[],
  partyIds: string[],
  opts: StartBattleOptions = {},
): Promise<StartBattleResult> {
  if (partyIds.length < 1 || partyIds.length > PARTY_MAX) {
    return { ok: false, code: 'bad_party', message: `A party is 1–${PARTY_MAX} horses.` };
  }
  if (enemyIds.length < 1 || enemyIds.length > 4 || enemyIds.some((id) => !ENEMY_BY_ID.has(id))) {
    return { ok: false, code: 'bad_enemy', message: 'No such foe.' };
  }
  // Region Keepers answer only the deep road (§9.4c): without a run handoff, the standalone
  // battle path refuses them — otherwise POST /battle could skip the earned Keeper-challenge
  // flow and still satisfy the tier ladder's hasBeatenBoss gate (audit P1).
  if (!opts.runId && enemyIds.some((id) => ENEMY_BY_ID.get(id)?.keeper)) {
    return {
      ok: false,
      code: 'bad_enemy',
      message: 'A Keeper does not answer challenges shouted from town. Earn the deep road.',
    };
  }
  const party = await loadParty(db, herdId, partyIds);
  if (!party)
    return { ok: false, code: 'bad_party', message: 'A party must be your adult horses.' };

  const seed = opts.seed ?? randomInt(1, 2 ** 31);
  const combatants: Combatant[] = [
    ...party.map(partyCombatant),
    ...enemyIds.map((id, i) => enemyCombatant(ENEMY_BY_ID.get(id)!, i)),
  ];
  const mealBuff = await getMealBuff(db, herdId, Date.now()); // today's cooked stat loadout (§7)
  const snap: BattleSnapshot = { round: 1, turnIndex: 0, order: [], combatants, log: [], mealBuff };
  const firstFoe = ENEMY_BY_ID.get(enemyIds[0]!);
  if (firstFoe) pushEvent(snap, firstFoe.intro, 'intro');
  recomputeOrder(snap, seed);
  const outcome = settle(snap, seed); // let any faster foes open

  const [row] = await db
    .insert(battles)
    .values({
      herdId,
      runId: opts.runId ?? null,
      enemies: enemyIds,
      seed,
      state: snap,
      status: outcome,
    })
    .returning();
  if (!row) return { ok: false, code: 'bad_party', message: 'Could not start the battle.' };

  const reward = outcome === 'active' ? null : await grantReward(db, herdId, outcome, enemyIds);
  await markRetreatMood(db, snap, outcome);
  if (outcome !== 'active')
    await db.update(battles).set({ status: outcome }).where(eq(battles.id, row.id));
  const potions = await itemQty(db, herdId, POTION_ID);
  return { ok: true, battleId: row.id, view: battleView(row.id, snap, outcome, potions, reward) };
}

export type ActResult =
  | {
      ok: false;
      code: 'not_found' | 'not_your_turn' | 'bad_target' | 'no_potion' | 'bad_action';
      message: string;
    }
  | { ok: true; view: BattleView };

/** Resolve one party action in an active battle, then play out the foes to the next decision. */
export async function actInBattle(
  db: DB,
  herdId: string,
  battleId: string,
  action: BattleAction,
): Promise<ActResult> {
  const row = await db.query.battles.findFirst({
    where: and(eq(battles.id, battleId), eq(battles.herdId, herdId), eq(battles.status, 'active')),
  });
  if (!row) return { ok: false, code: 'not_found', message: 'No such battle.' };

  const snap = JSON.parse(JSON.stringify(row.state)) as BattleSnapshot; // clone before mutating
  const cur = byId(snap, snap.order[snap.turnIndex]);
  if (!cur || cur.side !== 'party' || cur.ko) {
    return { ok: false, code: 'not_your_turn', message: 'Not your turn.' };
  }

  // The Item action spends a real Healing Potion — verify before applying, consume only on success.
  let spendPotion = false;
  if (action.type === 'item') {
    if (action.itemId !== POTION_ID)
      return { ok: false, code: 'bad_action', message: 'Unknown item.' };
    if ((await itemQty(db, herdId, POTION_ID)) < 1) {
      return { ok: false, code: 'no_potion', message: 'No Healing Potion in the stash.' };
    }
    spendPotion = true;
  }

  const { outcome, error } = applyAct(snap, row.seed, action);
  if (error) {
    const code = error === 'not_your_turn' || error === 'bad_target' ? error : 'bad_action';
    return { ok: false, code, message: 'That move did not land.' };
  }

  // Claim the turn FIRST (§11 hardening): the state/status write is conditional on the battle
  // still being active, so a concurrent killing blow can't double-bank the reward — only the
  // submission that lands the write consumes the potion, pays the prize, and marks moods.
  const claimed = await db
    .update(battles)
    .set({ state: snap, status: outcome })
    .where(and(eq(battles.id, row.id), eq(battles.status, 'active')))
    .returning({ id: battles.id });
  if (claimed.length === 0) {
    return { ok: false, code: 'not_found', message: 'No such battle.' };
  }
  if (spendPotion) await consumeItems(db, herdId, [{ id: POTION_ID, qty: 1 }]);

  const reward = outcome === 'active' ? null : await grantReward(db, herdId, outcome, row.enemies);
  await markRetreatMood(db, snap, outcome);
  const potions = await itemQty(db, herdId, POTION_ID);
  return { ok: true, view: battleView(row.id, snap, outcome, potions, reward) };
}

/** Read a battle (resume / poll). */
export async function getBattleView(
  db: DB,
  herdId: string,
  battleId: string,
): Promise<BattleView | null> {
  const row = await db.query.battles.findFirst({
    where: and(eq(battles.id, battleId), eq(battles.herdId, herdId)),
  });
  if (!row) return null;
  const snap = row.state;
  const reward = row.status === 'active' ? null : totalReward(row.enemies); // informational on a finished fight
  const adjusted =
    row.status === 'retreated' && reward
      ? { cubes: Math.floor(reward.cubes * REWARD_RETREAT_FRACTION), items: [] }
      : row.status === 'fled'
        ? null
        : reward;
  const potions = await itemQty(db, herdId, POTION_ID);
  return battleView(row.id, snap, row.status, potions, adjusted);
}

/** Set (or clear) a horse's combat class — freely re-assignable anytime (§9.4b). Snapshotted into a
 *  battle at its start, so it can't change mid-fight. */
export async function setHorseClass(
  db: DB,
  herdId: string,
  horseId: string,
  cls: HorseClass | null,
): Promise<{ ok: boolean }> {
  const h = await getHorse(db, horseId);
  if (!h || h.herdId !== herdId) return { ok: false };
  await db.update(horses).set({ class: cls }).where(eq(horses.id, horseId));
  return { ok: true };
}
