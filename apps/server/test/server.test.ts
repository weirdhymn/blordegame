/*
 * Phase 3 acceptance — a plain Node script (not node:test, which is incompatible
 * with PGlite's lazy WASM init). Run: node --import ./scripts/register.mjs test/server.test.ts
 * Exercises the real Fastify + Drizzle + Postgres(PGlite) stack end to end.
 */
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  ADVENTURE_HARMONY_MAX,
  ADVENTURE_MARK_THRESHOLD,
  ADVENTURE_SKILL_XP_ATTEMPT,
  ADVENTURE_SKILL_XP_SUCCESS,
  BONDED_BREED_STAT_BONUS,
  BONDED_THRESHOLD,
  CLASS_APPROACH,
  COMBAT_RESIST_MULT,
  COMBAT_WEAKNESS_MULT,
  cookMeal,
  FIELD_GUIDE_MILESTONES,
  FOAL_TO_ADULT_MS,
  FRIEND_THRESHOLD,
  GATHER_PER_HORSE_PER_DAY,
  GROOM_CUBES,
  HERD_TIERS,
  type HorseClass,
  JOB_DC,
  JOB_SEASONED_DC_BONUS,
  KEEPER_UNLOCK_EXPEDITIONS,
  OMEN_GATHER_BONUS_QTY,
  POTION_HEAL_HP,
  REWARD_RETREAT_FRACTION,
  SHRINE_PATCH_FEE,
  SKILL_KEYS,
  STARTING_CUBES,
  STAT_KEYS,
  STAT_MAX,
  STUDBOOK_TIER_CUBES,
  UPLOAD_BASE,
  UPLOAD_FOAL_FACTOR,
} from '@blorse/balance';
import { breedFoal, resolve as resolveCoat, type Genotype } from '@blorse/genetics';
import { GLITCH_KINDS, type GlitchKind } from '@blorse/render-core';
import { eq as drizzleEq } from 'drizzle-orm';
import { NodePgDatabase } from 'drizzle-orm/node-postgres';
import { PgliteDatabase } from 'drizzle-orm/pglite';
import type { InjectOptions } from 'fastify';
import { buildApp } from '../src/app.js';
import { createDb, createPgliteDb, type DB } from '../src/db/client.js';
import { runMigrations } from '../src/db/migrate.js';
import {
  adventureRuns,
  battles,
  herds,
  horseAncestors,
  horses,
  jobAssignments,
  journalEvents,
  marketListings,
  relationships,
  trades,
  users,
} from '../src/db/schema.js';
import {
  ADVENTURE_BY_ID,
  ADVENTURE_POOLS,
  ADVENTURE_SCRIPTS,
  REGION_KEEPER,
  type Choice,
} from '../src/content/adventures.js';
import { MAGIC_CROP_POOL } from '../src/content/crops.js';
import { ENEMY_BY_ID } from '../src/content/enemies.js';
import { ITEM_BY_ID } from '../src/content/items.js';
import { RECIPE_BY_ID } from '../src/content/recipes.js';
import { REGION_BY_ID } from '../src/content/regions.js';
import { STUDBOOK_GOAL_BY_ID } from '../src/content/studbook.js';
import { adventure } from '../src/services/adventure.js';
import {
  availableChoices,
  chooseInRun,
  keeperChallenge,
  partyHarmony,
  partyHasBond,
  resolveChoice,
  startRun,
} from '../src/services/adventure-run.js';
import { getAudit } from '../src/services/audit.js';
import { bondedBreedBonus, breedHorses, breedingOdds } from '../src/services/breeding.js';
import { cook, getCareState, getMealBuff, groom } from '../src/services/care-hub.js';
import {
  actInBattle,
  approachMultiplier,
  getBattleView,
  kindnessStat,
  startBattle,
  type BattleAction,
  type BattleView,
} from '../src/services/combat.js';
import { advanceHerd } from '../src/services/daily.js';
import { roam } from '../src/services/exploration.js';
import { getFieldGuide, recordDiscovery } from '../src/services/fieldguide.js';
import {
  buySprinkler,
  fertilizePlot,
  getGarden,
  harvestPlot,
  plantCrop,
  waterPlot,
} from '../src/services/garden.js';
import {
  getHorse,
  listHerdHorses,
  mintHorse,
  rollGlitch,
  shareLineage,
} from '../src/services/horse.js';
import { consumeItems, grantItems, itemQty, quickSellItem } from '../src/services/inventory.js';
import { jobDc, resolveJobsForDay } from '../src/services/jobs.js';
import { buyListing, listHorse } from '../src/services/market.js';
import { omenFor } from '../src/services/omens.js';
import { compatibility } from '../src/services/personality.js';
import {
  checkJobSlots,
  getProgression,
  herdHorseCount,
  upgradeHerd,
} from '../src/services/progression.js';
import { getQuestState } from '../src/services/quests.js';
import { induceGlitch, patchGlitch, SHRINE_OFFERING_ID } from '../src/services/shrine.js';
import { skillCheck } from '../src/services/stats.js';
import { checkStudbookOnMature, getStudbook } from '../src/services/studbook.js';
import { acceptTrade, createTrade } from '../src/services/trade.js';
import {
  coatRarityScore,
  computeUploadReward,
  uploadHorse,
  uploadQuote,
} from '../src/services/upload.js';
import { creditCubes, spendCubes } from '../src/services/wallet.js';
import { gameDay } from '../src/util/clock.js';
import { mulberry32 } from '../src/util/rng.js';
import { check, cookieOf, eq, section, summarize } from './harness.js';

async function main(): Promise<void> {
  // Default: in-memory PGlite. With DATABASE_URL=postgres://… (the CI postgres job), the SAME
  // suite runs against real PostgreSQL — the node-postgres path PGlite can't exercise. The
  // suite registers fixed usernames, so it expects a FRESH database each run.
  const driverDb = process.env.DATABASE_URL?.startsWith('postgres') ? createDb() : createPgliteDb();
  await runMigrations(driverDb); // needs the concrete driver union (instanceof narrowing)
  const db: DB = driverDb; // …the suite uses the driver-agnostic base (clean builder overloads)
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
  section('register: creates User + 1:1 Herd, issues a session');
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
  section('cold-start grant (§6, §14): a fresh account is immediately playable');
  const startHerd = reg.json<{ herd: { id: string; cubes: number } }>().herd;
  eq('new herd starts with the Cubes purse', startHerd.cubes, STARTING_CUBES);
  const starters = (
    await inject({
      method: 'GET',
      url: `/herds/${startHerd.id}/horses`,
      headers: { cookie: cookieOf(reg) }, // rosters require a session (§11 hardening)
    })
  ).json<{ id: string; lifeStage: string }[]>();
  eq('new herd is granted two starter horses', starters.length, 2);
  eq('both starters are adults', starters.filter((h) => h.lifeStage === 'adult').length, 2);
  const [s0, s1] = starters;
  eq(
    'the two starters are unrelated (can breed immediately)',
    s0 && s1 ? await shareLineage(db, s0.id, s1.id) : true,
    false,
  );

  // The §7 herd-size cap is exercised on FRESH herds below; the long-running `plum` playground herd
  // accumulates far past the tier-1 roster cap across the suite, so run it at the top tier (cap 30)
  // to keep the breeding/recruit/wild tests — which aren't about the cap — unblocked.
  await db.update(herds).set({ level: 5 }).where(drizzleEq(herds.id, startHerd.id));

  // --- duplicate + weak input ---
  section('duplicate + weak input');
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
  section('login + /me');
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
  section('mint + load + render spec (derived, cached, deterministic)');
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
  section('lineage closure (§5.4a), transitive');
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
  section('Phase 4: breeding');
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
  section('Phase 5: exploration & quests');
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

  // The daily gather is capped at once per (adult) horse per day (§7): ONE action sends the whole
  // stable foraging and completes 'first-steps', then it's done until tomorrow.
  const gather1 = await inject({
    method: 'POST',
    url: '/regions/green-grass/roam',
    headers: { cookie },
  });
  eq('daily gather → 200', gather1.statusCode, 200);
  const g1 = gather1.json<{
    found: unknown[];
    horsesGathered: number;
    herdSize: number;
    questCompletions: { questId: string }[];
  }>();
  check('the gather found materials', g1.found.length > 0);
  check(
    'every adult foraged (horsesGathered === herdSize ≥ 1)',
    g1.horsesGathered === g1.herdSize && g1.horsesGathered >= 1,
  );
  check(
    'one daily gather completes "First Steps"',
    g1.questCompletions.some((c) => c.questId === 'first-steps'),
  );
  // a second gather the same day is capped → 409, no second haul
  const gather2 = await inject({
    method: 'POST',
    url: '/regions/green-grass/roam',
    headers: { cookie },
  });
  eq('a second gather the same day → 409 (capped)', gather2.statusCode, 409);

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
  // Dusty Dunes is unlocked now — gathering there is no longer 403-locked, just already-foraged-today
  // (409), since the herd already gathered in Green Grass this day. Proves the unlock + the cap.
  const duneRoam = await inject({
    method: 'POST',
    url: '/regions/dusty-dunes/roam',
    headers: { cookie },
  });
  eq(
    'Dusty Dunes unlocked (no longer 403) but the herd already foraged today → 409',
    duneRoam.statusCode,
    409,
  );

  // --- per-horse daily gather cap (§7): controlled-clock service tests ---
  section('per-horse daily gather cap (§7): controlled-clock service tests');
  eq('the gather cap is once per horse per day', GATHER_PER_HORSE_PER_DAY, 1);
  {
    const forager = await inject({
      method: 'POST',
      url: '/auth/register',
      payload: { username: 'forager', password: 'forage1horse' },
    });
    const fHerd = forager.json<{ herd: { id: string } }>().herd.id;
    const G0 = Date.UTC(2026, 5, 1, 18);
    const G1 = G0 + 86_400_000;
    const G2 = G0 + 2 * 86_400_000;

    const day0 = await roam(db, fHerd, 'green-grass', G0, 1);
    check(
      'day 0: the 2-adult stable forages (2 horses, real haul)',
      day0.ok && day0.horsesGathered === 2 && day0.herdSize === 2 && day0.found.length > 0,
    );
    const day0Qty = day0.ok ? day0.found.reduce((s, f) => s + f.qty, 0) : 0;

    const day0again = await roam(db, fHerd, 'green-grass', G0, 1);
    check(
      'same day again → already_gathered (each horse is capped to one gather)',
      !day0again.ok && day0again.code === 'already_gathered',
    );

    const day1 = await roam(db, fHerd, 'green-grass', G1, 1);
    check(
      'next day → the cap resets and the stable forages again',
      day1.ok && day1.horsesGathered === 2,
    );

    // a bigger stable gathers more: add 2 adults → 4 forage, strictly more drops (same seed)
    await mintHorse(db, {
      herdId: fHerd,
      genotype: { E: 'Ee', A: 'Aa' } as Genotype,
      origin: 'wild',
      lifeStage: 'adult',
    });
    await mintHorse(db, {
      herdId: fHerd,
      genotype: { E: 'Ee', A: 'Aa' } as Genotype,
      origin: 'wild',
      lifeStage: 'adult',
    });
    const day2 = await roam(db, fHerd, 'green-grass', G2, 1);
    const day2Qty = day2.ok ? day2.found.reduce((s, f) => s + f.qty, 0) : 0;
    check(
      'a bigger stable forages with every horse (4 of 4)',
      day2.ok && day2.horsesGathered === 4,
    );
    check(
      'a bigger stable gathers strictly more (4 horses > 2 horses, same seed)',
      day2Qty > day0Qty,
    );

    // a herd with no adult horses → no_horses
    const empty = await inject({
      method: 'POST',
      url: '/auth/register',
      payload: { username: 'emptyfold', password: 'emptyhorse1' },
    });
    const eHerd = empty.json<{ herd: { id: string } }>().herd.id;
    await db.update(horses).set({ herdId: null }).where(drizzleEq(horses.herdId, eHerd));
    const noHorses = await roam(db, eHerd, 'green-grass', G0, 1);
    check('a herd with no adults → no_horses', !noHorses.ok && noHorses.code === 'no_horses');
  }

  // --- Phase 6: aging, care & daily rhythm ---
  section('Phase 6: aging, care & daily rhythm');
  const DAY_MS = 86_400_000;
  const baseNow = Date.now();

  // login-catchup: a fresh herd, 3 days later → exactly 3 daily stipends (deterministic)
  const reg2 = await inject({
    method: 'POST',
    url: '/auth/register',
    payload: { username: 'pepper', password: 'hunter2horse' },
  });
  const herd2Id = reg2.json<{ herd: { id: string } }>().herd.id;
  // Pin the cursor to the SAME clock sample the advance uses — register's own Date.now()
  // could land across a midnight-EST rollover and make "exactly 3" read 2 (audit P2 flake).
  await db
    .update(herds)
    .set({ lastSimTick: gameDay(baseNow) })
    .where(drizzleEq(herds.id, herd2Id));
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
  check(
    'foal matured on check-in',
    matured.matured.some((m) => m.id === foal.id),
  );
  check(
    'the reveal names the coat (the Morning Post headline)',
    (matured.matured.find((m) => m.id === foal.id)?.coat ?? '').length > 0,
  );
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

  // POST /daily on the real clock (already caught up → no-op, 200)
  const daily = await inject({ method: 'POST', url: '/daily', headers: { cookie } });
  eq('POST /daily → 200', daily.statusCode, 200);

  // --- Phase 7: Pasture, gathering & crafting ---
  section('Phase 7: Pasture, gathering & crafting');
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

  // Pasture structure-slot gating is a level-1 capacity (4 slots) — drop `plum` to tier 1 for this
  // block (it's at the top tier elsewhere so its big roster isn't herd-capped), then restore.
  await db.update(herds).set({ level: 1 }).where(drizzleEq(herds.id, herdId));
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
  await db.update(herds).set({ level: 5 }).where(drizzleEq(herds.id, herdId)); // restore top tier
  check(
    'Library is placed',
    pasture.structures.some((s) => s.type === 'library'),
  );

  // --- Phase 8a: stats, dice & jobs ---
  section('Phase 8a: stats, dice & jobs');
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
  section('Phase 8b: adventures & the Tavern');
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
  section('Phase 8c: interactive "story" adventures (§9.3)');
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
    'Dusty Dunes is interactive now (it has its own expeditions)',
    regionsView.find((r) => r.id === 'dusty-dunes')?.interactive === true,
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
    payload: { regionId: 'no-such-region', party: [id] },
  });
  eq('start in a region with no scripts → 404', noScript.statusCode, 404);

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

  // §2 pool mechanic: a region holds a pool of RANDOM scripts; startRun draws one (seeded). Keeper
  // bosses are EXCLUDED from this pool — they're a separate, earned challenge (verified below).
  check(
    'green-grass holds a pool of random expeditions',
    (ADVENTURE_POOLS.get('green-grass')?.length ?? 0) >= 3,
  );
  check(
    'Dusty Dunes and Weird Woods now have interactive expeditions too (not only Green Grass)',
    (ADVENTURE_POOLS.get('dusty-dunes')?.length ?? 0) >= 1 &&
      (ADVENTURE_POOLS.get('weird-woods')?.length ?? 0) >= 1,
  );
  // Content integrity (§9.3/§9.4): every script is well-formed, reachable, and references real enemies.
  let badStart = 0;
  let danglingNext = 0;
  let badBattle = 0;
  let battleRefs = 0;
  let orphanScenes = 0;
  for (const sc of ADVENTURE_SCRIPTS) {
    if (!sc.scenes[sc.start]) badStart += 1;
    const seen = new Set<string>([sc.start]);
    const queue: string[] = [sc.start];
    while (queue.length > 0) {
      const sceneId = queue.shift()!;
      const scene = sc.scenes[sceneId];
      if (!scene) continue;
      for (const ch of scene.choices) {
        for (const out of [ch.success, ch.failure]) {
          if (!out) continue;
          if (out.battle) {
            battleRefs += 1;
            if (!ENEMY_BY_ID.has(out.battle)) badBattle += 1;
          }
          if (out.next !== 'end' && !sc.scenes[out.next]) danglingNext += 1;
          if (out.next !== 'end' && !seen.has(out.next)) {
            seen.add(out.next);
            queue.push(out.next);
          }
        }
      }
    }
    for (const sceneId of Object.keys(sc.scenes)) if (!seen.has(sceneId)) orphanScenes += 1;
  }
  check('every script’s start scene exists', badStart === 0);
  check('every choice’s next resolves to a scene or "end" (no dangling refs)', danglingNext === 0);
  check('no orphan scenes — every scene is reachable from its start', orphanScenes === 0);
  check('every battle ref (boss or skirmish) resolves to a real enemy', badBattle === 0);
  check('combat is woven across the pool (≥6 battle refs: bosses + skirmishes)', battleRefs >= 6);
  check(
    'all three regions have a reachable expedition pool',
    ['green-grass', 'dusty-dunes', 'weird-woods'].every(
      (r) => (ADVENTURE_POOLS.get(r)?.length ?? 0) >= 1,
    ),
  );

  // ── Expedition selection + the deliberate Keeper challenge (§7/§9.4c) ────────────────────────────
  section('Expedition selection + the deliberate Keeper challenge (§7/§9.4c)');
  // Regular expeditions are randomized (region-pick only); each region boss is a separate, EARNED
  // Keeper challenge — out of the random pool. Confirm every progression boss stays reachable, and a
  // random draw never hands one back.
  {
    check(
      'the random pool excludes every Keeper boss (no boss in the surprise draw)',
      [...ADVENTURE_POOLS.values()].every((pool) => pool.every((s) => !s.keeper)),
    );
    check(
      'every progression boss is reachable as its region’s Keeper',
      REGION_KEEPER.get('green-grass')?.id === 'hollow-keeper' &&
        REGION_KEEPER.get('dusty-dunes')?.id === 'sandstone-sentinel' &&
        REGION_KEEPER.get('weird-woods')?.id === 'mistwood-mimic',
    );
    const keeperFights = (scriptId: string, enemy: string): boolean => {
      const sc = ADVENTURE_BY_ID.get(scriptId);
      return (
        !!sc &&
        Object.values(sc.scenes).some((sn) =>
          sn.choices.some((ch) => [ch.success, ch.failure].some((o) => o?.battle === enemy)),
        )
      );
    };
    check(
      'each Keeper’s deepest path hands off to its boss battle',
      keeperFights('hollow-keeper', 'gg-hollow-keeper') &&
        keeperFights('sandstone-sentinel', 'dd-sandstone-sentinel') &&
        keeperFights('mistwood-mimic', 'ww-mistwood-mimic'),
    );

    // Across many seeded random draws, the keeper expedition's start scene never appears.
    const ggDraws = new Set<string>();
    for (let s = 1; s <= 24; s++) {
      const r = await startRun(db, herdId, 'green-grass', [id], { seed: s });
      if (r.ok) ggDraws.add(r.scene.id);
    }
    check('random GG draws never surface the keeper expedition', !ggDraws.has('keeper-threshold'));

    // EARNED: a fresh herd must complete KEEPER_UNLOCK_EXPEDITIONS expeditions before it can challenge.
    const kHerd = (
      await inject({
        method: 'POST',
        url: '/auth/register',
        payload: { username: 'keeperherd', password: 'keeperhorse1' },
      })
    ).json<{ herd: { id: string } }>().herd.id;
    const kAdult = await mintHorse(db, {
      herdId: kHerd,
      genotype: { E: 'Ee' } as Genotype,
      origin: 'wild',
      lifeStage: 'adult',
    });
    const before = await keeperChallenge(db, kHerd, 'green-grass');
    check(
      'a fresh herd has not earned the GG keeper yet',
      before.keeper?.id === 'hollow-keeper' &&
        !before.available &&
        before.completed === 0 &&
        before.needed === KEEPER_UNLOCK_EXPEDITIONS,
    );
    const tooEarly = await startRun(db, kHerd, 'green-grass', [kAdult.id], {
      scriptId: 'hollow-keeper',
    });
    check(
      'challenging the keeper before it is earned is refused',
      !tooEarly.ok && tooEarly.code === 'keeper_locked',
    );
    for (let i = 0; i < KEEPER_UNLOCK_EXPEDITIONS; i++) {
      await db.insert(adventureRuns).values({
        herdId: kHerd,
        regionId: 'green-grass',
        scriptId: 'windfall',
        party: [kAdult.id],
        seed: i,
        sceneId: 'windfall-slope',
        status: 'ended',
      });
    }
    const earned = await keeperChallenge(db, kHerd, 'green-grass');
    check(
      'after enough expeditions, the keeper challenge is earned',
      earned.available && earned.completed >= KEEPER_UNLOCK_EXPEDITIONS,
    );
    const challenge = await startRun(db, kHerd, 'green-grass', [kAdult.id], {
      scriptId: 'hollow-keeper',
    });
    check('an earned herd can deliberately challenge the keeper', challenge.ok);

    // Structural length variety in the GG pool: a short errand (≤2 scenes) AND a long journey (≥8).
    const sceneCounts = (ADVENTURE_POOLS.get('green-grass') ?? []).map(
      (s) => Object.keys(s.scenes).length,
    );
    check(
      'GG expeditions vary in length (a short errand and a long journey both exist)',
      Math.min(...sceneCounts) <= 2 && Math.max(...sceneCounts) >= 8,
    );
    // Dusty Dunes diversified to match: a short errand + a rescue, on top of the existing pool.
    const ddPool = ADVENTURE_POOLS.get('dusty-dunes') ?? [];
    check(
      'Dusty Dunes spans varied shapes (short errand + rescue + the rest)',
      ddPool.length >= 4 &&
        ddPool.some((s) => s.id === 'salt-pan') &&
        ddPool.some((s) => s.id === 'lost-caravan') &&
        Math.min(...ddPool.map((s) => Object.keys(s.scenes).length)) <= 2,
    );
    // Weird Woods too: a short errand + an uncanny mystery on top of the luminous + riddle ones.
    const wwPool = ADVENTURE_POOLS.get('weird-woods') ?? [];
    check(
      'Weird Woods spans varied shapes (short errand + uncanny mystery + the rest)',
      wwPool.length >= 4 &&
        wwPool.some((s) => s.id === 'witch-hazel') &&
        wwPool.some((s) => s.id === 'long-way-round') &&
        Math.min(...wwPool.map((s) => Object.keys(s.scenes).length)) <= 2,
    );
  }

  // --- "The Lost Lamb" (§9.3): deep branching + cross-scene consequence, on the scene-tree engine ---
  section('"The Lost Lamb" (§9.3): deep branching + cross-scene consequence, on t');
  {
    const lamb = ADVENTURE_BY_ID.get('lost-lamb');
    check('lost-lamb script exists in the Green Grass pool', !!lamb);
    if (lamb) {
      // BFS the branch graph from the start scene → which scenes are actually reachable.
      const reached = new Set<string>([lamb.start]);
      const queue: string[] = [lamb.start];
      while (queue.length > 0) {
        const scene = lamb.scenes[queue.shift()!];
        if (!scene) continue;
        for (const ch of scene.choices) {
          for (const out of [ch.success, ch.failure]) {
            if (out && out.next !== 'end' && !reached.has(out.next)) {
              reached.add(out.next);
              queue.push(out.next);
            }
          }
        }
      }
      // (a) the opening fork reaches THREE genuinely different middles — none funnel away.
      check(
        'lost-lamb: the Creek route is reachable (both calm + tense arrivals)',
        reached.has('creek-calm') && reached.has('creek-tense'),
      );
      check(
        'lost-lamb: the Bramble-Hollow route is reachable (both normal + winded)',
        reached.has('hollow') && reached.has('hollow-winded'),
      );
      check('lost-lamb: the SECRET Fence-Line route is reachable', reached.has('fence'));
      check(
        'lost-lamb: every scene is reachable from the start (no orphans)',
        Object.keys(lamb.scenes).every((s) => reached.has(s)),
      );
      check(
        'lost-lamb: every choice next resolves to a scene or "end"',
        Object.values(lamb.scenes).every((sc) =>
          sc.choices.every((ch) =>
            [ch.success, ch.failure].every(
              (out) => !out || out.next === 'end' || !!lamb.scenes[out.next],
            ),
          ),
        ),
      );

      // (b) the Fence-Line is the Openness-gated replay hook; the creek/hollow openers are ungated.
      const start = lamb.scenes[lamb.start]!;
      const pip = start.choices.find((c) => c.success.next === 'fence');
      check(
        'lost-lamb: the Fence-Line is gated on Openness ≥ 60 (the replay hook)',
        pip?.requires?.trait === 'o' && (pip?.requires?.min ?? 0) >= 60,
      );
      check(
        'lost-lamb: the Creek + Hollow openers are ungated (everyone sees them)',
        start.choices.some((c) => c.success.next === 'creek-calm' && !c.requires) &&
          start.choices.some((c) => c.success.next === 'hollow' && !c.requires),
      );

      // (c) the echoes: an early outcome makes a LATER check harder.
      const dcOf = (sceneId: string, choiceId: string): number =>
        lamb.scenes[sceneId]!.choices.find((c) => c.id === choiceId)!.check!.dc;
      check(
        'lost-lamb: tense-arrival makes the later Befriend check harder (calm/tense echo)',
        dcOf('creek-tense', 'coax-cross') > dcOf('creek-calm', 'coax-cross'),
      );
      check(
        'lost-lamb: a Winded horse rolls the Hollow checks harder (winded echo)',
        dcOf('hollow-winded', 'cut-path') > dcOf('hollow', 'cut-path') &&
          dcOf('hollow-winded', 'find-gap') > dcOf('hollow', 'find-gap'),
      );

      // (d) the clever bramble path carries the marsh-sage bonus home (loot is the carried state).
      const findGap = lamb.scenes['hollow']!.choices.find((c) => c.id === 'find-gap')!;
      check(
        'lost-lamb: the clever bramble path finds marsh-sage (cross-scene reward)',
        (findGap.success.items ?? []).some((i) => i.id === 'marsh-sage'),
      );

      // (e) the ending FLAGS produce the right reward variations.
      const cubesOf = (sceneId: string): number =>
        lamb.scenes[sceneId]!.choices[0]!.success.cubes ?? 0;
      check(
        'lost-lamb: the full-flock ending pays the most (best route C reward)',
        cubesOf('finale-flock') > cubesOf('finale-bonded'),
      );
      check(
        'lost-lamb: befriending the lamb pays more than a plain rescue',
        cubesOf('finale-bonded') > cubesOf('finale-clean'),
      );
      check(
        'lost-lamb: the soggy ending still pays the FULL lamb reward (the penalty is flavor only)',
        cubesOf('finale-soggy') === cubesOf('finale-clean'),
      );
      check(
        'lost-lamb: banking with no lamb pays the least (the cozy out)',
        cubesOf('finale-bank') < cubesOf('finale-clean'),
      );
    }
  }
  const pickA = await startRun(db, herdId, 'green-grass', [id], { seed: 777 });
  const pickB = await startRun(db, herdId, 'green-grass', [id], { seed: 777 });
  check(
    'a fixed seed draws the same script every time',
    pickA.ok && pickB.ok && pickA.scene.id === pickB.scene.id,
  );
  // Structural, not content-coupled (audit P2): derive the expected start scenes from the
  // pool itself, so adding/reordering scripts can't silently break this check.
  const poolStarts = new Set((ADVENTURE_POOLS.get('green-grass') ?? []).map((s) => s.start));
  const startsSeen = new Set<string>();
  for (let s = 1; s <= 40 && startsSeen.size < poolStarts.size; s++) {
    const r = await startRun(db, herdId, 'green-grass', [id], { seed: s });
    if (r.ok) startsSeen.add(r.scene.id);
  }
  check(
    `every pooled script is reachable across seeds (saw ${startsSeen.size}/${poolStarts.size})`,
    poolStarts.size >= 2 && [...poolStarts].every((sc) => startsSeen.has(sc)),
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
  section('Uploading to The Cloud (§14.3a): reward scaling, guards, FK-clean dele');
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
  section('Adventures train horses (§9.3): per-check skill XP + the cosmetic "Sea');
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

  // --- Phase 8d: turn-based combat (§9.4) — the minimum playable battle ---
  section('Phase 8d: turn-based combat (§9.4) — the minimum playable battle');
  const POTION = 'healing-potion';
  const herdCubes = async (): Promise<number> =>
    (await inject({ method: 'GET', url: '/me', headers: { cookie } })).json<{
      herd: { cubes: number };
    }>().herd.cubes;
  const combatHorse = async (over: {
    str?: number;
    dex?: number;
    con?: number;
    int?: number;
    luck?: number;
    a?: number; // Agreeableness (Benevolence) — drives Soothe
    cls?: HorseClass; // combat class
    name?: string;
  }): Promise<string> => {
    const h = await mintHorse(db, {
      herdId,
      genotype: { E: 'Ee', A: 'Aa' },
      origin: 'wild',
      lifeStage: 'adult',
      name: over.name ?? null,
      stats: {
        str: over.str ?? 10,
        dex: over.dex ?? 10,
        con: over.con ?? 10,
        int: over.int ?? 10,
        wis: 10,
        cha: 10,
      },
      luck: over.luck ?? 10,
      personality: over.a !== undefined ? { o: 50, c: 50, e: 50, a: over.a, n: 50 } : undefined,
    });
    if (over.cls)
      await db.update(horses).set({ class: over.cls }).where(drizzleEq(horses.id, h.id));
    return h.id;
  };
  // Drive an active battle to a terminal state (default strategy: bash the first standing foe).
  const driveBattle = async (
    battleId: string,
    pick: (v: BattleView) => BattleAction = (v) => ({
      type: 'attack',
      targetId: v.combatants.find((c) => c.side === 'foe' && !c.ko)?.id ?? '',
    }),
  ): Promise<BattleView> => {
    let view = (await getBattleView(db, herdId, battleId)) as BattleView;
    for (let i = 0; i < 80 && view.status === 'active' && view.isPartyTurn; i++) {
      const res = await actInBattle(db, herdId, battleId, pick(view));
      if (!res.ok) break;
      view = res.view;
    }
    return view;
  };

  // 1) A strong party bashes a weak foe → a win that banks the reward.
  const cubesB1 = await herdCubes();
  const brute = await combatHorse({ str: 20, con: 20, dex: 16, name: 'Brute' });
  const startWin = await startBattle(db, herdId, ['thistle-whirl'], [brute], { seed: 7 });
  check(
    'a battle starts active with two-sided HP',
    startWin.ok &&
      startWin.view.combatants.length === 2 &&
      startWin.view.combatants.every((c) => c.hp > 0 && c.maxHp > 0),
  );
  const won = startWin.ok ? await driveBattle(startWin.battleId) : null;
  check('a strong party defeats a weak foe (a win)', !!won && won.status === 'won');
  eq(
    'a won battle banks the foe reward',
    (await herdCubes()) - cubesB1,
    ENEMY_BY_ID.get('thistle-whirl')?.reward.cubes ?? 0,
  );
  if (won) {
    check(
      "the foe was KO'd (HP 0), and the party came through fine — never a death",
      won.combatants.some((c) => c.side === 'foe' && c.ko && c.hp === 0) &&
        won.combatants.some((c) => c.side === 'party' && !c.ko),
    );
  }

  // 2) A weak lone horse vs a sturdy foe → full-party KO → a cozy RETREAT with reduced reward.
  const cubesB2 = await herdCubes();
  const wimp = await combatHorse({ str: 4, con: 3, dex: 5, luck: 4, name: 'Wimp' });
  const startR = await startBattle(db, herdId, ['bramble-tangle'], [wimp], { seed: 5 });
  const retreated = startR.ok ? await driveBattle(startR.battleId) : null;
  check(
    'a full-party KO ends in a cozy retreat (never a loss)',
    !!retreated && retreated.status === 'retreated',
  );
  const brambleCubes = ENEMY_BY_ID.get('bramble-tangle')?.reward.cubes ?? 0;
  const retreatGain = (await herdCubes()) - cubesB2;
  check(
    'a retreat banks a REDUCED reward (less than a win)',
    retreatGain === Math.floor(brambleCubes * REWARD_RETREAT_FRACTION) &&
      retreatGain < brambleCubes,
  );

  // 3) Turn order is by speed: a faster foe opens before the party's first move.
  const slowpoke = await combatHorse({ dex: 4, con: 16, name: 'Slowpoke' });
  const startTO = await startBattle(db, herdId, ['thistle-whirl'], [slowpoke], { seed: 11 });
  const slowView = startTO.ok ? startTO.view.combatants.find((c) => c.id === slowpoke) : undefined;
  check(
    'turn order by DEX — a faster foe acts first',
    startTO.ok &&
      startTO.view.isPartyTurn &&
      startTO.view.log.some((e) => e.kind === 'enemy') &&
      !!slowView &&
      slowView.hp < slowView.maxHp,
  );

  // 4) The Healing Potion finally does something. Take hits until clearly wounded (so the +30 isn't
  //    clipped at max), then heal and confirm the net gain even after the foe's counter that turn.
  await grantItems(db, herdId, [{ id: POTION, qty: 1 }]);
  const medic = await combatHorse({ str: 8, con: 12, dex: 10, name: 'Medic' });
  const startHeal = await startBattle(db, herdId, ['bramble-tangle'], [medic], { seed: 13 });
  if (startHeal.ok) {
    const foeId = startHeal.view.combatants.find((c) => c.side === 'foe')?.id ?? '';
    let v: BattleView = startHeal.view;
    for (let i = 0; i < 20 && v.status === 'active' && v.isPartyTurn; i++) {
      const m = v.combatants.find((c) => c.id === medic) as BattleView['combatants'][number];
      if (m.ko || m.hp <= m.maxHp - POTION_HEAL_HP) break;
      const r = await actInBattle(db, herdId, startHeal.battleId, {
        type: 'attack',
        targetId: foeId,
      });
      if (!r.ok) break;
      v = r.view;
    }
    const before = v.combatants.find((c) => c.id === medic) as BattleView['combatants'][number];
    const canHeal =
      v.status === 'active' &&
      v.isPartyTurn &&
      !before.ko &&
      before.hp <= before.maxHp - POTION_HEAL_HP;
    const healed = canHeal
      ? await actInBattle(db, herdId, startHeal.battleId, {
          type: 'item',
          itemId: POTION,
          targetId: medic,
        })
      : null;
    const after =
      healed && healed.ok
        ? (healed.view.combatants.find((c) => c.id === medic) as BattleView['combatants'][number])
        : null;
    check(
      'the Healing Potion mends a hurt horse and is consumed',
      !!healed &&
        healed.ok &&
        !!after &&
        after.hp > before.hp &&
        healed.view.potions === v.potions - 1 &&
        healed.view.log.some((e) => e.kind === 'item'),
    );
  }

  // 4) Item with an empty stash is refused (no potion → no effect). Zero the stash first.
  const onHand = await itemQty(db, herdId, POTION);
  if (onHand > 0) await consumeItems(db, herdId, [{ id: POTION, qty: onHand }]);
  const broke = await combatHorse({ dex: 20, name: 'Broke' }); // fast → acts first
  const startNoPot = await startBattle(db, herdId, ['bramble-tangle'], [broke], { seed: 9 });
  if (startNoPot.ok && startNoPot.view.isPartyTurn) {
    const r = await actInBattle(db, herdId, startNoPot.battleId, {
      type: 'item',
      itemId: POTION,
      targetId: broke,
    });
    check('Item with no Healing Potion is refused', !r.ok && r.code === 'no_potion');
  }

  // 5) Flee ends the battle cozily — no reward, no penalty.
  const runner = await combatHorse({ con: 20, dex: 20, luck: 20, name: 'Runner' });
  const startFlee = await startBattle(db, herdId, ['bramble-tangle'], [runner], { seed: 2 });
  let fled = startFlee.ok ? startFlee.view : null;
  if (startFlee.ok) {
    for (let i = 0; i < 8 && fled && fled.status === 'active'; i++) {
      const r = await actInBattle(db, herdId, startFlee.battleId, { type: 'flee' });
      fled = r.ok ? r.view : fled;
    }
  }
  check(
    'a horse can Flee a battle cozily (ends, no reward)',
    !!fled && fled.status === 'fled' && fled.reward === null,
  );

  // 6) Determinism: same seed + same actions → identical battle (seeded, replayable).
  const repA = await startBattle(db, herdId, ['thistle-whirl', 'thistle-whirl'], [brute], {
    seed: 42,
  });
  const repB = await startBattle(db, herdId, ['thistle-whirl', 'thistle-whirl'], [brute], {
    seed: 42,
  });
  if (repA.ok && repB.ok) {
    const a = await driveBattle(repA.battleId);
    const b = await driveBattle(repB.battleId);
    eq('same seed + same actions → same outcome (deterministic)', a.status, b.status);
    check(
      '…and identical combatant HP/KO',
      JSON.stringify(a.combatants.map((c) => [c.id, c.hp, c.ko])) ===
        JSON.stringify(b.combatants.map((c) => [c.id, c.hp, c.ko])),
    );
  }

  // approach ↔ weakness (§9.4a): the tactical heart. Pure scaling + Soothe-off-kindness.
  eq(
    'an approach the foe is weak to scales damage up',
    approachMultiplier('soothe', 'confront', 'soothe'),
    COMBAT_WEAKNESS_MULT,
  );
  eq(
    'an approach the foe resists scales damage down',
    approachMultiplier('soothe', 'confront', 'confront'),
    COMBAT_RESIST_MULT,
  );
  eq('a neutral approach is unscaled', approachMultiplier('soothe', 'confront', 'outwit'), 1);
  check(
    'Soothe works off the kindness stat (a kinder horse soothes harder, clamped to the stat scale)',
    kindnessStat(90) > kindnessStat(40) && kindnessStat(50) === 10 && kindnessStat(100) <= STAT_MAX,
  );

  // One controlled strike, returning the damage dealt to the (lone) foe.
  const oneStrike = async (
    approach: 'confront' | 'outwit' | 'skirmish' | 'soothe',
    seed: number,
    horseId: string,
  ): Promise<number> => {
    const s = await startBattle(db, herdId, ['snappish-gander'], [horseId], { seed });
    if (!s.ok) return -1;
    const r = await actInBattle(db, herdId, s.battleId, {
      type: 'attack',
      targetId: 'foe0',
      approach,
    });
    if (!r.ok) return -1;
    const g = r.view.combatants.find((c) => c.side === 'foe') as BattleView['combatants'][number];
    return g.maxHp - g.hp;
  };

  // Same kind horse, same foe, same seed — Soothe (the gander's weakness) vs a neutral Skirmish differ
  // ONLY by the weakness multiplier (DEX 16 == the kindness from A 80, so the base roll is identical).
  const gentle = await combatHorse({ dex: 16, a: 80, name: 'Gentle' });
  const sootheDmg = await oneStrike('soothe', 77, gentle);
  const neutralDmg = await oneStrike('skirmish', 77, gentle);
  check(
    'Soothe on a Soothe-weak foe deals the weakness multiplier over a neutral approach',
    sootheDmg === Math.round(neutralDmg * COMBAT_WEAKNESS_MULT) && sootheDmg > neutralDmg,
  );

  // The headline: a Benevolent horse (kindness 18) Soothing a Soothe-weak / Confront-resistant foe
  // out-damages a bruiser (STR 18) Confronting it — reading the tell + the right horse wins.
  const benevolent = await combatHorse({ con: 12, a: 90, dex: 14, luck: 16, name: 'Benevolent' });
  const bruiser = await combatHorse({
    str: 18,
    con: 12,
    a: 30,
    dex: 14,
    luck: 16,
    name: 'Bruiser',
  });
  const benevSoothe = await oneStrike('soothe', 31, benevolent);
  const bruiserConfront = await oneStrike('confront', 31, bruiser);
  check(
    'a Benevolent horse out-soothes a bruiser who confronts a Soothe-weak, Confront-resistant foe',
    benevSoothe > bruiserConfront,
  );

  // classes (§9.4b): an identity + ability layer over the approaches. class→approach mapping…
  eq('Knight → Confront', CLASS_APPROACH.knight, 'confront');
  eq('Wizard → Outwit', CLASS_APPROACH.wizard, 'outwit');
  eq('Rogue → Skirmish (Dexterity)', CLASS_APPROACH.rogue, 'skirmish');
  eq('Cleric → Soothe (kindness)', CLASS_APPROACH.cleric, 'soothe');

  // A classed horse's strike — the engine fixes the approach from its class (no approach arg).
  const classStrike = async (horseId: string, foe: string, seed: number): Promise<number> => {
    const s = await startBattle(db, herdId, [foe], [horseId], { seed });
    if (!s.ok) return -1;
    const r = await actInBattle(db, herdId, s.battleId, { type: 'attack', targetId: 'foe0' });
    if (!r.ok) return -1;
    const g = r.view.combatants.find((c) => c.side === 'foe') as BattleView['combatants'][number];
    return g.maxHp - g.hp;
  };

  // Stat-scaling per class: a strong-STR Knight out-cleaves a weak-STR one (same seed, neutral foe).
  const strongKnight = await combatHorse({
    str: 18,
    dex: 16,
    luck: 16,
    cls: 'knight',
    name: 'Sir Strong',
  });
  const weakKnight = await combatHorse({
    str: 8,
    dex: 16,
    luck: 16,
    cls: 'knight',
    name: 'Sir Weak',
  });
  check(
    "a class scales with the horse's stat — a strong Knight out-cleaves a weak one",
    (await classStrike(strongKnight, 'thistle-whirl', 55)) >
      (await classStrike(weakKnight, 'thistle-whirl', 55)),
  );

  // Class-vs-weakness headline: a Cleric out-fights a Knight against a Soothe-weak / Confront-resistant
  // foe (the Cleric's Soothe ×1.5 vs the Knight's resisted Confront ×0.5) — matching class to foe wins.
  const clericH = await combatHorse({
    a: 90,
    dex: 14,
    luck: 16,
    cls: 'cleric',
    name: 'Sister Kind',
  });
  const knightH = await combatHorse({
    str: 18,
    dex: 14,
    luck: 16,
    cls: 'knight',
    name: 'Sir Bruiser',
  });
  check(
    'a Cleric out-fights a Knight against a Soothe-weak, Confront-resistant foe',
    (await classStrike(clericH, 'snappish-gander', 31)) >
      (await classStrike(knightH, 'snappish-gander', 31)),
  );

  // The Mend ability is the Cleric's alone — a Knight cannot cast it.
  const noMend = await combatHorse({ str: 18, dex: 16, cls: 'knight', name: 'Sir Nomend' });
  const nmStart = await startBattle(db, herdId, ['bramble-tangle'], [noMend], { seed: 4 });
  if (nmStart.ok && nmStart.view.isPartyTurn) {
    const r = await actInBattle(db, herdId, nmStart.battleId, { type: 'mend', targetId: noMend });
    check("only a Cleric can Mend (a Knight can't)", !r.ok && r.code === 'bad_action');
  }

  // …and a Cleric's Mend actually heals a wounded ally (kindness-scaled). Take hits until clearly
  // wounded (so +Mend isn't clipped), then Mend self and confirm the net gain.
  const healer = await combatHorse({ a: 90, con: 12, dex: 6, cls: 'cleric', name: 'Healer' });
  const mendStart = await startBattle(db, herdId, ['bramble-tangle'], [healer], { seed: 6 });
  if (mendStart.ok) {
    const me = (vw: BattleView): BattleView['combatants'][number] =>
      vw.combatants.find((c) => c.id === healer) as BattleView['combatants'][number];
    const mendHeal = 14 + kindnessStat(90); // CLERIC_MEND_BASE + kindness
    let v: BattleView = mendStart.view;
    for (let i = 0; i < 20 && v.status === 'active' && v.isPartyTurn; i++) {
      const h = me(v);
      if (h.ko || h.hp <= h.maxHp - mendHeal) break;
      const r = await actInBattle(db, herdId, mendStart.battleId, {
        type: 'attack',
        targetId: 'foe0',
      });
      if (!r.ok) break;
      v = r.view;
    }
    const before = me(v);
    const canMend =
      v.status === 'active' && v.isPartyTurn && !before.ko && before.hp <= before.maxHp - mendHeal;
    const r = canMend
      ? await actInBattle(db, herdId, mendStart.battleId, { type: 'mend', targetId: healer })
      : null;
    const after = r && r.ok ? me(r.view) : null;
    check(
      "a Cleric's Mend heals a wounded ally (kindness-scaled)",
      !!r && r.ok && !!after && after.hp > before.hp,
    );
  }

  // boss handoff (§9.4c): a deep Green Grass adventure culminates in a boss battle ----------------
  const cubesPreBoss = await herdCubes();
  const bossParty = [
    await combatHorse({ a: 95, con: 16, dex: 16, luck: 16, cls: 'cleric', name: 'Boss Cleric A' }),
    await combatHorse({ a: 95, con: 16, dex: 14, luck: 16, cls: 'cleric', name: 'Boss Cleric B' }),
    await combatHorse({ str: 18, con: 18, dex: 12, luck: 14, cls: 'knight', name: 'Boss Knight' }),
  ];
  const bossRun = await startRun(db, herdId, 'green-grass', bossParty, {
    scriptId: 'hollow-keeper',
    seed: 1,
  });
  check('the Hollow-Keeper expedition starts (a chosen script)', bossRun.ok);
  if (bossRun.ok) {
    await chooseInRun(db, herdId, bossRun.runId, 'prod-it'); // threshold → rouse the Keeper
    const face = await chooseInRun(db, herdId, bossRun.runId, 'declare'); // → boss battle
    check(
      'facing the boss ends the run and hands off to a battle vs the Hollow-Keeper',
      face.ok &&
        face.ended === true &&
        !!face.battle &&
        face.battle.view.combatants.some((c) => c.side === 'foe' && c.name === 'the Hollow-Keeper'),
    );
    if (face.ok && face.ended && face.battle) {
      const won = await driveBattle(face.battle.battleId);
      const keeper = ENEMY_BY_ID.get('gg-hollow-keeper')!;
      check('a strong party defeats the Hollow-Keeper', won.status === 'won');
      check(
        'boss victory grants the big end-of-adventure reward',
        won.reward !== null && (won.reward?.cubes ?? 0) === (keeper.reward.cubes ?? 0),
      );
      check(
        'the herd banked the boss reward (the run already banked its journey haul)',
        (await herdCubes()) - cubesPreBoss >= (keeper.reward.cubes ?? 0),
      );
    }
  }

  // Bowing out after rousing the Keeper skips the boss entirely (the challenge is opt-in).
  const skipRun = await startRun(
    db,
    herdId,
    'green-grass',
    [await combatHorse({ name: 'Skipper' })],
    { scriptId: 'hollow-keeper', seed: 2 },
  );
  if (skipRun.ok) {
    await chooseInRun(db, herdId, skipRun.runId, 'prod-it'); // threshold → rouse the Keeper
    const banked = await chooseInRun(db, herdId, skipRun.runId, 'bow-out'); // → end, no boss
    check(
      'bowing out after rousing the Keeper ends the run with no boss battle',
      banked.ok && banked.ended === true && banked.battle === null,
    );
  }

  // Losing the boss is cozy: a full-party KO → retreat home with a reduced reward, never a loss.
  const loseRun = await startRun(
    db,
    herdId,
    'green-grass',
    [await combatHorse({ str: 4, con: 3, dex: 5, luck: 4, name: 'Wee One' })],
    { scriptId: 'hollow-keeper', seed: 3 },
  );
  if (loseRun.ok) {
    await chooseInRun(db, herdId, loseRun.runId, 'prod-it');
    const face = await chooseInRun(db, herdId, loseRun.runId, 'declare');
    if (face.ok && face.ended && face.battle) {
      const lost = await driveBattle(face.battle.battleId);
      const keeper = ENEMY_BY_ID.get('gg-hollow-keeper')!;
      check(
        'losing the boss is a cozy retreat with a reduced reward (never a loss)',
        lost.status === 'retreated' &&
          (lost.reward?.cubes ?? -1) ===
            Math.floor((keeper.reward.cubes ?? 0) * REWARD_RETREAT_FRACTION),
      );
    }
  }

  // --- Phase 9: The Living Herd ---
  section('Phase 9: The Living Herd');
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
  section('Phase 10: social & economy');
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

  // ── Inventory quick-sell (§7/§10): a modest convenience dump, audited; rares/grains protected ──
  section('Inventory quick-sell (§7/§10): a modest convenience dump, audited; rar');
  {
    const timber0 = await itemQty(db, herdId, 'timber');
    await grantItems(db, herdId, [
      { id: 'timber', qty: 5 },
      { id: 'rare-gem', qty: 1 },
      { id: 'grain-corn', qty: 3 },
    ]);
    const before =
      (await db.query.herds.findFirst({ where: drizzleEq(herds.id, herdId) }))?.cubes ?? 0;
    const sold = await quickSellItem(db, herdId, 'timber', 3);
    check(
      'quick-sell pays the modest per-item value',
      sold.ok && sold.gained === 6 && sold.sold === 3,
    );
    check(
      'quick-sell removes the sold items',
      (await itemQty(db, herdId, 'timber')) === timber0 + 2,
    );
    const after =
      (await db.query.herds.findFirst({ where: drizzleEq(herds.id, herdId) }))?.cubes ?? 0;
    check('quick-sell credits the Cubes', after === before + 6);
    check(
      'quick-sell is audited',
      (await getAudit(db, herdId)).some((r) => r.action === 'item_sell'),
    );
    // selling more than held clamps to the held quantity (never negative)
    const remaining = await itemQty(db, herdId, 'timber');
    const overSell = await quickSellItem(db, herdId, 'timber', 99);
    check('quick-sell clamps to the held quantity', overSell.ok && overSell.sold === remaining);
    // a cooking grain isn't quick-sellable (protected by exclusion from the value map)
    const grainSell = await quickSellItem(db, herdId, 'grain-corn', 1);
    check('grains are not quick-sellable', !grainSell.ok && grainSell.code === 'not_sellable');
    // the rare gem IS sellable (a prestige cash-in) — the confirm is a UI gate; the value is real
    const gemSell = await quickSellItem(db, herdId, 'rare-gem', 1);
    check('the rare gem sells for its prestige value', gemSell.ok && gemSell.gained === 40);
  }

  // ── The atomic economy kernel (§11 hardening): conditional spends, all-or-nothing consumes ──
  section('The atomic economy kernel (§11 hardening): conditional spends, all-or-');
  {
    const balance = async (): Promise<number> =>
      (await db.query.herds.findFirst({ where: drizzleEq(herds.id, herdId) }))?.cubes ?? 0;
    const b0 = await balance();
    const afterSpend = await spendCubes(db, herdId, 10);
    check('spendCubes deducts and returns the new balance', afterSpend === b0 - 10);
    const tooMuch = await spendCubes(db, herdId, b0 + 1_000_000);
    check('spendCubes refuses an overdraw (conditional update → null)', tooMuch === null);
    check('a refused spend changes nothing', (await balance()) === b0 - 10);
    const afterCredit = await creditCubes(db, herdId, 10);
    check('creditCubes restores the balance', afterCredit === b0);

    // consumeItems is all-or-nothing: one short item rolls the WHOLE batch back.
    await grantItems(db, herdId, [{ id: 'plank', qty: 3 }]);
    const plank0 = await itemQty(db, herdId, 'plank');
    const partial = await consumeItems(db, herdId, [
      { id: 'plank', qty: 2 },
      { id: 'brick', qty: 999_999 }, // far more than held → the batch must fail
    ]);
    check('a short item refuses the whole consume batch', partial === false);
    check(
      'the refused batch left the other items untouched (rolled back)',
      (await itemQty(db, herdId, 'plank')) === plank0,
    );
  }

  // ── Conditional claims (§11 hardening): every value flow has exactly one winner ──
  section('Conditional claims (§11): one winner per value flow');
  {
    // A fresh herd for clean ledgers.
    const ccHerd = (
      await inject({
        method: 'POST',
        url: '/auth/register',
        payload: { username: 'clerk', password: 'clerkhorse1' },
      })
    ).json<{ herd: { id: string } }>().herd.id;
    const cubesOf = async (h: string): Promise<number> =>
      (await db.query.herds.findFirst({ where: drizzleEq(herds.id, h) }))!.cubes;

    // Daily catch-up pays exactly once: the second check-in at the same instant claims nothing.
    const ccNow = Date.now();
    await db
      .update(herds)
      .set({ lastSimTick: gameDay(ccNow) - 2, groomBonusPending: true })
      .where(drizzleEq(herds.id, ccHerd));
    const cubesBefore = await cubesOf(ccHerd);
    const first = await advanceHerd(db, ccHerd, ccNow);
    const afterFirst = await cubesOf(ccHerd);
    const second = await advanceHerd(db, ccHerd, ccNow);
    check(
      'advanceHerd: the claim pays the stipend + pending groom exactly once',
      first.daysAdvanced === 2 &&
        first.groomCubes === GROOM_CUBES &&
        afterFirst >= cubesBefore + first.cubesGained &&
        second.daysAdvanced === 0 &&
        second.cubesGained === 0 &&
        (await cubesOf(ccHerd)) === afterFirst,
    );

    // An ended run refuses a re-submitted ending choice (the step claim).
    const ccHorse = await mintHorse(db, {
      herdId: ccHerd,
      genotype: { E: 'Ee', A: 'Aa' },
      origin: 'founder',
      lifeStage: 'adult',
      glitch: null,
      stats: { str: 14, dex: 14, con: 14, int: 14, wis: 14, cha: 14 },
    });
    const ccRun = await startRun(db, ccHerd, 'green-grass', [ccHorse.id], { seed: 11 });
    if (!ccRun.ok) throw new Error('run failed to start');
    let lastChoice = '';
    let guard = 0;
    let ended = false;
    while (!ended && guard++ < 40) {
      const view = await db.query.adventureRuns.findFirst({
        where: drizzleEq(adventureRuns.id, ccRun.runId),
      });
      if (!view || view.status !== 'active') break;
      const script = ADVENTURE_BY_ID.get(view.scriptId)!;
      const scene = script.scenes[view.sceneId]!;
      const choice = scene.choices[0]!;
      lastChoice = choice.id;
      const r = await chooseInRun(db, ccHerd, ccRun.runId, choice.id);
      ended = r.ok && r.ended;
    }
    const resubmit = await chooseInRun(db, ccHerd, ccRun.runId, lastChoice);
    check(
      'chooseInRun: re-submitting the ending choice banks nothing (claim already spent)',
      ended && !resubmit.ok && resubmit.code === 'not_found',
    );

    // Market: a broke buyer is refused and the listing stays purchasable.
    const seller = (
      await inject({
        method: 'POST',
        url: '/auth/register',
        payload: { username: 'fence', password: 'fencehorse1' },
      })
    ).json<{ herd: { id: string } }>().herd.id;
    const wares = await mintHorse(db, {
      herdId: seller,
      genotype: { E: 'ee' },
      origin: 'founder',
      lifeStage: 'adult',
      glitch: null,
    });
    const buyerCubes = await cubesOf(ccHerd);
    const listed = await listHorse(db, seller, wares.id, buyerCubes + 5_000);
    if (!listed.ok) throw new Error('listing failed');
    const broke = await buyListing(db, ccHerd, listed.listingId);
    const stillActive = await db.query.marketListings.findFirst({
      where: drizzleEq(marketListings.id, listed.listingId),
    });
    check(
      'market buy: a short balance is refused through the kernel; the listing survives',
      !broke.ok &&
        broke.code === 'cant_afford' &&
        stillActive?.status === 'active' &&
        (await cubesOf(ccHerd)) === buyerCubes,
    );

    // Trade: an accept where a side cannot cover its Cubes is refused and stays pending.
    const greedy = await createTrade(db, seller, {
      toHerd: ccHerd,
      offerHorses: [wares.id],
      requestCubes: buyerCubes + 9_000, // more than the recipient holds
    });
    if (!greedy.ok) throw new Error('trade failed to create');
    const refuse = await acceptTrade(db, ccHerd, greedy.tradeId);
    const pendingStill = await db.query.trades.findFirst({
      where: drizzleEq(trades.id, greedy.tradeId),
    });
    check(
      'trade accept: a side short on Cubes is refused; the trade stays pending, balances intact',
      !refuse.ok &&
        refuse.code === 'cant_afford' &&
        pendingStill?.status === 'pending' &&
        (await cubesOf(ccHerd)) === buyerCubes,
    );

    // The Keeper gate: bosses answer only the deep road (run handoff), never POST /battle.
    const shouted = await startBattle(db, ccHerd, ['gg-hollow-keeper'], [ccHorse.id]);
    check(
      'a Keeper refuses a standalone battle — the tier gate cannot be skipped',
      !shouted.ok && shouted.code === 'bad_enemy',
    );

    // Foal-white redaction (§4.2): the API never hands out a foal's genotype/seed.
    const ccCookie = cookieOf(
      await inject({
        method: 'POST',
        url: '/auth/login',
        payload: { username: 'clerk', password: 'clerkhorse1' },
      }),
    );
    const secretFoal = await mintHorse(db, {
      herdId: ccHerd,
      genotype: { E: 'Ee', A: 'Aa', C: 'CrCr' }, // a coat worth keeping secret
      origin: 'bred',
      lifeStage: 'foal',
      glitch: null,
    });
    const foalRes = await inject({ method: 'GET', url: `/horses/${secretFoal.id}` });
    const foalBody = foalRes.json<{ genotype: Record<string, string>; seed: number }>();
    const adultRes = await inject({ method: 'GET', url: `/horses/${ccHorse.id}` });
    check(
      'a foal travels the API white: empty genotype, zero seed (adults stay fully readable)',
      Object.keys(foalBody.genotype).length === 0 &&
        foalBody.seed === 0 &&
        Object.keys(adultRes.json<{ genotype: Record<string, string> }>().genotype).length > 0,
    );
    const anonRoster = await inject({ method: 'GET', url: `/herds/${ccHerd}/horses` });
    const authedRoster = await inject({
      method: 'GET',
      url: `/herds/${ccHerd}/horses`,
      headers: { cookie: ccCookie },
    });
    check(
      'rosters require a session (401 anonymous, 200 authed)',
      anonRoster.statusCode === 401 && authedRoster.statusCode === 200,
    );
  }

  // ───────────────────────── Phase 11 — beta hardening ─────────────────────────
  section('Phase 11 — beta hardening');

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
  section('prod-hardening gates');
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

  // ── §7 herd-tier progression spine (the Cubes sink + milestone-gated ladder) ──
  section('§7 herd-tier progression spine (the Cubes sink + milestone-gated ladde');
  {
    const minimalBattle = { round: 1, turnIndex: 0, order: [], combatants: [], log: [] };
    const freshHerd = async (name: string): Promise<string> => {
      const r = await inject({
        method: 'POST',
        url: '/auth/register',
        payload: { username: name, password: 'progress1horse' },
      });
      return r.json<{ herd: { id: string } }>().herd.id;
    };

    check(
      'the ladder is 5 tiers, top cap 30, Tier-2 cost 650',
      HERD_TIERS.length === 5 && HERD_TIERS[4]!.herdCap === 30 && HERD_TIERS[1]!.cost === 650,
    );
    check(
      'herd caps strictly escalate (the master lever)',
      HERD_TIERS.every((t, i) => i === 0 || t.herdCap > HERD_TIERS[i - 1]!.herdCap),
    );

    const ph = await freshHerd('progress');
    const p0 = await getProgression(db, ph);
    check(
      'a fresh herd reads as Tier 1 Smallholding (cap 6, 2 jobs, 4 slots)',
      !!p0 && p0.tier === 1 && p0.herdCap === 6 && p0.jobSlots === 2 && p0.structureSlots === 4,
    );
    check(
      'next is Working Farm (650 ⬡), gated on breeding a foal (not yet met)',
      !!p0?.next &&
        p0.next.tier === 2 &&
        p0.next.cost === 650 &&
        !p0.next.gatesMet &&
        p0.next.gates.some((g) => /foal/i.test(g.label)),
    );

    // gated: enough Cubes but the milestone isn't met → upgrade refused
    await db.update(herds).set({ cubes: 9000 }).where(drizzleEq(herds.id, ph));
    const gated = await upgradeHerd(db, ph);
    check('upgrade refused while gated (no foal bred yet)', !gated.ok && gated.code === 'gated');

    // breed a foal → completes a-new-foal → the gate clears → upgrade to Tier 2, Cubes deducted
    const adults = (await listHerdHorses(db, ph)).filter((h) => h.lifeStage === 'adult');
    const bred = await breedHorses(db, ph, adults[0]!.id, adults[1]!.id, { seed: 1 });
    check('bred a foal (completes the a-new-foal quest)', bred.ok);
    await db.update(herds).set({ cubes: 9000 }).where(drizzleEq(herds.id, ph)); // re-baseline (the quest paid out)
    const up2 = await upgradeHerd(db, ph);
    check(
      'Tier 2 unlocked after breeding + paying',
      up2.ok && up2.tier === 2 && up2.herdCap === 10,
    );
    check(
      'the Tier-2 cost (650) was sunk from the purse',
      (await db.query.herds.findFirst({ where: drizzleEq(herds.id, ph) }))?.cubes === 9000 - 650,
    );

    // Tier 3 gates on a boss win (combat breadth)
    const p2 = await getProgression(db, ph);
    check(
      'Tier 3 gated on the Green Grass boss (not yet met)',
      !!p2?.next && p2.next.tier === 3 && !p2.next.gatesMet,
    );
    await db.insert(battles).values({
      herdId: ph,
      enemies: ['gg-hollow-keeper'],
      seed: 1,
      state: minimalBattle,
      status: 'won',
    });
    await db.update(herds).set({ cubes: 9000 }).where(drizzleEq(herds.id, ph));
    const up3 = await upgradeHerd(db, ph);
    check('Tier 3 unlocked by beating the Green Grass boss', up3.ok && up3.tier === 3);

    // Tier 4 gates on BOTH a rare coat AND a second boss (must play the breadth)
    const p3 = await getProgression(db, ph);
    check(
      'Tier 4 gated on TWO accomplishments (rare coat + Dunes boss)',
      !!p3?.next && p3.next.gates.length === 2 && !p3.next.gatesMet,
    );
    await mintHorse(db, {
      herdId: ph,
      genotype: { E: 'Ee', G: 'Gg' },
      origin: 'wild',
      lifeStage: 'adult',
    });
    await db.insert(battles).values({
      herdId: ph,
      enemies: ['dd-sandstone-sentinel'],
      seed: 1,
      state: minimalBattle,
      status: 'won',
    });
    await db.update(herds).set({ cubes: 9000 }).where(drizzleEq(herds.id, ph));
    const up4 = await upgradeHerd(db, ph);
    check('Tier 4 unlocked by a rare (Gray) coat + the Dunes boss', up4.ok && up4.tier === 4);

    // The blocked-at-cap moment is MOTIVATING — names the next tier + cost, never a dead end.
    const cap = await freshHerd('capper');
    for (let i = 0; i < 4; i++) {
      await mintHorse(db, {
        herdId: cap,
        genotype: { E: 'Ee', A: 'Aa' },
        origin: 'wild',
        lifeStage: 'adult',
      });
    }
    check('herd filled to the Tier-1 cap of 6', (await herdHorseCount(db, cap)) === 6);
    const capAdults = (await listHerdHorses(db, cap)).filter((h) => h.lifeStage === 'adult');
    const blockedBreed = await breedHorses(db, cap, capAdults[0]!.id, capAdults[1]!.id, {
      seed: 2,
    });
    check(
      'at cap → breeding is blocked (herd_full)',
      !blockedBreed.ok && blockedBreed.code === 'herd_full',
    );
    check(
      'the herd-full message motivates (names Tier 2 + the 650 ⬡ cost)',
      !blockedBreed.ok && /Tier 2/.test(blockedBreed.message) && /650/.test(blockedBreed.message),
    );
    // job-slots cap at Tier 1 = 2 workers; a 3rd is a motivating block too
    const slot3 = await checkJobSlots(db, cap, 2);
    check(
      'Tier-1 job slots cap at 2 (a 3rd worker is blocked, motivating)',
      !slot3.ok && slot3.code === 'jobs_full' && /Tier 2/.test(slot3.message),
    );
    // tiering up raises the roster ceiling → room to grow again
    await db.update(herds).set({ level: 2 }).where(drizzleEq(herds.id, cap));
    const roomNow = await getProgression(db, cap);
    check(
      'tiering up to Working Farm raised the cap to 10 (room to grow)',
      roomNow?.herdCap === 10 && (roomNow?.herdSize ?? 99) < 10,
    );
  }

  // ── §7 Daily Care hub: cook (morning ritual) + groom (evening ritual) ──
  section('§7 Daily Care hub: cook (morning ritual) + groom (evening ritual)');
  {
    // cookMeal (pure): the per-stat cap and the rare multiplier
    check('cookMeal caps a stat at +5 (5 grains to max it)', cookMeal({ str: 9 }).str === 5);
    check(
      'cookMeal maps grain counts → per-stat buff',
      cookMeal({ str: 3, int: 2 }).str === 3 && cookMeal({ str: 3, int: 2 }).int === 2,
    );
    check(
      'a rare multiplies the WHOLE dish (×1.5 → round(5×1.5)=8)',
      cookMeal({ str: 5 }, 1).str === 8,
    );
    check('two rares double it (×2)', cookMeal({ str: 4 }, 2).str === 8);

    // a herd of 8 (so the pot holds 8) — mint past the tier-1 cap directly (raw mint isn't capped)
    const cookHerd = (
      await inject({
        method: 'POST',
        url: '/auth/register',
        payload: { username: 'cook', password: 'cookhorse1' },
      })
    ).json<{ herd: { id: string } }>().herd.id;
    for (let i = 0; i < 6; i++) {
      await mintHorse(db, {
        herdId: cookHerd,
        genotype: { E: 'Ee', A: 'Aa' } as Genotype,
        origin: 'wild',
        lifeStage: 'adult',
      });
    }
    const beforeCook = await getCareState(db, cookHerd, Date.UTC(2026, 6, 1, 12));
    check(
      'the pot holds one slot per horse (8)',
      beforeCook.slots === 8 && beforeCook.herdSize === 8,
    );
    check('not cooked yet → no live buff', !beforeCook.cookedToday);

    // stock the pantry and cook a STR-heavy, dash-of-CHA meal with a rare
    await grantItems(db, cookHerd, [
      { id: 'grain-corn', qty: 5 },
      { id: 'grain-rye', qty: 1 },
      { id: 'saffron-bloom', qty: 1 },
    ]);
    const CD = Date.UTC(2026, 6, 1, 12);
    const meal = await cook(db, cookHerd, { 'grain-corn': 5, 'grain-rye': 1 }, 1, CD);
    check(
      'cook succeeds: STR + CHA buffed, rare-multiplied',
      meal.ok && meal.mealBuffs.str === 8 && meal.mealBuffs.cha === 2,
    );
    check(
      'the live meal buff reads back today',
      Object.keys(await getMealBuff(db, cookHerd, CD)).length > 0,
    );
    check(
      'the meal buff RESETS at the next day',
      Object.keys(await getMealBuff(db, cookHerd, CD + 86_400_000)).length === 0,
    );
    // over-filling the pot is refused (cozy: a clear message, not a crash)
    await grantItems(db, cookHerd, [{ id: 'grain-corn', qty: 20 }]);
    const overfill = await cook(db, cookHerd, { 'grain-corn': 9 }, 0, CD);
    check(
      'a pot can hold at most `slots` ingredients',
      !overfill.ok && overfill.code === 'too_many',
    );

    // the meal buff genuinely helps a check: a hopeless DC turns into a win
    const cookAdult = (await listHerdHorses(db, cookHerd)).filter(
      (h) => h.lifeStage === 'adult',
    )[0]!;
    const hopeless: Choice = {
      id: 'h',
      text: 'h',
      check: { stat: 'str', dc: 40 },
      success: { text: 'WIN', next: 'end' },
      failure: { text: 'LOSE', next: 'end' },
    };
    const noBuff = resolveChoice([cookAdult], hopeless, mulberry32(7), [], {});
    const bigBuff = resolveChoice([cookAdult], hopeless, mulberry32(7), [], { str: 50 });
    check(
      'a meal buff turns a hopeless check into a win (DC reduction)',
      noBuff.outcome.text === 'LOSE' && bigBuff.outcome.text === 'WIN',
    );

    // groom: soothe rough moods + queue the small morning bonus
    await db.update(horses).set({ mood: 'rattled' }).where(drizzleEq(horses.herdId, cookHerd));
    const groomRes = await groom(db, cookHerd);
    check('groom soothes the rattled herd', groomRes.soothed >= 1);
    check(
      'every horse is content after grooming',
      (await listHerdHorses(db, cookHerd)).every((h) => h.mood === 'content'),
    );
    check('groom queues the flat next-morning bonus', groomRes.pendingCubes === GROOM_CUBES);
    // …paid once, at the next sunrise (a real rollover) — guilt-free, no daily FOMO drip
    const roll1 = await advanceHerd(db, cookHerd, CD + 86_400_000);
    check('grooming pays GROOM_CUBES at the next rollover', roll1.groomCubes === GROOM_CUBES);
    const roll2 = await advanceHerd(db, cookHerd, CD + 2 * 86_400_000);
    check('the groom bonus pays once, never drips daily', roll2.groomCubes === 0);

    // a full-party battle retreat leaves the party rattled → grooming has something to soothe
    const sad = await db
      .insert(horses)
      .values({
        herdId: cookHerd,
        genotype: { E: 'Ee' } as Genotype,
        seed: 1,
        origin: 'wild',
        lifeStage: 'adult',
        mood: 'rattled',
      })
      .returning({ id: horses.id });
    check('a rattled mood persists until groomed', sad.length === 1);
    await groom(db, cookHerd);
    const soothedHorse = await getHorse(db, sad[0]!.id);
    check('the evening groom soothes it back to content', soothedHorse?.mood === 'content');
  }

  // ── The Garden (§7j): plant the crop itself, harvest a multiplier; wither returns it ──
  section('The Garden (§7j)');
  {
    const HOUR = 3_600_000;
    const gid = (
      await inject({
        method: 'POST',
        url: '/auth/register',
        payload: { username: 'gardener', password: 'gardenhorse1' },
      })
    ).json<{ herd: { id: string } }>().herd.id;
    const freshHerd = async () =>
      (await db.query.herds.findFirst({ where: drizzleEq(herds.id, gid) }))!;
    let gHerd = await freshHerd();
    const T0 = Date.UTC(2027, 0, 1, 12);

    const g0 = await getGarden(db, gHerd, T0);
    check('plots ride the herd-tier spine (2 + tier = 3 at Smallholding)', g0.plots.length === 3);

    const noCrop = await plantCrop(db, gHerd, 1, 'carrot', T0);
    check(
      'planting needs the crop itself in the pantry (the crop IS the seed)',
      !noCrop.ok && noCrop.code === 'cant_afford',
    );
    await grantItems(db, gid, [
      { id: 'carrot', qty: 2 },
      { id: 'radish', qty: 6 },
      { id: 'fertilizer', qty: 3 },
      { id: 'rich-fertilizer', qty: 1 },
      { id: 'magic-fertilizer', qty: 1 },
    ]);
    const planted = await plantCrop(db, gHerd, 1, 'carrot', T0);
    check('planting consumes one crop', planted.ok && (await itemQty(db, gid, 'carrot')) === 1);

    let v = (await getGarden(db, gHerd, T0 + 6 * HOUR)).plots[0]!;
    check(
      'a half-grown crop reads GROWING with a visible bar',
      v.stage === 'growing' && v.growth > 0.4 && v.growth < 0.6,
    );
    v = (await getGarden(db, gHerd, T0 + 13 * HOUR)).plots[0]!;
    check('a 12h crop is ripe after 12h', v.stage === 'ripe');

    const h1 = await harvestPlot(db, gHerd, 1, T0 + 13 * HOUR, 5);
    check(
      'harvest = the multiplier PLUS the dual yield (carrot → carrots + greens)',
      h1.ok &&
        h1.harvested.some((s) => s.id === 'carrot' && s.qty === 3) &&
        h1.harvested.some((s) => s.id === 'carrot-greens' && s.qty === 1),
    );

    // Basic fertilizer: faster, never bigger.
    await fertilizePlot(db, gHerd, 1, 'fertilizer', T0);
    await plantCrop(db, gHerd, 1, 'radish', T0);
    v = (await getGarden(db, gHerd, T0 + 10 * HOUR)).plots[0]!;
    check('basic fertilizer hurries growth (a 12h crop ripens by ~9.6h)', v.stage === 'ripe');
    const hBasic = await harvestPlot(db, gHerd, 1, T0 + 10 * HOUR, 5);
    check(
      'basic fertilizer never changes the yield',
      hBasic.ok && hBasic.harvested.find((s) => s.id === 'radish')?.qty === 4,
    );

    // Rich fertilizer: +1..2 extra base crops.
    await fertilizePlot(db, gHerd, 2, 'rich-fertilizer', T0);
    await plantCrop(db, gHerd, 2, 'radish', T0);
    const hRich = await harvestPlot(db, gHerd, 2, T0 + 13 * HOUR, 7);
    const richQty = hRich.ok ? (hRich.harvested.find((s) => s.id === 'radish')?.qty ?? 0) : 0;
    check('rich fertilizer adds 1–2 extra base crops', hRich.ok && richQty >= 5 && richQty <= 6);

    // Magic fertilizer: exactly ONE bonus crop, from the defined pool only.
    await fertilizePlot(db, gHerd, 3, 'magic-fertilizer', T0);
    await plantCrop(db, gHerd, 3, 'radish', T0);
    const hMagic = await harvestPlot(db, gHerd, 3, T0 + 13 * HOUR, 11);
    const magicTotal = hMagic.ok ? hMagic.harvested.reduce((s, x) => s + x.qty, 0) : 0;
    check(
      'magic fertilizer adds exactly one bonus crop from the defined pool',
      hMagic.ok &&
        magicTotal === 5 &&
        hMagic.harvested.every((s) => MAGIC_CROP_POOL.includes(s.id)),
    );

    // ── The wither machine: drain → visible grace → the planted crop COMES BACK ──
    await plantCrop(db, gHerd, 1, 'radish', T0);
    v = (await getGarden(db, gHerd, T0 + 47 * HOUR)).plots[0]!;
    check(
      'the tank drains visibly (nearly dry at 47h)',
      v.stage === 'ripe' && v.water > 0 && v.water < 0.05,
    );
    v = (await getGarden(db, gHerd, T0 + 49 * HOUR)).plots[0]!;
    check(
      'dry → DRYING with the grace runway visible',
      v.stage === 'drying' &&
        (v.graceLeftMs ?? 0) > 118 * HOUR &&
        (v.graceLeftMs ?? 0) <= 120 * HOUR,
    );
    const rescue = await waterPlot(db, gHerd, 1, T0 + 49 * HOUR);
    check('watering at any drying stage resets it to safe', rescue.ok && rescue.stage === 'ripe');
    // Now let it truly go: dry again at +48h from the rescue, grace 120h → withers at 49+168h.
    const radishBefore = await itemQty(db, gid, 'radish');
    const gWither = await getGarden(db, gHerd, T0 + 220 * HOUR);
    check(
      'long neglect withers — and RETURNS the planted crop (0 net loss)',
      gWither.returned.some((r) => r.slot === 1 && r.crop === 'radish') &&
        (await itemQty(db, gid, 'radish')) === radishBefore + 1 &&
        gWither.plots[0]!.stage === 'empty',
    );

    // Fertilizer is the only thing a wither costs.
    const fertBefore = await itemQty(db, gid, 'fertilizer');
    await fertilizePlot(db, gHerd, 1, 'fertilizer', T0 + 220 * HOUR);
    await plantCrop(db, gHerd, 1, 'radish', T0 + 220 * HOUR);
    const gWither2 = await getGarden(db, gHerd, T0 + 440 * HOUR);
    check(
      'a withered fertilized plot returns the crop but not the fertilizer',
      gWither2.plots[0]!.stage === 'empty' &&
        gWither2.plots[0]!.fertilizer === null &&
        (await itemQty(db, gid, 'fertilizer')) === fertBefore - 1,
    );

    // ── The sprinkler: a convenience purchase that pins every tank full ──
    gHerd = await freshHerd();
    const TS = T0 + 500 * HOUR;
    const spr = await buySprinkler(db, gHerd, 7, TS);
    check('the sprinkler is a conditional Cubes purchase', spr.ok);
    gHerd = await freshHerd(); // window now on the row
    await plantCrop(db, gHerd, 1, 'radish', TS);
    v = (await getGarden(db, gHerd, TS + 6 * 24 * HOUR)).plots[0]!;
    check(
      'while the sprinkler runs, nothing dries (6 days unwatered, tank full)',
      v.stage === 'ripe' && v.water === 1,
    );
    v = (await getGarden(db, gHerd, TS + 11 * HOUR)).plots[0]!;
    check('the sprinkler also hurries growth (a 12h crop ripe by 11h)', v.stage === 'ripe');

    // ── Fertilizer from care: fed yesterday → fertilizer this morning; not fed → simply none ──
    const realNow = Date.now();
    // Same straddle pin as the pepper herd: the fed-day rule matches mealDay to a tick day,
    // so the cursor must derive from realNow, not the register-time clock (audit P2 flake).
    await db
      .update(herds)
      .set({ lastSimTick: gameDay(realNow) })
      .where(drizzleEq(herds.id, gid));
    await grantItems(db, gid, [{ id: 'grain-corn', qty: 1 }]);
    const fedCook = await cook(db, gid, { 'grain-corn': 1 }, 0, realNow + 86_400_000);
    check('the herd is fed (the communal cook)', fedCook.ok);
    const basicBefore = await itemQty(db, gid, 'fertilizer');
    const morning = await advanceHerd(db, gid, realNow + 2 * 86_400_000);
    const herdHeads = (await listHerdHorses(db, gid)).length;
    check(
      'fed yesterday → each horse produced one fertilizer overnight',
      morning.fertilizer === herdHeads &&
        (await itemQty(db, gid, 'fertilizer')) === basicBefore + herdHeads,
    );
    const morning2 = await advanceHerd(db, gid, realNow + 4 * 86_400_000);
    check('not fed → simply no fertilizer (never a penalty)', morning2.fertilizer === 0);
  }

  // ── The Debug Shrine (§7l): deliberate glitch access + the natural birth roll ──
  section('The Debug Shrine (§7l)');
  {
    const sid = (
      await inject({
        method: 'POST',
        url: '/auth/register',
        payload: { username: 'sysadmin', password: 'shrinehorse1' },
      })
    ).json<{ herd: { id: string } }>().herd.id;
    const adult = await mintHorse(db, {
      herdId: sid,
      genotype: { E: 'Ee', A: 'Aa' },
      origin: 'founder',
      lifeStage: 'adult',
      glitch: null, // explicit null suppresses the birth roll — the shrine writes it below
    });
    const foal = await mintHorse(db, {
      herdId: sid,
      genotype: { E: 'ee' },
      origin: 'founder',
      lifeStage: 'foal',
      glitch: null,
    });

    // The natural roll (§5.7/§14.1): fires under GLITCH_CHANCE, uniform over the kinds.
    check('birth roll: a miss leaves the horse normal', rollGlitch(() => 0.5) === null);
    const seq = (vals: number[]): (() => number) => {
      let i = 0;
      return () => vals[i++] ?? 0;
    };
    check(
      'birth roll: a hit picks uniformly over every implemented glitch',
      rollGlitch(seq([0.0005, 0.01])) === 'inverted' &&
        rollGlitch(seq([0.0005, 0.4])) === 'screen' &&
        rollGlitch(seq([0.0005, 0.9])) === 'shade',
    );
    check(
      'every implemented glitch is offered (render-core runtime list)',
      GLITCH_KINDS.length === 3,
    );

    // No offering → the monks decline, nothing changes.
    const broke = await induceGlitch(db, sid, adult.id, () => 0);
    check(
      'no fairy dust → declined, horse untouched',
      !broke.ok && broke.code === 'cant_afford' && (await getHorse(db, adult.id))!.glitch === null,
    );

    await grantItems(db, sid, [{ id: SHRINE_OFFERING_ID, qty: 3 }]);
    const foalTry = await induceGlitch(db, sid, foal.id, () => 0);
    check(
      'foals are refused (no bugs yet) and the offering survives',
      !foalTry.ok && foalTry.code === 'foal' && (await itemQty(db, sid, SHRINE_OFFERING_ID)) === 3,
    );

    const r1 = await induceGlitch(db, sid, adult.id, () => 0.1); // floor(0.1×3)=0 → inverted
    check(
      'an offering buys a server-rolled glitch (rng low → inverted)',
      r1.ok && r1.glitch === 'inverted' && (await getHorse(db, adult.id))!.glitch === 'inverted',
    );
    check('the offering is consumed', (await itemQty(db, sid, SHRINE_OFFERING_ID)) === 2);

    const r2 = await induceGlitch(db, sid, adult.id, () => 0.9); // floor(0.9×3)=2 → shade
    check(
      're-offering rerolls in place (prior reported for the duplicate-ticket joke)',
      r2.ok && r2.glitch === 'shade' && r2.prior === 'inverted',
    );

    // Patch = file a bug report: charges the fee, clears the column.
    const balBefore = (await db.query.herds.findFirst({ where: drizzleEq(herds.id, sid) }))!.cubes;
    const patched = await patchGlitch(db, sid, adult.id);
    const balAfter = (await db.query.herds.findFirst({ where: drizzleEq(herds.id, sid) }))!.cubes;
    check(
      'patch clears the glitch and charges the filing fee',
      patched.ok &&
        patched.cleared === 'shade' &&
        (await getHorse(db, adult.id))!.glitch === null &&
        balAfter === balBefore - SHRINE_PATCH_FEE,
    );
    const rePatch = await patchGlitch(db, sid, adult.id);
    check(
      'patching a normal horse is refused free of charge',
      !rePatch.ok &&
        rePatch.code === 'not_glitched' &&
        (await db.query.herds.findFirst({ where: drizzleEq(herds.id, sid) }))!.cubes === balAfter,
    );

    // Ownership: someone else's horse gets the same answer as no horse at all.
    const stranger = await mintHorse(db, {
      herdId: null,
      genotype: { E: 'ee' },
      origin: 'wild',
      lifeStage: 'adult',
      glitch: null,
    });
    const notMine = await induceGlitch(db, sid, stranger.id, () => 0);
    check('a horse you do not own is not_found', !notMine.ok && notMine.code === 'not_found');

    // Breeding never copies a glitch (§5.7): the foal's column is its OWN birth roll
    // (derived from its own seed — the same salt mintHorse uses), never a parent's kind.
    // Asserting against the roll instead of `null` keeps this green even on the 1-in-1,000
    // seed whose fresh roll legitimately fires.
    const starter = (await listHerdHorses(db, sid)).find(
      (h) => h.id !== adult.id && h.id !== foal.id && h.lifeStage === 'adult',
    )!;
    await db
      .update(horses)
      .set({ glitch: 'inverted' as GlitchKind })
      .where(drizzleEq(horses.id, adult.id));
    await db
      .update(horses)
      .set({ glitch: 'screen' as GlitchKind })
      .where(drizzleEq(horses.id, starter.id));
    const bred = await breedHorses(db, sid, adult.id, starter.id, { seed: 7 });
    check(
      'foals never inherit a glitch — their column is their own fresh birth roll',
      bred.ok &&
        bred.viable &&
        bred.foal.glitch === rollGlitch(mulberry32((bred.foal.seed ^ 0x9d17ce2b) >>> 0)),
    );
  }

  // ── The Studbook (§7m): standing breeding goals, checked at the coat reveal ──
  section('The Studbook (§7m)');
  {
    // Goal predicates read the resolved phenotype (alleles + flags), not display strings.
    const g = (id: string) => STUDBOOK_GOAL_BY_ID.get(id)!;
    const bay = resolveCoat({ E: 'Ee', A: 'Aa' });
    const paleDun = resolveCoat({ E: 'ee', C: 'CrCr', D: 'Dd' });
    const dunalino = resolveCoat({ E: 'ee', C: 'CCr', D: 'Dd' });
    check(
      'predicates: a bay is The Classic and nothing fancier',
      g('the-classic').test(bay) && !g('touched-by-gold').test(bay) && !g('born-to-fade').test(bay),
    );
    check(
      'predicates: double cream is The Pale Page, NOT Touched by Gold',
      g('the-pale-page').test(paleDun) && !g('touched-by-gold').test(paleDun),
    );
    check(
      'predicates: dun-over-cream stacks three goals (single cream + stripe + the combo)',
      g('touched-by-gold').test(dunalino) &&
        g('wearing-the-stripe').test(dunalino) &&
        g('stripe-on-gold').test(dunalino),
    );

    // Direct service flow: exact reward accounting + once-only.
    const rid = (
      await inject({
        method: 'POST',
        url: '/auth/register',
        payload: { username: 'registrar', password: 'studbookhorse1' },
      })
    ).json<{ herd: { id: string } }>().herd.id;
    const cubesOf = async () =>
      (await db.query.herds.findFirst({ where: drizzleEq(herds.id, rid) }))!.cubes;
    const bredBay = await mintHorse(db, {
      herdId: rid,
      genotype: { E: 'Ee', A: 'Aa' },
      origin: 'bred',
      lifeStage: 'adult',
      glitch: null,
    });
    const before = await cubesOf();
    const beats = await checkStudbookOnMature(db, rid, bredBay);
    const expect = (STUDBOOK_TIER_CUBES[1] ?? 0) * 2; // open-the-book + the-classic
    check(
      'a bred bay reveal fulfills Open the Book + The Classic, paying both tiers exactly',
      beats.length === 2 &&
        beats.some((b) => b.goalId === 'open-the-book') &&
        beats.some((b) => b.goalId === 'the-classic') &&
        (await cubesOf()) === before + expect,
    );
    const again = await checkStudbookOnMature(db, rid, bredBay);
    check(
      'each goal fulfills once per herd — a second matching reveal pays nothing',
      again.length === 0 && (await cubesOf()) === before + expect,
    );
    const wildling = await mintHorse(db, {
      herdId: rid,
      genotype: { E: 'ee', D: 'Dd' },
      origin: 'wild',
      lifeStage: 'adult',
      glitch: null,
    });
    check(
      'recruits and founders do not count — the studbook honors your own breeding only',
      (await checkStudbookOnMature(db, rid, wildling)).length === 0,
    );

    // The daily pipeline: a bred foal matures at sunrise → beats ride the Morning Post.
    const foalDun = await mintHorse(db, {
      herdId: rid,
      genotype: { E: 'ee', C: 'CCr', D: 'Dd' },
      origin: 'bred',
      lifeStage: 'foal',
      glitch: null,
    });
    const reveal = await advanceHerd(db, rid, Date.now() + FOAL_TO_ADULT_MS + 60_000);
    const expectDun = (STUDBOOK_TIER_CUBES[2] ?? 0) * 2 + (STUDBOOK_TIER_CUBES[3] ?? 0); // gold + stripe + combo
    check(
      'the reveal carries studbook beats into the daily digest (gold + stripe + the combo)',
      reveal.matured.some((m) => m.id === foalDun.id) &&
        reveal.studbook.length === 3 &&
        reveal.studbook.reduce((s, b) => s + b.cubes, 0) === expectDun,
    );

    const book = await getStudbook(db, rid);
    const doneIds = book.goals.filter((x) => x.done).map((x) => x.id);
    check(
      'the book shows 5 fulfilled goals with the fulfilling coat on each stamp',
      doneIds.length === 5 &&
        doneIds.includes('stripe-on-gold') &&
        book.goals.every((x) => !x.done || x.done.coat.length > 0),
    );
    check(
      'founded lines: every coat bred to adulthood, its first author on record',
      book.registry.length >= 1 &&
        book.registry.some((l) => l.firstId === bredBay.id && l.count >= 1),
    );
  }

  // ── The polish bundle (§7n): Naturalist's Purse, Brag Lines, the Registrar squints ──
  section('Polish bundle (§7n): guide milestones, brag beats, carrier whispers');
  {
    // Content integrity: the ladder's top rung IS the catalog — a gene drop that grows the
    // catalog must extend the ladder in the same change.
    const natH = (
      await inject({
        method: 'POST',
        url: '/auth/register',
        payload: { username: 'naturalist', password: 'naturalisthorse1' },
      })
    ).json<{ herd: { id: string } }>().herd.id;
    const guide0 = await getFieldGuide(db, natH);
    const ladder = FIELD_GUIDE_MILESTONES;
    check(
      'the milestone ladder tops out exactly at the catalog size',
      ladder[ladder.length - 1]?.coats === guide0.catalogSize,
    );

    // Walk the herd to the first milestone with distinct coats (starters granted 2 already).
    const natCubes = async () =>
      (await db.query.herds.findFirst({ where: drizzleEq(herds.id, natH) }))!.cubes;
    const pin = await mintHorse(db, {
      herdId: natH,
      genotype: { E: 'ee' },
      origin: 'wild',
      lifeStage: 'adult',
      glitch: null,
    });
    const coats: Genotype[] = [
      { E: 'Ee', A: 'aa' }, // black
      { E: 'ee', C: 'CCr' }, // palomino
      { E: 'Ee', A: 'Aa', C: 'CCr' }, // buckskin
      { E: 'ee', C: 'CrCr' }, // cremello
      { E: 'Ee', A: 'Aa', D: 'DD' }, // dun bay
      { E: 'ee', D: 'DD' }, // red dun
      { E: 'Ee', A: 'aa', D: 'DD' }, // grullo
      { E: 'ee', Ch: 'ChCh' }, // champagne chestnut
      { E: 'Ee', A: 'Aa', Ch: 'ChCh' }, // champagne bay
      { E: 'Ee', A: 'aa', C: 'CCr' }, // smoky black
      { E: 'ee', C: 'CCr', D: 'DD' }, // dunalino
    ];
    let purse = 0;
    const before10 = await natCubes();
    for (const g of coats) {
      const beats = await recordDiscovery(db, natH, { id: pin.id, genotype: g });
      purse += beats.reduce((s, b) => s + b.cubes, 0);
      if ((await getFieldGuide(db, natH)).discoveredCount >= 10) break;
    }
    const reward10 = ladder.find((m) => m.coats === 10)?.cubes ?? 0;
    check(
      'crossing 10 coats pays the first purse exactly once',
      purse === reward10 && (await natCubes()) === before10 + reward10,
    );
    const again = await recordDiscovery(db, natH, { id: pin.id, genotype: { E: 'ee' } }); // re-discovery
    check('a re-discovered coat moves no needle and pays nothing', again.length === 0);
    const guideNow = await getFieldGuide(db, natH);
    check(
      'the guide view flags the claimed rung (and only that one)',
      guideNow.milestones.find((m) => m.coats === 10)?.claimed === true &&
        guideNow.milestones.filter((m) => m.claimed).length === 1,
    );
    const purseBeat = await db
      .select()
      .from(journalEvents)
      .where(drizzleEq(journalEvents.herdId, natH));
    check(
      'the purse writes a journal beat (the mid-day announcement path)',
      purseBeat.some((e) => e.kind === 'guide' && e.text.includes('10 coats')),
    );

    // The Registrar squints: two pearl CARRIERS look plain but whisper loudly.
    const ca = await mintHorse(db, {
      herdId: natH,
      genotype: { E: 'ee', C: 'Cprl' },
      origin: 'founder',
      lifeStage: 'adult',
      glitch: null,
    });
    const cb = await mintHorse(db, {
      herdId: natH,
      genotype: { E: 'ee', C: 'Cprl' },
      origin: 'founder',
      lifeStage: 'adult',
      glitch: null,
    });
    const odds = await breedingOdds(db, ca.id, cb.id);
    check(
      'breeding odds surface the hidden pearl carrier',
      odds.ok && odds.carriers.some((c) => /prl|pearl/i.test(c.id) || /pearl/i.test(c.label)),
    );

    // Brag Lines: a level-up that mints an accomplishment writes a 🏅 journal beat.
    const brag = await mintHorse(db, {
      herdId: natH,
      genotype: { E: 'Ee' },
      origin: 'founder',
      lifeStage: 'adult',
      glitch: null,
      skills: { reading: { level: 4, xp: 999_999 } }, // any grant levels it through 5 (and 10)
    });
    await db.insert(jobAssignments).values({
      horseId: brag.id,
      herdId: natH,
      structureType: 'library',
      skill: 'reading',
      stat: 'int',
    });
    await resolveJobsForDay(db, natH, mulberry32(5), {}, 12_345);
    const bragBeats = await db
      .select()
      .from(journalEvents)
      .where(drizzleEq(journalEvents.herdId, natH));
    check(
      'a fresh accomplishment writes a 🏅 brag line to the Journal',
      bragBeats.some(
        (e) => e.kind === 'accomplishment' && e.day === 12_345 && /Skilled Reading/.test(e.text),
      ),
    );
  }

  // ── "Your First Day" (§7i): the onboarding quest walks the whole daily rhythm ──
  section('First-day rhythm quest (§7i)');
  {
    const fdHerd = (
      await inject({
        method: 'POST',
        url: '/auth/register',
        payload: { username: 'firstday', password: 'firstdayhorse1' },
      })
    ).json<{ herd: { id: string } }>().herd.id;
    const fdQuest = async () =>
      (await getQuestState(db, fdHerd)).find((q) => q.questId === 'first-day');
    const fresh = await fdQuest();
    check(
      'a fresh herd opens Your First Day with five rhythm steps',
      fresh?.status === 'active' && fresh.objectives.length === 5,
    );

    // Walk the rhythm on a controlled clock (a couple of days out so the rollover is real).
    const dayMs = Date.now() + 2 * 86_400_000;
    const roamed = await roam(db, fdHerd, 'green-grass', dayMs, 99);
    check('step 1 — the herd forages', roamed.ok);
    await grantItems(db, fdHerd, [{ id: 'grain-corn', qty: 1 }]);
    const cooked = await cook(db, fdHerd, { 'grain-corn': 1 }, 0, dayMs);
    check('step 2 — the morning meal is cooked', cooked.ok);
    const fdRun = await startRun(db, fdHerd, 'green-grass', [], { scriptId: 'windfall' });
    check('step 3 — an expedition begins (The Windfall)', !fdRun.ok); // empty party refused…
    const fdAdult = (await listHerdHorses(db, fdHerd)).find((h) => h.lifeStage === 'adult');
    const fdRun2 = fdAdult
      ? await startRun(db, fdHerd, 'green-grass', [fdAdult.id], { scriptId: 'windfall', seed: 3 })
      : { ok: false as const, code: 'bad_party' as const, message: '' };
    check('…and with a real party it sets out', fdRun2.ok);
    if (fdRun2.ok) {
      await chooseInRun(db, fdHerd, fdRun2.runId, 'sweep-low'); // either outcome → dusk
      const ended = await chooseInRun(db, fdHerd, fdRun2.runId, 'call-it'); // safe → end
      check('the short errand banks and ends', ended.ok && ended.ended === true);
    }
    await groom(db, fdHerd);
    const beforeSunrise = await fdQuest();
    check(
      'four steps done, the sunrise still waits',
      beforeSunrise?.status === 'active' &&
        beforeSunrise.objectives.filter((o) => o.have >= o.need).length === 4,
    );

    const balBefore =
      (await db.query.herds.findFirst({ where: drizzleEq(herds.id, fdHerd) }))?.cubes ?? 0;
    const sunrise = await advanceHerd(db, fdHerd, dayMs + 86_400_000);
    check(
      'the next sunrise completes Your First Day — celebrated in the Morning Post',
      sunrise.questCompletions.some((q) => q.questId === 'first-day' && q.cubes === 250),
    );
    const balAfter =
      (await db.query.herds.findFirst({ where: drizzleEq(herds.id, fdHerd) }))?.cubes ?? 0;
    check(
      'the reward landed on top of the morning ledger',
      balAfter === balBefore + sunrise.cubesGained + 250,
    );
    check('the quest reads completed', (await fdQuest())?.status === 'completed');
  }

  // ── Daily region omens (§7): world weather — deterministic, buff-only ──
  section('Daily region omens (§7)');
  {
    const o1 = omenFor('green-grass', 5);
    check(
      'the same (region, day) always draws the same omen',
      o1 !== null && o1.id === omenFor('green-grass', 5)?.id,
    );
    const skies = new Set<string>();
    for (let d = 0; d < 14; d++) skies.add(omenFor('green-grass', d)?.id ?? '');
    check('the sky varies across a fortnight', skies.size >= 2);
    check(
      'every region has weather',
      ['green-grass', 'dusty-dunes', 'weird-woods'].every((r) => omenFor(r, 3) !== null),
    );

    // The omen buff genuinely helps a check (mirrors the meal-buff DC flip).
    const omenHorse = await mintHorse(db, {
      herdId,
      genotype: { E: 'Ee' } as Genotype,
      origin: 'wild',
      lifeStage: 'adult',
    });
    const hopeless: Choice = {
      id: 'om',
      text: 'om',
      check: { stat: 'dex', dc: 40 },
      success: { text: 'WIN', next: 'end' },
      failure: { text: 'LOSE', next: 'end' },
    };
    const noOmen = resolveChoice([omenHorse], hopeless, mulberry32(7), [], {}, {});
    const bigOmen = resolveChoice([omenHorse], hopeless, mulberry32(7), [], {}, { dex: 50 });
    check(
      'an omen buff turns a hopeless check into a win (DC reduction)',
      noOmen.outcome.text === 'LOSE' && bigOmen.outcome.text === 'WIN',
    );

    // The gather kicker: same seed on a kicker day vs a plain day → the base haul is identical
    // (the omen never shifts the RNG stream) plus exactly the featured bonus per forager.
    const base = Date.UTC(2026, 0, 5, 12);
    let kickerMs = 0;
    let plainMs = 0;
    let kickerItem = '';
    for (let k = 0; k < 60 && (kickerMs === 0 || plainMs === 0); k++) {
      const ms = base + k * 86_400_000;
      const o = omenFor('green-grass', gameDay(ms));
      if (o?.bonusItem && kickerMs === 0) {
        kickerMs = ms;
        kickerItem = o.bonusItem;
      } else if (!o?.bonusItem && plainMs === 0) {
        plainMs = ms;
      }
    }
    check('a kicker day and a plain day both exist in the horizon', kickerMs > 0 && plainMs > 0);
    const omenHerd = (
      await inject({
        method: 'POST',
        url: '/auth/register',
        payload: { username: 'omenherd', password: 'omenhorse1' },
      })
    ).json<{ herd: { id: string } }>().herd.id;
    const qtyOf = (r: Awaited<ReturnType<typeof roam>>, id: string): number =>
      r.ok ? (r.found.find((f) => f.id === id)?.qty ?? 0) : -1;
    // Run chronologically so the per-day gather cap resets between the two roams.
    const firstMs = Math.min(kickerMs, plainMs);
    const secondMs = Math.max(kickerMs, plainMs);
    const seedRoam = 4242;
    const first = await roam(db, omenHerd, 'green-grass', firstMs, seedRoam);
    const second = await roam(db, omenHerd, 'green-grass', secondMs, seedRoam);
    const onKicker = firstMs === kickerMs ? first : second;
    const onPlain = firstMs === kickerMs ? second : first;
    check('roams succeed on both days', onPlain.ok && onKicker.ok);
    if (onPlain.ok && onKicker.ok) {
      check(
        'the kicker day adds exactly the featured bonus per forager (same base haul)',
        onKicker.horsesGathered === onPlain.horsesGathered &&
          qtyOf(onKicker, kickerItem) - qtyOf(onPlain, kickerItem) ===
            onKicker.horsesGathered * OMEN_GATHER_BONUS_QTY,
      );
    }

    // The regions view carries the day's omen for the Venture Out banner.
    const regs = (await inject({ method: 'GET', url: '/regions', headers: { cookie } })).json<
      { id: string; omen: { name: string; text: string } | null }[]
    >();
    check(
      'GET /regions carries the day’s omen',
      regs.length > 0 && regs.every((r) => r.omen !== null && r.omen.name.length > 0),
    );
  }

  // ── HTTP skins (§11): every newer feature's auth guard + error mapping, smoked ──
  section('HTTP skins (§11): auth guards + error mapping on the newer routes');
  {
    const smoke = await inject({
      method: 'POST',
      url: '/auth/register',
      payload: { username: 'smoketester', password: 'smokehorse1' },
    });
    const sCookie = cookieOf(smoke);
    const authed = (opts: InjectOptions) =>
      inject({ ...opts, headers: { ...(opts.headers ?? {}), cookie: sCookie } });
    const ghost = '00000000-0000-4000-8000-000000000000'; // a syntactically valid id that exists nowhere

    // Anonymous requests bounce at the door, uniformly.
    const anonChecks: Array<[string, InjectOptions]> = [
      [
        'POST /shrine/glitch',
        { method: 'POST', url: '/shrine/glitch', payload: { horseId: ghost } },
      ],
      ['POST /shrine/patch', { method: 'POST', url: '/shrine/patch', payload: { horseId: ghost } }],
      ['GET /studbook', { method: 'GET', url: '/studbook' }],
      ['GET /garden', { method: 'GET', url: '/garden' }],
      [
        'POST /garden/plant',
        { method: 'POST', url: '/garden/plant', payload: { slot: 1, crop: 'radish' } },
      ],
      ['GET /care', { method: 'GET', url: '/care' }],
      ['POST /care/groom', { method: 'POST', url: '/care/groom' }],
      ['GET /progression', { method: 'GET', url: '/progression' }],
      [
        'POST /inventory/sell',
        { method: 'POST', url: '/inventory/sell', payload: { itemId: 'timber', qty: 1 } },
      ],
      [
        'POST /battle/start',
        {
          method: 'POST',
          url: '/battle/start',
          payload: { enemyIds: ['bramble-tangle'], party: [ghost] },
        },
      ],
    ];
    let allAnon401 = true;
    for (const [label, opts] of anonChecks) {
      const res = await inject(opts);
      if (res.statusCode !== 401) {
        allAnon401 = false;
        console.error(`    anonymous ${label} → ${res.statusCode} (expected 401)`);
      }
    }
    check('every newer mutating/read surface requires a session (uniform 401)', allAnon401);

    // Happy reads return the right shapes.
    const sbRes = await authed({ method: 'GET', url: '/studbook' });
    const careRes = await authed({ method: 'GET', url: '/care' });
    const progRes = await authed({ method: 'GET', url: '/progression' });
    check(
      'authed reads: studbook (13 goals), care, progression all 200 with bodies',
      sbRes.statusCode === 200 &&
        sbRes.json<{ goals: unknown[] }>().goals.length === 13 &&
        careRes.statusCode === 200 &&
        progRes.statusCode === 200,
    );

    // Service errors map to clean statuses (no raw 500s).
    const ghostShrine = await authed({
      method: 'POST',
      url: '/shrine/glitch',
      payload: { horseId: ghost },
    });
    const brokePlant = await authed({
      method: 'POST',
      url: '/garden/plant',
      payload: { slot: 1, crop: 'walnut' }, // a fresh herd holds none
    });
    const emptyCook = await authed({ method: 'POST', url: '/care/cook', payload: {} }); // service rule
    const wrongCook = await authed({
      method: 'POST',
      url: '/care/cook',
      payload: { grains: 'oats' }, // wrong shape → transport schema
    });
    check(
      'service errors map cleanly: shrine ghost 404, broke plant 402, empty pot 409, bad shape 400',
      ghostShrine.statusCode === 404 &&
        brokePlant.statusCode === 402 &&
        emptyCook.statusCode === 409 &&
        wrongCook.statusCode === 400,
    );

    // Logout actually ends the session.
    const out = await authed({ method: 'POST', url: '/auth/logout' });
    const meAfter = await authed({ method: 'GET', url: '/me' });
    check(
      'logout invalidates the session (the old cookie reads as anonymous)',
      out.statusCode === 200 && meAfter.statusCode === 401,
    );

    // A malformed uuid in a path is the caller's mistake — 400, never a 500 (audit P2).
    const mangled = await inject({ method: 'GET', url: '/horses/not-a-uuid' });
    check(
      'a malformed id answers 400 bad_request (was a PG 22P02 → 500)',
      mangled.statusCode === 400 && mangled.json<{ code: string }>().code === 'bad_request',
    );

    // Usernames fold to lowercase: one handle, one account, any capitalization at login.
    const reg1 = await inject({
      method: 'POST',
      url: '/auth/register',
      payload: { username: 'CaseFold', password: 'casefoldhorse1' },
    });
    const reg2 = await inject({
      method: 'POST',
      url: '/auth/register',
      payload: { username: 'casefold', password: 'casefoldhorse2' },
    });
    const shoutyLogin = await inject({
      method: 'POST',
      url: '/auth/login',
      payload: { username: 'CASEFOLD', password: 'casefoldhorse1' },
    });
    check(
      'usernames are case-insensitive: duplicate 409, any-case login 200',
      reg1.statusCode === 201 && reg2.statusCode === 409 && shoutyLogin.statusCode === 200,
    );
  }

  // ── Prod serving mode (§11): static SPA + fallback, exercised like a browser would ──
  section('Prod serving (§11): static web + SPA fallback');
  {
    const webDir = mkdtempSync(join(tmpdir(), 'blorse-web-'));
    writeFileSync(join(webDir, 'index.html'), '<!doctype html><title>BLORSE</title>');
    const prodApp = buildApp(db, {
      webDir,
      rateLimitMax: 100_000,
      authRateLimitMax: 100_000,
      secureCookie: true, // assert the prod cookie posture below
    });
    await prodApp.ready();

    // Cookie security flags were never asserted (audit P2) — pin the whole posture here.
    const prodReg = await prodApp.inject({
      method: 'POST',
      url: '/api/auth/register',
      payload: { username: 'cookiecheck', password: 'cookiehorse1' },
    });
    const setCookie = prodReg.headers['set-cookie']?.toString() ?? '';
    check(
      'the session cookie ships HttpOnly + SameSite=Lax + Secure (prod posture)',
      prodReg.statusCode === 201 &&
        /httponly/i.test(setCookie) &&
        /samesite=lax/i.test(setCookie) &&
        /secure/i.test(setCookie),
    );
    const root = await prodApp.inject({
      method: 'GET',
      url: '/',
      headers: { accept: 'text/html' },
    });
    const deep = await prodApp.inject({
      method: 'GET',
      url: '/town/studbook', // a client route — must fall back to the SPA shell
      headers: { accept: 'text/html' },
    });
    const apiMiss = await prodApp.inject({
      method: 'GET',
      url: '/api/definitely-not-a-route',
      headers: { accept: 'application/json' },
    });
    check(
      'webDir serves the shell at /, deep links fall back to it, API misses stay JSON 404',
      root.statusCode === 200 &&
        root.body.includes('BLORSE') &&
        deep.statusCode === 200 &&
        deep.body.includes('BLORSE') &&
        apiMiss.statusCode === 404 &&
        apiMiss.json<{ code: string }>().code === 'not_found',
    );
    await prodApp.close();
  }

  // ── Living-Herd determinism (§8): identical seeds + temperaments → identical beats ──
  section('Living-Herd determinism (§8)');
  {
    const mkTwin = async (n: string): Promise<string> => {
      const r = await inject({
        method: 'POST',
        url: '/auth/register',
        payload: { username: n, password: `${n}horse1` },
      });
      const hid = r.json<{ herd: { id: string } }>().herd.id;
      await db
        .update(herds)
        .set({ simSeed: 424242, lastSimTick: gameDay(Date.now()) })
        .where(drizzleEq(herds.id, hid));
      // Two horses with pinned temperaments — the only autonomy inputs besides the seed.
      for (const p of [
        { o: 70, c: 40, e: 80, a: 75, n: 20 },
        { o: 60, c: 50, e: 75, a: 80, n: 25 },
      ]) {
        await mintHorse(db, {
          herdId: hid,
          genotype: { E: 'ee' },
          origin: 'wild',
          lifeStage: 'adult',
          glitch: null,
          personality: p,
        });
      }
      return hid;
    };
    const t1 = await mkTwin('twinone');
    const t2 = await mkTwin('twintwo');
    const now2 = Date.now();
    const b1 = await advanceHerd(db, t1, now2 + 3 * 86_400_000);
    const b2 = await advanceHerd(db, t2, now2 + 3 * 86_400_000);
    const kinds = (r: { journal: { glyph: string | null }[] }): string =>
      JSON.stringify(r.journal.map((e) => e.glyph ?? '·').sort());
    check(
      'twin herds (same simSeed, same temperaments) write identical beat kinds',
      b1.journal.length > 0 && kinds(b1) === kinds(b2),
    );
  }

  await app.close();

  // ── Postgres adapter routing (§6): DATABASE_URL picks the driver ──
  section('Postgres adapter routing (§6)');
  {
    const prev = process.env.DATABASE_URL;
    process.env.DATABASE_URL = 'postgres://user:pw@localhost:5432/blorse';
    const pgDb = createDb(); // the Pool connects lazily — construction alone proves the routing
    check('postgres:// routes to the node-postgres driver', pgDb instanceof NodePgDatabase);
    delete process.env.DATABASE_URL;
    const memDb = createDb();
    check('unset DATABASE_URL routes to embedded PGlite', memDb instanceof PgliteDatabase);
    if (prev === undefined) delete process.env.DATABASE_URL;
    else process.env.DATABASE_URL = prev;
  }

  process.exit(summarize());
}

main().catch((err: unknown) => {
  console.error(err);
  process.exit(1);
});
