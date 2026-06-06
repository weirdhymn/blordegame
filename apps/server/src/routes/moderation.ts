import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { SESSION_COOKIE } from '../auth/tokens.js';
import type { DB } from '../db/client.js';
import type { UserRow } from '../db/schema.js';
import { getHerdForUser, resolveSessionUser } from '../services/auth.js';
import { createReport, getStats, isMod, listReports, setFrozen } from '../services/moderation.js';

export function registerModerationRoutes(app: FastifyInstance, db: DB): void {
  // Resolve the session user, replying 401 if absent. Returns null once handled.
  async function authUser(req: FastifyRequest, reply: FastifyReply): Promise<UserRow | null> {
    const user = await resolveSessionUser(db, req.cookies[SESSION_COOKIE]);
    if (!user) {
      reply.code(401).send({ error: 'unauthorized' });
      return null;
    }
    return user;
  }

  // ── Player report flow (§11) ── any authed player; tightly rate-limited vs. spam.
  app.post(
    '/report',
    { config: { rateLimit: { max: 5, timeWindow: '1 minute' } } },
    async (req, reply) => {
      const user = await authUser(req, reply);
      if (!user) return reply;
      const herd = await getHerdForUser(db, user.id);
      if (!herd) return reply.code(401).send({ error: 'unauthorized' });
      const body = (req.body ?? {}) as { targetType?: string; targetId?: string; reason?: string };
      const result = await createReport(
        db,
        herd.id,
        body.targetType ?? '',
        body.targetId ?? '',
        body.reason ?? '',
      );
      if (!result.ok) {
        return reply.code(400).send({ error: 'targetType, targetId and a reason are required' });
      }
      return reply.code(201).send(result);
    },
  );

  // ── Moderator tools (§11) ── role-gated.
  app.get('/mod/reports', async (req, reply) => {
    const user = await authUser(req, reply);
    if (!user) return reply;
    if (!isMod(user)) return reply.code(403).send({ error: 'forbidden' });
    return reply.send(await listReports(db));
  });

  app.get('/mod/stats', async (req, reply) => {
    const user = await authUser(req, reply);
    if (!user) return reply;
    if (!isMod(user)) return reply.code(403).send({ error: 'forbidden' });
    return reply.send(await getStats(db));
  });

  // Account freeze is the heaviest hammer — admin only.
  app.post('/mod/users/:id/freeze', async (req, reply) => {
    const user = await authUser(req, reply);
    if (!user) return reply;
    if (user.role !== 'admin') return reply.code(403).send({ error: 'admin only' });
    const { id } = req.params as { id: string };
    const ok = await setFrozen(db, id, true);
    return reply.code(ok ? 200 : 404).send({ ok, frozen: true });
  });

  app.post('/mod/users/:id/unfreeze', async (req, reply) => {
    const user = await authUser(req, reply);
    if (!user) return reply;
    if (user.role !== 'admin') return reply.code(403).send({ error: 'admin only' });
    const { id } = req.params as { id: string };
    const ok = await setFrozen(db, id, false);
    return reply.code(ok ? 200 : 404).send({ ok, frozen: false });
  });
}
