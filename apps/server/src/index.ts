import { buildApp } from './app.js';
import { createDb } from './db/client.js';
import { runMigrations } from './db/migrate.js';

const db = createDb();
await runMigrations(db);

const app = buildApp(db);
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
