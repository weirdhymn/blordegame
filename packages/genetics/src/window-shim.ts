// The vendored engine (vendor/data.js, vendor/genetics.js) attaches its tables to a
// global `window` (it predates ESM; it ran under file://). Node has none, so we add
// one here — but only as a TRANSIENT namespace: engine.ts removes it again as soon as
// it has captured the engine, so we don't leave a `window` lying around that makes
// environment-sniffing libraries (e.g. PGlite, which treats `typeof window` as the
// browser signal) mistake Node for a browser. In a real browser, `window` already
// exists and we touch nothing. The engine is never modified (BLORSE_PLAN.md §5.1).
const g = globalThis as unknown as Record<string, unknown>;

/** True if WE created the global `window` (Node) — engine.ts then removes it again. */
export const addedWindow = typeof g.window === 'undefined';
if (addedWindow) g.window = {};
