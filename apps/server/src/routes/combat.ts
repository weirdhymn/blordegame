import { APPROACHES, type Approach, HORSE_CLASSES, type HorseClass } from '@blorse/balance';
import type { FastifyInstance } from 'fastify';
import { SESSION_COOKIE } from '../auth/tokens.js';
import type { DB } from '../db/client.js';
import {
  actInBattle,
  getBattleView,
  setHorseClass,
  startBattle,
  type BattleAction,
} from '../services/combat.js';
import { bodySchema, idArray } from './schemas.js';
import { herdFor } from './util.js';

function parseAction(body: unknown): BattleAction | null {
  const b = (body ?? {}) as {
    type?: string;
    targetId?: string;
    itemId?: string;
    approach?: string;
  };
  switch (b.type) {
    case 'attack': {
      if (!b.targetId) return null;
      const approach = APPROACHES.includes(b.approach as Approach)
        ? (b.approach as Approach)
        : undefined;
      return { type: 'attack', targetId: b.targetId, approach };
    }
    case 'mend':
      return b.targetId ? { type: 'mend', targetId: b.targetId } : null;
    case 'item':
      return b.targetId && b.itemId
        ? { type: 'item', itemId: b.itemId, targetId: b.targetId }
        : null;
    case 'defend':
      return { type: 'defend' };
    case 'flee':
      return { type: 'flee' };
    default:
      return null;
  }
}

export function registerCombatRoutes(app: FastifyInstance, db: DB): void {
  // Begin a battle (§9.4). v1 entry is standalone; the adventure run→battle handoff lands later.
  app.post(
    '/battle/start',
    bodySchema({ enemies: idArray(8), party: idArray(8) }),
    async (req, reply) => {
      const herd = await herdFor(db, req.cookies[SESSION_COOKIE]);
      if (!herd) return reply.code(401).send({ error: 'unauthorized' });
      const body = (req.body ?? {}) as { enemies?: unknown; party?: unknown };
      if (!Array.isArray(body.enemies) || !Array.isArray(body.party)) {
        return reply.code(400).send({ error: 'enemies[] and party[] required' });
      }
      const result = await startBattle(
        db,
        herd.id,
        body.enemies as string[],
        body.party as string[],
      );
      if (!result.ok) {
        return reply
          .code(result.code === 'bad_enemy' ? 404 : 400)
          .send({ error: result.message, code: result.code });
      }
      return reply.code(201).send({ battleId: result.battleId, battle: result.view });
    },
  );

  app.post('/battle/:id/act', async (req, reply) => {
    const herd = await herdFor(db, req.cookies[SESSION_COOKIE]);
    if (!herd) return reply.code(401).send({ error: 'unauthorized' });
    const { id } = req.params as { id: string };
    const action = parseAction(req.body);
    if (!action)
      return reply.code(400).send({ error: 'a valid action is required', code: 'bad_action' });
    const result = await actInBattle(db, herd.id, id, action);
    if (!result.ok) {
      const status = result.code === 'not_found' ? 404 : result.code === 'no_potion' ? 409 : 400;
      return reply.code(status).send({ error: result.message, code: result.code });
    }
    return reply.send({ battle: result.view });
  });

  app.get('/battle/:id', async (req, reply) => {
    const herd = await herdFor(db, req.cookies[SESSION_COOKIE]);
    if (!herd) return reply.code(401).send({ error: 'unauthorized' });
    const { id } = req.params as { id: string };
    const view = await getBattleView(db, herd.id, id);
    if (!view) return reply.code(404).send({ error: 'not found' });
    return reply.send({ battle: view });
  });

  // Assign (or clear) a horse's combat class — freely re-assignable (§9.4b).
  app.post('/horses/:id/class', async (req, reply) => {
    const herd = await herdFor(db, req.cookies[SESSION_COOKIE]);
    if (!herd) return reply.code(401).send({ error: 'unauthorized' });
    const { id } = req.params as { id: string };
    const raw = (req.body ?? {}) as { class?: string | null };
    let cls: HorseClass | null;
    if (raw.class == null) cls = null;
    else if (HORSE_CLASSES.includes(raw.class as HorseClass)) cls = raw.class as HorseClass;
    else return reply.code(400).send({ error: 'unknown class', code: 'bad_class' });
    const r = await setHorseClass(db, herd.id, id, cls);
    if (!r.ok) return reply.code(404).send({ error: 'not found' });
    return reply.send({ ok: true, class: cls });
  });
}
