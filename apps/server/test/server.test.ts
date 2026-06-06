/*
 * Phase 3 acceptance — a plain Node script (not node:test, which is incompatible
 * with PGlite's lazy WASM init). Run: node --import ./scripts/register.mjs test/server.test.ts
 * Exercises the real Fastify + Drizzle + Postgres(PGlite) stack end to end.
 */
import type { FastifyInstance, InjectOptions } from 'fastify';
import { buildApp } from '../src/app.js';
import { createPgliteDb } from '../src/db/client.js';
import { runMigrations } from '../src/db/migrate.js';
import { mintHorse, shareLineage } from '../src/services/horse.js';

let pass = 0;
let fail = 0;
function check(desc: string, cond: boolean): void {
  if (cond) pass++;
  else {
    fail++;
    console.error(`  ✗ ${desc}`);
  }
}
function eq<T>(desc: string, actual: T, expected: T): void {
  check(
    `${desc} (expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)})`,
    actual === expected,
  );
}

type InjectResult = Awaited<ReturnType<FastifyInstance['inject']>>;
function cookieOf(res: InjectResult): string {
  const c = res.cookies.find((x) => x.name === 'blorse_session');
  return c ? `blorse_session=${c.value}` : '';
}

async function main(): Promise<void> {
  const db = createPgliteDb();
  await runMigrations(db);
  const app = buildApp(db);
  await app.ready();
  const inject = (opts: InjectOptions) => app.inject(opts);

  // --- register: creates User + 1:1 Herd, issues a session ---
  const reg = await inject({
    method: 'POST',
    url: '/auth/register',
    payload: { username: 'plum', password: 'hunter2horse' },
  });
  eq('register → 201', reg.statusCode, 201);
  check(
    'herd name ends with "Herd"',
    /Herd$/.test(reg.json<{ herd: { name: string } }>().herd.name),
  );
  check('session cookie set', cookieOf(reg).includes('blorse_session='));

  // --- duplicate + weak input ---
  const dup = await inject({
    method: 'POST',
    url: '/auth/register',
    payload: { username: 'plum', password: 'anotherpass1' },
  });
  eq('duplicate username → 409', dup.statusCode, 409);
  const weak = await inject({
    method: 'POST',
    url: '/auth/register',
    payload: { username: 'x', password: 'short' },
  });
  eq('weak credentials → 400', weak.statusCode, 400);

  // --- login + /me ---
  const login = await inject({
    method: 'POST',
    url: '/auth/login',
    payload: { username: 'plum', password: 'hunter2horse' },
  });
  eq('login → 200', login.statusCode, 200);
  const cookie = cookieOf(login);
  const me = await inject({ method: 'GET', url: '/me', headers: { cookie } });
  eq('/me → 200', me.statusCode, 200);
  eq('/me returns the user', me.json<{ user: { username: string } }>().user.username, 'plum');

  const badPw = await inject({
    method: 'POST',
    url: '/auth/login',
    payload: { username: 'plum', password: 'wrongpassword' },
  });
  eq('wrong password → 401', badPw.statusCode, 401);

  // --- mint + load + render spec (derived, cached, deterministic) ---
  const mint = await inject({
    method: 'POST',
    url: '/horses',
    headers: { cookie },
    payload: { genotype: { E: 'Ee', A: 'Aa' }, lifeStage: 'adult' },
  });
  eq('mint → 201', mint.statusCode, 201);
  const id = mint.json<{ id: string }>().id;
  const got = await inject({ method: 'GET', url: `/horses/${id}` });
  check('loaded horse has a seed', got.json<{ seed: number }>().seed > 0);
  const spec1 = await inject({ method: 'GET', url: `/horses/${id}/spec` });
  eq('render spec → 200', spec1.statusCode, 200);
  eq('spec displayName is Bay', spec1.json<{ displayName: string }>().displayName, 'Bay');
  const spec2 = await inject({ method: 'GET', url: `/horses/${id}/spec` });
  eq(
    'spec is deterministic/cached',
    spec2.json<{ coat: string }>().coat,
    spec1.json<{ coat: string }>().coat,
  );

  const noAuth = await inject({
    method: 'POST',
    url: '/horses',
    payload: { genotype: { E: 'Ee' } },
  });
  eq('mint without auth → 401', noAuth.statusCode, 401);

  // --- lineage closure (§5.4a), transitive ---
  const a = await mintHorse(db, { herdId: null, genotype: { E: 'Ee', A: 'Aa' }, origin: 'wild' });
  const b = await mintHorse(db, { herdId: null, genotype: { E: 'ee' }, origin: 'wild' });
  const e = await mintHorse(db, { herdId: null, genotype: { E: 'Ee', A: 'aa' }, origin: 'wild' });
  const c = await mintHorse(db, {
    herdId: null,
    genotype: { E: 'Ee', A: 'Aa' },
    origin: 'bred',
    parentA: a.id,
    parentB: b.id,
  });
  const d = await mintHorse(db, {
    herdId: null,
    genotype: { E: 'Ee' },
    origin: 'bred',
    parentA: c.id,
    parentB: e.id,
  });
  eq('disjoint founders may breed', await shareLineage(db, a.id, b.id), false);
  eq('parent×child blocked', await shareLineage(db, c.id, a.id), true);
  eq('great-grandparent blocked (transitive)', await shareLineage(db, d.id, a.id), true);
  eq('other grandparent blocked', await shareLineage(db, d.id, b.id), true);
  eq('unrelated may breed', await shareLineage(db, a.id, e.id), false);

  await app.close();

  console.log(
    `\n=== Phase 3 server tests ===\npassed: ${pass}   failed: ${fail}   total: ${pass + fail}`,
  );
  process.exit(fail === 0 ? 0 : 1);
}

main().catch((err: unknown) => {
  console.error(err);
  process.exit(1);
});
