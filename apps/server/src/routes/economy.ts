import type { FastifyInstance } from 'fastify';
import { SESSION_COOKIE } from '../auth/tokens.js';
import type { DB } from '../db/client.js';
import type { HerdRow } from '../db/schema.js';
import { getHerdForUser, resolveSessionUser } from '../services/auth.js';
import { browseMarket, buyListing, cancelListing, listHorse } from '../services/market.js';
import {
  acceptTrade,
  createTrade,
  listTrades,
  resolveTrade,
  type TradeOffer,
} from '../services/trade.js';

async function herdFor(db: DB, cookie: string | undefined): Promise<HerdRow | null> {
  const user = await resolveSessionUser(db, cookie);
  if (!user) return null;
  return getHerdForUser(db, user.id);
}

export function registerEconomyRoutes(app: FastifyInstance, db: DB): void {
  // ── Marketplace ──
  app.get('/market', async (req, reply) => {
    const herd = await herdFor(db, req.cookies[SESSION_COOKIE]);
    if (!herd) return reply.code(401).send({ error: 'unauthorized' });
    return reply.send(await browseMarket(db));
  });

  app.post('/market', async (req, reply) => {
    const herd = await herdFor(db, req.cookies[SESSION_COOKIE]);
    if (!herd) return reply.code(401).send({ error: 'unauthorized' });
    const body = (req.body ?? {}) as { horseId?: string; price?: number };
    if (!body.horseId || typeof body.price !== 'number') {
      return reply.code(400).send({ error: 'horseId and price required' });
    }
    const result = await listHorse(db, herd.id, body.horseId, body.price);
    if (!result.ok) {
      const status = result.code === 'not_found' ? 404 : result.code === 'not_owned' ? 403 : 409;
      return reply.code(status).send({ error: result.message, code: result.code });
    }
    return reply.code(201).send(result);
  });

  app.post('/market/:id/buy', async (req, reply) => {
    const herd = await herdFor(db, req.cookies[SESSION_COOKIE]);
    if (!herd) return reply.code(401).send({ error: 'unauthorized' });
    const { id } = req.params as { id: string };
    const result = await buyListing(db, herd.id, id);
    if (!result.ok) {
      const status =
        result.code === 'not_found'
          ? 404
          : result.code === 'gone'
            ? 409
            : result.code === 'own_listing'
              ? 400
              : 402;
      return reply.code(status).send({ error: result.message, code: result.code });
    }
    return reply.send(result);
  });

  app.delete('/market/:id', async (req, reply) => {
    const herd = await herdFor(db, req.cookies[SESSION_COOKIE]);
    if (!herd) return reply.code(401).send({ error: 'unauthorized' });
    const { id } = req.params as { id: string };
    const ok = await cancelListing(db, herd.id, id);
    return reply.code(ok ? 200 : 404).send({ ok });
  });

  // ── Direct trades ──
  app.get('/trades', async (req, reply) => {
    const herd = await herdFor(db, req.cookies[SESSION_COOKIE]);
    if (!herd) return reply.code(401).send({ error: 'unauthorized' });
    return reply.send(await listTrades(db, herd.id));
  });

  app.post('/trades', async (req, reply) => {
    const herd = await herdFor(db, req.cookies[SESSION_COOKIE]);
    if (!herd) return reply.code(401).send({ error: 'unauthorized' });
    const result = await createTrade(db, herd.id, (req.body ?? {}) as TradeOffer);
    if (!result.ok) {
      const status = result.code === 'cant_afford' ? 402 : result.code === 'not_owned' ? 403 : 400;
      return reply.code(status).send({ error: result.message, code: result.code });
    }
    return reply.code(201).send(result);
  });

  app.post('/trades/:id/accept', async (req, reply) => {
    const herd = await herdFor(db, req.cookies[SESSION_COOKIE]);
    if (!herd) return reply.code(401).send({ error: 'unauthorized' });
    const { id } = req.params as { id: string };
    const result = await acceptTrade(db, herd.id, id);
    if (!result.ok) {
      const status =
        result.code === 'not_found'
          ? 404
          : result.code === 'not_recipient'
            ? 403
            : result.code === 'cant_afford'
              ? 402
              : 409;
      return reply.code(status).send({ error: result.message, code: result.code });
    }
    return reply.send(result);
  });

  app.post('/trades/:id/decline', async (req, reply) => {
    const herd = await herdFor(db, req.cookies[SESSION_COOKIE]);
    if (!herd) return reply.code(401).send({ error: 'unauthorized' });
    const { id } = req.params as { id: string };
    const ok = await resolveTrade(db, herd.id, id, 'declined');
    return reply.code(ok ? 200 : 404).send({ ok });
  });

  app.delete('/trades/:id', async (req, reply) => {
    const herd = await herdFor(db, req.cookies[SESSION_COOKIE]);
    if (!herd) return reply.code(401).send({ error: 'unauthorized' });
    const { id } = req.params as { id: string };
    const ok = await resolveTrade(db, herd.id, id, 'cancelled');
    return reply.code(ok ? 200 : 404).send({ ok });
  });
}
