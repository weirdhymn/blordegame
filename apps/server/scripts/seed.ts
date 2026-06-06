/*
 * Idempotent dev seed.  Run:  pnpm --filter @blorse/server seed
 *
 * Populates a database with one login-able Herd + one known-genotype starter horse so
 * the API can be exercised by hand. The three starter regions (Green Grass, Dusty Dunes,
 * Weird Woods) are CODE content (src/content/regions.ts), not table rows — they always
 * exist at runtime and need no seeding.
 *
 * Idempotent: the account is reused if it already exists, and the starter horse is minted
 * only once (keyed by its pinned seed + 'founder' origin). A founder horse has no parents,
 * so it introduces no lineage; its stats come from the engine via the pinned seed, so it
 * respects every breeding/balance rule. Safe to run repeatedly.
 *
 * Writes to whatever DATABASE_URL points at; if unset, defaults to a persisted PGlite dir
 * (file:./.data/blorse) so the data survives restarts. Start the server with the SAME
 * DATABASE_URL so it reads this database.
 */
import { eq } from 'drizzle-orm';
import { resolve } from '@blorse/genetics';
import { createDb } from '../src/db/client.js';
import { runMigrations } from '../src/db/migrate.js';
import { users } from '../src/db/schema.js';
import { getHerdForUser, registerUser } from '../src/services/auth.js';
import { listHerdHorses, mintHorse } from '../src/services/horse.js';

const SEED_USER = 'tester';
const SEED_PASS = 'horsehorse1'; // ≥8 chars — valid per the /auth rules
const STARTER_GENOTYPE = { E: 'Ee', A: 'Aa' }; // resolves to "Bay"
const STARTER_SEED = 1337; // pinned → identical look + stats on every run
const STARTER_NAME = 'Clementine';

async function main(): Promise<void> {
  if (!process.env.DATABASE_URL) {
    process.env.DATABASE_URL = 'file:./.data/blorse';
    console.log('• DATABASE_URL unset — defaulting to file:./.data/blorse');
    console.log('  (run the server with the SAME DATABASE_URL to read this data)');
  }
  const db = createDb();
  await runMigrations(db);
  console.log(`• migrations applied  (DATABASE_URL=${process.env.DATABASE_URL})`);

  // 1) Account + Herd — idempotent by username.
  const existing = await db.query.users.findFirst({ where: eq(users.username, SEED_USER) });
  const herd = existing
    ? await getHerdForUser(db, existing.id)
    : (await registerUser(db, SEED_USER, SEED_PASS)).herd;
  if (!herd) throw new Error('failed to resolve the seed herd');
  console.log(
    existing
      ? `• reused account "${SEED_USER}"  (herd ${herd.id})`
      : `• created account "${SEED_USER}"  (herd ${herd.id})`,
  );

  // 2) Starter horse — idempotent by pinned seed + founder origin.
  const mine = await listHerdHorses(db, herd.id);
  const starter = mine.find((h) => h.seed === STARTER_SEED && h.origin === 'founder');
  if (starter) {
    console.log(
      `• starter horse already present: ${starter.id} — ${resolve(starter.genotype).displayName} "${starter.name ?? ''}"`,
    );
  } else {
    const minted = await mintHorse(db, {
      herdId: herd.id,
      genotype: STARTER_GENOTYPE,
      origin: 'founder',
      seed: STARTER_SEED,
      lifeStage: 'adult', // adult so it can breed / adventure immediately
      name: STARTER_NAME,
    });
    console.log(
      `• minted starter horse ${minted.id} — ${resolve(minted.genotype).displayName} "${STARTER_NAME}" (adult)`,
    );
  }

  console.log('\n=== seed complete ===');
  console.log(`  login       : ${SEED_USER} / ${SEED_PASS}`);
  console.log(`  herd id     : ${herd.id}`);
  console.log(`  open region : green-grass   (dusty-dunes & weird-woods unlock via quests)`);
  process.exit(0);
}

main().catch((err: unknown) => {
  console.error('seed failed:', err);
  process.exit(1);
});
