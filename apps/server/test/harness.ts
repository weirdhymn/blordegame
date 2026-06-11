/**
 * The shared acceptance-test harness (§11): pass/fail counters, assertions, and SECTION labels so
 * a failure localizes by phase name instead of a line number in a 3,000-line script. The suite
 * stays one sequential PGlite run by design (the WASM init is incompatible with node:test).
 */
import type { FastifyInstance } from 'fastify';

let pass = 0;
let fail = 0;
let current = '(start)';
const failedSections = new Map<string, number>();

/** Label the phase the following checks belong to — failures print as "✗ [section] desc". */
export function section(name: string): void {
  current = name;
}

export function check(desc: string, cond: boolean): void {
  if (cond) pass++;
  else {
    fail++;
    failedSections.set(current, (failedSections.get(current) ?? 0) + 1);
    console.error(`  ✗ [${current}] ${desc}`);
  }
}

export function eq<T>(desc: string, actual: T, expected: T): void {
  check(
    `${desc} (expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)})`,
    actual === expected,
  );
}

export type InjectResult = Awaited<ReturnType<FastifyInstance['inject']>>;
export function cookieOf(res: InjectResult): string {
  const c = res.cookies.find((x) => x.name === 'blorse_session');
  return c ? `blorse_session=${c.value}` : '';
}

/** Print the tally (+ which sections failed) and return the process exit code. */
export function summarize(): number {
  console.log(
    `\n=== BLORSE server tests ===\npassed: ${pass}   failed: ${fail}   total: ${pass + fail}`,
  );
  if (fail > 0) {
    for (const [s, n] of failedSections) console.error(`  ${n} failing in: ${s}`);
  }
  return fail === 0 ? 0 : 1;
}
