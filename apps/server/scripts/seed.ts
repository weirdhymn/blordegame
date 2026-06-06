/*
 * Idempotent dev seed.  Run:  pnpm --filter @blorse/server seed
 *
 * Guarantees a known login-able account for hand-testing the API. Every new Herd is already
 * granted its cold-start position by registerUser — two unrelated founder adults + a starting
 * Cubes purse (§6/§14) — so the seed mainly just pins the `tester` login.
 *
 * The three starter regions (Green Grass, Dusty Dunes, Weird Woods) are CODE content
 * (src/content/regions.ts), not table rows — they always exist and need no seeding.
 *
 * Idempotent: the account is reused if present, and grantStarterHorses is a no-op once the
 * Herd has horses. Writes to DATABASE_URL (defaults to a persisted file:./.data/blorse so the
 * data survives restarts). Start the server with the SAME DATABASE_URL to read this database.
 */
import { resolve } from '@blorse/genetics';
import { eq } from 'drizzle-orm';
import { createDb } from '../src/db/client.js';
import { runMigrations } from '../src/db/migrate.js';
import { horses, users } from '../src/db/schema.js';
import { getHerdForUser, grantStarterHorses, registerUser } from '../src/services/auth.js';
import { listHerdHorses, mintHorse } from '../src/services/horse.js';
import { computeTavernFee, listTavern } from '../src/services/tavern.js';

const SEED_USER = 'tester';
const SEED_PASS = 'horsehorse1'; // ≥8 chars — valid per the /auth rules

async function main(): Promise<void> {
  if (!process.env.DATABASE_URL) {
    process.env.DATABASE_URL = 'file:./.data/blorse';
    console.log('• DATABASE_URL unset — defaulting to file:./.data/blorse');
    console.log('  (run the server with the SAME DATABASE_URL to read this data)');
  }
  const db = createDb();
  await runMigrations(db);
  console.log(`• migrations applied  (DATABASE_URL=${process.env.DATABASE_URL})`);

  // Account + Herd — idempotent by username. registerUser grants the cold-start position.
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

  // Top up starters even if this herd predates the cold-start grant (idempotent — no-op if present).
  await grantStarterHorses(db, herd.id);
  const mine = await listHerdHorses(db, herd.id);
  const coats = mine.map((h) => `${resolve(h.genotype).displayName} (${h.lifeStage})`).join(', ');

  // Stock the shared Tavern so recruiting is playable immediately (idempotent).
  if ((await listTavern(db)).length === 0) {
    const stock = [
      { genotype: { E: 'Ee', A: 'aa' }, seed: 0xa11 }, // Black
      { genotype: { E: 'Ee', A: 'At' }, seed: 0xb22 }, // Seal Brown
      { genotype: { G: 'Gg', E: 'Ee', A: 'Aa' }, seed: 0xc33 }, // Gray (rarer → pricier)
    ];
    for (const s of stock) {
      const h = await mintHorse(db, {
        herdId: null,
        genotype: s.genotype,
        origin: 'wild',
        seed: s.seed,
        lifeStage: 'adult',
      });
      await db
        .update(horses)
        .set({ tavernFee: computeTavernFee(h) })
        .where(eq(horses.id, h.id));
    }
    console.log(`• stocked the Tavern with ${stock.length} horses`);
  }

  console.log('\n=== seed complete ===');
  console.log(`  login       : ${SEED_USER} / ${SEED_PASS}`);
  console.log(`  herd id     : ${herd.id}`);
  console.log(`  cubes       : ${herd.cubes}`);
  console.log(`  horses (${mine.length}) : ${coats}`);
  console.log(`  open region : green-grass   (dusty-dunes & weird-woods unlock via quests)`);
  process.exit(0);
}

main().catch((err: unknown) => {
  console.error('seed failed:', err);
  process.exit(1);
});
