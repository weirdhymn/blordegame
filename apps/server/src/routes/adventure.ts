import type { FastifyInstance } from 'fastify';
import { SESSION_COOKIE } from '../auth/tokens.js';
import { ADVENTURE_POOLS } from '../content/adventures.js';
import type { DB } from '../db/client.js';
import type { HerdRow } from '../db/schema.js';
import { adventure } from '../services/adventure.js';
import { chooseInRun, startRun } from '../services/adventure-run.js';
import { getHerdForUser, resolveSessionUser } from '../services/auth.js';
import { listTavern, recruitFromTavern } from '../services/tavern.js';

async function herdFor(db: DB, cookie: string | undefined): Promise<HerdRow | null> {
  const user = await resolveSessionUser(db, cookie);
  if (!user) return null;
  return getHerdForUser(db, user.id);
}

export function registerAdventureRoutes(app: FastifyInstance, db: DB): void {
  app.post('/adventure', async (req, reply) => {
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
  // List a region's authored expeditions (id + name) so the player can pick one (§9.4c).
  app.get('/regions/:regionId/adventures', async (req) => {
    const { regionId } = req.params as { regionId: string };
    return (ADVENTURE_POOLS.get(regionId) ?? []).map((sc) => ({ id: sc.id, name: sc.name }));
  });

  app.post('/adventure/start', async (req, reply) => {
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
      const status = result.code === 'no_script' ? 404 : result.code === 'locked' ? 403 : 400;
      return reply.code(status).send({ error: result.message, code: result.code });
    }
    return reply.send(result);
  });

  app.post('/adventure/:runId/choose', async (req, reply) => {
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
  });

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
