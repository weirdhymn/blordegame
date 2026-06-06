/*
 * Promote a user to admin (role='admin'), so they can use mod tools and the gated mint route.
 * Run:  pnpm --filter @blorse/server set-admin <username>
 * In production on Fly:  fly ssh console  → then the same command (see DEPLOY.md).
 * Targets whatever DATABASE_URL points at; idempotent.
 */
import { eq } from 'drizzle-orm';
import { createDb } from '../src/db/client.js';
import { runMigrations } from '../src/db/migrate.js';
import { users } from '../src/db/schema.js';

async function main(): Promise<void> {
  const username = process.argv[2];
  if (!username) {
    console.error('usage: pnpm --filter @blorse/server set-admin <username>');
    process.exit(1);
  }
  const db = createDb();
  await runMigrations(db);
  const res = await db
    .update(users)
    .set({ role: 'admin' })
    .where(eq(users.username, username))
    .returning({ username: users.username });
  if (res.length === 0) {
    console.error(`no user named "${username}"`);
    process.exit(1);
  }
  console.log(`promoted "${username}" to admin`);
  process.exit(0);
}

main().catch((err: unknown) => {
  console.error(err);
  process.exit(1);
});
