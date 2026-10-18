import {
  randomBytes,
  scrypt as scryptCallback,
  timingSafeEqual,
} from 'node:crypto';
import { promisify } from 'node:util';

// =========================
// PASSWORD HASHING
// Passwords are NEVER stored as plain text. We store a scrypt hash:
// a slow, salted one-way function built into Node.js, so even if the
// database leaks, the original passwords can't be read back.
// Stored format:  scrypt$N$r$p$salt$hash  (salt and hash in base64)
// =========================

const scrypt = promisify(scryptCallback) as (
  password: string,
  salt: Buffer,
  keylen: number,
  options: { N: number; r: number; p: number; maxmem: number },
) => Promise<Buffer>;

const N = 2 ** 15; // cost: higher = slower to brute force
const R = 8;
const P = 1;
const KEY_LENGTH = 64;
const MAX_MEM = 64 * 1024 * 1024;

export const MIN_PASSWORD_LENGTH = 12;
export const MAX_PASSWORD_LENGTH = 200;

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16);

  const hash = await scrypt(password, salt, KEY_LENGTH, {
    N,
    r: R,
    p: P,
    maxmem: MAX_MEM,
  });

  return [
    'scrypt',
    N,
    R,
    P,
    salt.toString('base64'),
    hash.toString('base64'),
  ].join('$');
}

export async function verifyPassword(
  password: string,
  stored: string,
): Promise<boolean> {
  const parts = stored.split('$');

  if (parts.length !== 6 || parts[0] !== 'scrypt') {
    return false;
  }

  const [, n, r, p, saltB64, hashB64] = parts as [
    string,
    string,
    string,
    string,
    string,
    string,
  ];

  const expected = Buffer.from(hashB64, 'base64');

  const actual = await scrypt(
    password,
    Buffer.from(saltB64, 'base64'),
    expected.length,
    {
      N: Number(n),
      r: Number(r),
      p: Number(p),
      maxmem: MAX_MEM,
    },
  );

  // Constant-time comparison: doesn't leak how many bytes matched
  return (
    actual.length === expected.length &&
    timingSafeEqual(actual, expected)
  );
}

// A real hash of a random password. Used when the email doesn't exist,
// so a wrong email and a wrong password take the same time to answer
// (otherwise an attacker could find out which emails are registered).
let dummyHashPromise: Promise<string> | null = null;

export function getDummyHash(): Promise<string> {
  dummyHashPromise ??= hashPassword(randomBytes(32).toString('hex'));

  return dummyHashPromise;
}
