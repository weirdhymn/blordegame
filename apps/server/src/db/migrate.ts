import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { migrate as migrateNodePg } from 'drizzle-orm/node-postgres/migrator';
import { migrate as migratePglite } from 'drizzle-orm/pglite/migrator';
import { PgliteDatabase } from 'drizzle-orm/pglite';
import type { DriverDb } from './client.js';

const migrationsFolder = join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'drizzle');

/** Apply the generated SQL migrations (idempotent — tracks applied ones). Each driver ships its
 *  own migrator, so this takes the CONCRETE driver union and narrows; services never need it. */
export async function runMigrations(db: DriverDb): Promise<void> {
  if (db instanceof PgliteDatabase) {
    await migratePglite(db, { migrationsFolder });
  } else {
    await migrateNodePg(db, { migrationsFolder });
  }
}
