import { randomBytes, scryptSync, timingSafeEqual } from 'node:crypto';

// scrypt parameters (N*r*p). 16384·8·1 ≈ 16 MB — well within Node's default maxmem.
const N = 16384;
const R = 8;
const P = 1;
const KEYLEN = 32;

/** `scrypt$N$r$p$saltHex$hashHex` — self-describing so params can evolve. */
export function hashPassword(password: string): string {
  const salt = randomBytes(16);
  const dk = scryptSync(password, salt, KEYLEN, { N, r: R, p: P });
  return `scrypt$${N}$${R}$${P}$${salt.toString('hex')}$${dk.toString('hex')}`;
}

export function verifyPassword(password: string, stored: string): boolean {
  const parts = stored.split('$');
  if (parts.length !== 6 || parts[0] !== 'scrypt') return false;
  const [, nStr = '', rStr = '', pStr = '', saltHex = '', hashHex = ''] = parts;
  const salt = Buffer.from(saltHex, 'hex');
  const expected = Buffer.from(hashHex, 'hex');
  if (expected.length === 0) return false;
  const dk = scryptSync(password, salt, expected.length, {
    N: Number(nStr),
    r: Number(rStr),
    p: Number(pStr),
  });
  return dk.length === expected.length && timingSafeEqual(dk, expected);
}
