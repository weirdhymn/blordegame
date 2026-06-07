/*
 * Phase 3 acceptance — a plain Node script (not node:test, which is incompatible
 * with PGlite's lazy WASM init). Run: node --import ./scripts/register.mjs test/server.test.ts
 * Exercises the real Fastify + Drizzle + Postgres(PGlite) stack end to end.
 */
import {
  ADVENTURE_HARMONY_MAX,
  ADVENTURE_MARK_THRESHOLD,
  ADVENTURE_SKILL_XP_ATTEMPT,
  ADVENTURE_SKILL_XP_SUCCESS,
  BONDED_BREED_STAT_BONUS,
  BONDED_THRESHOLD,
  CARE_BELOVED_THRESHOLD,
  CARE_CHECK_BONUS,
  FOAL_TO_ADULT_MS,
  FRIEND_THRESHOLD,
  JOB_DC,
  JOB_SEASONED_DC_BONUS,
  SKILL_KEYS,
  STARTING_CUBES,
  STAT_KEYS,
  STAT_MAX,
  UPLOAD_BASE,
  UPLOAD_FOAL_FACTOR,
} from '@blorse/balance';
import { breedFoal, type Genotype } from '@blorse/genetics';
import { eq as drizzleEq } from 'drizzle-orm';
import type { FastifyInstance, InjectOptions } from 'fastify';
import { buildApp } from '../src/app.js';
import { createPgliteDb } from '../src/db/client.js';
import { runMigrations } from '../src/db/migrate.js';
import {
  adventureRuns,
  herds,
  horseAncestors,
  horses,
  jobAssignments,
  marketListings,
  relationships,
  users,
} from '../src/db/schema.js';
import { ADVENTURE_BY_ID, ADVENTURE_POOLS, type Choice } from '../src/content/adventures.js';
import { ITEM_BY_ID } from '../src/content/items.js';
import { RECIPE_BY_ID } from '../src/content/recipes.js';
import { REGION_BY_ID } from '../src/content/regions.js';
import { adventure } from '../src/services/adventure.js';
import {
  availableChoices,
  chooseInRun,
  partyHarmony,
  partyHasBond,
  resolveChoice,
  startRun,
} from '../src/services/adventure-run.js';
import { getAudit } from '../src/services/audit.js';
import { bondedBreedBonus, breedHorses } from '../src/services/breeding.js';
import { advanceHerd } from '../src/services/daily.js';
import { getHorse, listHerdHorses, mintHorse, shareLineage } from '../src/services/horse.js';
import { grantItems } from '../src/services/inventory.js';
import { jobDc, resolveJobsForDay } from '../src/services/jobs.js';
import { compatibility } from '../src/services/personality.js';
import { skillCheck } from '../src/services/stats.js';
import {
  coatRarityScore,
  computeUploadReward,
  uploadHorse,
  uploadQuote,
} from '../src/services/upload.js';
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
  // stock raw materials (as if from roaming): timber → planks, clay → bricks
  await grantItems(db, herdId, [
    { id: 'timber', qty: 20 },
    { id: 'clay', qty: 20 },
    { id: 'plant-fiber', qty: 12 },
    { id: 'ore', qty: 8 },
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

  // bonds shape breeding (§8 → §14.2): a foal born to a bonded pair starts stronger ----------
  // The pure bonus curve: full at a true bond, graded down, zero for strangers/rivals (cozy).
  eq(
    'a full bond passes the whole stat bonus',
    bondedBreedBonus(BONDED_THRESHOLD),
    BONDED_BREED_STAT_BONUS,
  );
  eq('strangers pass no bonus', bondedBreedBonus(0), 0);
  eq('rivals pass no bonus — never a penalty', bondedBreedBonus(-50), 0);
  check(
    'a budding friendship passes a partial, capped bonus',
    bondedBreedBonus(FRIEND_THRESHOLD) > 0 &&
      bondedBreedBonus(FRIEND_THRESHOLD) <= BONDED_BREED_STAT_BONUS &&
      bondedBreedBonus(FRIEND_THRESHOLD) <= bondedBreedBonus(BONDED_THRESHOLD),
  );

  // Mid-stat parents (so +bonus stays well under STAT_MAX and is plainly visible).
  const midStats = { str: 12, dex: 12, con: 12, int: 12, wis: 12, cha: 12 };
  const bp1 = await mintHorse(db, {
    herdId,
    genotype: { E: 'Ee', A: 'Aa' },
    origin: 'wild',
    lifeStage: 'adult',
    stats: midStats,
  });
  const bp2 = await mintHorse(db, {
    herdId,
    genotype: { E: 'ee', A: 'aa' },
    origin: 'wild',
    lifeStage: 'adult',
    stats: midStats,
  });
  const [bLo, bHi] = bp1.id < bp2.id ? [bp1.id, bp2.id] : [bp2.id, bp1.id];
  await db
    .insert(relationships)
    .values({ herdId, horseA: bLo, horseB: bHi, affinity: BONDED_THRESHOLD, type: 'bonded' });
  const bondBred = await breedHorses(db, herdId, bp1.id, bp2.id, { seed: 1 });
  check('a bonded pair still produces a foal', bondBred.ok && bondBred.viable);
  if (bondBred.ok && bondBred.viable) {
    eq('the result surfaces the full bond bonus', bondBred.bond?.bonus, BONDED_BREED_STAT_BONUS);
    // Re-mint the identical cross (same parents + foal seed) with no bond logic → the baseline.
    const baseline = await mintHorse(db, {
      herdId,
      genotype: bondBred.foal.genotype,
      origin: 'bred',
      lifeStage: 'foal',
      parentA: bp1.id,
      parentB: bp2.id,
      seed: bondBred.foal.seed,
    });
    check(
      'every foal stat = inherited baseline + bond bonus (capped at STAT_MAX)',
      STAT_KEYS.every(
        (k) =>
          (bondBred.foal.stats[k] ?? 0) ===
          Math.min(STAT_MAX, (baseline.stats[k] ?? 0) + BONDED_BREED_STAT_BONUS),
      ),
    );
    check(
      'the bonded foal is genuinely stronger than its inherited baseline',
      STAT_KEYS.some((k) => (bondBred.foal.stats[k] ?? 0) > (baseline.stats[k] ?? 0)),
    );
  }

  // An un-bonded (stranger) pair breeds exactly as before — no bond surfaced, no stat bump.
  const sp1 = await mintHorse(db, {
    herdId,
    genotype: { E: 'Ee', A: 'Aa' },
    origin: 'wild',
    lifeStage: 'adult',
    stats: midStats,
  });
  const sp2 = await mintHorse(db, {
    herdId,
    genotype: { E: 'ee', A: 'aa' },
    origin: 'wild',
    lifeStage: 'adult',
    stats: midStats,
  });
  const strangerBred = await breedHorses(db, herdId, sp1.id, sp2.id, { seed: 1 });
  check('a stranger pair produces a foal', strangerBred.ok && strangerBred.viable);
  if (strangerBred.ok && strangerBred.viable) {
    check('no bond → no bonus surfaced', strangerBred.bond === null);
    const baseline = await mintHorse(db, {
      herdId,
      genotype: strangerBred.foal.genotype,
      origin: 'bred',
      lifeStage: 'foal',
      parentA: sp1.id,
      parentB: sp2.id,
      seed: strangerBred.foal.seed,
    });
    check(
      'a stranger foal inherits with no bond bump (unchanged behavior)',
      STAT_KEYS.every((k) => (strangerBred.foal.stats[k] ?? 0) === (baseline.stats[k] ?? 0)),
    );
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

  // jobs ↔ adventures (§9.3): a Seasoned adventurer works better -----------------------------
  // Pure: the job DC is eased once a horse is Seasoned (≥ threshold), and not one adventure before.
  eq(
    'a Seasoned adventurer has an easier job check',
    jobDc(ADVENTURE_MARK_THRESHOLD),
    JOB_DC - JOB_SEASONED_DC_BONUS,
  );
  eq('an un-seasoned horse uses the base job DC', jobDc(0), JOB_DC);
  eq(
    'one adventure short of Seasoned → still the base DC',
    jobDc(ADVENTURE_MARK_THRESHOLD - 1),
    JOB_DC,
  );

  // A seed whose job roll FAILS at the base DC but CLEARS the eased DC — so the only thing that
  // flips the outcome is the Seasoned mark.
  let bandSeed = -1;
  for (let s = 1; s < 600 && bandSeed < 0; s++) {
    const base = skillCheck(10, 0, 10, JOB_DC, mulberry32(s)).success;
    const eased = skillCheck(10, 0, 10, JOB_DC - JOB_SEASONED_DC_BONUS, mulberry32(s)).success;
    if (!base && eased) bandSeed = s;
  }
  check('found a seed where the Seasoned bonus flips a job check', bandSeed >= 0);

  // Each worker is the ONLY job in its own fresh herd → it rolls the seed's first value, so the
  // run is deterministic and the two differ only by the mark.
  const jobOnlyHerd = async (uname: string, adventures: number): Promise<number> => {
    const reg = await inject({
      method: 'POST',
      url: '/auth/register',
      payload: { username: uname, password: 'jobtesthorse' },
    });
    const hId = reg.json<{ herd: { id: string } }>().herd.id;
    const w = await mintHorse(db, {
      herdId: hId,
      genotype: { E: 'Ee', A: 'Aa' },
      origin: 'wild',
      lifeStage: 'adult',
      stats: { str: 10, dex: 10, con: 10, int: 10, wis: 10, cha: 10 },
      luck: 10,
    });
    await db.update(horses).set({ adventures }).where(drizzleEq(horses.id, w.id));
    await db.insert(jobAssignments).values({
      horseId: w.id,
      herdId: hId,
      structureType: 'library',
      skill: 'reading',
      stat: 'int',
    });
    return resolveJobsForDay(db, hId, mulberry32(bandSeed));
  };
  const seasonedCubes = await jobOnlyHerd('jobseasoned', ADVENTURE_MARK_THRESHOLD);
  const homebodyCubes = await jobOnlyHerd('jobhomebody', 0);
  check(
    'a Seasoned worker out-earns an identical un-seasoned one on the same job roll',
    seasonedCubes > homebodyCubes && homebodyCubes > 0,
  );

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

  // --- Phase 8c: interactive "story" adventures (§9.3) ---
  // Pure scene resolution is deterministic under a seeded RNG.
  const flatStats = { str: 10, dex: 10, con: 10, int: 10, wis: 10, cha: 10 };
  const calm1 = await mintHorse(db, {
    herdId,
    genotype: { E: 'Ee' },
    origin: 'wild',
    lifeStage: 'adult',
    stats: flatStats,
    luck: 10,
    personality: { o: 50, c: 50, e: 45, a: 80, n: 20 },
  });
  const calm2 = await mintHorse(db, {
    herdId,
    genotype: { E: 'ee' },
    origin: 'wild',
    lifeStage: 'adult',
    stats: flatStats,
    luck: 10,
    personality: { o: 52, c: 48, e: 50, a: 82, n: 18 },
  });
  const calmParty = [calm1, calm2];

  const safeChoice: Choice = { id: 'safe', text: 'safe', success: { text: 'auto', next: 'end' } };
  eq(
    'a checkless choice always takes its success branch',
    resolveChoice(calmParty, safeChoice, () => 0.5).outcome.text,
    'auto',
  );

  const ref = skillCheck(10, 0, 10, 0, () => 0.5).total; // the roll these flat horses make at rng 0.5
  const plain: Choice = {
    id: 'p',
    text: 'p',
    check: { stat: 'cha', dc: ref + 1 },
    success: { text: 'win', next: 'end' },
    failure: { text: 'lose', next: 'end' },
  };
  eq(
    'a roll one under the DC fails',
    resolveChoice(calmParty, plain, () => 0.5).outcome.text,
    'lose',
  );

  // Harmony buffs a flagged check: a tight-knit party clears a DC the same roll would miss.
  const harmonyBonus = partyHarmony(calmParty);
  check('a tight-knit party earns a harmony buff', harmonyBonus >= 1);
  eq('a lone horse has no harmony', partyHarmony([calm1]), 0);
  const harmonized: Choice = {
    id: 'h',
    text: 'h',
    check: { stat: 'cha', dc: ref + 1, harmony: true },
    success: { text: 'win', next: 'end' },
    failure: { text: 'lose', next: 'end' },
  };
  eq(
    'the same roll clears the DC with harmony',
    resolveChoice(calmParty, harmonized, () => 0.5).outcome.text,
    'win',
  );

  // A clashing party harmonizes worse than a compatible one.
  const clash1 = await mintHorse(db, {
    herdId,
    genotype: { E: 'Ee' },
    origin: 'wild',
    lifeStage: 'adult',
    stats: flatStats,
    luck: 10,
    personality: { o: 95, c: 5, e: 10, a: 5, n: 95 },
  });
  const clash2 = await mintHorse(db, {
    herdId,
    genotype: { E: 'ee' },
    origin: 'wild',
    lifeStage: 'adult',
    stats: flatStats,
    luck: 10,
    personality: { o: 5, c: 95, e: 95, a: 10, n: 98 },
  });
  check(
    'a clashing party harmonizes worse than a compatible one',
    partyHarmony([clash1, clash2]) < harmonyBonus,
  );

  // §bonds: the harmony buff reads the *stored relationship graph*, not just innate personality.
  const calmBondKey = { horseA: calm1.id, horseB: calm2.id };
  const freshHarmony = partyHarmony([calm1, calm2]); // no bonds → personality proxy
  const bondedHarmony = partyHarmony(
    [calm1, calm2],
    [{ ...calmBondKey, affinity: BONDED_THRESHOLD, type: 'bonded' }],
  );
  check('a bonded pair out-harmonizes the same pair as strangers', bondedHarmony > freshHarmony);
  check('a stored bond lifts harmony to the max', bondedHarmony === ADVENTURE_HARMONY_MAX);
  check(
    'a rival pair gives no harmony but never a penalty (cozy, buff-only)',
    partyHarmony([calm1, calm2], [{ ...calmBondKey, affinity: -50, type: 'rival' }]) === 0,
  );
  check(
    'partyHasBond flags a friendly/bonded pair',
    partyHasBond(
      [calm1, calm2],
      [{ ...calmBondKey, affinity: FRIEND_THRESHOLD, type: 'friend' }],
    ) && !partyHasBond([calm1, calm2], []),
  );
  const harmonyChoice: Choice = {
    id: 'h',
    text: 'h',
    check: { stat: 'cha', dc: 20, harmony: true },
    success: { text: 'win', next: 'end' },
    failure: { text: 'lose', next: 'end' },
  };
  const freshRoll = resolveChoice([calm1, calm2], harmonyChoice, () => 0.5).roll;
  const bondedRoll = resolveChoice([calm1, calm2], harmonyChoice, () => 0.5, [
    { ...calmBondKey, affinity: BONDED_THRESHOLD, type: 'bonded' },
  ]).roll;
  check(
    'a bonded party rolls a higher harmony bonus on a check',
    (bondedRoll?.harmony ?? 0) > (freshRoll?.harmony ?? 0),
  );

  // Integration: chooseInRun reads the graph and surfaces `bonded` on a harmony check.
  const bondA = await mintHorse(db, {
    herdId,
    genotype: { E: 'Ee', A: 'Aa' },
    origin: 'founder',
    lifeStage: 'adult',
    personality: { o: 50, c: 50, e: 50, a: 80, n: 20 },
  });
  const bondB = await mintHorse(db, {
    herdId,
    genotype: { E: 'ee' },
    origin: 'founder',
    lifeStage: 'adult',
    personality: { o: 50, c: 50, e: 50, a: 80, n: 20 },
  });
  const [bh1, bh2] = bondA.id < bondB.id ? [bondA.id, bondB.id] : [bondB.id, bondA.id];
  await db
    .insert(relationships)
    .values({ herdId, horseA: bh1, horseB: bh2, affinity: BONDED_THRESHOLD, type: 'bonded' });
  const bondRun = await startRun(db, herdId, 'green-grass', [bondA.id, bondB.id], {
    scriptId: 'sunny-hollow',
    seed: 3,
  });
  if (bondRun.ok) {
    await chooseInRun(db, herdId, bondRun.runId, 'forage-bank'); // → crossroads
    await chooseInRun(db, herdId, bondRun.runId, 'push'); // → stranger
    const approach = await chooseInRun(db, herdId, bondRun.runId, 'approach'); // a harmony check
    check(
      'chooseInRun surfaces `bonded` when a real bond helps a harmony check',
      approach.ok && approach.bonded === true,
    );
  }

  // Personality gates a choice: the bold call needs Extraversion ≥ 60 in someone.
  const ggScript = ADVENTURE_BY_ID.get('sunny-hollow');
  const strangerScene = ggScript?.scenes['stranger'];
  check('sunny-hollow has a stranger scene', !!strangerScene);
  if (strangerScene) {
    const timidIds = availableChoices(strangerScene, calmParty).map((c) => c.id);
    check('a non-bold party cannot call out boldly', !timidIds.includes('call-bold'));
    check('a non-bold party can still approach gently', timidIds.includes('approach'));
    const bold = await mintHorse(db, {
      herdId,
      genotype: { E: 'Ee' },
      origin: 'wild',
      lifeStage: 'adult',
      stats: flatStats,
      luck: 10,
      personality: { o: 50, c: 50, e: 80, a: 70, n: 25 },
    });
    const boldIds = availableChoices(strangerScene, [bold]).map((c) => c.id);
    check('a bold party unlocks the bold call', boldIds.includes('call-bold'));
  }

  // HTTP flow: start → choose → bank, with the haul reaching the stash.
  const fiberQty = async (): Promise<number> => {
    const inv = (await inject({ method: 'GET', url: '/inventory', headers: { cookie } })).json<
      { id: string; qty: number }[]
    >();
    return inv.find((i) => i.id === 'plant-fiber')?.qty ?? 0;
  };
  const regionsView = (await inject({ method: 'GET', url: '/regions', headers: { cookie } })).json<
    { id: string; interactive: boolean }[]
  >();
  check(
    'green-grass is flagged interactive',
    regionsView.find((r) => r.id === 'green-grass')?.interactive === true,
  );
  check(
    'a scriptless region is not interactive',
    regionsView.find((r) => r.id === 'dusty-dunes')?.interactive === false,
  );

  // The route does the seeded pool draw (no script override), so retry until it serves Sunny
  // Hollow — the fixed choice-path below assumes it. (The pool draw itself is covered separately.)
  const startSunny = async () => {
    const res = await inject({
      method: 'POST',
      url: '/adventure/start',
      headers: { cookie },
      payload: { regionId: 'green-grass', party: [id] },
    });
    return { res, json: res.json<{ runId: string; scene?: { id: string } }>() };
  };
  let started = await startSunny();
  for (let i = 0; i < 40 && started.json.scene?.id !== 'meadow-edge'; i++)
    started = await startSunny();
  eq('POST /adventure/start → 200', started.res.statusCode, 200);
  eq('the run opens on the meadow edge', started.json.scene?.id, 'meadow-edge');
  const storyRunId = started.json.runId;

  const noScript = await inject({
    method: 'POST',
    url: '/adventure/start',
    headers: { cookie },
    payload: { regionId: 'dusty-dunes', party: [id] },
  });
  eq('start in a scriptless region → 404', noScript.statusCode, 404);

  const step1 = await inject({
    method: 'POST',
    url: `/adventure/${storyRunId}/choose`,
    headers: { cookie },
    payload: { choiceId: 'forage-bank' },
  });
  eq('first choice → 200', step1.statusCode, 200);
  const step1Json = step1.json<{ ended: boolean; scene?: { id: string } }>();
  check(
    'foraging advances to the crossroads',
    step1Json.ended === false && step1Json.scene?.id === 'crossroads',
  );

  const fiberBefore = await fiberQty();
  const retreatRes = await inject({
    method: 'POST',
    url: `/adventure/${storyRunId}/choose`,
    headers: { cookie },
    payload: { choiceId: 'retreat' },
  });
  const retreatJson = retreatRes.json<{
    ended: boolean;
    summary: { loot: { id: string; qty: number }[] };
  }>();
  check(
    'retreat ends the run with a banked haul',
    retreatJson.ended === true && retreatJson.summary.loot.length > 0,
  );
  check('the banked haul reached the herd stash', (await fiberQty()) > fiberBefore);

  const stale = await inject({
    method: 'POST',
    url: `/adventure/${storyRunId}/choose`,
    headers: { cookie },
    payload: { choiceId: 'retreat' },
  });
  eq('choosing in an ended run → 404', stale.statusCode, 404);

  // Wild befriend: a successful approach mints a stranger straight into the herd.
  const herdBefore = (await listHerdHorses(db, herdId)).length;
  let befriendedName: string | null = null;
  for (let s = 1; s <= 60 && befriendedName === null; s++) {
    const r = await startRun(db, herdId, 'green-grass', [hs1.id, hs2.id], {
      seed: s,
      scriptId: 'sunny-hollow',
    });
    if (!r.ok) continue;
    await chooseInRun(db, herdId, r.runId, 'forage-bank');
    await chooseInRun(db, herdId, r.runId, 'push');
    const res = await chooseInRun(db, herdId, r.runId, 'approach');
    if (res.ok && res.befriended) befriendedName = res.befriended.name;
    if (res.ok && !res.ended) await chooseInRun(db, herdId, r.runId, 'slip-out');
  }
  check('a wild stranger can be befriended into the herd', befriendedName !== null);
  check(
    'befriending added a horse to the herd',
    (await listHerdHorses(db, herdId)).length > herdBefore,
  );

  // Run persistence (§9.3): a run started before a restart survives in the DB and continues.
  const persisted = await startRun(db, herdId, 'green-grass', [id], {
    seed: 4242,
    scriptId: 'sunny-hollow',
  });
  check('startRun opens an interactive run', persisted.ok);
  if (persisted.ok) {
    const persistRunId = persisted.runId;
    const liveRow = await db.query.adventureRuns.findFirst({
      where: drizzleEq(adventureRuns.id, persistRunId),
    });
    check('the run is persisted to adventure_runs as active', liveRow?.status === 'active');

    // Simulate a server restart: a brand-new app instance, zero in-memory state, same DB.
    const app2 = buildApp(db, { rateLimitMax: 100_000, authRateLimitMax: 100_000 });
    await app2.ready();
    const inject2 = (opts: InjectOptions) =>
      app2.inject({ ...opts, url: `/api${typeof opts.url === 'string' ? opts.url : ''}` });

    const restartStep1 = await inject2({
      method: 'POST',
      url: `/adventure/${persistRunId}/choose`,
      headers: { cookie },
      payload: { choiceId: 'forage-bank' },
    });
    eq('continue a pre-restart run on a fresh instance → 200', restartStep1.statusCode, 200);
    const restartScene = restartStep1.json<{ ended: boolean; scene?: { id: string } }>();
    check(
      'the run resumes from its persisted scene',
      restartScene.ended === false && restartScene.scene?.id === 'crossroads',
    );

    const restartEnd = await inject2({
      method: 'POST',
      url: `/adventure/${persistRunId}/choose`,
      headers: { cookie },
      payload: { choiceId: 'retreat' },
    });
    const restartSummary = restartEnd.json<{ ended: boolean; summary?: { loot: unknown[] } }>();
    check(
      'the resumed run ends and banks its haul',
      restartSummary.ended === true && (restartSummary.summary?.loot.length ?? 0) > 0,
    );
    const endedRow = await db.query.adventureRuns.findFirst({
      where: drizzleEq(adventureRuns.id, persistRunId),
    });
    check('the finished run is persisted as ended', endedRow?.status === 'ended');
    await app2.close();
  }

  // §2 pool mechanic: a region holds a pool of scripts; startRun draws one (seeded, reproducible).
  check(
    'green-grass holds a pool of two scripts',
    (ADVENTURE_POOLS.get('green-grass')?.length ?? 0) === 2,
  );
  const pickA = await startRun(db, herdId, 'green-grass', [id], { seed: 777 });
  const pickB = await startRun(db, herdId, 'green-grass', [id], { seed: 777 });
  check(
    'a fixed seed draws the same script every time',
    pickA.ok && pickB.ok && pickA.scene.id === pickB.scene.id,
  );
  const startsSeen = new Set<string>();
  for (let s = 1; s <= 40; s++) {
    const r = await startRun(db, herdId, 'green-grass', [id], { seed: s });
    if (r.ok) startsSeen.add(r.scene.id);
  }
  check(
    'both scripts in the pool are reachable across seeds',
    startsSeen.has('meadow-edge') && startsSeen.has('herb-meadow'),
  );
  const forced = await startRun(db, herdId, 'green-grass', [id], {
    seed: 1,
    scriptId: 'herb-hunt',
  });
  check('a scriptId override forces that script', forced.ok && forced.scene.id === 'herb-meadow');

  // §3 herb hunt: structure, gating, feed-forward, the brew, and a coherent marsh-sage chain.
  const herb = ADVENTURE_BY_ID.get('herb-hunt');
  check('herb-hunt is registered in the pool', !!herb);
  if (herb) {
    const targets = Object.values(herb.scenes).flatMap(
      (sc) =>
        sc.choices.flatMap((c) => [c.success.next, c.failure?.next].filter(Boolean)) as string[],
    );
    check(
      'every herb-hunt branch points to a real scene or end',
      targets.every((t) => t === 'end' || !!herb.scenes[t]),
    );
    const usedStats = new Set(
      Object.values(herb.scenes).flatMap((sc) =>
        sc.choices.map((c) => c.check?.stat).filter(Boolean),
      ),
    );
    check('herb-hunt uses several distinct stats (not one for all)', usedStats.size >= 4);

    const fen = herb.scenes['fen'];
    const sneak = fen?.choices.find((c) => c.id === 'sneak');
    check(
      'the sneak option is gated on Conscientiousness (≠ Sunny Hollow)',
      sneak?.requires?.trait === 'c',
    );
    const cautious = await mintHorse(db, {
      herdId,
      genotype: { E: 'Ee' },
      origin: 'wild',
      lifeStage: 'adult',
      stats: flatStats,
      luck: 10,
      personality: { o: 50, c: 80, e: 30, a: 60, n: 30 },
    });
    if (fen) {
      check(
        'a low-Conscientiousness party cannot sneak',
        !availableChoices(fen, calmParty).some((c) => c.id === 'sneak'),
      );
      check(
        'a Conscientious party unlocks the sneak',
        availableChoices(fen, [cautious]).some((c) => c.id === 'sneak'),
      );
    }

    const richDc = herb.scenes['brew-rich']?.choices[0]?.check?.dc ?? 0;
    const thinDc = herb.scenes['brew-thin']?.choices[0]?.check?.dc ?? 0;
    check('better sage yields a more forgiving brew (feed-forward)', richDc > 0 && richDc < thinDc);
    check(
      'the brew is the harmony-buffed check',
      herb.scenes['brew-rich']?.choices[0]?.check?.harmony === true,
    );
  }

  const ggLoot = REGION_BY_ID.get('green-grass')?.loot.map((l) => l.item) ?? [];
  check('marsh-sage is sourced from Green Grass (no orphan)', ggLoot.includes('marsh-sage'));
  const brew = RECIPE_BY_ID.get('brew-healing-potion');
  check(
    'the Brew Healing Potion recipe sinks marsh-sage into a potion',
    !!brew && brew.inputs.some((i) => i.id === 'marsh-sage') && brew.output.id === 'healing-potion',
  );
  check(
    'the healing potion is a known item with framing flavor',
    !!ITEM_BY_ID.get('healing-potion')?.flavor,
  );

  // A deterministic herb-hunt path: bank at the fork → a modest potion, no dice needed.
  const hh = await startRun(db, herdId, 'green-grass', [id], { scriptId: 'herb-hunt' });
  check('herb-hunt opens at the meadow', hh.ok && hh.scene.id === 'herb-meadow');
  if (hh.ok) {
    const toFork = await chooseInRun(db, herdId, hh.runId, 'pick-open');
    check(
      'the meadow leads to the push/bank fork',
      toFork.ok && !toFork.ended && toFork.scene.id === 'herb-fork',
    );
    const banked = await chooseInRun(db, herdId, hh.runId, 'brew-now');
    check(
      'banking the herb hunt brews a healing potion',
      banked.ok && banked.ended && banked.summary.loot.some((l) => l.id === 'healing-potion'),
    );
  }

  // --- Uploading to The Cloud (§14.3a): reward scaling, guards, FK-clean deletion ---
  const flat6 = { str: 10, dex: 10, con: 10, int: 10, wis: 10, cha: 10 };
  const maxedSkills: Record<string, { level: number; xp: number }> = {};
  for (const k of SKILL_KEYS) maxedSkills[k] = { level: 8, xp: 0 };
  const maxedStats = { str: 18, dex: 18, con: 18, int: 18, wis: 18, cha: 18 };

  const bayUntrained = await mintHorse(db, {
    herdId,
    genotype: { E: 'Ee', A: 'Aa' },
    origin: 'founder',
    lifeStage: 'adult',
    stats: flat6,
  });
  const grayUntrained = await mintHorse(db, {
    herdId,
    genotype: { G: 'Gg', E: 'Ee', A: 'Aa' },
    origin: 'founder',
    lifeStage: 'adult',
    stats: flat6,
  });
  const bayTrained = await mintHorse(db, {
    herdId,
    genotype: { E: 'Ee', A: 'Aa' },
    origin: 'founder',
    lifeStage: 'adult',
    stats: maxedStats,
    skills: maxedSkills,
  });
  const uploadFoal = await mintHorse(db, {
    herdId,
    genotype: { E: 'Ee', A: 'Aa' },
    origin: 'founder',
    lifeStage: 'foal',
    stats: flat6,
  });
  const rBay = computeUploadReward(bayUntrained).reward;
  const rGray = computeUploadReward(grayUntrained).reward;
  const rTrained = computeUploadReward(bayTrained).reward;
  const rFoal = computeUploadReward(uploadFoal).reward;
  check('upload reward scales with rarity (Gray > Bay)', rGray > rBay);
  check(
    'coat rarity is derived from the engine (Gray rarer than Bay)',
    coatRarityScore(grayUntrained.genotype) > coatRarityScore(bayUntrained.genotype),
  );
  check('upload reward scales with training (maxed > untrained)', rTrained > rBay);
  check('a foal pays minimal (less than a common adult)', rFoal < rBay);
  eq('a foal pays exactly the foal floor', rFoal, Math.round(UPLOAD_BASE * UPLOAD_FOAL_FACTOR));

  // The quote endpoint names the horse + shows the server-computed reward (client never computes).
  const upQ = await inject({
    method: 'GET',
    url: `/horses/${grayUntrained.id}/upload-quote`,
    headers: { cookie },
  });
  eq('upload quote → 200', upQ.statusCode, 200);
  const upQBody = upQ.json<{ horse: { name: string }; reward: number }>();
  check('the quote names the horse', upQBody.horse.name.length > 0);
  eq('the quote reward matches the server computation', upQBody.reward, rGray);

  // Relationships surface as a warning (not a block).
  const friendA = await mintHorse(db, {
    herdId,
    genotype: { E: 'Ee' },
    origin: 'wild',
    lifeStage: 'adult',
  });
  const friendB = await mintHorse(db, {
    herdId,
    genotype: { E: 'ee' },
    origin: 'wild',
    lifeStage: 'adult',
    name: 'Buddy',
  });
  await db
    .insert(relationships)
    .values({ herdId, horseA: friendA.id, horseB: friendB.id, affinity: 40, type: 'friend' });
  const relQuote = await uploadQuote(db, herdId, friendA.id);
  check(
    'the quote surfaces a bonded herdmate (warn, not block)',
    relQuote.ok && relQuote.relationships.some((b) => b.name === 'Buddy'),
  );

  // Guard: a horse out on an active adventure cannot be uploaded.
  const advUp = await mintHorse(db, {
    herdId,
    genotype: { E: 'Ee', A: 'Aa' },
    origin: 'founder',
    lifeStage: 'adult',
  });
  await startRun(db, herdId, 'green-grass', [advUp.id], { scriptId: 'sunny-hollow' });
  const blocked = await uploadHorse(db, herdId, advUp.id);
  check(
    'cannot upload a horse on an active adventure',
    !blocked.ok && blocked.code === 'on_adventure',
  );

  // FK-clean deletion: a parent with a child link, a relationship, ancestry, a job, and a listing.
  const upParent = await mintHorse(db, {
    herdId,
    genotype: { E: 'Ee', A: 'Aa' },
    origin: 'founder',
    lifeStage: 'adult',
  });
  const upChild = await mintHorse(db, {
    herdId,
    genotype: { E: 'Ee' },
    origin: 'bred',
    parentA: upParent.id,
    parentB: id,
    lifeStage: 'adult',
  });
  const upMate = await mintHorse(db, {
    herdId,
    genotype: { E: 'ee' },
    origin: 'wild',
    lifeStage: 'adult',
  });
  await db
    .insert(relationships)
    .values({ herdId, horseA: upParent.id, horseB: upMate.id, affinity: 20, type: 'friend' });
  await db.insert(jobAssignments).values({
    horseId: upParent.id,
    herdId,
    structureType: 'library',
    skill: 'reading',
    stat: 'int',
  });
  await db.insert(marketListings).values({ herdId, horseId: upParent.id, price: 100 });
  const cubesBeforeUpload = (await db.query.herds.findFirst({ where: drizzleEq(herds.id, herdId) }))
    ?.cubes;
  const upRes = await uploadHorse(db, herdId, upParent.id);
  check('uploading a parent succeeds (no FK violation)', upRes.ok);
  check('the uploaded horse is gone', (await getHorse(db, upParent.id)) === null);
  eq(
    "the child's parent link is nulled (no dangling ref)",
    (await getHorse(db, upChild.id))?.parentA ?? null,
    null,
  );
  eq(
    'the relationship row is cascade-deleted',
    (await db.select().from(relationships).where(drizzleEq(relationships.horseA, upParent.id)))
      .length,
    0,
  );
  eq(
    'the job row is cascade-deleted',
    (await db.select().from(jobAssignments).where(drizzleEq(jobAssignments.horseId, upParent.id)))
      .length,
    0,
  );
  eq(
    'the market listing is cascade-deleted',
    (await db.select().from(marketListings).where(drizzleEq(marketListings.horseId, upParent.id)))
      .length,
    0,
  );
  eq(
    'ancestry rows for the uploaded horse are gone',
    (
      await db
        .select()
        .from(horseAncestors)
        .where(drizzleEq(horseAncestors.ancestorId, upParent.id))
    ).length,
    0,
  );
  if (upRes.ok) {
    eq(
      'the parting gift reached the purse',
      (await db.query.herds.findFirst({ where: drizzleEq(herds.id, herdId) }))?.cubes,
      (cubesBeforeUpload ?? 0) + upRes.reward,
    );
  }

  // The upload endpoint performs the send-off end to end.
  const httpUp = await mintHorse(db, {
    herdId,
    genotype: { E: 'Ee', A: 'Aa' },
    origin: 'founder',
    lifeStage: 'adult',
  });
  const upPost = await inject({
    method: 'POST',
    url: `/horses/${httpUp.id}/upload`,
    headers: { cookie },
  });
  eq('POST upload → 200', upPost.statusCode, 200);
  check('the endpoint returns a reward', upPost.json<{ reward: number }>().reward > 0);
  eq(
    'the uploaded horse is gone (404)',
    (await inject({ method: 'GET', url: `/horses/${httpUp.id}` })).statusCode,
    404,
  );

  // --- Adventures train horses (§9.3): per-check skill XP + the cosmetic "Seasoned" mark ---
  const trainee = await mintHorse(db, {
    herdId,
    genotype: { E: 'Ee', A: 'Aa' },
    origin: 'founder',
    lifeStage: 'adult',
    stats: flat6,
  });
  const beforeXp =
    ((await getHorse(db, trainee.id))?.skills as Record<string, { level: number; xp: number }>)
      ?.foraging?.xp ?? 0;
  const trainRun = await startRun(db, herdId, 'green-grass', [trainee.id], {
    scriptId: 'sunny-hollow',
    seed: 7,
  });
  check('a training run started', trainRun.ok);
  if (trainRun.ok) {
    const step1 = await chooseInRun(db, herdId, trainRun.runId, 'forage-bank');
    check(
      'a skill check reports who trained + the specific skill',
      step1.ok && !step1.ended && step1.trained?.skill === 'foraging',
    );
    check(
      'the surfaced XP gain is positive',
      step1.ok && !step1.ended && (step1.trained?.xp ?? 0) > 0,
    );
    const afterXp =
      ((await getHorse(db, trainee.id))?.skills as Record<string, { level: number; xp: number }>)
        ?.foraging?.xp ?? 0;
    check('foraging XP rose from the adventure check', afterXp > beforeXp);
    await chooseInRun(db, herdId, trainRun.runId, 'retreat'); // crossroads → end
    check(
      'completing an adventure increments the horse adventure count',
      ((await getHorse(db, trainee.id))?.adventures ?? 0) >= 1,
    );
  }
  check(
    'a successful check trains more than a failed attempt',
    ADVENTURE_SKILL_XP_SUCCESS > ADVENTURE_SKILL_XP_ATTEMPT,
  );

  // The cosmetic mark surfaces at the threshold — flavor only, no mechanical effect.
  const markHorse = await mintHorse(db, {
    herdId,
    genotype: { E: 'Ee', A: 'Aa' },
    origin: 'founder',
    lifeStage: 'adult',
  });
  await db
    .update(horses)
    .set({ adventures: ADVENTURE_MARK_THRESHOLD })
    .where(drizzleEq(horses.id, markHorse.id));
  const markedView = (await inject({ method: 'GET', url: `/horses/${markHorse.id}` })).json<{
    adventures: number;
    experienced: boolean;
  }>();
  eq('the horse view reports the adventure count', markedView.adventures, ADVENTURE_MARK_THRESHOLD);
  check('the experienced mark appears at the threshold', markedView.experienced === true);
  check(
    'a horse below the threshold is not yet experienced',
    (await inject({ method: 'GET', url: `/horses/${trainee.id}` })).json<{ experienced: boolean }>()
      .experienced === false,
  );

  // --- Care matters (§7 → §9.3): a horse tended today fares a little better on adventures ---
  const careNow = Date.now();
  const careHorse = await mintHorse(db, {
    herdId,
    genotype: { E: 'Ee', A: 'Aa' },
    origin: 'founder',
    lifeStage: 'adult',
    stats: flat6,
  });
  const careRef = skillCheck(10, 0, careHorse.luck, 0, () => 0.5).total;
  const careChoice: Choice = {
    id: 'carec',
    text: 'carec',
    check: { stat: 'wis', skill: 'foraging', dc: careRef + 1 },
    success: { text: 'win', next: 'end' },
    failure: { text: 'lose', next: 'end' },
  };
  const caredRes = resolveChoice(
    [{ ...careHorse, lastCaredAt: new Date(careNow) }],
    careChoice,
    () => 0.5,
    [],
    careNow,
  );
  const uncaredRes = resolveChoice(
    [{ ...careHorse, lastCaredAt: null }],
    careChoice,
    () => 0.5,
    [],
    careNow,
  );
  check(
    'a freshly-cared horse gets the care buff on its check',
    (caredRes.roll?.care ?? 0) === CARE_CHECK_BONUS,
  );
  check('an un-cared horse gets no care buff', (uncaredRes.roll?.care ?? 0) === 0);
  eq('an un-cared horse fails just under the DC', uncaredRes.outcome.text, 'lose');
  eq('care clears the same DC', caredRes.outcome.text, 'win');

  // Integration: chooseInRun reads the horse's care state and applies the buff.
  const careAdv = await mintHorse(db, {
    herdId,
    genotype: { E: 'Ee', A: 'Aa' },
    origin: 'founder',
    lifeStage: 'adult',
    stats: flat6,
  });
  await db.update(horses).set({ lastCaredAt: new Date() }).where(drizzleEq(horses.id, careAdv.id));
  const careRun = await startRun(db, herdId, 'green-grass', [careAdv.id], {
    scriptId: 'sunny-hollow',
    seed: 11,
  });
  if (careRun.ok) {
    const careStep = await chooseInRun(db, herdId, careRun.runId, 'forage-bank');
    check(
      'chooseInRun applies the care buff for a tended horse',
      careStep.ok && !careStep.ended && (careStep.roll?.care ?? 0) === CARE_CHECK_BONUS,
    );
  }

  // The cosmetic "Beloved" mark + `caredToday` surface on the horse view.
  const belovedHorse = await mintHorse(db, {
    herdId,
    genotype: { E: 'Ee', A: 'Aa' },
    origin: 'founder',
    lifeStage: 'adult',
  });
  await db
    .update(horses)
    .set({ careCount: CARE_BELOVED_THRESHOLD, lastCaredAt: new Date() })
    .where(drizzleEq(horses.id, belovedHorse.id));
  const belovedView = (await inject({ method: 'GET', url: `/horses/${belovedHorse.id}` })).json<{
    careCount: number;
    beloved: boolean;
    caredToday: boolean;
  }>();
  eq('the horse view reports the care count', belovedView.careCount, CARE_BELOVED_THRESHOLD);
  check('the Beloved mark appears at the threshold', belovedView.beloved === true);
  check('a horse tended today reads caredToday', belovedView.caredToday === true);
  const plainHorse = await mintHorse(db, {
    herdId,
    genotype: { E: 'ee' },
    origin: 'wild',
    lifeStage: 'adult',
  });
  const plainView = (await inject({ method: 'GET', url: `/horses/${plainHorse.id}` })).json<{
    beloved: boolean;
    caredToday: boolean;
  }>();
  check(
    'a fresh horse is neither Beloved nor cared today',
    plainView.beloved === false && plainView.caredToday === false,
  );

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

  // 4) Admin debug toolkit (§dev) — gating + each command. Mounted only when allowDebug is on,
  //    and then only for admins; consolidates the old /daily/simulate dev affordance.
  {
    // 4a) Prod-style build (allowDebug off) → the routes aren't mounted: 404 for everyone.
    const pdb = createPgliteDb();
    await runMigrations(pdb);
    const papp = buildApp(pdb, { rateLimitMax: 100_000, authRateLimitMax: 100_000 });
    await papp.ready();
    const preg = await papp.inject({
      method: 'POST',
      url: '/api/auth/register',
      payload: { username: 'prodless', password: 'horsehorse1' },
    });
    eq(
      'debug routes are unmounted in a prod-style build → 404',
      (
        await papp.inject({
          method: 'POST',
          url: '/api/debug/grant',
          headers: { cookie: cookieOf(preg) },
          payload: { cubes: 100 },
        })
      ).statusCode,
      404,
    );
    await papp.close();

    // 4b) Dev build (allowDebug on) — a non-admin is denied (403); an admin can use every command.
    const ddb = createPgliteDb();
    await runMigrations(ddb);
    const dapp = buildApp(ddb, {
      rateLimitMax: 100_000,
      authRateLimitMax: 100_000,
      allowDebug: true,
    });
    await dapp.ready();
    const dinject = (opts: InjectOptions) =>
      dapp.inject({ ...opts, url: `/api${typeof opts.url === 'string' ? opts.url : ''}` });

    const reg = await dinject({
      method: 'POST',
      url: '/auth/register',
      payload: { username: 'debugadmin', password: 'horsehorse1' },
    });
    const dcookie = cookieOf(reg);
    const who = reg.json<{ user: { id: string }; herd: { id: string } }>();
    const dHerdId = who.herd.id;

    eq(
      'debug as a non-admin → 403',
      (
        await dinject({
          method: 'POST',
          url: '/debug/grant',
          headers: { cookie: dcookie },
          payload: { cubes: 100 },
        })
      ).statusCode,
      403,
    );

    // Promote to admin — the same session cookie now resolves to an admin user.
    await ddb.update(users).set({ role: 'admin' }).where(drizzleEq(users.id, who.user.id));

    // GRANT
    const beforeCubes = (
      await dinject({ method: 'GET', url: '/me', headers: { cookie: dcookie } })
    ).json<{ herd: { cubes: number } }>().herd.cubes;
    const grantBody = (
      await dinject({
        method: 'POST',
        url: '/debug/grant',
        headers: { cookie: dcookie },
        payload: { cubes: 500, items: [{ id: 'marsh-sage', qty: 7 }] },
      })
    ).json<{ cubes: number; inventory: { id: string; qty: number }[] }>();
    check('debug grant adds Cubes', grantBody.cubes === beforeCubes + 500);
    check(
      'debug grant adds the item by id',
      (grantBody.inventory.find((i) => i.id === 'marsh-sage')?.qty ?? 0) >= 7,
    );

    // MINT — a Conscientiousness-60 horse that unlocks the herb-hunt sneak gate.
    const mintRes = await dinject({
      method: 'POST',
      url: '/debug/mint',
      headers: { cookie: dcookie },
      payload: { personality: { c: 60 }, stats: { dex: 14 }, lifeStage: 'adult', name: 'Careful' },
    });
    eq('debug mint → 201', mintRes.statusCode, 201);
    const minted = mintRes.json<{
      id: string;
      personality: Record<string, number>;
      luck: number;
    }>();
    eq('minted horse has the requested Conscientiousness', minted.personality.c, 60);
    eq('minted horse defaults the rest of OCEAN to 50', minted.personality.o, 50);
    const mintedRow = await getHorse(ddb, minted.id);
    const fen = ADVENTURE_BY_ID.get('herb-hunt')?.scenes['fen'];
    check(
      'the minted C-60 horse unlocks the herb-hunt sneak gate',
      !!fen && !!mintedRow && availableChoices(fen, [mintedRow]).some((c) => c.id === 'sneak'),
    );

    // TIME — advance days drives the autonomy tick (journal fills); single tick = exactly one day.
    const social = { o: 50, c: 50, e: 85, a: 85, n: 15 };
    for (const name of ['Sage', 'Thyme']) {
      await dinject({
        method: 'POST',
        url: '/debug/mint',
        headers: { cookie: dcookie },
        payload: { personality: social, name },
      });
    }
    const adv = (
      await dinject({
        method: 'POST',
        url: '/debug/advance-days',
        headers: { cookie: dcookie },
        payload: { days: 6 },
      })
    ).json<{ daysAdvanced: number }>();
    check('debug advance-days moves the clock', adv.daysAdvanced >= 6);
    const journal = (
      await dinject({ method: 'GET', url: '/journal', headers: { cookie: dcookie } })
    ).json<unknown[]>();
    check('debug advance-days drives the autonomy tick → journal fills', journal.length > 0);

    const beforeTick = (await ddb.query.herds.findFirst({ where: drizzleEq(herds.id, dHerdId) }))
      ?.lastSimTick;
    await dinject({
      method: 'POST',
      url: '/debug/tick',
      headers: { cookie: dcookie },
      payload: {},
    });
    const afterTick = (await ddb.query.herds.findFirst({ where: drizzleEq(herds.id, dHerdId) }))
      ?.lastSimTick;
    eq('a single tick advances exactly one day', (afterTick ?? 0) - (beforeTick ?? 0), 1);

    // MATURE a foal on demand → adult (the coat reveal).
    const foal = await mintHorse(ddb, {
      herdId: dHerdId,
      genotype: { E: 'Ee' },
      origin: 'wild',
      lifeStage: 'foal',
    });
    eq(
      'debug mature a foal → 200',
      (
        await dinject({
          method: 'POST',
          url: `/debug/mature/${foal.id}`,
          headers: { cookie: dcookie },
          payload: {},
        })
      ).statusCode,
      200,
    );
    check(
      'the matured foal is now an adult',
      (await getHorse(ddb, foal.id))?.lifeStage === 'adult',
    );

    // INSPECT — the full hidden truth (luck + full OCEAN + genotype) + raw runs.
    const dump = (
      await dinject({
        method: 'GET',
        url: `/debug/horse/${minted.id}`,
        headers: { cookie: dcookie },
      })
    ).json<{
      horse: { luck: number; personality: Record<string, number>; genotype: unknown };
      relationships: unknown[];
    }>();
    check(
      'inspect exposes hidden luck + full OCEAN + genotype',
      typeof dump.horse.luck === 'number' &&
        dump.horse.personality.c === 60 &&
        !!dump.horse.genotype,
    );
    check(
      'inspect runs returns an array',
      Array.isArray(
        (await dinject({ method: 'GET', url: '/debug/runs', headers: { cookie: dcookie } })).json(),
      ),
    );

    // RESET — back to a clean starter state (2 founder adults + the cold-start purse, stash cleared).
    await dinject({
      method: 'POST',
      url: '/debug/reset',
      headers: { cookie: dcookie },
      payload: {},
    });
    const afterReset = await listHerdHorses(ddb, dHerdId);
    eq('reset restores exactly two starter horses', afterReset.length, 2);
    check(
      'reset starters are adults',
      afterReset.every((h) => h.lifeStage === 'adult'),
    );
    eq(
      'reset restores the cold-start Cubes purse',
      (await ddb.query.herds.findFirst({ where: drizzleEq(herds.id, dHerdId) }))?.cubes,
      STARTING_CUBES,
    );
    eq(
      'reset clears the stash',
      (await dinject({ method: 'GET', url: '/inventory', headers: { cookie: dcookie } })).json<
        unknown[]
      >().length,
      0,
    );

    await dapp.close();
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
