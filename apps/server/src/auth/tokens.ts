import { createHash, randomBytes } from 'node:crypto';

export const SESSION_COOKIE = 'blorse_session';
export const SESSION_TTL_MS = 1000 * 60 * 60 * 24 * 30; // 30 days

/** A high-entropy opaque token handed to the client (only its hash is stored). */
export function generateSessionToken(): string {
  return randomBytes(32).toString('base64url');
}

export function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}
