import type { Genotype } from '@blorse/genetics';
import type { LifeStage } from '@blorse/render-core';
import type { FastifyInstance } from 'fastify';
import { SESSION_COOKIE } from '../auth/tokens.js';
import type { DB } from '../db/client.js';
import type { HorseRow } from '../db/schema.js';
import { getHerdForUser, resolveSessionUser } from '../services/auth.js';
import { getHorse, horseRenderSpec, listHerdHorses, mintHorse } from '../services/horse.js';
import { assignJob, getJob, unassignJob } from '../services/jobs.js';

export function publicHorse(h: HorseRow) {
  return {
    id: h.id,
    herdId: h.herdId,
    genotype: h.genotype,
    seed: h.seed,
    glitch: h.glitch,
    lifeStage: h.lifeStage,
    name: h.name,
    origin: h.origin,
    parentA: h.parentA,
    parentB: h.parentB,
    stats: h.stats,
    skills: h.skills,
    accomplishments: h.accomplishments,
    personality: h.personality,
    // `luck` is intentionally omitted — it is hidden (§9.1).
  };
}

interface MintBody {
  genotype?: Genotype;
  lifeStage?: LifeStage;
  name?: string;
  seed?: number;
}

export function registerHorseRoutes(app: FastifyInstance, db: DB): void {
  // Mint a horse into the caller's herd. A dev/founder faucet — in the live game,
  // horses arrive via breeding (Phase 4) and wild encounters (Phase 8).
  app.post('/horses', async (req, reply) => {
    const user = await resolveSessionUser(db, req.cookies[SESSION_COOKIE]);
    if (!user) return reply.code(401).send({ error: 'unauthorized' });
    const herd = await getHerdForUser(db, user.id);
    if (!herd) return reply.code(404).send({ error: 'no herd' });

    const body = (req.body ?? {}) as MintBody;
    if (!body.genotype || typeof body.genotype !== 'object') {
      return reply.code(400).send({ error: 'genotype required' });
    }
    const horse = await mintHorse(db, {
      herdId: herd.id,
      genotype: body.genotype,
      origin: 'founder',
      lifeStage: body.lifeStage,
      name: body.name ?? null,
      seed: body.seed,
    });
    return reply.code(201).send(publicHorse(horse));
  });

  app.get('/horses/:id', async (req, reply) => {
    const { id } = req.params as { id: string };
    const horse = await getHorse(db, id);
    if (!horse) return reply.code(404).send({ error: 'not found' });
    return reply.send(publicHorse(horse));
  });

  // Render-on-demand: the derived RenderSpec (cached). The client composites pixels.
  app.get('/horses/:id/spec', async (req, reply) => {
    const { id } = req.params as { id: string };
    const horse = await getHorse(db, id);
    if (!horse) return reply.code(404).send({ error: 'not found' });
    return reply.send(horseRenderSpec(horse));
  });

  app.get('/herds/:id/horses', async (req, reply) => {
    const { id } = req.params as { id: string };
    const list = await listHerdHorses(db, id);
    return reply.send(list.map(publicHorse));
  });

  // Jobs (§9.2): post a horse to a Structure's job; it produces on each rollover.
  app.post('/horses/:id/job', async (req, reply) => {
    const user = await resolveSessionUser(db, req.cookies[SESSION_COOKIE]);
    if (!user) return reply.code(401).send({ error: 'unauthorized' });
    const herd = await getHerdForUser(db, user.id);
    if (!herd) return reply.code(404).send({ error: 'no herd' });
    const { id } = req.params as { id: string };
    const structureType = (req.body as { structureType?: string } | undefined)?.structureType;
    if (!structureType) return reply.code(400).send({ error: 'structureType required' });
    const result = await assignJob(db, herd.id, id, structureType);
    if (!result.ok) {
      const status =
        result.code === 'not_found'
          ? 404
          : result.code === 'not_owned'
            ? 403
            : result.code === 'no_job'
              ? 400
              : 409;
      return reply.code(status).send({ error: result.message, code: result.code });
    }
    return reply.code(201).send(result);
  });

  app.delete('/horses/:id/job', async (req, reply) => {
    const user = await resolveSessionUser(db, req.cookies[SESSION_COOKIE]);
    if (!user) return reply.code(401).send({ error: 'unauthorized' });
    const herd = await getHerdForUser(db, user.id);
    if (!herd) return reply.code(404).send({ error: 'no herd' });
    const { id } = req.params as { id: string };
    const horse = await getHorse(db, id);
    if (!horse || horse.herdId !== herd.id) return reply.code(404).send({ error: 'not found' });
    await unassignJob(db, id);
    return reply.send({ ok: true });
  });

  app.get('/horses/:id/job', async (req, reply) => {
    const { id } = req.params as { id: string };
    return reply.send({ job: await getJob(db, id) });
  });
}
