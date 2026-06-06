import { randomInt } from 'node:crypto';
import { eq } from 'drizzle-orm';
import { hashPassword, verifyPassword } from '../auth/password.js';
import { generateSessionToken, hashToken, SESSION_TTL_MS } from '../auth/tokens.js';
import type { DB } from '../db/client.js';
import { herds, sessions, users, type HerdRow, type UserRow } from '../db/schema.js';

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

/** Create a User + its 1:1 Herd atomically (BLORSE_PLAN.md §6). */
export async function registerUser(
  db: DB,
  username: string,
  password: string,
): Promise<AuthedHerd> {
  const existing = await db.query.users.findFirst({ where: eq(users.username, username) });
  if (existing) throw new UsernameTakenError();

  const passwordHash = hashPassword(password);
  return db.transaction(async (tx) => {
    const [user] = await tx.insert(users).values({ username, passwordHash }).returning();
    if (!user) throw new Error('failed to create user');
    const name = `${HERD_NAMES[randomInt(HERD_NAMES.length)] ?? 'Wandering'} Herd`;
    const [herd] = await tx
      .insert(herds)
      .values({ userId: user.id, name, simSeed: randomInt(1, 2 ** 31) })
      .returning();
    if (!herd) throw new Error('failed to create herd');
    return { user, herd };
  });
}

export async function login(
  db: DB,
  username: string,
  password: string,
): Promise<AuthedHerd | null> {
  const user = await db.query.users.findFirst({ where: eq(users.username, username) });
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

export async function getHerdForUser(db: DB, userId: string): Promise<HerdRow | null> {
  return (await db.query.herds.findFirst({ where: eq(herds.userId, userId) })) ?? null;
}
