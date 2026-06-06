import { PGlite } from '@electric-sql/pglite';
import { drizzle, type PgliteDatabase } from 'drizzle-orm/pglite';
import * as schema from './schema.js';

export type DB = PgliteDatabase<typeof schema>;

/**
 * Phase 3 uses PGlite — an embedded Postgres — so the whole stack runs and is
 * tested with zero external services. The Drizzle schema is dialect-postgres, so
 * production swaps this one factory for `drizzle-orm/node-postgres` against a real
 * Postgres with no schema/query changes (BLORSE_PLAN.md §6).
 */
export function createPgliteDb(dataDir?: string): DB {
  const client = new PGlite(dataDir); // undefined dataDir → in-memory (tests)
  return drizzle(client, { schema });
}

export function createDb(): DB {
  const url = process.env.DATABASE_URL;
  if (url && url.startsWith('postgres')) {
    throw new Error(
      'node-postgres is not wired yet (Phase 3 uses PGlite). Unset DATABASE_URL for ' +
        'in-memory, or use a "file:./data" path for a persisted PGlite dir.',
    );
  }
  const dataDir = url ? url.replace(/^file:/, '') : undefined;
  return createPgliteDb(dataDir);
}
