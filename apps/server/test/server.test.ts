/*
 * Phase 3 acceptance — a plain Node script (not node:test, which is incompatible
 * with PGlite's lazy WASM init). Run: node --import ./scripts/register.mjs test/server.test.ts
 * Exercises the real Fastify + Drizzle + Postgres(PGlite) stack end to end.
 */
import { breedFoal, type Genotype } from '@blorse/genetics';
import type { FastifyInstance, InjectOptions } from 'fastify';
import { buildApp } from '../src/app.js';
import { createPgliteDb } from '../src/db/client.js';
import { runMigrations } from '../src/db/migrate.js';
import { breedHorses } from '../src/services/breeding.js';
import { mintHorse, shareLineage } from '../src/services/horse.js';
import { mulberry32 } from '../src/util/rng.js';

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

  // --- Phase 4: breeding ---
  const herdId = me.json<{ herd: { id: string } }>().herd.id;
  const mateRes = await inject({
    method: 'POST',
    url: '/horses',
    headers: { cookie },
    payload: { genotype: { E: 'ee', A: 'aa' }, lifeStage: 'adult' },
  });
  const mateId = mateRes.json<{ id: string }>().id;

  // foal-odds preview (punnett)
  const odds = await inject({ method: 'GET', url: `/breed/odds?a=${id}&b=${mateId}` });
  eq('odds → 200', odds.statusCode, 200);
  check(
    'odds has a color distribution',
    odds.json<{ distribution: unknown[] }>().distribution.length > 0,
  );

  // breed two disjoint adults → a white foal with both parents
  const breed = await inject({
    method: 'POST',
    url: '/breed',
    headers: { cookie },
    payload: { parentA: id, parentB: mateId },
  });
  eq('breed disjoint adults → 201', breed.statusCode, 201);
  const foal = breed.json<{
    foal: { id: string; lifeStage: string; parentA: string | null; parentB: string | null };
  }>().foal;
  eq('foal is a foal', foal.lifeStage, 'foal');
  check('foal has both parents', !!foal.parentA && !!foal.parentB);

  // pedigree
  const ped = await inject({ method: 'GET', url: `/horses/${foal.id}/pedigree` });
  eq('pedigree → 200', ped.statusCode, 200);
  eq('pedigree shows 2 parents', ped.json<{ parents: unknown[] }>().parents.length, 2);

  // gates
  const reBreed = await inject({
    method: 'POST',
    url: '/breed',
    headers: { cookie },
    payload: { parentA: id, parentB: mateId },
  });
  eq('re-breed on cooldown → 429', reBreed.statusCode, 429);
  const selfBreed = await inject({
    method: 'POST',
    url: '/breed',
    headers: { cookie },
    payload: { parentA: id, parentB: id },
  });
  eq('self-breed → 400', selfBreed.statusCode, 400);
  const foalBreed = await inject({
    method: 'POST',
    url: '/breed',
    headers: { cookie },
    payload: { parentA: foal.id, parentB: mateId },
  });
  eq('breeding a foal → 409 (not adult)', foalBreed.statusCode, 409);

  // related gate (siblings share both parents)
  const gp1 = await mintHorse(db, {
    herdId,
    genotype: { E: 'Ee', A: 'Aa' },
    origin: 'wild',
    lifeStage: 'adult',
  });
  const gp2 = await mintHorse(db, {
    herdId,
    genotype: { E: 'ee', A: 'aa' },
    origin: 'wild',
    lifeStage: 'adult',
  });
  const sib1 = await mintHorse(db, {
    herdId,
    genotype: { E: 'Ee' },
    origin: 'bred',
    lifeStage: 'adult',
    parentA: gp1.id,
    parentB: gp2.id,
  });
  const sib2 = await mintHorse(db, {
    herdId,
    genotype: { E: 'Ee' },
    origin: 'bred',
    lifeStage: 'adult',
    parentA: gp1.id,
    parentB: gp2.id,
  });
  const rel = await breedHorses(db, herdId, sib1.id, sib2.id);
  eq('siblings rejected as related', rel.ok === false ? rel.code : 'ok', 'related');

  // non-viable cross: "…but nothing happened." — and it must NOT burn cooldown
  const wwGeno: Genotype = { E: 'Ee', A: 'Aa', W: 'Ww' };
  let viableSeed = -1;
  let lethalSeed = -1;
  for (let s = 1; s < 300 && (viableSeed < 0 || lethalSeed < 0); s++) {
    const r = breedFoal(wwGeno, wwGeno, mulberry32(s));
    if (r.viable && viableSeed < 0) viableSeed = s;
    if (!r.viable && lethalSeed < 0) lethalSeed = s;
  }
  check('Ww×Ww can be non-viable', lethalSeed >= 0);
  check('Ww×Ww can be viable', viableSeed >= 0);
  const w1 = await mintHorse(db, { herdId, genotype: wwGeno, origin: 'wild', lifeStage: 'adult' });
  const w2 = await mintHorse(db, { herdId, genotype: wwGeno, origin: 'wild', lifeStage: 'adult' });
  const nv = await breedHorses(db, herdId, w1.id, w2.id, { seed: lethalSeed });
  check('non-viable → ok, nothing happened', nv.ok && !nv.viable);
  const afterNv = await breedHorses(db, herdId, w1.id, w2.id, { seed: viableSeed });
  check('viable breed after non-viable (no cooldown burned)', afterNv.ok && afterNv.viable);

  // --- Phase 5: exploration & quests ---
  // the viable breeds above advanced the 'A New Foal' breed quest to completion
  const quests0 = await inject({ method: 'GET', url: '/quests', headers: { cookie } });
  eq('quests → 200', quests0.statusCode, 200);
  check(
    'breeding completed "A New Foal"',
    quests0
      .json<{ questId: string; status: string }[]>()
      .some((q) => q.questId === 'a-new-foal' && q.status === 'completed'),
  );

  // region gating: Green Grass open, Dusty Dunes locked (first-steps not done yet)
  const regions0 = (await inject({ method: 'GET', url: '/regions', headers: { cookie } })).json<
    { id: string; unlocked: boolean }[]
  >();
  check(
    'Green Grass unlocked',
    regions0.some((r) => r.id === 'green-grass' && r.unlocked),
  );
  check(
    'Dusty Dunes locked',
    regions0.some((r) => r.id === 'dusty-dunes' && !r.unlocked),
  );
  const lockedRoam = await inject({
    method: 'POST',
    url: '/regions/dusty-dunes/roam',
    headers: { cookie },
  });
  eq('roam locked region → 403', lockedRoam.statusCode, 403);

  // roam Green Grass 3× → completes 'first-steps'
  let firstStepsDone = false;
  for (let i = 0; i < 3; i++) {
    const r = await inject({
      method: 'POST',
      url: '/regions/green-grass/roam',
      headers: { cookie },
    });
    eq(`roam ${i + 1} → 200`, r.statusCode, 200);
    const body = r.json<{ found: unknown[]; questCompletions: { questId: string }[] }>();
    check(`roam ${i + 1} found materials`, body.found.length > 0);
    if (body.questCompletions.some((c) => c.questId === 'first-steps')) firstStepsDone = true;
  }
  check('roaming completed "First Steps"', firstStepsDone);

  // inventory reflects roam loot
  const inv = (await inject({ method: 'GET', url: '/inventory', headers: { cookie } })).json<
    { id: string; qty: number }[]
  >();
  check(
    'inventory has materials',
    inv.some((s) => s.qty > 0),
  );

  // quest rewards: a-new-foal (200) + first-steps (150) = 350 cubes
  const me2 = await inject({ method: 'GET', url: '/me', headers: { cookie } });
  eq('cubes from quest rewards', me2.json<{ herd: { cubes: number } }>().herd.cubes, 350);

  // first-steps unlocked Dusty Dunes → roam now succeeds
  const regions1 = (await inject({ method: 'GET', url: '/regions', headers: { cookie } })).json<
    { id: string; unlocked: boolean }[]
  >();
  check(
    'Dusty Dunes now unlocked',
    regions1.some((r) => r.id === 'dusty-dunes' && r.unlocked),
  );
  const duneRoam = await inject({
    method: 'POST',
    url: '/regions/dusty-dunes/roam',
    headers: { cookie },
  });
  eq('roam Dusty Dunes → 200', duneRoam.statusCode, 200);

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
