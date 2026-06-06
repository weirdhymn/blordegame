import { defineConfig } from 'drizzle-kit';

// `pnpm --filter @blorse/server db:generate` emits SQL migrations into ./drizzle
// from the schema. Generation is offline (no DB connection needed). Postgres
// dialect — runs on both PGlite (dev/test) and real Postgres (prod).
export default defineConfig({
  schema: './src/db/schema.ts',
  out: './drizzle',
  dialect: 'postgresql',
});
