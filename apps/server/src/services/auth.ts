import { randomInt } from 'node:crypto';
import { STARTING_CUBES } from '@blorse/balance';
import { eq, lt } from 'drizzle-orm';
import { hashPassword, verifyPassword } from '../auth/password.js';
import { generateSessionToken, hashToken, SESSION_TTL_MS } from '../auth/tokens.js';
import { STARTER_HORSES } from '../content/onboarding.js';
import type { DB } from '../db/client.js';
import { herds, sessions, users, type HerdRow, type UserRow } from '../db/schema.js';
import { gameDay } from '../util/clock.js';
import { listHerdHorses, mintHorse } from './horse.js';

// Placeholder herd names (fruit/veg, like default horse names §6) until lore lands.
const HERD_NAMES = ['Plum', 'Pepper', 'Turnip', 'Cherry', 'Parsnip', 'Mango', 'Radish', 'Fig'];

export interface AuthedHerd {
  user: UserRow;
  herd: HerdRow;
}

export class UsernameTakenError extends Error {
  constructor() {
    super('username already taken');
    this.name = 'UsernameTakenError';
  }
}

/** Postgres unique-violation (23505), as surfaced by either driver (pg nests it in `cause`). */
function isUniqueViolation(e: unknown): boolean {
  const code = (e as { code?: string })?.code ?? (e as { cause?: { code?: string } })?.cause?.code;
  return code === '23505' || (e instanceof Error && e.message.includes('duplicate key'));
}

/** Create a User + its 1:1 Herd atomically (BLORSE_PLAN.md §6). Usernames are folded to
 *  lowercase — "Alice" and "alice" are one account, not two confusable ones (audit P2). */
export async function registerUser(
  db: DB,
  rawUsername: string,
  password: string,
): Promise<AuthedHerd> {
  const username = rawUsername.toLowerCase();
  const existing = await db.query.users.findFirst({ where: eq(users.username, username) });
  if (existing) throw new UsernameTakenError();

  const passwordHash = hashPassword(password);
  const authed = await db.transaction(async (tx) => {
    // The unique index is the real duplicate guard — the pre-check above only makes the
    // common case friendly. A concurrent duplicate surfaces as the DB unique violation,
    // mapped to the same 409 (was a raw 500 — audit P2).
    const [user] = await tx
      .insert(users)
      .values({ username, passwordHash })
      .returning()
      .catch((e: unknown) => {
        if (isUniqueViolation(e)) throw new UsernameTakenError();
        throw e;
      });
    if (!user) throw new Error('failed to create user');
    const name = `${HERD_NAMES[randomInt(HERD_NAMES.length)] ?? 'Wandering'} Herd`;
    const [herd] = await tx
      .insert(herds)
      .values({
        userId: user.id,
        name,
        cubes: STARTING_CUBES, // cold-start purse (§6, §14)
        simSeed: randomInt(1, 2 ** 31),
        lastSimTick: gameDay(Date.now()), // start the daily-rollover cursor at today
      })
      .returning();
    if (!herd) throw new Error('failed to create herd');
    return { user, herd };
  });
  // Cold-start grant (§6): every new Herd begins with a viable starting position so a new
  // player isn't stuck with no horses. Done after the tx (mintHorse takes the DB, not a tx).
  await grantStarterHorses(db, authed.herd.id);
  return authed;
}

/**
 * Grant a Herd its founder starter horses (§6 onboarding). **Idempotent**: a no-op if the
 * Herd already has any horse, so re-running onboarding never double-grants. The starters are
 * parentless founders, so they never share an ancestor and can breed immediately (§5.4a).
 */
export async function grantStarterHorses(db: DB, herdId: string): Promise<void> {
  const existing = await listHerdHorses(db, herdId);
  if (existing.length > 0) return;
  for (const starter of STARTER_HORSES) {
    await mintHorse(db, {
      herdId,
      genotype: starter.genotype,
      origin: 'founder',
      seed: starter.seed,
      lifeStage: 'adult', // adult so they can breed / adventure at once
    });
  }
}

export async function login(
  db: DB,
  username: string,
  password: string,
): Promise<AuthedHerd | null> {
  // Same fold as registration — login is case-insensitive on the handle.
  const user = await db.query.users.findFirst({
    where: eq(users.username, username.toLowerCase()),
  });
  if (!user || !verifyPassword(password, user.passwordHash)) return null;
  const herd = await db.query.herds.findFirst({ where: eq(herds.userId, user.id) });
  return herd ? { user, herd } : null;
}

export async function createSession(db: DB, userId: string): Promise<string> {
  const token = generateSessionToken();
  await db.insert(sessions).values({
    userId,
    tokenHash: hashToken(token),
    expiresAt: new Date(Date.now() + SESSION_TTL_MS),
  });
  return token;
}

export async function resolveSessionUser(
  db: DB,
  token: string | undefined,
): Promise<UserRow | null> {
  if (!token) return null;
  const row = await db.query.sessions.findFirst({
    where: eq(sessions.tokenHash, hashToken(token)),
  });
  if (!row || row.expiresAt.getTime() < Date.now()) return null;
  return (await db.query.users.findFirst({ where: eq(users.id, row.userId) })) ?? null;
}

export async function deleteSession(db: DB, token: string | undefined): Promise<void> {
  if (token) await db.delete(sessions).where(eq(sessions.tokenHash, hashToken(token)));
}

/**
 * Delete every session whose TTL has lapsed (audit follow-up). Expiry is already enforced
 * lazily at read (`resolveSessionUser`), so this changes no behaviour — it just stops the
 * `sessions` table growing without bound (one row per login/device, forever). Returns the
 * count purged. Run on an interval in prod (index.ts) and freely callable in tests.
 */
export async function purgeExpiredSessions(db: DB, nowMs = Date.now()): Promise<number> {
  const gone = await db
    .delete(sessions)
    .where(lt(sessions.expiresAt, new Date(nowMs)))
    .returning({ id: sessions.id });
  return gone.length;
}

export async function getHerdForUser(db: DB, userId: string): Promise<HerdRow | null> {
  return (await db.query.herds.findFirst({ where: eq(herds.userId, userId) })) ?? null;
}
