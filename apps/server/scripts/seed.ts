/*
 * Idempotent dev seed.  Run:  pnpm --filter @blorse/server seed
 *
 * Guarantees a known login-able TESTER account stocked to exercise every shipped system
 * (§7j–§7v): the Garden + all three fertilizers, cooking (grains + crops + saffron),
 * crafting (incl. planks/bricks, Books + Board Games for Night Reading), the Debug Shrine
 * (fairy dust + one already-glitched horse), the Studbook (mushroom-carrier pair, gray,
 * dun, cream), all four regions unlocked via their real quest chain, a mid-ladder herd
 * tier, and pre-built Library + Meeting Hall so clubs and Night Reading fire on day one.
 *
 * NOTE: the password is deliberately shorter than the registration policy (it's a dev
 * account, seeded service-side); /auth/login validates shape only, so it logs in fine.
 *
 * Idempotent: account reused by username; the password is RE-PINNED every run; items top
 * up to targets (never duplicate); named horses mint once; structures build once.
 * Writes to DATABASE_URL (defaults to file:./.data/blorse). Start the server with the
 * SAME DATABASE_URL to read this database.
 */
import { resolve } from '@blorse/genetics';
import { eq } from 'drizzle-orm';
import { hashPassword } from '../src/auth/password.js';
import { createDb } from '../src/db/client.js';
import { runMigrations } from '../src/db/migrate.js';
import { herds, horses, users } from '../src/db/schema.js';
import { getHerdForUser, grantStarterHorses, registerUser } from '../src/services/auth.js';
import { listHerdHorses, mintHorse } from '../src/services/horse.js';
import { grantItems, itemQty } from '../src/services/inventory.js';
import { buildStructure, getPasture } from '../src/services/pasture.js';
import { recordEvent } from '../src/services/quests.js';
import { computeTavernFee, listTavern } from '../src/services/tavern.js';

const SEED_USER = 'tester1';
const SEED_PASS = 'tester1'; // dev-only; below the registration policy ON PURPOSE (see note)

const SEED_CUBES = 5_000;
const SEED_TIER = 3; // Ranch: 15 horses, 4 job slots — mid-ladder, room to climb both ways

/** Inventory targets — the seed TOPS UP to these (idempotent), never stacks duplicates. */
const KIT: Record<string, number> = {
  // garden stock (every tier, both duals)
  radish: 12,
  carrot: 12,
  'carrot-greens': 4,
  'grain-corn': 10,
  pumpkin: 8,
  'grain-wheat': 10,
  'marsh-sage': 8,
  apple: 8,
  walnut: 6,
  // fertilizers + their inputs
  fertilizer: 10,
  'rich-fertilizer': 4,
  'magic-fertilizer': 3,
  bone: 6,
  'fairy-dust': 4, // shrine offerings AND magic-fert input — the deliberate tension
  // cooking + combat
  'saffron-bloom': 3,
  'healing-potion': 4,
  // crafting + building
  timber: 30,
  ore: 30,
  clay: 20,
  'plant-fiber': 30,
  plank: 10,
  brick: 10,
  book: 4, // Night Reading
  'board-game': 2, // Meeting-Hall game nights
  'rare-gem': 2,
};

/** A deliberate testing stable (beyond the two starters), minted once each by name. */
const STABLE: {
  name: string;
  genotype: Record<string, string>;
  glitch?: 'inverted';
  lifeStage: 'adult' | 'foal';
  origin: 'founder' | 'bred';
  note: string;
}[] = [
  // Mushroom-carrier pair (§7u): breed them toward the Studbook's "Something New".
  {
    name: 'Chanterelle',
    genotype: { E: 'ee', My: 'Mymy' },
    lifeStage: 'adult',
    origin: 'founder',
    note: 'mushroom carrier',
  },
  {
    name: 'Porcini',
    genotype: { E: 'ee', My: 'Mymy', Sty: 'nSty' },
    lifeStage: 'adult',
    origin: 'founder',
    note: 'mushroom carrier (sooty)',
  },
  // One of each headline gene for goals/odds/guide testing.
  {
    name: 'Latte',
    genotype: { E: 'ee', C: 'CCr' },
    lifeStage: 'adult',
    origin: 'founder',
    note: 'palomino (single cream)',
  },
  {
    name: 'Stripe',
    genotype: { E: 'Ee', A: 'Aa', D: 'Dd' },
    lifeStage: 'adult',
    origin: 'founder',
    note: 'dun',
  },
  {
    name: 'Dapple',
    genotype: { G: 'Gg', E: 'Ee', A: 'Aa' },
    lifeStage: 'adult',
    origin: 'founder',
    note: 'gray',
  },
  // Pre-glitched: exercises the Shrine's bug report + the render transforms immediately.
  {
    name: 'Pixel',
    genotype: { E: 'Ee', A: 'aa' },
    glitch: 'inverted',
    lifeStage: 'adult',
    origin: 'founder',
    note: 'inverted glitch',
  },
  // A bred foal: its reveal exercises the Morning Post headline + Studbook hooks.
  {
    name: 'Sprout',
    genotype: { E: 'ee', C: 'CCr', D: 'Dd' },
    lifeStage: 'foal',
    origin: 'bred',
    note: 'foal — reveals as a dual-goal coat',
  },
];

async function main(): Promise<void> {
  if (!process.env.DATABASE_URL) {
    process.env.DATABASE_URL = 'file:./.data/blorse';
    console.log('• DATABASE_URL unset — defaulting to file:./.data/blorse');
    console.log('  (run the server with the SAME DATABASE_URL to read this data)');
  }
  const db = createDb();
  await runMigrations(db);
  console.log(`• migrations applied  (DATABASE_URL=${process.env.DATABASE_URL})`);

  // Account + Herd — idempotent by username; the password is re-pinned EVERY run so
  // "tester1 / tester1" always works no matter what the account has been through.
  const existing = await db.query.users.findFirst({ where: eq(users.username, SEED_USER) });
  const herd = existing
    ? await getHerdForUser(db, existing.id)
    : (await registerUser(db, SEED_USER, SEED_PASS)).herd;
  if (!herd) throw new Error('failed to resolve the seed herd');
  await db
    .update(users)
    .set({ role: 'admin', passwordHash: hashPassword(SEED_PASS), frozen: false })
    .where(eq(users.username, SEED_USER));
  console.log(
    `${existing ? '• reused' : '• created'} account "${SEED_USER}" (admin, password re-pinned)`,
  );

  // Mid-ladder progression + a full purse (top-up, never clawback).
  await db
    .update(herds)
    .set({ level: Math.max(herd.level, SEED_TIER), cubes: Math.max(herd.cubes, SEED_CUBES) })
    .where(eq(herds.id, herd.id));
  console.log(`• herd tier ≥ ${SEED_TIER} (Ranch), cubes ≥ ${SEED_CUBES}`);

  // Walk the real region-unlock chain by its own events (idempotent: counters cap at need).
  await recordEvent(db, herd.id, { type: 'roam', regionId: 'green-grass' });
  await recordEvent(db, herd.id, { type: 'roam', regionId: 'dusty-dunes' });
  await recordEvent(db, herd.id, { type: 'roam', regionId: 'weird-woods' });
  await recordEvent(db, herd.id, { type: 'expedition', regionId: 'weird-woods' });
  await recordEvent(db, herd.id, { type: 'expedition', regionId: 'weird-woods' });
  console.log('• quest chain advanced — all four regions open (incl. The Tundra)');

  // The kit: top up each item to its target.
  let granted = 0;
  for (const [id, target] of Object.entries(KIT)) {
    const have = await itemQty(db, herd.id, id);
    if (have < target) {
      await grantItems(db, herd.id, [{ id, qty: target - have }]);
      granted += target - have;
    }
  }
  console.log(`• inventory topped up (${granted} items granted this run)`);

  // Starters (no-op if present) + the named testing stable (mint once each).
  await grantStarterHorses(db, herd.id);
  const mine = await listHerdHorses(db, herd.id);
  const names = new Set(mine.map((h) => h.name));
  for (const s of STABLE) {
    if (names.has(s.name)) continue;
    await mintHorse(db, {
      herdId: herd.id,
      genotype: s.genotype,
      origin: s.origin,
      lifeStage: s.lifeStage,
      glitch: s.glitch ?? null,
      name: s.name,
    });
    console.log(`• minted ${s.name} — ${s.note}`);
  }

  // Library + Meeting Hall so Night Reading and clubs fire on the first rollover.
  const pasture = await getPasture(db, herd.id);
  const builtTypes = new Set(pasture.structures.map((b) => b.type));
  for (const type of ['library', 'meeting-hall']) {
    if (builtTypes.has(type)) continue;
    const r = await buildStructure(db, herd.id, type);
    console.log(r.ok ? `• built the ${type}` : `! could not build ${type}: ${r.message}`);
  }

  // Stock the shared Tavern so recruiting is playable immediately (idempotent).
  if ((await listTavern(db)).length === 0) {
    const stock = [
      { genotype: { E: 'Ee', A: 'aa' }, seed: 0xa11 }, // Black
      { genotype: { E: 'EE', A: 'AA' }, seed: 0xb22 }, // Bay
      { genotype: { G: 'Gg', E: 'Ee', A: 'Aa' }, seed: 0xc33 }, // Gray (rarer → pricier)
      { genotype: { E: 'ee', My: 'Mymy' }, seed: 0xd44 }, // a quiet mushroom carrier
      { genotype: { E: 'Ee', A: 'Aa', Z: 'nZ' }, seed: 0xe55 }, // Silver — Tundra-flavored
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

  const finalHerd = await db.query.herds.findFirst({ where: eq(herds.id, herd.id) });
  const stable = await listHerdHorses(db, herd.id);
  const coats = stable
    .map(
      (h) =>
        `${h.name ?? '?'}: ${h.lifeStage === 'foal' ? 'Foal' : resolve(h.genotype).displayName}`,
    )
    .join(', ');

  console.log('\n=== seed complete ===');
  console.log(`  login        : ${SEED_USER} / ${SEED_PASS}`);
  console.log(`  herd id      : ${herd.id}`);
  console.log(`  tier / cubes : ${finalHerd?.level} / ${finalHerd?.cubes}`);
  console.log(`  horses (${stable.length})  : ${coats}`);
  console.log(
    '  regions      : all four open (Green Grass · Dusty Dunes · Weird Woods · The Tundra)',
  );
  console.log('  structures   : Library + Meeting Hall built (Night Reading / clubs live)');
  process.exit(0);
}

main().catch((err: unknown) => {
  console.error('seed failed:', err);
  process.exit(1);
});
