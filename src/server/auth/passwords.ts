/**
 * Password hashing.
 *
 * scrypt from Node's own crypto - no dependency to keep current, and a memory-
 * hard function rather than a fast hash, so a stolen database is expensive to
 * attack. Parameters are stored alongside each hash, so raising them later
 * leaves existing passwords readable until their owners next sign in.
 */

import { randomBytes, scrypt as scryptCallback, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';

const scrypt = promisify(scryptCallback) as (
  password: string,
  salt: Buffer,
  keylen: number,
  options: { N: number; r: number; p: number; maxmem: number },
) => Promise<Buffer>;

const N = 2 ** 15;
const R = 8;
const P = 1;
const KEY_LENGTH = 64;
// 128 * N * r is the working set; the default 32MB cap is just under what
// N=32768 needs, so it is raised rather than the cost being lowered.
const MAX_MEM = 96 * 1024 * 1024;

export const MINIMUM_PASSWORD_LENGTH = 10;

export function passwordProblem(password: string): string | null {
  if (password.length < MINIMUM_PASSWORD_LENGTH) {
    return `A password needs at least ${MINIMUM_PASSWORD_LENGTH} characters.`;
  }
  if (password.trim().length === 0) return 'A password cannot be only spaces.';
  return null;
}

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16);
  const derived = await scrypt(password.normalize('NFKC'), salt, KEY_LENGTH, { N, r: R, p: P, maxmem: MAX_MEM });
  return ['scrypt', N, R, P, salt.toString('base64url'), derived.toString('base64url')].join('$');
}

/** Constant-time, and false rather than throwing on a stored value it cannot read. */
export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const parts = stored.split('$');
  if (parts.length !== 6 || parts[0] !== 'scrypt') return false;
  const [, n, r, p, salt, expected] = parts;
  const expectedBuffer = Buffer.from(expected!, 'base64url');
  try {
    const derived = await scrypt(password.normalize('NFKC'), Buffer.from(salt!, 'base64url'), expectedBuffer.length, {
      N: Number(n),
      r: Number(r),
      p: Number(p),
      maxmem: MAX_MEM,
    });
    return derived.length === expectedBuffer.length && timingSafeEqual(derived, expectedBuffer);
  } catch {
    return false;
  }
}
