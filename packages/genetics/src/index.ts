/**
 * @blorse/genetics — typed facade over the vendored equine-genetics engine.
 *
 * Phase 0 (scaffold): intentionally empty.
 * Phase 1 vendors `genetics.js` + `data.js` into `./vendor/` essentially
 * untouched, brings the ~340-test suite across (kept green), and re-exports a
 * typed `resolve` / `breedFoal` / `randomGenotype` / ... API here.
 *
 * The engine is sacred — wrap it, never refactor its internals (BLORSE_PLAN.md §5.1,
 * CLAUDE.md "Golden rules").
 */
export const PACKAGE_NAME = '@blorse/genetics';
