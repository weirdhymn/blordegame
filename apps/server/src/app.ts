import cookie from '@fastify/cookie';
import rateLimit from '@fastify/rate-limit';
import fastifyStatic from '@fastify/static';
import Fastify, { type FastifyError, type FastifyInstance } from 'fastify';
import { SESSION_COOKIE } from './auth/tokens.js';
import type { DB } from './db/client.js';
import { registerAdventureRoutes } from './routes/adventure.js';
import { registerAuthRoutes, type AuthConfig } from './routes/auth.js';
import { registerCareHubRoutes } from './routes/care-hub.js';
import { registerCombatRoutes } from './routes/combat.js';
import { registerEconomyRoutes } from './routes/economy.js';
import { registerBreedingRoutes } from './routes/breeding.js';
import { registerDailyRoutes } from './routes/daily.js';
import { registerDebugRoutes } from './routes/debug.js';
import { registerExplorationRoutes } from './routes/exploration.js';
import { registerGardenRoutes } from './routes/garden.js';
import { registerHorseRoutes } from './routes/horses.js';
import { registerModerationRoutes } from './routes/moderation.js';
import { registerPastureRoutes } from './routes/pasture.js';
import { registerProgressionRoutes } from './routes/progression.js';
import { registerShrineRoutes } from './routes/shrine.js';
import { registerSocialRoutes } from './routes/social.js';
import { registerStudbookRoutes } from './routes/studbook.js';
import { resolveSessionUser } from './services/auth.js';

export interface AppOptions {
  /** Global per-IP request ceiling per minute (§11). Tests pass a high value so a fast
   *  burst of inject() calls isn't throttled. */
  rateLimitMax?: number;
  /** Tight per-IP cap on /api/auth/login + /register per minute (default 8). */
  authRateLimitMax?: number;
  /** Require a valid invite code at registration (default false → open signups). */
  requireInvite?: boolean;
  /** Accepted invite codes — a wave is one code. */
  inviteCodes?: string[];
  /** Allow any authed user to mint via POST /horses (default false → admin-only). */
  allowMint?: boolean;
  /** Set the Secure flag on the session cookie (prod over HTTPS). */
  secureCookie?: boolean;
  /** Trust X-Forwarded-* headers — true behind a platform proxy (Fly) so rate-limit keys on
   *  the real client IP, not the proxy. */
  trustProxy?: boolean;
  /** Absolute path to the built web client (apps/web/dist). When set, the server serves it
   *  same-origin with an SPA fallback. Unset (tests/dev) → API only. */
  webDir?: string;
  /** Mount the admin debug toolkit (POST /api/debug/*, time control, inspect, reset). Default
   *  false; index.ts enables it outside production. Even when on, every debug route additionally
   *  requires role 'admin' — so a non-admin gets 403 and a prod build 404 (routes unmounted). */
  allowDebug?: boolean;
}

/** Build a Fastify instance bound to a DB. Pure factory — tests drive it via inject(). */
export function buildApp(db: DB, opts: AppOptions = {}): FastifyInstance {
  const cfg = {
    rateLimitMax: opts.rateLimitMax ?? 600,
    authRateLimitMax: opts.authRateLimitMax ?? 8,
    requireInvite: opts.requireInvite ?? false,
    inviteCodes: opts.inviteCodes ?? [],
    allowMint: opts.allowMint ?? false,
    secureCookie: opts.secureCookie ?? false,
    trustProxy: opts.trustProxy ?? false,
    webDir: opts.webDir,
    allowDebug: opts.allowDebug ?? false,
  };

  const app = Fastify({ logger: false, trustProxy: cfg.trustProxy });
  app.register(cookie);
  // Anti-abuse rate limiting (§11). Generous global ceiling; sensitive routes set a tighter
  // per-route `config.rateLimit`. Keyed by client IP (real IP when trustProxy is on).
  app.register(rateLimit, { global: true, max: cfg.rateLimitMax, timeWindow: '1 minute' });

  // Consistent JSON error envelopes (§11) so the client never sees a raw stack.
  app.setErrorHandler((err: FastifyError, _req, reply) => {
    const status = err.statusCode && err.statusCode >= 400 ? err.statusCode : 500;
    const message = status >= 500 ? 'internal server error' : (err.message ?? 'error');
    // Schema-validation failures (routes/schemas.ts) read as a plain bad_request, not FST_ERR_*.
    const code = err.code === 'FST_ERR_VALIDATION' ? 'bad_request' : err.code;
    reply.code(status).send({ error: message, code });
  });
  // SPA fallback (prod): serve index.html for browser navigations to client routes (deep
  // links / refresh); everything else stays a 404 JSON. Off when no web build is served.
  app.setNotFoundHandler((req, reply) => {
    if (cfg.webDir && req.method === 'GET' && (req.headers.accept ?? '').includes('text/html')) {
      return reply.sendFile('index.html');
    }
    return reply.code(404).send({ error: 'not found', code: 'not_found' });
  });

  // Moderation freeze (§11): a frozen account may read, but every state-changing request
  // (non-GET, outside /api/auth) is refused. Centralised so no route can forget it.
  app.addHook('preHandler', async (req, reply) => {
    if (req.method === 'GET' || req.method === 'HEAD' || req.method === 'OPTIONS') return;
    if (req.url.startsWith('/api/auth/')) return;
    const user = await resolveSessionUser(db, req.cookies[SESSION_COOKIE]);
    if (user?.frozen) {
      return reply.code(403).send({ error: 'account frozen', code: 'frozen' });
    }
  });

  // Health stays at the root for the platform/Docker healthcheck (no prefix, no auth).
  app.get('/health', () => ({ status: 'ok' }));

  // Same-origin static serving of the built client (prod). wildcard:false → unmatched paths
  // fall through to the SPA notFound handler above.
  if (cfg.webDir) {
    app.register(fastifyStatic, { root: cfg.webDir, wildcard: false });
  }

  const authCfg: AuthConfig = {
    requireInvite: cfg.requireInvite,
    inviteCodes: cfg.inviteCodes,
    secureCookie: cfg.secureCookie,
    authRateLimitMax: cfg.authRateLimitMax,
  };

  // API under /api so client routes (/, /horses/:id, /breed, …) never collide with endpoints.
  // Registered AFTER rate-limit so per-route `config.rateLimit` is honoured (the avvio
  // onRoute-ordering fix, §11).
  app.register(
    async (instance) => {
      registerAuthRoutes(instance, db, authCfg);
      registerHorseRoutes(instance, db, { allowMint: cfg.allowMint });
      registerBreedingRoutes(instance, db);
      registerExplorationRoutes(instance, db);
      registerDailyRoutes(instance, db);
      registerPastureRoutes(instance, db);
      registerProgressionRoutes(instance, db);
      registerCareHubRoutes(instance, db);
      registerGardenRoutes(instance, db);
      registerShrineRoutes(instance, db);
      registerStudbookRoutes(instance, db);
      registerAdventureRoutes(instance, db);
      registerCombatRoutes(instance, db);
      registerSocialRoutes(instance, db);
      registerEconomyRoutes(instance, db);
      registerModerationRoutes(instance, db);
      // Admin debug toolkit — mounted only on dev instances (prod ⇒ routes 404). Each route
      // still requires an admin. Consolidates the old /daily/simulate dev affordance.
      if (cfg.allowDebug) registerDebugRoutes(instance, db);
    },
    { prefix: '/api' },
  );

  return app;
}
