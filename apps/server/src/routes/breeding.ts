import type { FastifyInstance } from 'fastify';
import { SESSION_COOKIE } from '../auth/tokens.js';
import type { DB } from '../db/client.js';
import { getHerdForUser, resolveSessionUser } from '../services/auth.js';
import {
  breedHorses,
  breedingOdds,
  eligibleMates,
  pedigree,
  type BreedRejection,
} from '../services/breeding.js';
import { publicHorse } from './horses.js';
import { bodySchema, id } from './schemas.js';

const REJECTION_STATUS: Record<BreedRejection, number> = {
  not_found: 404,
  not_owned: 403,
  not_adult: 409,
  cooldown: 429,
  related: 409,
  same_horse: 400,
  herd_full: 409,
};

export function registerBreedingRoutes(app: FastifyInstance, db: DB): void {
  app.post('/breed', bodySchema({ parentA: id, parentB: id }), async (req, reply) => {
    const user = await resolveSessionUser(db, req.cookies[SESSION_COOKIE]);
    if (!user) return reply.code(401).send({ error: 'unauthorized' });
    const herd = await getHerdForUser(db, user.id);
    if (!herd) return reply.code(404).send({ error: 'no herd' });

    const body = (req.body ?? {}) as { parentA?: string; parentB?: string };
    if (!body.parentA || !body.parentB) {
      return reply.code(400).send({ error: 'parentA and parentB are required' });
    }

    const result = await breedHorses(db, herd.id, body.parentA, body.parentB);
    if (!result.ok) {
      return reply
        .code(REJECTION_STATUS[result.code])
        .send({ error: result.message, code: result.code });
    }
    if (!result.viable) {
      return reply.code(200).send({ viable: false, message: result.message });
    }
    return reply
      .code(201)
      .send({ viable: true, foal: publicHorse(result.foal), bond: result.bond });
  });

  app.get('/breed/odds', async (req, reply) => {
    const { a, b } = req.query as { a?: string; b?: string };
    if (!a || !b) return reply.code(400).send({ error: 'a and b query params required' });
    const odds = await breedingOdds(db, a, b);
    if (!odds.ok) return reply.code(404).send({ error: 'horse not found' });
    return reply.send(odds);
  });

  app.get('/horses/:id/pedigree', async (req, reply) => {
    const { id } = req.params as { id: string };
    const ped = await pedigree(db, id, 3);
    if (!ped) return reply.code(404).send({ error: 'not found' });
    return reply.send(ped);
  });

  app.get('/horses/:id/mates', async (req, reply) => {
    const user = await resolveSessionUser(db, req.cookies[SESSION_COOKIE]);
    if (!user) return reply.code(401).send({ error: 'unauthorized' });
    const herd = await getHerdForUser(db, user.id);
    if (!herd) return reply.code(404).send({ error: 'no herd' });
    const { id } = req.params as { id: string };
    const mates = await eligibleMates(db, herd.id, id);
    return reply.send(mates.map(publicHorse));
  });
}
