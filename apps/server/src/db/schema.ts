import { sql } from 'drizzle-orm';
import {
  type AnyPgColumn,
  boolean,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';
import type { Approach, HorseClass } from '@blorse/balance';
import type { Genotype } from '@blorse/genetics';
import type { GlitchKind, LifeStage } from '@blorse/render-core';

export const userRole = pgEnum('user_role', ['player', 'mod', 'admin']);
export const lifeStageEnum = pgEnum('life_stage', ['foal', 'adult']);
export const glitchKindEnum = pgEnum('glitch_kind', ['inverted', 'screen', 'shade']);
export const horseOrigin = pgEnum('horse_origin', ['founder', 'wild', 'bred']);
export const horseClassEnum = pgEnum('horse_class', ['knight', 'wizard', 'rogue', 'cleric']);
export const questStatus = pgEnum('quest_status', ['active', 'completed']);
export const listingStatus = pgEnum('listing_status', ['active', 'sold', 'cancelled']);
export const tradeStatus = pgEnum('trade_status', ['pending', 'accepted', 'declined', 'cancelled']);

/** Auth identity only (BLORSE_PLAN.md §6). Game state hangs off the Herd, not the User. */
export const users = pgTable('users', {
  id: uuid('id').defaultRandom().primaryKey(),
  username: text('username').notNull().unique(),
  passwordHash: text('password_hash').notNull(),
  role: userRole('role').notNull().default('player'),
  /** Moderation freeze (§11) — a frozen account can read but not perform actions. */
  frozen: boolean('frozen').notNull().default(false),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

/** The player's game entity — the hub most things attach to (1:1 with User at beta). */
export const herds = pgTable('herds', {
  id: uuid('id').defaultRandom().primaryKey(),
  userId: uuid('user_id')
    .notNull()
    .unique()
    .references(() => users.id, { onDelete: 'cascade' }),
  name: text('name').notNull(),
  /** Cubes stored as integer copper-equivalent (§14.1); displayed split into denominations. */
  cubes: integer('cubes').notNull().default(0),
  level: integer('level').notNull().default(1),
  /** Autonomy sim cursor (§8.2) — deterministic per-herd. */
  simSeed: integer('sim_seed').notNull(),
  lastSimTick: integer('last_sim_tick').notNull().default(0),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

/** A horse. Phenotype is derived from (genotype, seed[, glitch]) — never stored (§2, §6). */
export const horses = pgTable(
  'horses',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    /** null = in the Tavern pool / unrecruited (§6). */
    herdId: uuid('herd_id').references(() => herds.id, { onDelete: 'set null' }),
    genotype: jsonb('genotype').notNull().$type<Genotype>(),
    seed: integer('seed').notNull(),
    /** Non-heritable render mutation (§5.7); null for almost all horses. */
    glitch: glitchKindEnum('glitch').$type<GlitchKind>(),
    lifeStage: lifeStageEnum('life_stage').notNull().default('foal').$type<LifeStage>(),
    /** Optional, cosmetic — identity is the row id, surfaced in the horse's URL (§6). */
    name: text('name'),
    parentA: uuid('parent_a').references((): AnyPgColumn => horses.id),
    parentB: uuid('parent_b').references((): AnyPgColumn => horses.id),
    origin: horseOrigin('origin').notNull(),
    bornAt: timestamp('born_at', { withTimezone: true }).notNull().defaultNow(),
    /** Per-parent breeding cooldown cursor (§7); null = never bred. */
    lastBredAt: timestamp('last_bred_at', { withTimezone: true }),
    /** Light-care counter (§7) — a hook for small bonuses once stats land (Phase 8). */
    careCount: integer('care_count').notNull().default(0),
    lastCaredAt: timestamp('last_cared_at', { withTimezone: true }),
    // RPG (§9): six core stats, hidden Luck, skills, accomplishments. Set at mint.
    stats: jsonb('stats').$type<Record<string, number>>().notNull().default({}),
    luck: integer('luck').notNull().default(10),
    skills: jsonb('skills')
      .$type<Record<string, { level: number; xp: number }>>()
      .notNull()
      .default({}),
    accomplishments: jsonb('accomplishments').$type<string[]>().notNull().default([]),
    /** Completed interactive adventures (§9.3) — drives the cosmetic "Seasoned" mark. Flavor only. */
    adventures: integer('adventures').notNull().default(0),
    /** Combat class (§9.4b) — identity + signature approach; null = unclassed. Freely re-assignable. */
    class: horseClassEnum('class').$type<HorseClass>(),
    /** Big Five (OCEAN) temperament (§8.1) — set at mint, near-immutable. */
    personality: jsonb('personality').$type<Record<string, number>>().notNull().default({}),
    // Tavern (§10): set when an unrecruited wild horse walks to the shared pool.
    tavernFee: integer('tavern_fee'),
    firstEncounteredBy: uuid('first_encountered_by').references((): AnyPgColumn => herds.id, {
      onDelete: 'set null',
    }),
  },
  (t) => [index('horses_herd_idx').on(t.herdId)],
);

/**
 * Lineage closure (§5.4a, §6) — one row per (descendant, ancestor) pair, materialized
 * at birth. Backs the O(1)-ish disjoint-ancestry breeding check. Lineages never shrink
 * (no death), so this only grows.
 */
export const horseAncestors = pgTable(
  'horse_ancestors',
  {
    horseId: uuid('horse_id')
      .notNull()
      .references(() => horses.id, { onDelete: 'cascade' }),
    ancestorId: uuid('ancestor_id')
      .notNull()
      .references(() => horses.id, { onDelete: 'cascade' }),
  },
  (t) => [
    primaryKey({ columns: [t.horseId, t.ancestorId] }),
    index('horse_ancestors_ancestor_idx').on(t.ancestorId),
  ],
);

/** Opaque session tokens (only the SHA-256 hash is stored). */
export const sessions = pgTable('sessions', {
  id: uuid('id').defaultRandom().primaryKey(),
  userId: uuid('user_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  tokenHash: text('token_hash').notNull().unique(),
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  createdAt: timestamp('created_at', { withTimezone: true })
    .notNull()
    .default(sql`now()`),
});

/** Per-herd material/item stash (Item catalog is content, §6/§7). */
export const inventory = pgTable(
  'inventory',
  {
    herdId: uuid('herd_id')
      .notNull()
      .references(() => herds.id, { onDelete: 'cascade' }),
    itemId: text('item_id').notNull(),
    qty: integer('qty').notNull().default(0),
  },
  (t) => [primaryKey({ columns: [t.herdId, t.itemId] })],
);

/** Per-herd progress on quest chains (quest definitions are content, §7). */
export const questProgress = pgTable(
  'quest_progress',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    herdId: uuid('herd_id')
      .notNull()
      .references(() => herds.id, { onDelete: 'cascade' }),
    questId: text('quest_id').notNull(),
    status: questStatus('status').notNull().default('active'),
    /** One counter per objective, parallel to the quest def's objectives array. */
    counters: jsonb('counters').notNull().$type<number[]>(),
    startedAt: timestamp('started_at', { withTimezone: true }).notNull().defaultNow(),
    completedAt: timestamp('completed_at', { withTimezone: true }),
  },
  (t) => [uniqueIndex('quest_progress_herd_quest_idx').on(t.herdId, t.questId)],
);

export const adventureRunStatusEnum = pgEnum('adventure_run_status', ['active', 'ended']);
export const battleStatusEnum = pgEnum('battle_status', ['active', 'won', 'retreated', 'fled']);

/**
 * In-flight interactive adventure runs (§9.3). Promoted from an in-memory store so a run
 * survives a server restart / redeploy / multiple instances. Resolution stays pure + seeded
 * (services/adventure-run.ts); this table only persists the run's cursor (regionId, sceneId,
 * step, seed) and the accrued, not-yet-banked haul. Loot/Cubes bank to the herd on `end`;
 * the row is then kept as `ended` (like quest_progress) for history.
 */
export const adventureRuns = pgTable(
  'adventure_runs',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    herdId: uuid('herd_id')
      .notNull()
      .references(() => herds.id, { onDelete: 'cascade' }),
    regionId: text('region_id').notNull(),
    /** Which script (from the region's pool) this run is playing — picked once at startRun (§9.3). */
    scriptId: text('script_id').notNull(),
    /** Horse ids in the party, in order. */
    party: jsonb('party').notNull().$type<string[]>(),
    /** Seed for the whole run; (seed, step) derives each choice's dice deterministically. */
    seed: integer('seed').notNull(),
    step: integer('step').notNull().default(0),
    sceneId: text('scene_id').notNull(),
    /** Accrued haul, banked to the herd only on `end`. */
    loot: jsonb('loot').notNull().$type<Record<string, number>>().default({}),
    cubes: integer('cubes').notNull().default(0),
    fatigue: integer('fatigue').notNull().default(0),
    /** Name of a wild horse befriended during this run (it joins the herd immediately). */
    befriended: text('befriended'),
    status: adventureRunStatusEnum('status').notNull().default('active'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('adventure_runs_herd_idx').on(t.herdId)],
);

// ── Combat (§9.4) — the persisted, battle-scoped combat state (jsonb payload of `battles.state`).
// Everything here is ephemeral to one fight: HP, KO, statuses all reset between battles (cozy — no
// grind-down, no persistent wounds). `statuses` is forward-compat (v1 minimum leaves it empty).
export type CombatStatusKind = 'rattled' | 'heartened';
export interface CombatStatus {
  kind: CombatStatusKind;
  turns: number;
}
export interface Combatant {
  id: string; // horseId (party) or a synthetic id (foe)
  side: 'party' | 'foe';
  name: string;
  maxHp: number;
  hp: number;
  ko: boolean; // "spooked/winded" — skipped for the rest of the fight, fine after
  stats: Record<string, number>;
  skills: Record<string, number>; // skill *levels* (boost a matching attack)
  luck: number;
  /** Benevolence (Agreeableness 0–100) — drives the Soothe approach (§9.4a). Party only. */
  kindness?: number;
  /** Combat class (§9.4b) — fixes this horse's attack to its signature approach. Party only. */
  class?: HorseClass;
  statuses: CombatStatus[];
  defending: boolean; // set by Defend, cleared at the start of this combatant's next turn
  enemyId?: string; // foe only — its EnemyDef id
  weakness?: Approach; // foe only — read by the approach layer (not the minimum)
  resist?: Approach;
}
export interface BattleEvent {
  round: number;
  text: string;
  kind?: string; // 'attack' | 'item' | 'defend' | 'flee' | 'ko' | 'end' | … (UI flavor)
}
export interface BattleSnapshot {
  round: number;
  turnIndex: number; // cursor into `order`
  order: string[]; // combatant ids in this round's turn order (recomputed each round)
  combatants: Combatant[];
  log: BattleEvent[];
}

/** One turn-based battle (§9.4). State lives in `state` (jsonb), seeded + resumable like a run. */
export const battles = pgTable(
  'battles',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    herdId: uuid('herd_id')
      .notNull()
      .references(() => herds.id, { onDelete: 'cascade' }),
    /** The adventure run this battle was entered from (§9.4), if any; null = standalone. */
    runId: uuid('run_id'),
    /** The EnemyDef ids in this fight (1–2 for v1). */
    enemies: jsonb('enemies').notNull().$type<string[]>(),
    /** Seed for the whole battle; (seed, round, turnIndex) derives each roll deterministically. */
    seed: integer('seed').notNull(),
    state: jsonb('state').notNull().$type<BattleSnapshot>(),
    status: battleStatusEnum('status').notNull().default('active'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('battles_herd_idx').on(t.herdId)],
);

/** Per-herd record of discovered coats — the Field Guide (collection pillar, §6/§7). */
export const fieldGuide = pgTable(
  'field_guide',
  {
    herdId: uuid('herd_id')
      .notNull()
      .references(() => herds.id, { onDelete: 'cascade' }),
    colorSlug: text('color_slug').notNull(),
    name: text('name').notNull(),
    firstHorseId: uuid('first_horse_id').references((): AnyPgColumn => horses.id, {
      onDelete: 'set null',
    }),
    discoveredAt: timestamp('discovered_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.herdId, t.colorSlug] })],
);

/** Placed Pasture structures (Library, Forge, …). One per type per herd (§6/§7). */
export const structures = pgTable(
  'structures',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    herdId: uuid('herd_id')
      .notNull()
      .references(() => herds.id, { onDelete: 'cascade' }),
    type: text('type').notNull(),
    level: integer('level').notNull().default(1),
    placedAt: timestamp('placed_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex('structures_herd_type_idx').on(t.herdId, t.type)],
);

/** A horse posted to a job at a Structure (§9.2). One job per horse. */
export const jobAssignments = pgTable(
  'job_assignments',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    horseId: uuid('horse_id')
      .notNull()
      .unique()
      .references(() => horses.id, { onDelete: 'cascade' }),
    herdId: uuid('herd_id')
      .notNull()
      .references(() => herds.id, { onDelete: 'cascade' }),
    structureType: text('structure_type').notNull(),
    skill: text('skill').notNull(),
    stat: text('stat').notNull(),
    assignedAt: timestamp('assigned_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('job_assignments_herd_idx').on(t.herdId)],
);

/** The relationship graph the autonomy engine reads + writes (§8). horseA < horseB. */
export const relationships = pgTable(
  'relationships',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    herdId: uuid('herd_id')
      .notNull()
      .references(() => herds.id, { onDelete: 'cascade' }),
    horseA: uuid('horse_a')
      .notNull()
      .references(() => horses.id, { onDelete: 'cascade' }),
    horseB: uuid('horse_b')
      .notNull()
      .references(() => horses.id, { onDelete: 'cascade' }),
    affinity: integer('affinity').notNull().default(0),
    type: text('type'), // friend | rival | bonded | null
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex('relationships_pair_idx').on(t.herdId, t.horseA, t.horseB)],
);

/** Append-only feed of autonomous happenings — the player's window into the herd (§8). */
export const journalEvents = pgTable(
  'journal_events',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    herdId: uuid('herd_id')
      .notNull()
      .references(() => herds.id, { onDelete: 'cascade' }),
    day: integer('day').notNull(),
    kind: text('kind').notNull(),
    text: text('text').notNull(),
    glyph: text('glyph'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('journal_events_herd_idx').on(t.herdId)],
);

/** Emergent groups horses self-organize (reading circle, …), gated by a Structure (§8.4). */
export const clubs = pgTable(
  'clubs',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    herdId: uuid('herd_id')
      .notNull()
      .references(() => herds.id, { onDelete: 'cascade' }),
    type: text('type').notNull(),
    members: jsonb('members').$type<string[]>().notNull().default([]),
    formedAt: timestamp('formed_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex('clubs_herd_type_idx').on(t.herdId, t.type)],
);

/** Marketplace listings — a horse offered at a fixed Cube price; escrowed buy (§10). */
export const marketListings = pgTable(
  'market_listings',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    herdId: uuid('herd_id')
      .notNull()
      .references(() => herds.id, { onDelete: 'cascade' }), // seller
    horseId: uuid('horse_id')
      .notNull()
      .references(() => horses.id, { onDelete: 'cascade' }),
    price: integer('price').notNull(),
    status: listingStatus('status').notNull().default('active'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('market_status_idx').on(t.status)],
);

/** Direct offer/accept trades — both sides escrowed, atomic settlement (§10). */
export const trades = pgTable('trades', {
  id: uuid('id').defaultRandom().primaryKey(),
  fromHerd: uuid('from_herd')
    .notNull()
    .references(() => herds.id, { onDelete: 'cascade' }),
  toHerd: uuid('to_herd')
    .notNull()
    .references(() => herds.id, { onDelete: 'cascade' }),
  offerHorses: jsonb('offer_horses').$type<string[]>().notNull().default([]),
  offerCubes: integer('offer_cubes').notNull().default(0),
  requestHorses: jsonb('request_horses').$type<string[]>().notNull().default([]),
  requestCubes: integer('request_cubes').notNull().default(0),
  status: tradeStatus('status').notNull().default('pending'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

/** Simple async direct messages (§10). */
export const messages = pgTable(
  'messages',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    fromHerd: uuid('from_herd')
      .notNull()
      .references(() => herds.id, { onDelete: 'cascade' }),
    toHerd: uuid('to_herd')
      .notNull()
      .references(() => herds.id, { onDelete: 'cascade' }),
    body: text('body').notNull(),
    readAt: timestamp('read_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('messages_to_idx').on(t.toHerd)],
);

/** Every state-changing economy action, for anti-abuse + moderation (§10). */
export const auditLog = pgTable(
  'audit_log',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    herdId: uuid('herd_id').references(() => herds.id, { onDelete: 'set null' }),
    action: text('action').notNull(),
    detail: jsonb('detail').$type<Record<string, unknown>>(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('audit_herd_idx').on(t.herdId)],
);

/** Player reports for moderation review (§11). */
export const reports = pgTable('reports', {
  id: uuid('id').defaultRandom().primaryKey(),
  reporterHerd: uuid('reporter_herd').references(() => herds.id, { onDelete: 'set null' }),
  targetType: text('target_type').notNull(), // herd | horse | message
  targetId: text('target_id').notNull(),
  reason: text('reason').notNull(),
  status: text('status').notNull().default('open'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export type UserRow = typeof users.$inferSelect;
export type HerdRow = typeof herds.$inferSelect;
export type HorseRow = typeof horses.$inferSelect;
