import type { Genotype } from '@blorse/genetics';
import type { LifeStage } from '@blorse/render-core';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { SESSION_COOKIE } from '../auth/tokens.js';
import type { DB } from '../db/client.js';
import type { HerdRow } from '../db/schema.js';
import { getHerdForUser, resolveSessionUser } from '../services/auth.js';
import {
  debugAdvanceDays,
  debugGrant,
  debugInspectHorse,
  debugInspectRuns,
  debugMatureHorse,
  debugMintHorse,
  debugReset,
  debugTick,
} from '../services/debug.js';

/**
 * Admin debug toolkit — fast play-test shortcuts to existing game logic (§dev). This whole plugin
 * is registered ONLY when `allowDebug` is on (dev instances), so in production the routes do not
 * exist (404). Within a dev instance each route additionally requires role 'admin' (403 otherwise)
 * — same spirit as the POST /horses mint lock. Never reachable by a normal player.
 */

// Resolves the caller's herd, or sends the right error (401/403/404) and returns null.
async function adminHerd(
  db: DB,
  req: FastifyRequest,
  reply: FastifyReply,
): Promise<HerdRow | null> {
  const user = await resolveSessionUser(db, req.cookies[SESSION_COOKIE]);
  if (!user) {
    await reply.code(401).send({ error: 'unauthorized' });
    return null;
  }
  if (user.role !== 'admin') {
    await reply.code(403).send({ error: 'admin only', code: 'forbidden' });
    return null;
  }
  const herd = await getHerdForUser(db, user.id);
  if (!herd) {
    await reply.code(404).send({ error: 'no herd' });
    return null;
  }
  return herd;
}

export function registerDebugRoutes(app: FastifyInstance, db: DB): void {
  // Grant: top up Cubes and/or any item(s) by id.
  app.post('/debug/grant', async (req, reply) => {
    const herd = await adminHerd(db, req, reply);
    if (!herd) return;
    const body = (req.body ?? {}) as { cubes?: number; items?: { id: string; qty: number }[] };
    return reply.send(await debugGrant(db, herd.id, { cubes: body.cubes, items: body.items }));
  });

  // Mint a custom horse (chosen OCEAN/stats/genotype). Returns the RAW row (incl. hidden luck).
  app.post('/debug/mint', async (req, reply) => {
    const herd = await adminHerd(db, req, reply);
    if (!herd) return;
    const body = (req.body ?? {}) as {
      genotype?: Genotype;
      personality?: Record<string, number>;
      stats?: Record<string, number>;
      luck?: number;
      lifeStage?: LifeStage;
      name?: string;
    };
    return reply.code(201).send(await debugMintHorse(db, herd.id, body));
  });

  // Time control — advance N days, a single tick, or mature one foal on demand.
  app.post('/debug/advance-days', async (req, reply) => {
    const herd = await adminHerd(db, req, reply);
    if (!herd) return;
    const days = (req.body as { days?: number } | undefined)?.days ?? 1;
    return reply.send(await debugAdvanceDays(db, herd.id, days));
  });

  app.post('/debug/tick', async (req, reply) => {
    const herd = await adminHerd(db, req, reply);
    if (!herd) return;
    return reply.send(await debugTick(db, herd.id));
  });

  app.post('/debug/mature/:horseId', async (req, reply) => {
    const herd = await adminHerd(db, req, reply);
    if (!herd) return;
    const { horseId } = req.params as { horseId: string };
    const r = await debugMatureHorse(db, herd.id, horseId);
    if (!r.ok) {
      return reply.code(r.code === 'not_found' ? 404 : 409).send({ error: r.code, code: r.code });
    }
    return reply.send(r);
  });

  // Inspect — the full hidden truth for a horse, and the raw state of in-progress runs.
  app.get('/debug/horse/:horseId', async (req, reply) => {
    const herd = await adminHerd(db, req, reply);
    if (!herd) return;
    const { horseId } = req.params as { horseId: string };
    const dump = await debugInspectHorse(db, herd.id, horseId);
    if (!dump) return reply.code(404).send({ error: 'not found' });
    return reply.send(dump);
  });

  app.get('/debug/runs', async (req, reply) => {
    const herd = await adminHerd(db, req, reply);
    if (!herd) return;
    return reply.send(await debugInspectRuns(db, herd.id));
  });

  // Reset — wipe the herd back to a clean starter state (2 founders + the cold-start purse).
  app.post('/debug/reset', async (req, reply) => {
    const herd = await adminHerd(db, req, reply);
    if (!herd) return;
    await debugReset(db, herd.id);
    return reply.send({ ok: true });
  });
}
