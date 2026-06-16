/*
 * The persistence canary (DEPLOY.md §5 — "the hard gate"), executed as TWO separate processes.
 *
 *   node --import ./scripts/register.mjs scripts/canary.ts write
 *      → registers/locates the canary herd, stamps a unique token into it, prints the token.
 *   node --import ./scripts/register.mjs scripts/canary.ts check <token>
 *      → a FRESH process (the "redeployed" app) re-opens DATABASE_URL and confirms the token
 *        survived. PASS only if the value written by the first process is read by the second.
 *
 * Two independent processes, each doing its own createDb()/runMigrations() against the same
 * DATABASE_URL, model exactly what a redeploy is: the app container is replaced; the managed
 * database must persist. (For the old PGlite-on-a-volume model this proved the volume wasn't
 * baked into the image; for managed Postgres it proves the redeploy keeps pointing at — and
 * does not wipe — the external DB.)
 */
import { eq } from 'drizzle-orm';
import { createDb } from '../src/db/client.js';
import { runMigrations } from '../src/db/migrate.js';
import { herds, users } from '../src/db/schema.js';
import { getHerdForUser, registerUser } from '../src/services/auth.js';

const CANARY_USER = 'persistence-canary';

async function main(): Promise<void> {
  const mode = process.argv[2];
  const db = createDb(); // reads DATABASE_URL — the real production routing
  await runMigrations(db); // the boot path

  if (mode === 'write') {
    const existing = await db.query.users.findFirst({ where: eq(users.username, CANARY_USER) });
    const herd = existing
      ? await getHerdForUser(db, existing.id)
      : (await registerUser(db, CANARY_USER, 'canarycanary1')).herd;
    if (!herd) throw new Error('canary: no herd');
    const token = Date.now() % 1_000_000;
    await db.update(herds).set({ cubes: token }).where(eq(herds.id, herd.id));
    console.log(`CANARY_WRITE token=${token} herd=${herd.id}`);
    process.exit(0);
  }

  if (mode === 'check') {
    const expected = Number(process.argv[3]);
    const u = await db.query.users.findFirst({ where: eq(users.username, CANARY_USER) });
    const herd = u ? await getHerdForUser(db, u.id) : null;
    const got = herd?.cubes ?? null;
    const pass = got === expected && Number.isFinite(expected);
    console.log(`CANARY_CHECK expected=${expected} got=${got} herd=${herd?.id ?? '(none)'}`);
    console.log(
      pass
        ? '=== CANARY: PASS — data written before the "redeploy" survived it ==='
        : '=== CANARY: FAIL — data did not persist across the process boundary ===',
    );
    process.exit(pass ? 0 : 1);
  }

  console.error('canary: mode must be "write" or "check <token>"');
  process.exit(2);
}

main().catch((err: unknown) => {
  console.error('canary failed:', err);
  process.exit(1);
});
