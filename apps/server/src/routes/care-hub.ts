import type { FastifyInstance } from 'fastify';
import { SESSION_COOKIE } from '../auth/tokens.js';
import type { DB } from '../db/client.js';
import type { HerdRow } from '../db/schema.js';
import { getHerdForUser, resolveSessionUser } from '../services/auth.js';
import { cook, getCareState, groom } from '../services/care-hub.js';

async function herdFor(db: DB, cookie: string | undefined): Promise<HerdRow | null> {
  const user = await resolveSessionUser(db, cookie);
  if (!user) return null;
  return getHerdForUser(db, user.id);
}

/** The daily-care hub (§7): the morning cook + the evening groom — the cozy heartbeat. */
export function registerCareHubRoutes(app: FastifyInstance, db: DB): void {
  app.get('/care', async (req, reply) => {
    const herd = await herdFor(db, req.cookies[SESSION_COOKIE]);
    if (!herd) return reply.code(401).send({ error: 'unauthorized' });
    return reply.send(await getCareState(db, herd.id, Date.now()));
  });

  app.post('/care/cook', async (req, reply) => {
    const herd = await herdFor(db, req.cookies[SESSION_COOKIE]);
    if (!herd) return reply.code(401).send({ error: 'unauthorized' });
    const body = (req.body ?? {}) as { grains?: Record<string, number>; rares?: number };
    const result = await cook(db, herd.id, body.grains ?? {}, body.rares ?? 0, Date.now());
    if (!result.ok) {
      return reply.code(409).send({ error: result.message, code: result.code });
    }
    return reply.send(result);
  });

  app.post('/care/groom', async (req, reply) => {
    const herd = await herdFor(db, req.cookies[SESSION_COOKIE]);
    if (!herd) return reply.code(401).send({ error: 'unauthorized' });
    return reply.send(await groom(db, herd.id));
  });
}
