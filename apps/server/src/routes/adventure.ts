import type { FastifyInstance } from 'fastify';
import { SESSION_COOKIE } from '../auth/tokens.js';
import type { DB } from '../db/client.js';
import { adventure } from '../services/adventure.js';
import { chooseInRun, keeperChallenge, startRun } from '../services/adventure-run.js';
import { listTavern, recruitFromTavern } from '../services/tavern.js';
import { bodySchema, id, idArray } from './schemas.js';
import { herdFor } from './util.js';

export function registerAdventureRoutes(app: FastifyInstance, db: DB): void {
  app.post('/adventure', bodySchema({ regionId: id, party: idArray(8) }), async (req, reply) => {
    const herd = await herdFor(db, req.cookies[SESSION_COOKIE]);
    if (!herd) return reply.code(401).send({ error: 'unauthorized' });
    const body = (req.body ?? {}) as { regionId?: string; party?: unknown };
    if (!body.regionId || !Array.isArray(body.party)) {
      return reply.code(400).send({ error: 'regionId and party[] required' });
    }
    const result = await adventure(db, herd.id, body.regionId, body.party as string[]);
    if (!result.ok) {
      const status = result.code === 'not_found' ? 404 : result.code === 'locked' ? 403 : 400;
      return reply.code(status).send({ error: result.message, code: result.code });
    }
    return reply.send(result);
  });

  // ── Interactive "story" adventures (§9.3) — regions with an authored scene library.
  // The flat POST /adventure above stays for regions without one; nothing here touches it.
  // Regular expeditions are RANDOMIZED (no picker). This returns only the region's deliberate Keeper
  // challenge (the progression boss) + whether it's been earned yet, for the "Challenge the Keeper" UI.
  app.get('/regions/:regionId/keeper', async (req, reply) => {
    const herd = await herdFor(db, req.cookies[SESSION_COOKIE]);
    if (!herd) return reply.code(401).send({ error: 'unauthorized' });
    const { regionId } = req.params as { regionId: string };
    return reply.send(await keeperChallenge(db, herd.id, regionId));
  });

  app.post(
    '/adventure/start',
    bodySchema({ regionId: id, party: idArray(8), scriptId: id }),
    async (req, reply) => {
      const herd = await herdFor(db, req.cookies[SESSION_COOKIE]);
      if (!herd) return reply.code(401).send({ error: 'unauthorized' });
      const body = (req.body ?? {}) as { regionId?: string; party?: unknown; scriptId?: string };
      if (!body.regionId || !Array.isArray(body.party)) {
        return reply.code(400).send({ error: 'regionId and party[] required' });
      }
      const result = await startRun(db, herd.id, body.regionId, body.party as string[], {
        scriptId: body.scriptId,
      });
      if (!result.ok) {
        const status =
          result.code === 'no_script'
            ? 404
            : result.code === 'locked' || result.code === 'keeper_locked'
              ? 403
              : 400;
        return reply.code(status).send({ error: result.message, code: result.code });
      }
      return reply.send(result);
    },
  );

  app.post(
    '/adventure/:runId/choose',
    bodySchema({ choiceId: id }, ['choiceId']),
    async (req, reply) => {
      const herd = await herdFor(db, req.cookies[SESSION_COOKIE]);
      if (!herd) return reply.code(401).send({ error: 'unauthorized' });
      const { runId } = req.params as { runId: string };
      const body = (req.body ?? {}) as { choiceId?: string };
      if (!body.choiceId) return reply.code(400).send({ error: 'choiceId required' });
      const result = await chooseInRun(db, herd.id, runId, body.choiceId);
      if (!result.ok) {
        const status =
          result.code === 'not_found' ? 404 : result.code === 'locked_choice' ? 403 : 400;
        return reply.code(status).send({ error: result.message, code: result.code });
      }
      return reply.send(result);
    },
  );

  app.get('/tavern', async (req, reply) => {
    const herd = await herdFor(db, req.cookies[SESSION_COOKIE]);
    if (!herd) return reply.code(401).send({ error: 'unauthorized' });
    return reply.send(await listTavern(db));
  });

  app.post('/tavern/:id/recruit', async (req, reply) => {
    const herd = await herdFor(db, req.cookies[SESSION_COOKIE]);
    if (!herd) return reply.code(401).send({ error: 'unauthorized' });
    const { id } = req.params as { id: string };
    const result = await recruitFromTavern(db, herd.id, id);
    if (!result.ok) {
      const status = result.code === 'not_found' ? 404 : result.code === 'gone' ? 409 : 402;
      return reply.code(status).send({ error: result.message, code: result.code });
    }
    return reply.code(201).send(result);
  });
}
