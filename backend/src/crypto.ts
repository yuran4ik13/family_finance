import {
  createCipheriv,
  createDecipheriv,
  randomBytes,
} from 'node:crypto';

import { config } from './config';

// =========================
// ENCRYPTION OF SECRETS (bank tokens)
// AES-256-GCM: industry-standard encryption that also detects tampering.
//
// - The key (ENCRYPTION_KEY) lives only in .env, never in the database.
//   A stolen database dump alone can't reveal anyone's bank token.
// - Every value gets its own random IV, so equal tokens look different.
// - "Associated data" ties a token to its owner (e.g. "user:7"): an
//   encrypted token copied into another user's row won't decrypt.
//
// Stored format:  v1.<iv>.<authTag>.<ciphertext>   (base64url parts)
// =========================

const ALGORITHM = 'aes-256-gcm';
const VERSION = 'v1';

export function encryptSecret(plainText: string, associatedData: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv(ALGORITHM, config.encryptionKey, iv);

  cipher.setAAD(Buffer.from(associatedData, 'utf8'));

  const encrypted = Buffer.concat([
    cipher.update(plainText, 'utf8'),
    cipher.final(),
  ]);

  return [
    VERSION,
    iv.toString('base64url'),
    cipher.getAuthTag().toString('base64url'),
    encrypted.toString('base64url'),
  ].join('.');
}

// Returns null if the value was tampered with, belongs to someone else,
// or was encrypted with a different key.
export function decryptSecret(
  stored: string,
  associatedData: string,
): string | null {
  const [version, ivPart, tagPart, dataPart] = stored.split('.');

  if (version !== VERSION || !ivPart || !tagPart || dataPart === undefined) {
    return null;
  }

  try {
    const decipher = createDecipheriv(
      ALGORITHM,
      config.encryptionKey,
      Buffer.from(ivPart, 'base64url'),
    );

    decipher.setAAD(Buffer.from(associatedData, 'utf8'));
    decipher.setAuthTag(Buffer.from(tagPart, 'base64url'));

    return Buffer.concat([
      decipher.update(Buffer.from(dataPart, 'base64url')),
      decipher.final(),
    ]).toString('utf8');
  } catch {
    return null;
  }
}

export function monobankTokenAad(userId: number): string {
  return `user:${userId}:monobank`;
}
