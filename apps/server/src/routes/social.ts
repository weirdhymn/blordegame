import type { FastifyInstance } from 'fastify';
import { SESSION_COOKIE } from '../auth/tokens.js';
import type { DB } from '../db/client.js';
import type { HerdRow } from '../db/schema.js';
import { getClubs, getRelationships } from '../services/autonomy.js';
import { getHerdForUser, resolveSessionUser } from '../services/auth.js';
import { getJournal } from '../services/journal.js';

async function herdFor(db: DB, cookie: string | undefined): Promise<HerdRow | null> {
  const user = await resolveSessionUser(db, cookie);
  if (!user) return null;
  return getHerdForUser(db, user.id);
}

export function registerSocialRoutes(app: FastifyInstance, db: DB): void {
  // The journal — "here's what your herd did while you were away" (§8).
  app.get('/journal', async (req, reply) => {
    const herd = await herdFor(db, req.cookies[SESSION_COOKIE]);
    if (!herd) return reply.code(401).send({ error: 'unauthorized' });
    return reply.send(await getJournal(db, herd.id));
  });

  app.get('/clubs', async (req, reply) => {
    const herd = await herdFor(db, req.cookies[SESSION_COOKIE]);
    if (!herd) return reply.code(401).send({ error: 'unauthorized' });
    return reply.send(await getClubs(db, herd.id));
  });

  app.get('/relationships', async (req, reply) => {
    const herd = await herdFor(db, req.cookies[SESSION_COOKIE]);
    if (!herd) return reply.code(401).send({ error: 'unauthorized' });
    return reply.send(await getRelationships(db, herd.id));
  });
}
