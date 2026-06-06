import { sql } from 'drizzle-orm';
import {
  type AnyPgColumn,
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
import type { Genotype } from '@blorse/genetics';
import type { GlitchKind, LifeStage } from '@blorse/render-core';

export const userRole = pgEnum('user_role', ['player', 'mod', 'admin']);
export const lifeStageEnum = pgEnum('life_stage', ['foal', 'adult']);
export const glitchKindEnum = pgEnum('glitch_kind', ['inverted', 'screen', 'shade']);
export const horseOrigin = pgEnum('horse_origin', ['founder', 'wild', 'bred']);
export const questStatus = pgEnum('quest_status', ['active', 'completed']);

/** Auth identity only (BLORSE_PLAN.md §6). Game state hangs off the Herd, not the User. */
export const users = pgTable('users', {
  id: uuid('id').defaultRandom().primaryKey(),
  username: text('username').notNull().unique(),
  passwordHash: text('password_hash').notNull(),
  role: userRole('role').notNull().default('player'),
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

export type UserRow = typeof users.$inferSelect;
export type HerdRow = typeof herds.$inferSelect;
export type HorseRow = typeof horses.$inferSelect;
