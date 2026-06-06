import type { FastifyInstance, FastifyReply } from 'fastify';
import { SESSION_COOKIE, SESSION_TTL_MS } from '../auth/tokens.js';
import type { DB } from '../db/client.js';
import type { HerdRow } from '../db/schema.js';
import {
  createSession,
  deleteSession,
  getHerdForUser,
  login,
  registerUser,
  resolveSessionUser,
  UsernameTakenError,
} from '../services/auth.js';

interface Credentials {
  username: string;
  password: string;
}

function validateCreds(body: unknown): Credentials | null {
  if (typeof body !== 'object' || body === null) return null;
  const { username, password } = body as Record<string, unknown>;
  if (typeof username !== 'string' || typeof password !== 'string') return null;
  const u = username.trim();
  if (u.length < 3 || u.length > 24 || !/^[\w.-]+$/.test(u)) return null;
  if (password.length < 8 || password.length > 200) return null;
  return { username: u, password };
}

function setSessionCookie(reply: FastifyReply, token: string): void {
  reply.setCookie(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: 'lax',
    path: '/',
    maxAge: Math.floor(SESSION_TTL_MS / 1000),
  });
}

function publicHerd(herd: HerdRow) {
  return { id: herd.id, name: herd.name, cubes: herd.cubes, level: herd.level };
}

export function registerAuthRoutes(app: FastifyInstance, db: DB): void {
  app.post('/auth/register', async (req, reply) => {
    const creds = validateCreds(req.body);
    if (!creds) return reply.code(400).send({ error: 'invalid username or password' });
    try {
      const { user, herd } = await registerUser(db, creds.username, creds.password);
      setSessionCookie(reply, await createSession(db, user.id));
      return reply
        .code(201)
        .send({ user: { id: user.id, username: user.username }, herd: publicHerd(herd) });
    } catch (e) {
      if (e instanceof UsernameTakenError) return reply.code(409).send({ error: 'username taken' });
      throw e;
    }
  });

  app.post('/auth/login', async (req, reply) => {
    const creds = validateCreds(req.body);
    if (!creds) return reply.code(400).send({ error: 'invalid credentials' });
    const res = await login(db, creds.username, creds.password);
    if (!res) return reply.code(401).send({ error: 'invalid credentials' });
    setSessionCookie(reply, await createSession(db, res.user.id));
    return reply.send({
      user: { id: res.user.id, username: res.user.username },
      herd: publicHerd(res.herd),
    });
  });

  app.post('/auth/logout', async (req, reply) => {
    await deleteSession(db, req.cookies[SESSION_COOKIE]);
    reply.clearCookie(SESSION_COOKIE, { path: '/' });
    return reply.send({ ok: true });
  });

  app.get('/me', async (req, reply) => {
    const user = await resolveSessionUser(db, req.cookies[SESSION_COOKIE]);
    if (!user) return reply.code(401).send({ error: 'unauthorized' });
    const herd = await getHerdForUser(db, user.id);
    if (!herd) return reply.code(404).send({ error: 'no herd' });
    return reply.send({
      user: { id: user.id, username: user.username, role: user.role },
      herd: publicHerd(herd),
    });
  });
}
