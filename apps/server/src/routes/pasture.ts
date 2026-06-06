import type { FastifyInstance } from 'fastify';
import { SESSION_COOKIE } from '../auth/tokens.js';
import type { DB } from '../db/client.js';
import type { HerdRow } from '../db/schema.js';
import { getHerdForUser, resolveSessionUser } from '../services/auth.js';
import { craft, listRecipes } from '../services/crafting.js';
import { buildStructure, getPasture } from '../services/pasture.js';

async function herdFor(db: DB, cookie: string | undefined): Promise<HerdRow | null> {
  const user = await resolveSessionUser(db, cookie);
  if (!user) return null;
  return getHerdForUser(db, user.id);
}

export function registerPastureRoutes(app: FastifyInstance, db: DB): void {
  app.get('/recipes', () => listRecipes()); // static content

  app.post('/craft', async (req, reply) => {
    const herd = await herdFor(db, req.cookies[SESSION_COOKIE]);
    if (!herd) return reply.code(401).send({ error: 'unauthorized' });
    const body = (req.body ?? {}) as { recipeId?: string; qty?: number };
    if (!body.recipeId) return reply.code(400).send({ error: 'recipeId required' });
    const result = await craft(db, herd.id, body.recipeId, body.qty ?? 1);
    if (!result.ok) {
      return reply
        .code(result.code === 'not_found' ? 404 : 409)
        .send({ error: result.message, code: result.code });
    }
    return reply.send(result);
  });

  app.get('/pasture', async (req, reply) => {
    const herd = await herdFor(db, req.cookies[SESSION_COOKIE]);
    if (!herd) return reply.code(401).send({ error: 'unauthorized' });
    return reply.send(await getPasture(db, herd.id));
  });

  app.post('/pasture/build', async (req, reply) => {
    const herd = await herdFor(db, req.cookies[SESSION_COOKIE]);
    if (!herd) return reply.code(401).send({ error: 'unauthorized' });
    const body = (req.body ?? {}) as { type?: string };
    if (!body.type) return reply.code(400).send({ error: 'type required' });
    const result = await buildStructure(db, herd.id, body.type);
    if (!result.ok) {
      return reply
        .code(result.code === 'unknown' ? 404 : 409)
        .send({ error: result.message, code: result.code });
    }
    return reply.code(201).send(result);
  });
}
