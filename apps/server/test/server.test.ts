/*
 * Phase 3 acceptance — a plain Node script (not node:test, which is incompatible
 * with PGlite's lazy WASM init). Run: node --import ./scripts/register.mjs test/server.test.ts
 * Exercises the real Fastify + Drizzle + Postgres(PGlite) stack end to end.
 */
import { FOAL_TO_ADULT_MS, STARTING_CUBES, STAT_KEYS } from '@blorse/balance';
import { breedFoal, type Genotype } from '@blorse/genetics';
import { eq as drizzleEq } from 'drizzle-orm';
import type { FastifyInstance, InjectOptions } from 'fastify';
import { buildApp } from '../src/app.js';
import { createPgliteDb } from '../src/db/client.js';
import { runMigrations } from '../src/db/migrate.js';
import { users } from '../src/db/schema.js';
import { adventure } from '../src/services/adventure.js';
import { getAudit } from '../src/services/audit.js';
import { breedHorses } from '../src/services/breeding.js';
import { advanceHerd } from '../src/services/daily.js';
import { mintHorse, shareLineage } from '../src/services/horse.js';
import { grantItems } from '../src/services/inventory.js';
import { compatibility } from '../src/services/personality.js';
import { skillCheck } from '../src/services/stats.js';
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
  // High caps so the fast inject() burst below isn't throttled; the tight per-route limits
  // (/report 5/min, auth 8/min) are exercised on their own. allowMint:true keeps the founder
  // faucet open for the suite (prod locks it to admins — see the gate tests below).
  const app = buildApp(db, { rateLimitMax: 100_000, authRateLimitMax: 100_000, allowMint: true });
  await app.ready();
  // The API is mounted under /api (prod serves the SPA at the root); prefix every call so the
  // assertions below read unchanged. (/health, the only root route, isn't exercised here.)
  const inject = (opts: InjectOptions) =>
    app.inject({ ...opts, url: `/api${typeof opts.url === 'string' ? opts.url : ''}` });

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

  // --- cold-start grant (§6, §14): a fresh account is immediately playable ---
  const startHerd = reg.json<{ herd: { id: string; cubes: number } }>().herd;
  eq('new herd starts with the Cubes purse', startHerd.cubes, STARTING_CUBES);
  const starters = (await inject({ method: 'GET', url: `/herds/${startHerd.id}/horses` })).json<
    { id: string; lifeStage: string }[]
  >();
  eq('new herd is granted two starter horses', starters.length, 2);
  eq('both starters are adults', starters.filter((h) => h.lifeStage === 'adult').length, 2);
  const [s0, s1] = starters;
  eq(
    'the two starters are unrelated (can breed immediately)',
    s0 && s1 ? await shareLineage(db, s0.id, s1.id) : true,
    false,
  );

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

  // quest rewards: a-new-foal (200) + first-steps (150) = 350 cubes, on top of the starting purse
  const me2 = await inject({ method: 'GET', url: '/me', headers: { cookie } });
  eq(
    'cubes from quest rewards (plus the starting purse)',
    me2.json<{ herd: { cubes: number } }>().herd.cubes,
    STARTING_CUBES + 350,
  );

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

  // --- Phase 6: aging, care & daily rhythm ---
  const DAY_MS = 86_400_000;
  const baseNow = Date.now();

  // login-catchup: a fresh herd, 3 days later → exactly 3 daily stipends (deterministic)
  const reg2 = await inject({
    method: 'POST',
    url: '/auth/register',
    payload: { username: 'pepper', password: 'hunter2horse' },
  });
  const herd2Id = reg2.json<{ herd: { id: string } }>().herd.id;
  const adv = await advanceHerd(db, herd2Id, baseNow + 3 * DAY_MS);
  eq('login-catchup advances 3 days', adv.daysAdvanced, 3);
  eq('catch-up grants 3x the daily Cubes', adv.cubesGained, 150);

  // maturation: the white foal reveals its coat at adulthood
  const beforeSpec = await inject({ method: 'GET', url: `/horses/${foal.id}/spec` });
  eq(
    'foal renders white before maturity',
    beforeSpec.json<{ foalWhite: boolean }>().foalWhite,
    true,
  );
  const matured = await advanceHerd(db, herdId, baseNow + FOAL_TO_ADULT_MS + 60_000);
  check('foal matured on check-in', matured.matured.includes(foal.id));
  const grown = await inject({ method: 'GET', url: `/horses/${foal.id}` });
  eq('matured foal is now adult', grown.json<{ lifeStage: string }>().lifeStage, 'adult');
  const afterSpec = await inject({ method: 'GET', url: `/horses/${foal.id}/spec` });
  eq('coat revealed at adulthood', afterSpec.json<{ foalWhite: boolean }>().foalWhite, false);

  // Field Guide: the adult Bay was discovered at mint; the foal's reveal adds more
  const fg = (await inject({ method: 'GET', url: '/field-guide', headers: { cookie } })).json<{
    discovered: { slug: string }[];
    discoveredCount: number;
    catalogSize: number;
  }>();
  check('field guide has discoveries', fg.discoveredCount > 0);
  check('field guide knows the catalog size', fg.catalogSize > 0);
  check(
    'Bay is in the field guide',
    fg.discovered.some((d) => d.slug === 'bay'),
  );

  // care: cozy, once per day
  const care1 = await inject({
    method: 'POST',
    url: `/horses/${id}/care`,
    headers: { cookie },
    payload: { action: 'feed' },
  });
  eq('care → 200', care1.statusCode, 200);
  const care2 = await inject({
    method: 'POST',
    url: `/horses/${id}/care`,
    headers: { cookie },
    payload: { action: 'groom' },
  });
  eq('second care same day → 409', care2.statusCode, 409);

  // POST /daily on the real clock (already caught up → no-op, 200)
  const daily = await inject({ method: 'POST', url: '/daily', headers: { cookie } });
  eq('POST /daily → 200', daily.statusCode, 200);

  // --- Phase 7: Pasture, gathering & crafting ---
  // stock raw materials (as if from roaming)
  await grantItems(db, herdId, [
    { id: 'odd-acorn', qty: 20 },
    { id: 'smooth-pebble', qty: 20 },
    { id: 'dust-shard', qty: 10 },
    { id: 'clover', qty: 10 },
    { id: 'grass-tuft', qty: 10 },
  ]);

  const recipes = await inject({ method: 'GET', url: '/recipes' });
  check('recipes listed', recipes.json<unknown[]>().length > 0);

  // craft building materials
  const craftPlank = await inject({
    method: 'POST',
    url: '/craft',
    headers: { cookie },
    payload: { recipeId: 'plank', qty: 8 },
  });
  eq('craft 8 planks → 200', craftPlank.statusCode, 200);
  eq('craft outputs 8 planks', craftPlank.json<{ output: { qty: number } }>().output.qty, 8);
  const craftBrick = await inject({
    method: 'POST',
    url: '/craft',
    headers: { cookie },
    payload: { recipeId: 'brick', qty: 4 },
  });
  eq('craft 4 bricks → 200', craftBrick.statusCode, 200);

  const inv2 = (await inject({ method: 'GET', url: '/inventory', headers: { cookie } })).json<
    { id: string; qty: number }[]
  >();
  check(
    'inventory has crafted planks',
    inv2.some((s) => s.id === 'plank' && s.qty >= 7),
  );
  check(
    'inventory has crafted bricks',
    inv2.some((s) => s.id === 'brick' && s.qty >= 3),
  );

  // crafting beyond available materials → insufficient
  const craftFail = await inject({
    method: 'POST',
    url: '/craft',
    headers: { cookie },
    payload: { recipeId: 'plank', qty: 999 },
  });
  eq('craft without materials → 409', craftFail.statusCode, 409);

  // build structures (consume building materials + Cubes), up to capacity
  for (const type of ['library', 'foragers-hut', 'track', 'kitchen']) {
    const b = await inject({
      method: 'POST',
      url: '/pasture/build',
      headers: { cookie },
      payload: { type },
    });
    eq(`build ${type} → 201`, b.statusCode, 201);
  }
  const dupBuild = await inject({
    method: 'POST',
    url: '/pasture/build',
    headers: { cookie },
    payload: { type: 'library' },
  });
  eq('build duplicate → 409', dupBuild.statusCode, 409);
  const fullBuild = await inject({
    method: 'POST',
    url: '/pasture/build',
    headers: { cookie },
    payload: { type: 'forge' },
  });
  eq('build beyond capacity → 409', fullBuild.statusCode, 409);

  const pasture = (await inject({ method: 'GET', url: '/pasture', headers: { cookie } })).json<{
    used: number;
    capacity: number;
    structures: { type: string }[];
  }>();
  eq('pasture used 4 slots', pasture.used, 4);
  eq('pasture capacity is 4', pasture.capacity, 4);
  check(
    'Library is placed',
    pasture.structures.some((s) => s.type === 'library'),
  );

  // --- Phase 8a: stats, dice & jobs ---
  const horseView = (await inject({ method: 'GET', url: `/horses/${id}` })).json<{
    stats: Record<string, number>;
    skills: Record<string, { level: number; xp: number }>;
    accomplishments: unknown[];
    luck?: number;
  }>();
  check(
    'horse exposes all six stats',
    STAT_KEYS.every((k) => typeof horseView.stats[k] === 'number'),
  );
  check(
    'stats are in 1..20',
    STAT_KEYS.every((k) => (horseView.stats[k] ?? 0) >= 1 && (horseView.stats[k] ?? 0) <= 20),
  );
  check('luck is hidden', horseView.luck === undefined);
  check('accomplishments is a list', Array.isArray(horseView.accomplishments));

  // dice (§9.1): deterministic + crit on a natural 20
  eq(
    'dice are deterministic for a seed',
    skillCheck(15, 3, 12, 10, mulberry32(7)).total,
    skillCheck(15, 3, 12, 10, mulberry32(7)).total,
  );
  const natTwenty = skillCheck(10, 0, 10, 15, () => 0.99);
  check('a natural 20 is a crit', natTwenty.d20 === 20 && natTwenty.crit);

  // stat inheritance (§14.2): maxed parents → a capable foal
  const maxStats = { str: 20, dex: 20, con: 20, int: 20, wis: 20, cha: 20 };
  const hs1 = await mintHorse(db, {
    herdId,
    genotype: { E: 'Ee', A: 'Aa' },
    origin: 'wild',
    lifeStage: 'adult',
    stats: maxStats,
    luck: 20,
  });
  const hs2 = await mintHorse(db, {
    herdId,
    genotype: { E: 'ee', A: 'aa' },
    origin: 'wild',
    lifeStage: 'adult',
    stats: maxStats,
    luck: 20,
  });
  const hsBreed = await breedHorses(db, herdId, hs1.id, hs2.id);
  check('maxed parents produce a foal', hsBreed.ok && hsBreed.viable);
  if (hsBreed.ok && hsBreed.viable) {
    const fStats = hsBreed.foal.stats;
    const avg = STAT_KEYS.reduce((s, k) => s + (fStats[k] ?? 0), 0) / STAT_KEYS.length;
    check('foal inherits high stats from maxed parents', avg > 12);
  }

  // jobs (§9.2): structure-gated assignment
  const noStructure = await inject({
    method: 'POST',
    url: `/horses/${id}/job`,
    headers: { cookie },
    payload: { structureType: 'forge' },
  });
  eq('assign a job without the structure → 409', noStructure.statusCode, 409);
  const noJob = await inject({
    method: 'POST',
    url: `/horses/${id}/job`,
    headers: { cookie },
    payload: { structureType: 'meeting-hall' },
  });
  eq('assign to a jobless building → 400', noJob.statusCode, 400);
  const assign = await inject({
    method: 'POST',
    url: `/horses/${id}/job`,
    headers: { cookie },
    payload: { structureType: 'library' },
  });
  eq('assign the Librarian job → 201', assign.statusCode, 201);

  // jobs produce + train skills over the daily rollover
  const adv8 = await advanceHerd(db, herdId, Date.now() + 12 * 86_400_000);
  check('jobs earned Cubes on the rollover', adv8.jobCubes > 0);
  const worked = (await inject({ method: 'GET', url: `/horses/${id}` })).json<{
    skills: Record<string, { level: number; xp: number }>;
  }>();
  const reading = worked.skills.reading ?? { level: 0, xp: 0 };
  check('the worker gained Reading progress', reading.level + reading.xp > 0);

  // --- Phase 8b: adventures & the Tavern ---
  const advRun = await inject({
    method: 'POST',
    url: '/adventure',
    headers: { cookie },
    payload: { regionId: 'green-grass', party: [id, mateId, hs1.id] },
  });
  eq('adventure → 200', advRun.statusCode, 200);
  const advBody = advRun.json<{ encounters: unknown[]; loot: unknown[] }>();
  check('adventure ran an encounter chain', advBody.encounters.length >= 3);
  check('adventure yielded loot', advBody.loot.length > 0);

  const lockedAdv = await inject({
    method: 'POST',
    url: '/adventure',
    headers: { cookie },
    payload: { regionId: 'weird-woods', party: [id] },
  });
  eq('adventure into a locked region → 403', lockedAdv.statusCode, 403);

  const bigParty = await inject({
    method: 'POST',
    url: '/adventure',
    headers: { cookie },
    payload: { regionId: 'green-grass', party: [id, mateId, hs1.id, hs2.id, gp1.id] },
  });
  eq('party larger than 4 → 400', bigParty.statusCode, 400);

  // forced wild encounter with a FULL party → it walks to the Tavern (via the service)
  const wildAdv = await adventure(db, herdId, 'green-grass', [id, mateId, hs1.id, hs2.id], {
    forceWild: true,
    seed: 12345,
  });
  check('a wild horse appeared', wildAdv.ok && wildAdv.wild !== null);
  check('full party → wild walks to the Tavern', wildAdv.ok && wildAdv.wild?.toTavern === true);
  const wildId = wildAdv.ok && wildAdv.wild ? wildAdv.wild.horseId : '';

  const tavern = (await inject({ method: 'GET', url: '/tavern', headers: { cookie } })).json<
    { id: string; fee: number }[]
  >();
  check('the Tavern lists strays with a fee', tavern.length > 0 && tavern.every((t) => t.fee > 0));

  const recruit = await inject({
    method: 'POST',
    url: `/tavern/${wildId}/recruit`,
    headers: { cookie },
    payload: {},
  });
  eq('recruit from the Tavern → 201', recruit.statusCode, 201);
  const owned = (await inject({ method: 'GET', url: `/horses/${wildId}` })).json<{
    herdId: string | null;
  }>();
  eq('recruited horse is now owned', owned.herdId, herdId);
  const recruit2 = await inject({
    method: 'POST',
    url: `/tavern/${wildId}/recruit`,
    headers: { cookie },
    payload: {},
  });
  check('re-recruiting a claimed horse fails (atomic)', recruit2.statusCode !== 201);

  // --- Phase 9: The Living Herd ---
  const pView = (await inject({ method: 'GET', url: `/horses/${id}` })).json<{
    personality: Record<string, number>;
    name: string;
  }>();
  const ocean = ['o', 'c', 'e', 'a', 'n'];
  check(
    'horse has OCEAN personality',
    ocean.every((k) => typeof pView.personality[k] === 'number'),
  );
  check(
    'personality traits are 0..100',
    ocean.every((k) => (pView.personality[k] ?? -1) >= 0 && (pView.personality[k] ?? 101) <= 100),
  );
  check('horse has an auto-generated name', pView.name.length > 0);

  // compatibility (§8.1): friendly vs clashing temperaments
  const friendly = compatibility(
    { o: 50, c: 50, e: 80, a: 80, n: 20 },
    { o: 50, c: 55, e: 80, a: 75, n: 25 },
  );
  const clashing = compatibility(
    { o: 0, c: 0, e: 0, a: 0, n: 100 },
    { o: 100, c: 100, e: 0, a: 0, n: 100 },
  );
  check('compatible personalities → positive affinity', friendly > 0);
  check('clashing personalities → non-positive affinity', clashing <= 0);

  // autonomy: two compatible horses in a fresh herd → a friendship + a journal beat
  const regC = await inject({
    method: 'POST',
    url: '/auth/register',
    payload: { username: 'cherry', password: 'hunter2horse' },
  });
  const cookieC = cookieOf(regC);
  const herdC = regC.json<{ herd: { id: string } }>().herd.id;
  const social = { o: 50, c: 50, e: 85, a: 85, n: 15 };
  await mintHorse(db, {
    herdId: herdC,
    genotype: { E: 'Ee', A: 'Aa' },
    origin: 'wild',
    lifeStage: 'adult',
    personality: social,
    name: 'Apple',
  });
  await mintHorse(db, {
    herdId: herdC,
    genotype: { E: 'ee', A: 'aa' },
    origin: 'wild',
    lifeStage: 'adult',
    personality: social,
    name: 'Pearl',
  });
  await advanceHerd(db, herdC, Date.now() + 6 * 86_400_000);
  const journalC = (
    await inject({ method: 'GET', url: '/journal', headers: { cookie: cookieC } })
  ).json<{ kind: string; text: string }[]>();
  check('autonomy wrote journal beats', journalC.length > 0);
  check(
    'a friendship formed',
    journalC.some((ev) => ev.kind === 'friend' || ev.kind === 'bonded'),
  );
  const relsC = (
    await inject({ method: 'GET', url: '/relationships', headers: { cookie: cookieC } })
  ).json<{ type: string | null; affinity: number }[]>();
  check(
    'relationship recorded with positive affinity',
    relsC.some((r) => r.affinity > 0),
  );

  // clubs (§8.4): a reading circle, gated by the Library
  await mintHorse(db, {
    herdId,
    genotype: { E: 'Ee' },
    origin: 'wild',
    lifeStage: 'adult',
    skills: { reading: { level: 2, xp: 0 } },
  });
  await mintHorse(db, {
    herdId,
    genotype: { E: 'ee' },
    origin: 'wild',
    lifeStage: 'adult',
    skills: { reading: { level: 2, xp: 0 } },
  });
  await advanceHerd(db, herdId, Date.now() + 16 * 86_400_000);
  const clubsP = (await inject({ method: 'GET', url: '/clubs', headers: { cookie } })).json<
    { type: string }[]
  >();
  check(
    'a reading circle formed (Library-gated)',
    clubsP.some((club) => club.type === 'reading-circle'),
  );

  // --- Phase 10: social & economy ---
  // Marketplace: plum lists a horse, cherry buys it
  const list = await inject({
    method: 'POST',
    url: '/market',
    headers: { cookie },
    payload: { horseId: mateId, price: 100 },
  });
  eq('list a horse → 201', list.statusCode, 201);
  const listingId = list.json<{ listingId: string }>().listingId;
  const market = (await inject({ method: 'GET', url: '/market', headers: { cookie } })).json<
    { id: string }[]
  >();
  check(
    'listing appears on the market',
    market.some((l) => l.id === listingId),
  );
  const buyOwn = await inject({
    method: 'POST',
    url: `/market/${listingId}/buy`,
    headers: { cookie },
  });
  eq('buying your own listing → 400', buyOwn.statusCode, 400);
  const buy = await inject({
    method: 'POST',
    url: `/market/${listingId}/buy`,
    headers: { cookie: cookieC },
  });
  eq('cherry buys the horse → 200', buy.statusCode, 200);
  eq(
    'the bought horse now belongs to cherry',
    (await inject({ method: 'GET', url: `/horses/${mateId}` })).json<{ herdId: string }>().herdId,
    herdC,
  );

  // Direct trade: plum offers gp1 for 30 of cherry's Cubes; cherry accepts (atomic swap)
  const trade = await inject({
    method: 'POST',
    url: '/trades',
    headers: { cookie },
    payload: { toHerd: herdC, offerHorses: [gp1.id], requestCubes: 30 },
  });
  eq('create trade → 201', trade.statusCode, 201);
  const tradeId = trade.json<{ tradeId: string }>().tradeId;
  check(
    'cherry sees the incoming trade',
    (await inject({ method: 'GET', url: '/trades', headers: { cookie: cookieC } }))
      .json<{ id: string }[]>()
      .some((t) => t.id === tradeId),
  );
  const accept = await inject({
    method: 'POST',
    url: `/trades/${tradeId}/accept`,
    headers: { cookie: cookieC },
  });
  eq('accept trade → 200', accept.statusCode, 200);
  eq(
    'the traded horse moved to cherry',
    (await inject({ method: 'GET', url: `/horses/${gp1.id}` })).json<{ herdId: string }>().herdId,
    herdC,
  );
  const trade2 = await inject({
    method: 'POST',
    url: '/trades',
    headers: { cookie },
    payload: { toHerd: herdC, offerCubes: 10 },
  });
  const tradeId2 = trade2.json<{ tradeId: string }>().tradeId;
  eq(
    'cherry declines a trade → 200',
    (
      await inject({
        method: 'POST',
        url: `/trades/${tradeId2}/decline`,
        headers: { cookie: cookieC },
      })
    ).statusCode,
    200,
  );

  // Inter-herd visit
  const profile = (
    await inject({ method: 'GET', url: `/herds/${herdC}/profile`, headers: { cookie } })
  ).json<{ name: string; horseCount: number; highlights: unknown[] }>();
  check('visit shows the herd name', profile.name.length > 0);
  check('visit shows horses', profile.horseCount > 0);

  // Messaging
  const msg = await inject({
    method: 'POST',
    url: '/messages',
    headers: { cookie },
    payload: { toHerd: herdC, body: 'Want to trade?' },
  });
  eq('send a message → 201', msg.statusCode, 201);
  check(
    'message lands in the recipient inbox',
    (await inject({ method: 'GET', url: '/messages', headers: { cookie: cookieC } }))
      .json<{ body: string }[]>()
      .some((m) => m.body === 'Want to trade?'),
  );

  // AuditLog recorded the economy actions
  const audit = await getAudit(db, herdId);
  check(
    'economy actions were audited',
    audit.some((row) => row.action === 'market_list') &&
      audit.some((row) => row.action === 'trade_offer'),
  );

  // ───────────────────────── Phase 11 — beta hardening ─────────────────────────

  // Report flow: any authed player can file a report.
  const rep1 = await inject({
    method: 'POST',
    url: '/report',
    headers: { cookie },
    payload: { targetType: 'horse', targetId: mateId, reason: 'looks suspicious' },
  });
  eq('file a report → 201', rep1.statusCode, 201);
  eq(
    'report without a target → 400',
    (
      await inject({
        method: 'POST',
        url: '/report',
        headers: { cookie },
        payload: { reason: 'no target given' },
      })
    ).statusCode,
    400,
  );

  // Promote a fresh account to admin (mods are seeded out-of-band in prod).
  const modReg = await inject({
    method: 'POST',
    url: '/auth/register',
    payload: { username: 'modboss', password: 'moderator99' },
  });
  const cookieMod = cookieOf(modReg);
  const modUser = await db.query.users.findFirst({ where: drizzleEq(users.username, 'modboss') });
  if (!modUser) throw new Error('mod account missing');
  check('mod account created', true);
  await db.update(users).set({ role: 'admin' }).where(drizzleEq(users.id, modUser.id));

  // A regular player can't reach the mod queue…
  eq(
    'non-mod hitting /mod/reports → 403',
    (await inject({ method: 'GET', url: '/mod/reports', headers: { cookie } })).statusCode,
    403,
  );
  // …but the admin can, and the filed report is waiting there.
  const modReports = await inject({
    method: 'GET',
    url: '/mod/reports',
    headers: { cookie: cookieMod },
  });
  eq('admin reads /mod/reports → 200', modReports.statusCode, 200);
  check(
    'the filed report is in the queue',
    modReports.json<{ targetId: string }[]>().some((r) => r.targetId === mateId),
  );

  // Mod stats aggregate the world.
  const stats = (
    await inject({ method: 'GET', url: '/mod/stats', headers: { cookie: cookieMod } })
  ).json<{ users: number; horses: number; openReports: number }>();
  check('stats count users', stats.users >= 3);
  check('stats count the open report', stats.openReports >= 1);

  // Account freeze: admin freezes cherry; cherry keeps read access but can't act.
  const targetUser = await db.query.users.findFirst({ where: drizzleEq(users.username, 'cherry') });
  if (!targetUser) throw new Error('freeze target missing');
  eq(
    'admin freezes the account → 200',
    (
      await inject({
        method: 'POST',
        url: `/mod/users/${targetUser.id}/freeze`,
        headers: { cookie: cookieMod },
      })
    ).statusCode,
    200,
  );
  eq(
    'frozen account can still read',
    (await inject({ method: 'GET', url: '/market', headers: { cookie: cookieC } })).statusCode,
    200,
  );
  const frozenAct = await inject({
    method: 'POST',
    url: '/messages',
    headers: { cookie: cookieC },
    payload: { toHerd: herdId, body: 'can I still talk?' },
  });
  eq('frozen account blocked from acting → 403', frozenAct.statusCode, 403);
  eq('frozen refusal is tagged', frozenAct.json<{ code: string }>().code, 'frozen');
  eq(
    'a non-admin cannot freeze accounts → 403',
    (
      await inject({
        method: 'POST',
        url: `/mod/users/${modUser.id}/freeze`,
        headers: { cookie },
      })
    ).statusCode,
    403,
  );
  // Unfreeze restores the ability to act.
  await inject({
    method: 'POST',
    url: `/mod/users/${targetUser.id}/unfreeze`,
    headers: { cookie: cookieMod },
  });
  eq(
    'unfrozen account can act again → 201',
    (
      await inject({
        method: 'POST',
        url: '/messages',
        headers: { cookie: cookieC },
        payload: { toHerd: herdId, body: 'back in action' },
      })
    ).statusCode,
    201,
  );

  // Consistent error envelopes: an unknown route returns JSON, not a stack.
  const notFound = await inject({ method: 'GET', url: '/no/such/route' });
  eq('unknown route → 404', notFound.statusCode, 404);
  eq('404 carries a machine code', notFound.json<{ code: string }>().code, 'not_found');

  // Audit coverage extended beyond the economy to breeding + recruiting.
  const audit2 = await getAudit(db, herdId);
  check(
    'breeding is audited',
    audit2.some((r) => r.action === 'breed'),
  );

  // Per-route rate limit: /report caps at 5/min, so a burst from one IP gets throttled.
  let sawRateLimit = false;
  for (let i = 0; i < 8; i++) {
    const r = await inject({
      method: 'POST',
      url: '/report',
      headers: { cookie },
      payload: { targetType: 'horse', targetId: mateId, reason: `spam ${i}` },
    });
    if (r.statusCode === 429) sawRateLimit = true;
  }
  check('the report endpoint rate-limits a burst (429)', sawRateLimit);

  // ───────────────────────── prod-hardening gates ─────────────────────────
  // Fresh app instances exercise the production gates (the main suite runs with them open).

  // 1) Auth rate limit — a burst of logins from one IP gets throttled.
  {
    const gdb = createPgliteDb();
    await runMigrations(gdb);
    const gapp = buildApp(gdb, { rateLimitMax: 100_000, authRateLimitMax: 3 });
    await gapp.ready();
    let throttled = false;
    for (let i = 0; i < 6; i++) {
      const r = await gapp.inject({
        method: 'POST',
        url: '/api/auth/login',
        payload: { username: 'nobody', password: 'whatever8' },
      });
      if (r.statusCode === 429) throttled = true;
    }
    check('auth routes rate-limit a burst (429)', throttled);
    await gapp.close();
  }

  // 2) Invite gate — closed without a code, open with a valid one.
  {
    const gdb = createPgliteDb();
    await runMigrations(gdb);
    const gapp = buildApp(gdb, {
      rateLimitMax: 100_000,
      authRateLimitMax: 100_000,
      requireInvite: true,
      inviteCodes: ['WAVE1'],
    });
    await gapp.ready();
    eq(
      'register without an invite → 403',
      (
        await gapp.inject({
          method: 'POST',
          url: '/api/auth/register',
          payload: { username: 'gatekept', password: 'horsehorse1' },
        })
      ).statusCode,
      403,
    );
    eq(
      'register with a valid invite → 201',
      (
        await gapp.inject({
          method: 'POST',
          url: '/api/auth/register',
          payload: { username: 'invited', password: 'horsehorse1', inviteCode: 'WAVE1' },
        })
      ).statusCode,
      201,
    );
    await gapp.close();
  }

  // 3) Mint lock — a non-admin can't use POST /horses when allowMint is off (the prod default).
  {
    const gdb = createPgliteDb();
    await runMigrations(gdb);
    const gapp = buildApp(gdb, { rateLimitMax: 100_000, authRateLimitMax: 100_000 });
    await gapp.ready();
    const reg = await gapp.inject({
      method: 'POST',
      url: '/api/auth/register',
      payload: { username: 'minter', password: 'horsehorse1' },
    });
    const mint = await gapp.inject({
      method: 'POST',
      url: '/api/horses',
      headers: { cookie: cookieOf(reg) },
      payload: { genotype: { E: 'Ee' }, lifeStage: 'adult' },
    });
    eq('non-admin mint is locked → 403', mint.statusCode, 403);
    await gapp.close();
  }

  // 4) Dev tools — gated off by default.
  {
    const gdb = createPgliteDb();
    await runMigrations(gdb);
    const gapp = buildApp(gdb, { rateLimitMax: 100_000, authRateLimitMax: 100_000 });
    await gapp.ready();
    const reg = await gapp.inject({
      method: 'POST',
      url: '/api/auth/register',
      payload: { username: 'devless', password: 'horsehorse1' },
    });
    eq(
      'dev simulate is gated off → 403',
      (
        await gapp.inject({
          method: 'POST',
          url: '/api/daily/simulate',
          headers: { cookie: cookieOf(reg) },
          payload: { days: 5 },
        })
      ).statusCode,
      403,
    );
    await gapp.close();
  }

  // 5) Dev tools on — /daily/simulate advances the clock so the autonomy tick produces journal
  //    beats (the live-API proof that the tick runs end to end, not just in the unit harness).
  {
    const gdb = createPgliteDb();
    await runMigrations(gdb);
    const gapp = buildApp(gdb, {
      rateLimitMax: 100_000,
      authRateLimitMax: 100_000,
      allowDevTools: true,
    });
    await gapp.ready();
    const reg = await gapp.inject({
      method: 'POST',
      url: '/api/auth/register',
      payload: { username: 'devon', password: 'horsehorse1' },
    });
    const devHerd = reg.json<{ herd: { id: string } }>().herd.id;
    const social = { o: 50, c: 50, e: 85, a: 85, n: 15 };
    await mintHorse(gdb, {
      herdId: devHerd,
      genotype: { E: 'Ee', A: 'Aa' },
      origin: 'wild',
      lifeStage: 'adult',
      personality: social,
      name: 'Sage',
    });
    await mintHorse(gdb, {
      herdId: devHerd,
      genotype: { E: 'ee', A: 'aa' },
      origin: 'wild',
      lifeStage: 'adult',
      personality: social,
      name: 'Thyme',
    });
    await gapp.inject({
      method: 'POST',
      url: '/api/daily/simulate',
      headers: { cookie: cookieOf(reg) },
      payload: { days: 6 },
    });
    const journal = (
      await gapp.inject({
        method: 'GET',
        url: '/api/journal',
        headers: { cookie: cookieOf(reg) },
      })
    ).json<unknown[]>();
    check('dev simulate advances the tick → journal fills', journal.length > 0);
    await gapp.close();
  }

  await app.close();

  console.log(
    `\n=== BLORSE server tests ===\npassed: ${pass}   failed: ${fail}   total: ${pass + fail}`,
  );
  process.exit(fail === 0 ? 0 : 1);
}

main().catch((err: unknown) => {
  console.error(err);
  process.exit(1);
});
