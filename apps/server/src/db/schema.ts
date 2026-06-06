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
  uuid,
} from 'drizzle-orm/pg-core';
import type { Genotype } from '@blorse/genetics';
import type { GlitchKind, LifeStage } from '@blorse/render-core';

export const userRole = pgEnum('user_role', ['player', 'mod', 'admin']);
export const lifeStageEnum = pgEnum('life_stage', ['foal', 'adult']);
export const glitchKindEnum = pgEnum('glitch_kind', ['inverted', 'screen', 'shade']);
export const horseOrigin = pgEnum('horse_origin', ['founder', 'wild', 'bred']);

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

export type UserRow = typeof users.$inferSelect;
export type HerdRow = typeof herds.$inferSelect;
export type HorseRow = typeof horses.$inferSelect;
