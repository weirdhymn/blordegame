/*
 * Progression pacing projection — price the Herd-Tier costs against REAL income, accounting for
 * income growing as the herd tiers up (more horses -> more jobs + more/bigger adventures). Anchored
 * to the measured ~138 Cubes/day mid-game baseline + the actual balance constants.
 *   node --import ./scripts/register.mjs scripts/project-progression.ts
 */
import { DAILY_CUBES, JOB_CUBES_BASE } from '@blorse/balance';

// The approved ladder (caps + job slots per tier). avgLvl = the herd's average job-skill level after
// the weeks of play it takes to reach that tier (jobs pay JOB_CUBES_BASE + level*2).
const TIERS = [
  { tier: 1, name: 'Smallholding', herdCap: 6, jobs: 2, avgLvl: 1 },
  { tier: 2, name: 'Working Farm', herdCap: 10, jobs: 3, avgLvl: 2 },
  { tier: 3, name: 'Ranch', herdCap: 15, jobs: 4, avgLvl: 4 },
  { tier: 4, name: 'Estate', herdCap: 22, jobs: 5, avgLvl: 6 },
  { tier: 5, name: 'Dynasty', herdCap: 30, jobs: 6, avgLvl: 8 },
];

// Measured: ~88 Cubes/day from adventuring at a ~6-horse herd, 4 runs/day (the 138/day measurement
// minus the 50 stipend). Adventuring scales with herd size (bigger/more parties, more wild recruits)
// but SUB-linearly — player time caps how many runs/day — and we cap the multiplier at 2.4x.
const ADV_BASE = 88;
const JOB_SUCCESS = 0.85; // success/crit-weighted fraction of the nominal job payout

function income(t: (typeof TIERS)[number]): {
  stipend: number;
  jobs: number;
  adv: number;
  total: number;
} {
  const stipend = DAILY_CUBES;
  const jobs = t.jobs * (JOB_CUBES_BASE + t.avgLvl * 2) * JOB_SUCCESS;
  const adv = ADV_BASE * Math.min(2.4, Math.pow(t.herdCap / 6, 0.6));
  return { stipend, jobs, adv, total: Math.round(stipend + jobs + adv) };
}

function project(costs: number[]): void {
  // costs[i] = Cubes to go from tier (i+1) -> (i+2); you earn at your CURRENT tier's income.
  console.log(`\n## cost set: ${costs.join(' / ')}  (total ${costs.reduce((a, b) => a + b, 0)} ⬡)`);
  console.log('  tier              income/day   cost     days     cumulative');
  let cum = 0;
  for (let i = 0; i < costs.length; i++) {
    const from = TIERS[i]!;
    const inc = income(from);
    const days = costs[i]! / inc.total;
    cum += days;
    console.log(
      `  T${from.tier} ${from.name.padEnd(13)} ${String(inc.total).padStart(4)}/day   ` +
        `${String(costs[i]).padStart(5)}    ${days.toFixed(1).padStart(4)}d    ${cum.toFixed(1).padStart(5)}d (to T${from.tier + 1})`,
    );
  }
}

console.log('=== Herd-Tier progression pacing (income grows as you climb) ===');
console.log('\nIncome model per tier (stipend + jobs + adventuring):');
for (const t of TIERS) {
  const inc = income(t);
  console.log(
    `  T${t.tier} ${t.name.padEnd(13)} cap ${String(t.herdCap).padStart(2)}  jobs ${t.jobs}  ` +
      `-> stipend ${inc.stipend} + jobs ${Math.round(inc.jobs)} + adv ${Math.round(inc.adv)} = ${inc.total}/day`,
  );
}

// A) the original feel-based proposal (expect a wall at the top)
project([400, 1200, 3000, 7000]);
// B) gentle, income-tracked
project([650, 1250, 2100, 3600]);
// C) round numbers, slightly longer endgame
project([600, 1500, 2800, 5000]);
