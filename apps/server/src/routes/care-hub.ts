import type { FastifyInstance } from 'fastify';
import { SESSION_COOKIE } from '../auth/tokens.js';
import type { DB } from '../db/client.js';
import { cook, getCareState, groom } from '../services/care-hub.js';
import { bodySchema, bounded } from './schemas.js';
import { herdFor } from './util.js';

/** The daily-care hub (§7): the morning cook + the evening groom — the cozy heartbeat. */
export function registerCareHubRoutes(app: FastifyInstance, db: DB): void {
  app.get('/care', async (req, reply) => {
    const herd = await herdFor(db, req.cookies[SESSION_COOKIE]);
    if (!herd) return reply.code(401).send({ error: 'unauthorized' });
    return reply.send(await getCareState(db, herd.id, Date.now()));
  });

  app.post(
    '/care/cook',
    bodySchema({
      // the pot only ever holds the six grains — refuse landslide objects at the door
      grains: { type: 'object', maxProperties: 32, additionalProperties: bounded(100_000, 0) },
      rares: bounded(100_000, 0),
    }),
    async (req, reply) => {
      const herd = await herdFor(db, req.cookies[SESSION_COOKIE]);
      if (!herd) return reply.code(401).send({ error: 'unauthorized' });
      const body = (req.body ?? {}) as { grains?: Record<string, number>; rares?: number };
      const result = await cook(db, herd.id, body.grains ?? {}, body.rares ?? 0, Date.now());
      if (!result.ok) {
        return reply.code(409).send({ error: result.message, code: result.code });
      }
      return reply.send(result);
    },
  );

  app.post('/care/groom', async (req, reply) => {
    const herd = await herdFor(db, req.cookies[SESSION_COOKIE]);
    if (!herd) return reply.code(401).send({ error: 'unauthorized' });
    return reply.send(await groom(db, herd.id));
  });
}
