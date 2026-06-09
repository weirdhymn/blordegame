import type { FastifyInstance } from 'fastify';
import { SESSION_COOKIE } from '../auth/tokens.js';
import type { DB } from '../db/client.js';
import type { HerdRow } from '../db/schema.js';
import { getHerdForUser, resolveSessionUser } from '../services/auth.js';
import { advanceHerd } from '../services/daily.js';
import { getFieldGuide } from '../services/fieldguide.js';

async function herdFor(db: DB, cookie: string | undefined): Promise<HerdRow | null> {
  const user = await resolveSessionUser(db, cookie);
  if (!user) return null;
  return getHerdForUser(db, user.id);
}

export function registerDailyRoutes(app: FastifyInstance, db: DB): void {
  // Manual check-in (reveal foals + accrue daily Cubes). Login does this automatically.
  // Fast-forwarding the clock now lives in the admin debug toolkit (POST /api/debug/advance-days).
  app.post('/daily', async (req, reply) => {
    const herd = await herdFor(db, req.cookies[SESSION_COOKIE]);
    if (!herd) return reply.code(401).send({ error: 'unauthorized' });
    return reply.send(await advanceHerd(db, herd.id, Date.now()));
  });

  app.get('/field-guide', async (req, reply) => {
    const herd = await herdFor(db, req.cookies[SESSION_COOKIE]);
    if (!herd) return reply.code(401).send({ error: 'unauthorized' });
    return reply.send(await getFieldGuide(db, herd.id));
  });
}
