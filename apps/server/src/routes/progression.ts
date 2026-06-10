import type { FastifyInstance } from 'fastify';
import { SESSION_COOKIE } from '../auth/tokens.js';
import type { DB } from '../db/client.js';
import { getProgression, upgradeHerd } from '../services/progression.js';
import { herdFor } from './util.js';

/** The Herd-Tier progression spine (§7): the Cubes sink + milestone-gated upgrade ladder. */
export function registerProgressionRoutes(app: FastifyInstance, db: DB): void {
  app.get('/progression', async (req, reply) => {
    const herd = await herdFor(db, req.cookies[SESSION_COOKIE]);
    if (!herd) return reply.code(401).send({ error: 'unauthorized' });
    return reply.send(await getProgression(db, herd.id));
  });

  app.post('/progression/upgrade', async (req, reply) => {
    const herd = await herdFor(db, req.cookies[SESSION_COOKIE]);
    if (!herd) return reply.code(401).send({ error: 'unauthorized' });
    const result = await upgradeHerd(db, herd.id);
    if (!result.ok) {
      const status = result.code === 'cant_afford' ? 402 : 409;
      return reply
        .code(status)
        .send({ error: result.message, code: result.code, gates: result.gates });
    }
    return reply.send(result);
  });
}
