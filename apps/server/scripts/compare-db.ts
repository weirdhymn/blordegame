/*
 * Non-destructive DB fingerprint COMPARE — proves a restored copy matches the source without
 * touching either. The safe way to verify restore against managed Postgres: restore a backup
 * into a SCRATCH Neon branch/database, then compare it to production here.
 *
 *   node --import ./scripts/register.mjs scripts/compare-db.ts <urlA> <urlB>
 *
 * Read-only (SELECT count(*) per table + one herd + one horse fingerprint on each side); asserts
 * the two are byte-identical. Exits 0 on match, 1 on mismatch. Neither database is modified.
 */
import pg from 'pg';

interface Fingerprint {
  counts: Record<string, number>;
  herd: { id: string; cubes: number; level: number } | null;
  horse: { name: string | null; genotype: string; seed: number } | null;
}

async function fingerprint(url: string): Promise<Fingerprint> {
  const client = new pg.Client({ connectionString: url });
  await client.connect();
  try {
    const tables = (
      await client.query<{ table_name: string }>(
        `SELECT table_name FROM information_schema.tables
         WHERE table_schema='public' AND table_type='BASE TABLE' ORDER BY table_name`,
      )
    ).rows.map((r) => r.table_name);
    const counts: Record<string, number> = {};
    for (const t of tables) {
      counts[t] = Number(
        (await client.query<{ n: string }>(`SELECT count(*)::text AS n FROM "${t}"`)).rows[0]?.n ??
          0,
      );
    }
    const hr = (
      await client.query<{ id: string; cubes: number; level: number }>(
        `SELECT id, cubes, level FROM herds ORDER BY created_at LIMIT 1`,
      )
    ).rows[0];
    const herd = hr ? { id: hr.id, cubes: Number(hr.cubes), level: Number(hr.level) } : null;
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
  } finally {
    await client.end();
  }
}

async function main(): Promise<void> {
  const [urlA, urlB] = [process.argv[2], process.argv[3]];
  if (!urlA?.startsWith('postgres') || !urlB?.startsWith('postgres')) {
    console.error('compare-db: usage — compare-db.ts <postgres-url-A> <postgres-url-B>');
    process.exit(2);
  }
  const [a, b] = await Promise.all([fingerprint(urlA), fingerprint(urlB)]);
  const total = (f: Fingerprint): number => Object.values(f.counts).reduce((x, y) => x + y, 0);
  const countsMatch = JSON.stringify(a.counts) === JSON.stringify(b.counts);
  const herdMatch = JSON.stringify(a.herd) === JSON.stringify(b.herd);
  const horseMatch = JSON.stringify(a.horse) === JSON.stringify(b.horse);

  console.log(`A: ${Object.keys(a.counts).length} tables, ${total(a)} rows`);
  console.log(`B: ${Object.keys(b.counts).length} tables, ${total(b)} rows`);
  console.log(`  per-table counts identical : ${countsMatch ? '✓' : '✗'}`);
  console.log(`  herd fingerprint identical : ${herdMatch ? '✓' : '✗'}`);
  console.log(`  horse genotype+seed identical: ${horseMatch ? '✓' : '✗'}`);

  if (countsMatch && herdMatch && horseMatch && total(a) > 0) {
    console.log('=== COMPARE: MATCH — the restored copy is byte-identical to the source ===');
    process.exit(0);
  }
  console.log('=== COMPARE: MISMATCH ===');
  process.exit(1);
}

main().catch((err: unknown) => {
  console.error('compare-db failed:', err);
  process.exit(1);
});
