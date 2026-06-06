import cookie from '@fastify/cookie';
import rateLimit from '@fastify/rate-limit';
import Fastify, { type FastifyError, type FastifyInstance } from 'fastify';
import { SESSION_COOKIE } from './auth/tokens.js';
import type { DB } from './db/client.js';
import { registerAdventureRoutes } from './routes/adventure.js';
import { registerAuthRoutes } from './routes/auth.js';
import { registerEconomyRoutes } from './routes/economy.js';
import { registerBreedingRoutes } from './routes/breeding.js';
import { registerDailyRoutes } from './routes/daily.js';
import { registerExplorationRoutes } from './routes/exploration.js';
import { registerHorseRoutes } from './routes/horses.js';
import { registerModerationRoutes } from './routes/moderation.js';
import { registerPastureRoutes } from './routes/pasture.js';
import { registerSocialRoutes } from './routes/social.js';
import { resolveSessionUser } from './services/auth.js';

export interface AppOptions {
  /** Global per-IP request ceiling per minute (§11). Tests that aren't exercising the
   *  limiter pass a high value so a fast burst of inject() calls isn't throttled. */
  rateLimitMax?: number;
}

/** Build a Fastify instance bound to a DB. Pure factory — tests drive it via inject(). */
export function buildApp(db: DB, opts: AppOptions = {}): FastifyInstance {
  const app = Fastify({ logger: false });
  app.register(cookie);
  // Anti-abuse rate limiting (§11). Generous global ceiling; sensitive routes set
  // a tighter per-route `config.rateLimit`. Keyed by client IP, in-memory store.
  app.register(rateLimit, { global: true, max: opts.rateLimitMax ?? 600, timeWindow: '1 minute' });

  // Consistent JSON error envelopes (§11) so the client never sees a raw stack.
  app.setErrorHandler((err: FastifyError, _req, reply) => {
    const status = err.statusCode && err.statusCode >= 400 ? err.statusCode : 500;
    const message = status >= 500 ? 'internal server error' : (err.message ?? 'error');
    reply.code(status).send({ error: message, code: err.code });
  });
  app.setNotFoundHandler((_req, reply) => {
    reply.code(404).send({ error: 'not found', code: 'not_found' });
  });

  // Moderation freeze (§11): a frozen account may read, but every state-changing
  // request (non-GET, outside /auth) is refused. Centralised so no route can forget it.
  app.addHook('preHandler', async (req, reply) => {
    if (req.method === 'GET' || req.method === 'HEAD' || req.method === 'OPTIONS') return;
    if (req.url.startsWith('/auth/')) return;
    const user = await resolveSessionUser(db, req.cookies[SESSION_COOKIE]);
    if (user?.frozen) {
      return reply.code(403).send({ error: 'account frozen', code: 'frozen' });
    }
  });

  app.get('/health', () => ({ status: 'ok' }));

  // Routes live in a child plugin registered AFTER rate-limit so that avvio loads the
  // limiter first — its `onRoute` listener must be attached before these routes are
  // added, or per-route `config.rateLimit` (e.g. /report) is silently ignored.
  app.register(async (instance) => {
    registerAuthRoutes(instance, db);
    registerHorseRoutes(instance, db);
    registerBreedingRoutes(instance, db);
    registerExplorationRoutes(instance, db);
    registerDailyRoutes(instance, db);
    registerPastureRoutes(instance, db);
    registerAdventureRoutes(instance, db);
    registerSocialRoutes(instance, db);
    registerEconomyRoutes(instance, db);
    registerModerationRoutes(instance, db);
  });

  return app;
}
