/*
 * The Living Herd, read cold (§8) — mint a varied cast, advance it day by day, and print the
 * journal exactly as a player would read it over a multi-day stretch. This is the play-test
 * harness: run it, read the beats, and judge whether the herd surprises and charms you.
 *
 * Everything is seeded, so the SAME seed always tells the SAME herd-history (that's the point —
 * unpredictable to the player, reproducible to the server). Pass a different seed for a different
 * cast of events; pass more days to read further.
 *
 * Run from apps/server:
 *   node --import ./scripts/register.mjs scripts/herd-journal.ts [days] [seedHex]
 *   e.g.  node --import ./scripts/register.mjs scripts/herd-journal.ts 14 0x1234
 */
import { eq } from 'drizzle-orm';
import { buildApp } from '../src/app.js';
import { createPgliteDb } from '../src/db/client.js';
import { runMigrations } from '../src/db/migrate.js';
import { herds, horses } from '../src/db/schema.js';
import { advanceHerd } from '../src/services/daily.js';
import { mintHorse } from '../src/services/horse.js';
import { gameDay } from '../src/util/clock.js';
import type { Personality } from '../src/services/personality.js';

const DAY_MS = 86_400_000;

// A characterful cast — names you can follow, temperaments chosen to give the sim something to do:
// two warm souls who ought to pair off, a curious wanderer, a prickly worrier, a steady middle,
// and a bold odd one out. (o,c,e,a,n on 0–100.)
const CAST: { name: string; p: Personality }[] = [
  { name: 'Clementine', p: { o: 60, c: 55, e: 88, a: 90, n: 15 } },
  { name: 'Bramble', p: { o: 58, c: 60, e: 85, a: 88, n: 18 } },
  { name: 'Pickle', p: { o: 97, c: 35, e: 70, a: 55, n: 40 } },
  { name: 'Thistle', p: { o: 45, c: 30, e: 40, a: 20, n: 85 } },
  { name: 'Olive', p: { o: 55, c: 65, e: 60, a: 65, n: 25 } },
  { name: 'Sprocket', p: { o: 85, c: 20, e: 90, a: 35, n: 60 } },
];

const trait = (p: Personality): string => `O${p.o} C${p.c} E${p.e} A${p.a} N${p.n}`;

async function main(): Promise<void> {
  const days = Number(process.argv[2] ?? 12);
  const seed = Number(process.argv[3] ?? 0x1234) >>> 0;

  const db = createPgliteDb();
  await runMigrations(db);
  const app = buildApp(db, { rateLimitMax: 100_000, authRateLimitMax: 100_000, allowMint: true });
  await app.ready();
  const inject = (o: { method: string; url: string; payload?: unknown }) =>
    app.inject({ ...o, url: `/api${o.url}` } as never);

  const reg = await inject({
    method: 'POST',
    url: '/auth/register',
    payload: { username: 'journalreader', password: 'journaldemo1' },
  });
  const herdId = (reg.json() as { herd: { id: string } }).herd.id;
  // Release the starter pair so only our named cast acts, then pin the seed + clock.
  await db.update(horses).set({ herdId: null }).where(eq(horses.herdId, herdId));
  await db
    .update(herds)
    .set({ simSeed: seed, lastSimTick: gameDay(Date.now()) })
    .where(eq(herds.id, herdId));
  for (const c of CAST)
    await mintHorse(db, {
      herdId,
      genotype: { E: 'ee' },
      origin: 'wild',
      lifeStage: 'adult',
      glitch: null,
      personality: c.p,
      name: c.name,
    });

  console.log(`\n=== The Living Herd — ${days} days, seed 0x${seed.toString(16)} ===\n`);
  console.log('The cast:');
  for (const c of CAST) console.log(`  ${c.name.padEnd(11)} ${trait(c.p)}`);
  console.log('');

  const base = Date.now();
  let totalBeats = 0;
  for (let d = 1; d <= days; d++) {
    const { journal } = await advanceHerd(db, herdId, base + d * DAY_MS);
    const label = `Day ${String(d).padStart(2)}`;
    if (journal.length === 0) {
      console.log(`${label}  · (a quiet day)`);
    } else {
      for (const b of journal) {
        console.log(`${label}  ${b.glyph ?? '·'}  ${b.text}`);
        totalBeats++;
      }
    }
  }

  // The quirks the herd picked up along the way (cosmetic — they live on the horse sheet).
  const roster = await db.select().from(horses).where(eq(horses.herdId, herdId));
  console.log('\n--- Quirks picked up (worn on the horse sheet, purely cosmetic) ---');
  let anyQuirk = false;
  for (const h of roster) {
    const qs = h.quirks as string[];
    if (qs.length > 0) {
      anyQuirk = true;
      console.log(`  ${(h.name ?? 'A horse').padEnd(11)} 🌿 ${qs.join('; ')}`);
    }
  }
  if (!anyQuirk) console.log('  (none yet — give it more days)');

  console.log(
    `\n${totalBeats} beats over ${days} days. Re-run for a different seed to get a different herd-history.\n`,
  );
  await app.close();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
