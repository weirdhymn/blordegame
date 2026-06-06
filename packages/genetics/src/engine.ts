import { addedWindow } from './window-shim.js'; // FIRST: provides `window` for the engine
import '../vendor/data.js'; // sets window.HORSE_DATA
import '../vendor/genetics.js'; // reads window.HORSE_DATA, sets window.HorseGenetics
import type { RawEngine } from './types.js';

const g = globalThis as unknown as Record<string, unknown>;
const win = g.window as { HorseGenetics?: RawEngine } | undefined;
const captured = win?.HorseGenetics;

// The engine has now captured HORSE_DATA in a closure and never reads `window` again,
// so remove the transient global we added — leaving Node's environment pristine.
if (addedWindow) delete g.window;

if (!captured) {
  throw new Error(
    '@blorse/genetics: the vendored engine did not initialize (window.HorseGenetics is missing). ' +
      'Expected vendor/data.js then vendor/genetics.js to have run.',
  );
}

const engine: RawEngine = captured;
export default engine;
