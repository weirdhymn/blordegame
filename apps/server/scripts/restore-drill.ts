/*
 * The restore DRILL — proves the deliverable that matters: "I saw data destroyed and
 * restored from backup," not "backups run."
 *
 *   CONFIRM_RESTORE=yes node --import ./scripts/register.mjs scripts/restore-drill.ts
 *
 * Against DATABASE_URL (a live postgres://):
 *   1. fingerprint the live data (per-table row counts + one herd's cubes + one horse's
 *      genotype/seed),
 *   2. back it up (scripts/backup.ts → real pg_dump),
 *   3. DESTROY it (DROP SCHEMA public CASCADE) and PROVE it is gone,
 *   4. restore it (scripts/restore.ts → real pg_restore),
 *   5. re-fingerprint and ASSERT byte-identical; print PASS/FAIL + the numbers.
 *
 * Doubles as the CI restore job (same script, ephemeral DB). Exits non-zero on any mismatch.
 */
import { execFileSync } from 'node:child_process';
import pg from 'pg';

interface Fingerprint {
  counts: Record<string, number>;
  herd: { id: string; cubes: number; level: number } | null;
  horse: { name: string | null; genotype: string; seed: number } | null;
}

async function fingerprint(client: pg.Client): Promise<Fingerprint> {
  const tables = (
    await client.query<{ table_name: string }>(
      `SELECT table_name FROM information_schema.tables
       WHERE table_schema='public' AND table_type='BASE TABLE' ORDER BY table_name`,
    )
  ).rows.map((r) => r.table_name);
  const counts: Record<string, number> = {};
  for (const t of tables) {
    const r = await client.query<{ n: string }>(`SELECT count(*)::text AS n FROM "${t}"`);
    counts[t] = Number(r.rows[0]?.n ?? 0);
  }
  const herdRow = (
    await client.query<{ id: string; cubes: number; level: number }>(
      `SELECT id, cubes, level FROM herds ORDER BY created_at LIMIT 1`,
    )
  ).rows[0];
  const herd = herdRow
    ? { id: herdRow.id, cubes: Number(herdRow.cubes), level: Number(herdRow.level) }
    : null;
  let horse: Fingerprint['horse'] = null;
  if (herd) {
    const h = (
      await client.query<{ name: string | null; genotype: unknown; seed: number }>(
        `SELECT name, genotype, seed FROM horses WHERE herd_id=$1 ORDER BY born_at LIMIT 1`,
        [herd.id],
      )
    ).rows[0];
    if (h) horse = { name: h.name, genotype: JSON.stringify(h.genotype), seed: Number(h.seed) };
  }
  return { counts, herd, horse };
}

function runScript(file: string): void {
  execFileSync('node', ['--import', './scripts/register.mjs', `scripts/${file}`], {
    stdio: ['ignore', 'inherit', 'inherit'],
    env: { ...process.env, CONFIRM_RESTORE: 'yes' },
  });
}

async function main(): Promise<void> {
  const url = process.env.DATABASE_URL ?? '';
  if (!url.startsWith('postgres')) {
    console.error('restore-drill: DATABASE_URL must be a postgres:// URL.');
    process.exit(2);
  }
  if (process.env.CONFIRM_RESTORE !== 'yes') {
    console.error(
      'restore-drill: REFUSING — this DESTROYS the target DB. Re-run with CONFIRM_RESTORE=yes.',
    );
    process.exit(3);
  }

  const connect = async (): Promise<pg.Client> => {
    const c = new pg.Client({ connectionString: url });
    await c.connect();
    return c;
  };

  console.log('\n━━━ 1. FINGERPRINT the live data ━━━');
  let client = await connect();
  const before = await fingerprint(client);
  const totalBefore = Object.values(before.counts).reduce((a, b) => a + b, 0);
  console.log(`  ${Object.keys(before.counts).length} tables, ${totalBefore} rows total`);
  console.log(
    `  herd : ${before.herd?.id} — cubes ${before.herd?.cubes}, tier ${before.herd?.level}`,
  );
  console.log(
    `  horse: ${before.horse?.name} — ${before.horse?.genotype} seed ${before.horse?.seed}`,
  );
  await client.end();

  console.log('\n━━━ 2. BACK UP (real pg_dump via scripts/backup.ts) ━━━');
  runScript('backup.ts');

  console.log('\n━━━ 3. DESTROY (DROP SCHEMA public CASCADE) + prove it is gone ━━━');
  client = await connect();
  await client.query('DROP SCHEMA public CASCADE');
  await client.query('CREATE SCHEMA public');
  let destroyed = false;
  try {
    await client.query('SELECT count(*) FROM herds');
  } catch (e) {
    destroyed = /does not exist/.test((e as Error).message);
  }
  console.log(
    `  herds table gone: ${destroyed}  ${destroyed ? '✓ data is genuinely destroyed' : '✗ DESTRUCTION DID NOT HAPPEN'}`,
  );
  await client.end();
  if (!destroyed) process.exit(1);

  console.log('\n━━━ 4. RESTORE (real pg_restore via scripts/restore.ts) ━━━');
  runScript('restore.ts');

  console.log('\n━━━ 5. RE-FINGERPRINT + ASSERT byte-identical ━━━');
  client = await connect();
  const after = await fingerprint(client);
  await client.end();

  const countsMatch = JSON.stringify(before.counts) === JSON.stringify(after.counts);
  const herdMatch = JSON.stringify(before.herd) === JSON.stringify(after.herd);
  const horseMatch = JSON.stringify(before.horse) === JSON.stringify(after.horse);
  const totalAfter = Object.values(after.counts).reduce((a, b) => a + b, 0);
  console.log(
    `  rows: ${totalBefore} → ${totalAfter}   counts identical: ${countsMatch ? '✓' : '✗'}`,
  );
  console.log(`  herd fingerprint identical : ${herdMatch ? '✓' : '✗'}`);
  console.log(`  horse genotype+seed identical: ${horseMatch ? '✓' : '✗'}`);

  if (countsMatch && herdMatch && horseMatch && totalAfter > 0) {
    console.log('\n=== RESTORE DRILL: PASS — destroyed and restored, byte-identical ===');
    process.exit(0);
  }
  console.log('\n=== RESTORE DRILL: FAIL ===');
  process.exit(1);
}

main().catch((err: unknown) => {
  console.error('restore-drill failed:', err);
  process.exit(1);
});
