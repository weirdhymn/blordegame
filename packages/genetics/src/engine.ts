import './window-shim.js'; // MUST be first: aliases `window` before the engine loads.
import '../vendor/data.js'; // sets window.HORSE_DATA
import '../vendor/genetics.js'; // reads window.HORSE_DATA, sets window.HorseGenetics
import type { RawEngine } from './types.js';

const globalRecord = globalThis as unknown as Record<string, unknown>;
const win = globalRecord.window as { HorseGenetics?: RawEngine } | undefined;
const loaded = win?.HorseGenetics;

if (!loaded) {
  throw new Error(
    '@blorse/genetics: the vendored engine did not initialize (window.HorseGenetics is missing). ' +
      'Expected vendor/data.js then vendor/genetics.js to have run.',
  );
}

const engine: RawEngine = loaded;
export default engine;
