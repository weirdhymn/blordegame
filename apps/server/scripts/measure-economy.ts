/*
 * Real-economy measurement (§7) — simulate a realistic stable gathering + adventuring across a few
 * days and report actual Material / Cube accumulation, so we can see whether the per-horse daily
 * gather cap throttled raw-material inflation (and whether crafting is still trivial).
 *
 * Run from apps/server:  node --import ./scripts/register.mjs scripts/measure-economy.ts
 */
import { eq } from 'drizzle-orm';
import { DAILY_CUBES, GATHER_PER_HORSE_PER_DAY } from '@blorse/balance';
import { buildApp } from '../src/app.js';
import { RECIPES } from '../src/content/recipes.js';
import { createPgliteDb } from '../src/db/client.js';
import { runMigrations } from '../src/db/migrate.js';
import { herds } from '../src/db/schema.js';
import { adventure } from '../src/services/adventure.js';
import { chooseInRun, startRun } from '../src/services/adventure-run.js';
import { roam } from '../src/services/exploration.js';
import { listHerdHorses, mintHorse } from '../src/services/horse.js';
import { getInventory } from '../src/services/inventory.js';

const RAWS = ['timber', 'clay', 'plant-fiber', 'ore', 'marsh-sage'];
const BANK_IDS = new Set([
  'bank',
  'retreat',
  'turn-back',
  'turn-around',
  'skirt-home',
  'slip-back',
  'back-out',
  'back-edge',
  'slip-mist',
  'slip-out',
  'pass',
  'leave-glint',
  'leave-brass',
  'bank-glass',
  'leave-bloom',
  'bank-flies',
  'leave-queen',
  'leave-it',
  'head-home',
  'leave-queen',
]);

async function main(): Promise<void> {
  const db = createPgliteDb();
  await runMigrations(db);
  const app = buildApp(db, { rateLimitMax: 100_000, authRateLimitMax: 100_000, allowMint: true });
  await app.ready();
  const inject = (o: { method: string; url: string; payload?: unknown }) =>
    app.inject({ ...o, url: `/api${o.url}` } as never);

  const reg = await inject({
    method: 'POST',
    url: '/auth/register',
    payload: { username: 'measure', password: 'measure1horse' },
  });
  const herdId = (reg.json() as { herd: { id: string } }).herd.id;
  // a realistic mid-game stable: 5 adults (2 starters + 3 more)
  for (let i = 0; i < 3; i++) {
    await mintHorse(db, {
      herdId,
      genotype: { E: 'Ee', A: 'Aa' },
      origin: 'wild',
      lifeStage: 'adult',
    });
  }
  const adults = (await listHerdHorses(db, herdId)).filter((h) => h.lifeStage === 'adult');
  const party = adults.slice(0, 4).map((h) => h.id);
  const STABLE = adults.length;

  const cubesNow = async (): Promise<number> =>
    (await db.query.herds.findFirst({ where: eq(herds.id, herdId) }))?.cubes ?? 0;
  const matsNow = async (): Promise<number> => {
    const inv = (await getInventory(db, herdId)) as { id: string; qty: number }[];
    return inv.filter((s) => RAWS.includes(s.id)).reduce((a, s) => a + s.qty, 0);
  };

  // Push-deep auto-player: pick the first available NON-bank choice each scene until the run ends
  // (a deep reward, or a skirmish that ends the run after banking the journey loot — left unfought,
  // so adventuring Cubes here are CONSERVATIVE: battle rewards are excluded).
  async function playStory(seed: number): Promise<void> {
    const run = await startRun(db, herdId, 'green-grass', party, { seed });
    if (!run.ok) return;
    let scene = run.scene;
    const runId = run.runId;
    for (let step = 0; step < 8; step++) {
      const avail = scene.choices.filter((c) => c.available);
      if (avail.length === 0) break;
      const choice = avail.find((c) => !BANK_IDS.has(c.id)) ?? avail[0]!;
      const res = await chooseInRun(db, herdId, runId, choice.id);
      if (!res.ok || res.ended) break;
      scene = res.scene;
    }
  }

  const DAY = 86_400_000;
  const D0 = Date.UTC(2026, 0, 1, 12);
  const ADV_PER_DAY = 4;
  let seed = 1000;

  console.log(`\n=== BLORSE economy measurement ===`);
  console.log(
    `Stable: ${STABLE} adults · cap: ${GATHER_PER_HORSE_PER_DAY} gather/horse/day · adventures/day: ${ADV_PER_DAY}\n`,
  );

  let totGatherMats = 0;
  let totAdvMats = 0;
  let totCubes = 0;
  const startCubes = await cubesNow();

  for (let d = 0; d < 3; d++) {
    const now = D0 + d * DAY;
    // (1) the daily gather
    const m0 = await matsNow();
    const g = await roam(db, herdId, 'green-grass', now, seed++);
    const gMats = (await matsNow()) - m0;
    totGatherMats += gMats;
    // (2) adventuring (grindable)
    const a0 = await matsNow();
    for (let a = 0; a < ADV_PER_DAY; a++) await playStory(seed++);
    const aMats = (await matsNow()) - a0;
    totAdvMats += aMats;
    // (3) daily rollover Cubes (no autonomy jobs assigned → just the stipend)
    await db
      .update(herds)
      .set({ cubes: (await cubesNow()) + DAILY_CUBES })
      .where(eq(herds.id, herdId));

    const horsesGathered = g.ok ? g.horsesGathered : 0;
    console.log(
      `Day ${d + 1}: gather ${horsesGathered} horses → +${gMats} raw mats | ${ADV_PER_DAY} adventures → +${aMats} raw mats | rollover +${DAILY_CUBES} cubes`,
    );
  }

  totCubes = (await cubesNow()) - startCubes;
  const totalMats = totGatherMats + totAdvMats;
  console.log(`\n--- 3-day totals ---`);
  console.log(`Raw materials from GATHERING:   ${totGatherMats}  (the capped source)`);
  console.log(`Raw materials from ADVENTURING: ${totAdvMats}  (grindable; should be the minority)`);
  console.log(`Raw materials TOTAL:            ${totalMats}  (~${(totalMats / 3).toFixed(1)}/day)`);
  console.log(`Cubes accrued (3 days):         ${totCubes}`);

  // final inventory by raw type
  const inv = (await getInventory(db, herdId)) as { id: string; qty: number }[];
  const byType = RAWS.map((r) => `${r}:${inv.find((s) => s.id === r)?.qty ?? 0}`).join('  ');
  console.log(`Final raw inventory:            ${byType}`);

  // crafting affordability: cheapest product is ~5-7 raws; how many products could 3 days fund?
  const productCost = (id: string): number => {
    const r = RECIPES.find((x) => x.id === id);
    return r ? r.inputs.reduce((a, i) => a + (RAWS.includes(i.id) ? i.qty : i.qty * 2), 0) : 0;
  };
  console.log(`\n--- crafting affordability (raws per product) ---`);
  for (const id of ['plank', 'brick', 'paper', 'ingot', 'book', 'tool', 'board-game']) {
    console.log(
      `  ${id}: ~${productCost(id)} raws  → 3-day haul funds ~${Math.floor(totalMats / Math.max(1, productCost(id)))}`,
    );
  }

  // one dice-adventure sample (the legacy path, now Cube-leaning)
  const dice = await adventure(db, herdId, 'green-grass', party, { seed: 7 });
  if (dice.ok) {
    const dMats = dice.loot.filter((l) => RAWS.includes(l.id)).reduce((a, l) => a + l.qty, 0);
    console.log(
      `\nDice-adventure sample: ${dice.successes} wins → ${dMats} raw mats + ${dice.cubes} cubes`,
    );
  }

  await app.close();
}

void main();
