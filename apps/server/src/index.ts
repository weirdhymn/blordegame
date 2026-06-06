import { buildApp } from './app.js';
import { createDb } from './db/client.js';
import { runMigrations } from './db/migrate.js';

const db = createDb();
await runMigrations(db);

const isProd = process.env.NODE_ENV === 'production';
const app = buildApp(db, {
  webDir: process.env.WEB_DIR, // serve the built client same-origin when set
  secureCookie: isProd,
  trustProxy: process.env.TRUST_PROXY === 'true',
  // Closed-by-default in prod: no INVITE_CODES ⇒ no signups. Open a wave by setting it.
  requireInvite: isProd,
  inviteCodes: (process.env.INVITE_CODES ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean),
  allowMint: process.env.ALLOW_MINT === 'true', // default false ⇒ admin-only
});
const port = Number(process.env.PORT ?? 3001);

app
  .listen({ port, host: '0.0.0.0' })
  .then((address) => {
    console.log(`blorse server listening at ${address}`);
  })
  .catch((err: unknown) => {
    console.error(err);
    process.exit(1);
  });
