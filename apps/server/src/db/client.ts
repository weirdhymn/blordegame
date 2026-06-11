import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { PGlite } from '@electric-sql/pglite';
import type { ExtractTablesWithRelations } from 'drizzle-orm';
import { drizzle as drizzleNodePg, type NodePgDatabase } from 'drizzle-orm/node-postgres';
import type { PgDatabase, PgQueryResultHKT } from 'drizzle-orm/pg-core';
import { drizzle as drizzlePglite, type PgliteDatabase } from 'drizzle-orm/pglite';
import pg from 'pg';
import * as schema from './schema.js';

/**
 * The driver-AGNOSTIC database handle every service types against: the shared `PgDatabase` base
 * of both drivers, so the whole game logic runs identically on PGlite (embedded — dev, tests,
 * the volume-backed beta deploy) and managed Postgres via node-postgres (`postgres://` URLs).
 * The dialect is postgres either way; no schema or query changes between them (BLORSE_PLAN §6).
 */
export type DB = PgDatabase<
  PgQueryResultHKT,
  typeof schema,
  ExtractTablesWithRelations<typeof schema>
>;

/** The transaction handle `db.transaction((tx) => …)` passes — same query API as DB. */
export type Tx = Parameters<Parameters<DB['transaction']>[0]>[0];
/** Accepted by services that must work both standalone and inside a caller's transaction —
 *  the atomic-economy kernel (wallet/inventory) threads this through every value-moving flow. */
export type DbLike = DB | Tx;

/** The concrete driver union — what `createDb` actually returns. `runMigrations` narrows on it
 *  (each driver ships its own migrator); everything else only needs the `DB` base above. */
export type DriverDb = PgliteDatabase<typeof schema> | NodePgDatabase<typeof schema>;

/** Embedded Postgres (PGlite): zero external services. undefined dataDir → in-memory (tests). */
export function createPgliteDb(dataDir?: string): PgliteDatabase<typeof schema> {
  const client = new PGlite(dataDir);
  return drizzlePglite(client, { schema });
}

/** Managed Postgres via node-postgres. The Pool connects lazily — the first query/migration
 *  surfaces any bad credentials, not construction. */
export function createNodePgDb(connectionString: string): NodePgDatabase<typeof schema> {
  const pool = new pg.Pool({ connectionString });
  return drizzleNodePg(pool, { schema });
}

/**
 * Create the database from DATABASE_URL:
 *   - `postgres://…` / `postgresql://…` → managed Postgres (node-postgres Pool)
 *   - `file:./path` → PGlite persisted on disk (the volume-backed beta deploy)
 *   - unset → PGlite in-memory (tests / scratch)
 */
export function createDb(): DriverDb {
  const url = process.env.DATABASE_URL;
  if (url && url.startsWith('postgres')) {
    return createNodePgDb(url);
  }
  const dataDir = url ? url.replace(/^file:/, '') : undefined;
  // PGlite creates only the leaf data dir, not intermediate parents — ensure they exist
  // so a path like file:./.data/blorse works on a clean checkout.
  if (dataDir) mkdirSync(dirname(dataDir), { recursive: true });
  return createPgliteDb(dataDir);
}
