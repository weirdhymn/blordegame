import type { FastifyInstance } from 'fastify';
import { SESSION_COOKIE } from '../auth/tokens.js';
import type { DB } from '../db/client.js';
import {
  buySprinkler,
  cropCatalog,
  fertilizePlot,
  getGarden,
  harvestPlot,
  plantCrop,
  waterPlot,
} from '../services/garden.js';
import { bodySchema, bounded, id } from './schemas.js';
import { herdFor } from './util.js';

/** The Garden (§7j) — optional enrichment, never an obligation. Every plot stage is derived
 *  server-side; the client just renders the visible runway. */
export function registerGardenRoutes(app: FastifyInstance, db: DB): void {
  app.get('/garden', async (req, reply) => {
    const herd = await herdFor(db, req.cookies[SESSION_COOKIE]);
    if (!herd) return reply.code(401).send({ error: 'unauthorized' });
    const view = await getGarden(db, herd, Date.now());
    return reply.send({ ...view, crops: cropCatalog() });
  });

  app.post(
    '/garden/plant',
    bodySchema({ slot: bounded(64, 1), crop: id }, ['slot', 'crop']),
    async (req, reply) => {
      const herd = await herdFor(db, req.cookies[SESSION_COOKIE]);
      if (!herd) return reply.code(401).send({ error: 'unauthorized' });
      const body = req.body as { slot: number; crop: string };
      const r = await plantCrop(db, herd, body.slot, body.crop, Date.now());
      if (!r.ok) return reply.code(r.code === 'cant_afford' ? 402 : 409).send(r);
      return reply.send(r);
    },
  );

  app.post(
    '/garden/fertilize',
    bodySchema({ slot: bounded(64, 1), kind: id }, ['slot', 'kind']),
    async (req, reply) => {
      const herd = await herdFor(db, req.cookies[SESSION_COOKIE]);
      if (!herd) return reply.code(401).send({ error: 'unauthorized' });
      const body = req.body as { slot: number; kind: string };
      const r = await fertilizePlot(db, herd, body.slot, body.kind, Date.now());
      if (!r.ok) return reply.code(r.code === 'cant_afford' ? 402 : 409).send(r);
      return reply.send(r);
    },
  );

  app.post('/garden/water', bodySchema({ slot: bounded(64, 1) }, ['slot']), async (req, reply) => {
    const herd = await herdFor(db, req.cookies[SESSION_COOKIE]);
    if (!herd) return reply.code(401).send({ error: 'unauthorized' });
    const body = req.body as { slot: number };
    const r = await waterPlot(db, herd, body.slot, Date.now());
    if (!r.ok) return reply.code(409).send(r);
    return reply.send(r);
  });

  app.post(
    '/garden/harvest',
    bodySchema({ slot: bounded(64, 1) }, ['slot']),
    async (req, reply) => {
      const herd = await herdFor(db, req.cookies[SESSION_COOKIE]);
      if (!herd) return reply.code(401).send({ error: 'unauthorized' });
      const body = req.body as { slot: number };
      const r = await harvestPlot(db, herd, body.slot, Date.now());
      if (!r.ok) return reply.code(409).send(r);
      return reply.send(r);
    },
  );

  app.post(
    '/garden/sprinkler',
    bodySchema({ days: bounded(14, 1) }, ['days']),
    async (req, reply) => {
      const herd = await herdFor(db, req.cookies[SESSION_COOKIE]);
      if (!herd) return reply.code(401).send({ error: 'unauthorized' });
      const body = req.body as { days: number };
      const r = await buySprinkler(db, herd, body.days, Date.now());
      if (!r.ok) return reply.code(r.code === 'cant_afford' ? 402 : 400).send(r);
      return reply.send(r);
    },
  );
}
