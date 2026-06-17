import { ADVENTURE_MARK_THRESHOLD } from '@blorse/balance';
import type { Genotype } from '@blorse/genetics';
import type { LifeStage } from '@blorse/render-core';
import type { FastifyInstance } from 'fastify';
import { SESSION_COOKIE } from '../auth/tokens.js';
import type { DB } from '../db/client.js';
import type { HorseRow } from '../db/schema.js';
import { getHerdForUser, resolveSessionUser } from '../services/auth.js';
import { getHorse, horseRenderSpec, listHerdHorses, mintHorse } from '../services/horse.js';
import { assignJob, getJob, unassignJob } from '../services/jobs.js';
import { uploadHorse, uploadQuote } from '../services/upload.js';
import { bodySchema, id } from './schemas.js';

export function publicHorse(h: HorseRow) {
  // Foal-white canon (§4.2): a foal's coat is a surprise until it matures, so its genotype and
  // seed never leave the server while it's white — the client computed the pre-reveal coat
  // otherwise (audit P1). The empty genotype renders pixel-identically (foal-white ignores
  // palette), and the reveal/Studbook moment stays a moment.
  const revealed = h.lifeStage === 'adult';
  return {
    id: h.id,
    herdId: h.herdId,
    genotype: revealed ? h.genotype : {},
    seed: revealed ? h.seed : 0,
    glitch: revealed ? h.glitch : null,
    lifeStage: h.lifeStage,
    name: h.name,
    origin: h.origin,
    parentA: h.parentA,
    parentB: h.parentB,
    stats: h.stats,
    skills: h.skills,
    accomplishments: h.accomplishments,
    /** Cosmetic quirks picked up living in the herd (§8) — flavour only, never a stat. */
    quirks: h.quirks,
    personality: h.personality,
    /** Completed interactive adventures + the derived cosmetic "Seasoned" mark (§9.3, flavor only). */
    adventures: h.adventures,
    experienced: h.adventures >= ADVENTURE_MARK_THRESHOLD,
    /** Combat class (§9.4b) — identity + signature approach; null = unclassed. */
    class: h.class,
    /** Cosmetic mood (§7) — 'content' default, 'rattled' after a rough day; the evening groom soothes it. */
    mood: h.mood,
    // `luck` is intentionally omitted — it is hidden (§9.1).
  };
}

interface MintBody {
  genotype?: Genotype;
  lifeStage?: LifeStage;
  name?: string;
  seed?: number;
}

export function registerHorseRoutes(
  app: FastifyInstance,
  db: DB,
  cfg: { allowMint: boolean },
): void {
  // Mint a horse into the caller's herd. A dev/founder faucet — gated to admins in prod
  // (allowMint=false) so a tester can't spawn horses and break the breeding economy.
  app.post('/horses', async (req, reply) => {
    const user = await resolveSessionUser(db, req.cookies[SESSION_COOKIE]);
    if (!user) return reply.code(401).send({ error: 'unauthorized' });
    if (!cfg.allowMint && user.role !== 'admin') {
      return reply.code(403).send({ error: 'minting is disabled', code: 'mint_disabled' });
    }
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
    // A foal's spec is built from the redaction placeholder — the spec's computed palette
    // would otherwise hand out the adult colors early (foal-white ignores them anyway).
    const safe =
      horse.lifeStage === 'adult' ? horse : { ...horse, genotype: {}, seed: 0, glitch: null };
    return reply.send(horseRenderSpec(safe));
  });

  // Rosters are for players, not anonymous scrapers (audit P1) — any session may read
  // (cross-herd reads stay open: visiting is a feature, §10).
  app.get('/herds/:id/horses', async (req, reply) => {
    const user = await resolveSessionUser(db, req.cookies[SESSION_COOKIE]);
    if (!user) return reply.code(401).send({ error: 'unauthorized' });
    const { id } = req.params as { id: string };
    const list = await listHerdHorses(db, id);
    return reply.send(list.map(publicHorse));
  });

  // Jobs (§9.2): post a horse to a Structure's job; it produces on each rollover.
  app.post(
    '/horses/:id/job',
    bodySchema({ structureType: id }, ['structureType']),
    async (req, reply) => {
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
    },
  );

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
    const user = await resolveSessionUser(db, req.cookies[SESSION_COOKIE]);
    if (!user) return reply.code(401).send({ error: 'unauthorized' });
    const herd = await getHerdForUser(db, user.id);
    if (!herd) return reply.code(404).send({ error: 'no herd' });
    const { id } = req.params as { id: string };
    const horse = await getHorse(db, id);
    if (!horse || horse.herdId !== herd.id) return reply.code(404).send({ error: 'not found' });
    return reply.send({ job: await getJob(db, id) });
  });

  // Upload to The Cloud (§14.3a) — the first permanent action. The quote is a read-only preview
  // that feeds the client's confirmation (names the horse, shows the exact reward + warnings);
  // the POST does the irreversible send-off. Both are server-authoritative.
  app.get('/horses/:id/upload-quote', async (req, reply) => {
    const user = await resolveSessionUser(db, req.cookies[SESSION_COOKIE]);
    if (!user) return reply.code(401).send({ error: 'unauthorized' });
    const herd = await getHerdForUser(db, user.id);
    if (!herd) return reply.code(404).send({ error: 'no herd' });
    const { id } = req.params as { id: string };
    const quote = await uploadQuote(db, herd.id, id);
    if (!quote.ok) return reply.code(404).send({ error: 'not found' });
    return reply.send(quote);
  });

  app.post('/horses/:id/upload', async (req, reply) => {
    const user = await resolveSessionUser(db, req.cookies[SESSION_COOKIE]);
    if (!user) return reply.code(401).send({ error: 'unauthorized' });
    const herd = await getHerdForUser(db, user.id);
    if (!herd) return reply.code(404).send({ error: 'no herd' });
    const { id } = req.params as { id: string };
    const result = await uploadHorse(db, herd.id, id);
    if (!result.ok) {
      return reply
        .code(result.code === 'not_found' ? 404 : 409)
        .send({ error: result.message, code: result.code });
    }
    return reply.send(result);
  });
}
