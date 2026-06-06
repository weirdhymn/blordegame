import cookie from '@fastify/cookie';
import Fastify, { type FastifyInstance } from 'fastify';
import type { DB } from './db/client.js';
import { registerAdventureRoutes } from './routes/adventure.js';
import { registerAuthRoutes } from './routes/auth.js';
import { registerBreedingRoutes } from './routes/breeding.js';
import { registerDailyRoutes } from './routes/daily.js';
import { registerExplorationRoutes } from './routes/exploration.js';
import { registerHorseRoutes } from './routes/horses.js';
import { registerPastureRoutes } from './routes/pasture.js';

/** Build a Fastify instance bound to a DB. Pure factory — tests drive it via inject(). */
export function buildApp(db: DB): FastifyInstance {
  const app = Fastify({ logger: false });
  app.register(cookie);

  app.get('/health', () => ({ status: 'ok' }));

  registerAuthRoutes(app, db);
  registerHorseRoutes(app, db);
  registerBreedingRoutes(app, db);
  registerExplorationRoutes(app, db);
  registerDailyRoutes(app, db);
  registerPastureRoutes(app, db);
  registerAdventureRoutes(app, db);

  return app;
}
