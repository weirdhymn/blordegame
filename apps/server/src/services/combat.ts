import { randomInt } from 'node:crypto';
import { and, eq, sql } from 'drizzle-orm';
import {
  abilityMod,
  APPROACH_SKILL,
  APPROACH_STAT,
  APPROACHES,
  COMBAT_DEFEND_MULT,
  COMBAT_DMG_BASE,
  COMBAT_DMG_CRIT_BONUS,
  COMBAT_DMG_GLANCE,
  COMBAT_FLEE_DC,
  COMBAT_GUARD_BASE,
  HP_BASE,
  HP_PER_CON,
  PARTY_MAX,
  POTION_HEAL_HP,
  POTION_REVIVE_HP,
  REWARD_RETREAT_FRACTION,
} from '@blorse/balance';
import { ENEMY_BY_ID, type EnemyDef } from '../content/enemies.js';
import type { DB } from '../db/client.js';
import {
  battles,
  herds,
  type BattleSnapshot,
  type Combatant,
  type HorseRow,
} from '../db/schema.js';
import { mulberry32 } from '../util/rng.js';
import { getHorse } from './horse.js';
import { consumeItems, grantItems, itemQty, type ItemStack } from './inventory.js';
import { skillCheck } from './stats.js';

// ── Combat engine (§9.4) ─────────────────────────────────────────────────────
// Server-authoritative, seeded, persisted like an adventure run: the whole fight lives in
// `battles.state`, every roll is derived from (seed, round, turnIndex) so a battle is replayable
// and survives a restart. Cozy: 0 HP = "spooked" (out for the fight, fine after); a full wipe is a
// retreat with reduced rewards — never a loss. HP is battle-scoped (fresh full HP every fight).
//
// v1 MINIMUM: Attack (a generic strike on a horse's best approach stat — no approach choice /
// weakness yet), Item (Healing Potion), Defend, Flee, two-sided HP, KO + retreat. Deferred:
// approaches/weaknesses, statuses, harmony, the Skill menu, the run→battle handoff.

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
  | { type: 'attack'; targetId: string }
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

/** A horse attacks with its *best approach* (str/int/cha/con) + that approach's job-skill; a foe
 *  attacks with its authored power. (The minimum auto-picks; the approach layer makes it a choice.) */
function attackProfile(c: Combatant): { statValue: number; skillLevel: number } {
  if (c.side === 'foe') return { statValue: enemyDefOf(c)?.power ?? 10, skillLevel: 0 };
  let best = { statValue: -Infinity, skillLevel: 0 };
  for (const ap of APPROACHES) {
    const sv = c.stats[APPROACH_STAT[ap]] ?? 10;
    if (sv > best.statValue)
      best = { statValue: sv, skillLevel: c.skills[APPROACH_SKILL[ap]] ?? 0 };
  }
  return best.statValue === -Infinity ? { statValue: 10, skillLevel: 0 } : best;
}

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

/** A single strike (reuses skillCheck): clean hit scales with the attacker's stat mod + crit; a
 *  miss still chips (cozy); a Defending target halves it. (No approach/weakness multiplier yet.) */
function resolveStrike(
  attacker: Combatant,
  target: Combatant,
  rng: () => number,
): { dmg: number; crit: boolean } {
  const atk = attackProfile(attacker);
  const check = skillCheck(atk.statValue, atk.skillLevel, attacker.luck, guardOf(target), rng);
  let dmg = check.success
    ? COMBAT_DMG_BASE +
      Math.max(0, abilityMod(atk.statValue)) +
      (check.crit ? COMBAT_DMG_CRIT_BONUS : 0)
    : COMBAT_DMG_GLANCE;
  if (target.defending) dmg = Math.ceil(dmg * COMBAT_DEFEND_MULT);
  return { dmg, crit: check.success && check.crit };
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
  pushEvent(snap, `${move.text} ${foe.name} hits ${primary.name} for ${dmg}.`, 'enemy');
  if (ko)
    pushEvent(snap, `${primary.name} is too spooked to go on — it'll be fine after a nap.`, 'ko');

  if (move.kind === 'sweep') {
    const second = targets.find((c) => c.id !== primary.id && !c.ko);
    if (second) {
      const splash = Math.ceil(dmg * 0.5);
      const ko2 = applyDamage(second, splash);
      pushEvent(snap, `…and clips ${second.name} for ${splash}.`, 'enemy');
      if (ko2) pushEvent(snap, `${second.name} is too spooked to go on.`, 'ko');
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
    const { dmg, crit } = resolveStrike(
      cur,
      target,
      rngAt(seed, snap.round, snap.turnIndex, ATTACK_SALT),
    );
    applyDamage(target, dmg);
    pushEvent(
      snap,
      `${cur.name} strikes ${target.name} for ${dmg}${crit ? ' — a clean hit!' : '.'}`,
      'attack',
    );
    if (target.ko) pushEvent(snap, `${target.name} reels back, done for the day.`, 'ko');
  } else if (action.type === 'defend') {
    cur.defending = true;
    pushEvent(snap, `${cur.name} braces, ready to weather the next blow.`, 'defend');
  } else if (action.type === 'flee') {
    const check = skillCheck(
      cur.stats.dex ?? 10,
      cur.skills.baking ?? 0,
      cur.luck,
      COMBAT_FLEE_DC,
      rngAt(seed, snap.round, snap.turnIndex, FLEE_SALT),
    );
    if (check.success) {
      pushEvent(snap, `${cur.name} calls it — the party slips away clean.`, 'flee');
      return { outcome: 'fled' };
    }
    pushEvent(
      snap,
      `${cur.name} looks for an opening to break off, but the moment passes.`,
      'flee',
    );
  } else if (action.type === 'item') {
    const target = byId(snap, action.targetId);
    if (!target || target.side !== 'party') return { outcome: 'active', error: 'bad_target' };
    if (target.ko) {
      target.ko = false;
      target.hp = Math.min(target.maxHp, POTION_REVIVE_HP);
      pushEvent(snap, `A Healing Potion brings ${target.name} blinking back to its feet.`, 'item');
    } else {
      const before = target.hp;
      target.hp = Math.min(target.maxHp, target.hp + POTION_HEAL_HP);
      pushEvent(snap, `A Healing Potion mends ${target.name} (+${target.hp - before} HP).`, 'item');
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
  return {
    id: c.id,
    side: c.side,
    name: c.name,
    hp: c.hp,
    maxHp: c.maxHp,
    ko: c.ko,
    defending: c.defending,
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

async function grantReward(
  db: DB,
  herdId: string,
  outcome: BattleOutcome,
  enemyIds: string[],
): Promise<{ cubes: number; items: ItemStack[] } | null> {
  if (outcome === 'won') {
    const r = totalReward(enemyIds);
    if (r.items.length) await grantItems(db, herdId, r.items);
    if (r.cubes > 0) {
      await db
        .update(herds)
        .set({ cubes: sql`${herds.cubes} + ${r.cubes}` })
        .where(eq(herds.id, herdId));
    }
    return r;
  }
  if (outcome === 'retreated') {
    const full = totalReward(enemyIds);
    const cubes = Math.floor(full.cubes * REWARD_RETREAT_FRACTION);
    if (cubes > 0) {
      await db
        .update(herds)
        .set({ cubes: sql`${herds.cubes} + ${cubes}` })
        .where(eq(herds.id, herdId));
    }
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
  const party = await loadParty(db, herdId, partyIds);
  if (!party)
    return { ok: false, code: 'bad_party', message: 'A party must be your adult horses.' };

  const seed = opts.seed ?? randomInt(1, 2 ** 31);
  const combatants: Combatant[] = [
    ...party.map(partyCombatant),
    ...enemyIds.map((id, i) => enemyCombatant(ENEMY_BY_ID.get(id)!, i)),
  ];
  const snap: BattleSnapshot = { round: 1, turnIndex: 0, order: [], combatants, log: [] };
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
  if (spendPotion) await consumeItems(db, herdId, [{ id: POTION_ID, qty: 1 }]);

  const reward = outcome === 'active' ? null : await grantReward(db, herdId, outcome, row.enemies);
  await db.update(battles).set({ state: snap, status: outcome }).where(eq(battles.id, row.id));
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
