import type { FastifyInstance } from 'fastify';
import { SESSION_COOKIE } from '../auth/tokens.js';
import type { DB } from '../db/client.js';
import { getStudbook } from '../services/studbook.js';
import { herdFor } from './util.js';

/** The Studbook (§7m) — read-only: goals fulfill themselves at the coat reveal (show,
 *  don't tell); the Morning Post announces them. This just opens the book. */
export function registerStudbookRoutes(app: FastifyInstance, db: DB): void {
  app.get('/studbook', async (req, reply) => {
    const herd = await herdFor(db, req.cookies[SESSION_COOKIE]);
    if (!herd) return reply.code(401).send({ error: 'unauthorized' });
    return reply.send(await getStudbook(db, herd.id));
  });
}
