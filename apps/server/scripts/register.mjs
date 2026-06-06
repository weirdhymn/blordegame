import { register } from 'node:module';

// Activate the resolve-only loader via `node --import ./scripts/register.mjs`.
register('./ts-resolve.mjs', import.meta.url);
