import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { migrate } from 'drizzle-orm/pglite/migrator';
import type { DB } from './client.js';

const migrationsFolder = join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'drizzle');

/** Apply the generated SQL migrations (idempotent — tracks applied ones). */
export async function runMigrations(db: DB): Promise<void> {
  await migrate(db, { migrationsFolder });
}
