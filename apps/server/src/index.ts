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
  allowDebug: !isProd, // admin debug toolkit (POST /api/debug/*) — local only, never in production
  // Pino request/error logging in prod (platform log drains read JSON); quiet in dev/tests.
  logger: isProd ? { level: process.env.LOG_LEVEL ?? 'info' } : false,
});
const port = Number(process.env.PORT ?? 3001);

// Graceful shutdown (audit P2): drain in-flight requests on a deploy's SIGTERM/SIGINT
// instead of hard-dropping them.
for (const signal of ['SIGTERM', 'SIGINT'] as const) {
  process.on(signal, () => {
    void app.close().then(() => process.exit(0));
  });
}

app
  .listen({ port, host: '0.0.0.0' })
  .then((address) => {
    console.log(`blorse server listening at ${address}`);
  })
  .catch((err: unknown) => {
    console.error(err);
    process.exit(1);
  });
