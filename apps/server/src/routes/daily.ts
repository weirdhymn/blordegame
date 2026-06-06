import type { FastifyInstance } from 'fastify';
import { SESSION_COOKIE } from '../auth/tokens.js';
import type { DB } from '../db/client.js';
import type { HerdRow } from '../db/schema.js';
import { getHerdForUser, resolveSessionUser } from '../services/auth.js';
import { careForHorse, type CareAction } from '../services/care.js';
import { advanceHerd } from '../services/daily.js';
import { getFieldGuide } from '../services/fieldguide.js';

async function herdFor(db: DB, cookie: string | undefined): Promise<HerdRow | null> {
  const user = await resolveSessionUser(db, cookie);
  if (!user) return null;
  return getHerdForUser(db, user.id);
}

export function registerDailyRoutes(
  app: FastifyInstance,
  db: DB,
  cfg: { allowDevTools: boolean },
): void {
  // Manual check-in (reveal foals + accrue daily Cubes). Login does this automatically.
  app.post('/daily', async (req, reply) => {
    const herd = await herdFor(db, req.cookies[SESSION_COOKIE]);
    if (!herd) return reply.code(401).send({ error: 'unauthorized' });
    return reply.send(await advanceHerd(db, herd.id, Date.now()));
  });

  // Dev-only: fast-forward the herd's clock to exercise the daily tick / autonomy without
  // waiting real days (journal beats, relationships, clubs, job income). Off in production.
  app.post('/daily/simulate', async (req, reply) => {
    if (!cfg.allowDevTools) {
      return reply.code(403).send({ error: 'dev tools are disabled', code: 'dev_disabled' });
    }
    const herd = await herdFor(db, req.cookies[SESSION_COOKIE]);
    if (!herd) return reply.code(401).send({ error: 'unauthorized' });
    const days = Math.max(1, Math.min(30, Math.floor((req.body as { days?: number })?.days ?? 1)));
    return reply.send(await advanceHerd(db, herd.id, Date.now() + days * 86_400_000));
  });

  app.get('/field-guide', async (req, reply) => {
    const herd = await herdFor(db, req.cookies[SESSION_COOKIE]);
    if (!herd) return reply.code(401).send({ error: 'unauthorized' });
    return reply.send(await getFieldGuide(db, herd.id));
  });

  app.post('/horses/:id/care', async (req, reply) => {
    const herd = await herdFor(db, req.cookies[SESSION_COOKIE]);
    if (!herd) return reply.code(401).send({ error: 'unauthorized' });
    const { id } = req.params as { id: string };
    const raw = (req.body as { action?: string } | undefined)?.action;
    const action: CareAction = raw === 'feed' ? 'feed' : 'groom';
    const result = await careForHorse(db, herd.id, id, action, Date.now());
    if (!result.ok) {
      const status = result.code === 'not_found' ? 404 : result.code === 'not_owned' ? 403 : 409;
      return reply.code(status).send({ error: result.message, code: result.code });
    }
    return reply.send(result);
  });
}
