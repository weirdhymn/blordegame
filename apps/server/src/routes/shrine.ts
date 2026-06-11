import { randomInt } from 'node:crypto';
import type { FastifyInstance } from 'fastify';
import { SESSION_COOKIE } from '../auth/tokens.js';
import type { DB } from '../db/client.js';
import { induceGlitch, patchGlitch } from '../services/shrine.js';
import { mulberry32 } from '../util/rng.js';
import { bodySchema, id } from './schemas.js';
import { herdFor } from './util.js';

/** The Debug Shrine (§7l) — offer fairy dust to introduce a server-rolled glitch, or file a
 *  bug report (Cubes) to clear one. The kind is never client-chosen. */
export function registerShrineRoutes(app: FastifyInstance, db: DB): void {
  app.post('/shrine/glitch', bodySchema({ horseId: id }, ['horseId']), async (req, reply) => {
    const herd = await herdFor(db, req.cookies[SESSION_COOKIE]);
    if (!herd) return reply.code(401).send({ error: 'unauthorized' });
    const body = req.body as { horseId: string };
    const r = await induceGlitch(db, herd.id, body.horseId, mulberry32(randomInt(1, 2 ** 31)));
    if (!r.ok) {
      const status = r.code === 'not_found' ? 404 : r.code === 'cant_afford' ? 402 : 409;
      return reply.code(status).send(r);
    }
    return reply.send(r);
  });

  app.post('/shrine/patch', bodySchema({ horseId: id }, ['horseId']), async (req, reply) => {
    const herd = await herdFor(db, req.cookies[SESSION_COOKIE]);
    if (!herd) return reply.code(401).send({ error: 'unauthorized' });
    const body = req.body as { horseId: string };
    const r = await patchGlitch(db, herd.id, body.horseId);
    if (!r.ok) {
      const status = r.code === 'not_found' ? 404 : r.code === 'cant_afford' ? 402 : 409;
      return reply.code(status).send(r);
    }
    return reply.send(r);
  });
}
