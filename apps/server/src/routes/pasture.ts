import type { FastifyInstance } from 'fastify';
import { ITEM_SELL_VALUE, SELL_CONFIRM_IDS } from '@blorse/balance';
import { SESSION_COOKIE } from '../auth/tokens.js';
import type { DB } from '../db/client.js';
import { ITEMS } from '../content/items.js';
import { craft, listRecipes } from '../services/crafting.js';
import { buildStructure, getPasture } from '../services/pasture.js';
import { bodySchema, bounded, id } from './schemas.js';
import { herdFor } from './util.js';

export function registerPastureRoutes(app: FastifyInstance, db: DB): void {
  app.get('/recipes', () => listRecipes()); // static content
  // static content — item catalog (names, kinds, flavor) + quick-sell value (so the Inventory page
  // knows what's sellable, for how much, and what needs a confirm) without exposing balance to the client.
  app.get('/items', () =>
    ITEMS.map((i) => ({
      ...i,
      sellValue: ITEM_SELL_VALUE[i.id],
      sellConfirm: SELL_CONFIRM_IDS.includes(i.id),
    })),
  );

  app.post(
    '/craft',
    bodySchema({ recipeId: id, qty: bounded(1_000_000) }, ['recipeId']),
    async (req, reply) => {
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
    },
  );

  app.get('/pasture', async (req, reply) => {
    const herd = await herdFor(db, req.cookies[SESSION_COOKIE]);
    if (!herd) return reply.code(401).send({ error: 'unauthorized' });
    return reply.send(await getPasture(db, herd.id));
  });

  app.post('/pasture/build', bodySchema({ type: id }, ['type']), async (req, reply) => {
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
