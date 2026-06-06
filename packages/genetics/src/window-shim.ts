// The vendored engine (vendor/data.js, vendor/genetics.js) attaches to a global
// `window` (it predates ESM; it ran under file://). In Node / Vitest there is no
// `window`, so alias it to `globalThis` BEFORE those modules evaluate. This module
// is imported first by engine.ts so the alias is in place when the engine loads.
//
// The engine is never modified — we shim around it (BLORSE_PLAN.md §5.1).

// Accessed untyped so we don't collide with the `window` shape TypeScript infers
// from the vendored JS (allowJs).
const globalRecord = globalThis as unknown as Record<string, unknown>;
if (globalRecord.window === undefined) {
  globalRecord.window = globalThis;
}

export {};
