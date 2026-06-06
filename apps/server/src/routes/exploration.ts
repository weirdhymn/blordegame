import type { FastifyInstance } from 'fastify';
import { SESSION_COOKIE } from '../auth/tokens.js';
import type { DB } from '../db/client.js';
import { getHerdForUser, resolveSessionUser } from '../services/auth.js';
import { listRegions, roam } from '../services/exploration.js';
import { getInventory } from '../services/inventory.js';
import { getQuestState } from '../services/quests.js';
import type { HerdRow } from '../db/schema.js';

async function requireHerd(
  db: DB,
  cookie: string | undefined,
): Promise<HerdRow | { error: number }> {
  const user = await resolveSessionUser(db, cookie);
  if (!user) return { error: 401 };
  const herd = await getHerdForUser(db, user.id);
  return herd ?? { error: 404 };
}

export function registerExplorationRoutes(app: FastifyInstance, db: DB): void {
  app.get('/regions', async (req, reply) => {
    const herd = await requireHerd(db, req.cookies[SESSION_COOKIE]);
    if ('error' in herd) return reply.code(herd.error).send({ error: 'unauthorized' });
    return reply.send(await listRegions(db, herd.id));
  });

  app.post('/regions/:id/roam', async (req, reply) => {
    const herd = await requireHerd(db, req.cookies[SESSION_COOKIE]);
    if ('error' in herd) return reply.code(herd.error).send({ error: 'unauthorized' });
    const { id } = req.params as { id: string };
    const result = await roam(db, herd.id, id);
    if (!result.ok) {
      return reply.code(result.code === 'not_found' ? 404 : 403).send({ error: result.message });
    }
    return reply.send(result);
  });

  app.get('/quests', async (req, reply) => {
    const herd = await requireHerd(db, req.cookies[SESSION_COOKIE]);
    if ('error' in herd) return reply.code(herd.error).send({ error: 'unauthorized' });
    return reply.send(await getQuestState(db, herd.id));
  });

  app.get('/inventory', async (req, reply) => {
    const herd = await requireHerd(db, req.cookies[SESSION_COOKIE]);
    if ('error' in herd) return reply.code(herd.error).send({ error: 'unauthorized' });
    return reply.send(await getInventory(db, herd.id));
  });
}
