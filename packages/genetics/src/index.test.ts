import { describe, expect, it } from 'vitest';
import { PACKAGE_NAME } from './index.js';

// Phase 0 smoke test — proves the test runner + TS resolution are wired up.
// The real safety net (the vendored engine's ~340 tests) arrives in Phase 1.
describe('@blorse/genetics scaffold', () => {
  it('exposes a package marker', () => {
    expect(PACKAGE_NAME).toBe('@blorse/genetics');
  });
});
