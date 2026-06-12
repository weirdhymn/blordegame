import type { FastifyInstance } from 'fastify';
import { SESSION_COOKIE } from '../auth/tokens.js';
import type { DB } from '../db/client.js';
import { getClubs, getRelationships } from '../services/autonomy.js';
import { getJournal } from '../services/journal.js';
import { getInbox, markAllRead, sendMessage } from '../services/messaging.js';
import { getHerdProfile } from '../services/visit.js';
import { bodySchema, id, shortText } from './schemas.js';
import { herdFor } from './util.js';

export function registerSocialRoutes(app: FastifyInstance, db: DB): void {
  // The journal — "here's what your herd did while you were away" (§8).
  app.get('/journal', async (req, reply) => {
    const herd = await herdFor(db, req.cookies[SESSION_COOKIE]);
    if (!herd) return reply.code(401).send({ error: 'unauthorized' });
    return reply.send(await getJournal(db, herd.id));
  });

  app.get('/clubs', async (req, reply) => {
    const herd = await herdFor(db, req.cookies[SESSION_COOKIE]);
    if (!herd) return reply.code(401).send({ error: 'unauthorized' });
    return reply.send(await getClubs(db, herd.id));
  });

  app.get('/relationships', async (req, reply) => {
    const herd = await herdFor(db, req.cookies[SESSION_COOKIE]);
    if (!herd) return reply.code(401).send({ error: 'unauthorized' });
    return reply.send(await getRelationships(db, herd.id));
  });

  // Inter-herd visit (§10): another herd's public grounds + journal highlights.
  app.get('/herds/:id/profile', async (req, reply) => {
    const herd = await herdFor(db, req.cookies[SESSION_COOKIE]);
    if (!herd) return reply.code(401).send({ error: 'unauthorized' });
    const { id } = req.params as { id: string };
    const profile = await getHerdProfile(db, id);
    if (!profile) return reply.code(404).send({ error: 'no such herd' });
    return reply.send(profile);
  });

  // Async messaging (§10) — tightly rate-limited (audit P2): DMs were bounded only by the
  // generous global ceiling, leaving room to flood another herd's inbox.
  app.post(
    '/messages',
    {
      config: { rateLimit: { max: 20, timeWindow: '1 minute' } },
      ...bodySchema({ toHerd: id, body: shortText(500) }),
    },
    async (req, reply) => {
      const herd = await herdFor(db, req.cookies[SESSION_COOKIE]);
      if (!herd) return reply.code(401).send({ error: 'unauthorized' });
      const body = (req.body ?? {}) as { toHerd?: string; body?: string };
      const result = await sendMessage(db, herd.id, body.toHerd ?? '', body.body ?? '');
      if (!result.ok) {
        return reply
          .code(result.code === 'no_recipient' ? 404 : 400)
          .send({ error: result.message, code: result.code });
      }
      return reply.code(201).send(result);
    },
  );

  app.get('/messages', async (req, reply) => {
    const herd = await herdFor(db, req.cookies[SESSION_COOKIE]);
    if (!herd) return reply.code(401).send({ error: 'unauthorized' });
    return reply.send(await getInbox(db, herd.id));
  });

  // Opening the Post Office reads everything (§7p) — one stamp, no per-letter ceremony.
  app.post('/messages/read-all', async (req, reply) => {
    const herd = await herdFor(db, req.cookies[SESSION_COOKIE]);
    if (!herd) return reply.code(401).send({ error: 'unauthorized' });
    await markAllRead(db, herd.id);
    return reply.send({ ok: true });
  });
}
