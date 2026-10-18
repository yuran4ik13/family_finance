import 'dotenv/config';

import { z } from 'zod';

// =========================
// CONFIG
// All settings come from .env and are checked once at startup.
// If something important is missing, the server refuses to start
// instead of running in an unsafe state.
// =========================

const envSchema = z.object({
  NODE_ENV: z
    .enum(['development', 'production', 'test'])
    .default('development'),

  PORT: z.coerce.number().int().min(1).max(65535).default(3000),

  DATABASE_URL: z.string().min(1, 'DATABASE_URL is required'),

  // Secret used to sign login tokens. Long random string, never commit it.
  // Generate one with:  openssl rand -base64 48
  JWT_SECRET: z
    .string()
    .min(32, 'JWT_SECRET must be at least 32 characters long'),

  // How long a login lasts
  SESSION_HOURS: z.coerce.number().int().min(1).max(24 * 30).default(12),

  // Where the frontend runs. Only this origin may call the API.
  // Several origins can be separated with commas.
  FRONTEND_ORIGIN: z.string().default('http://localhost:5173'),

  // Set to "true" when the backend runs behind a reverse proxy
  // (Render, Railway, Nginx...) so rate limiting sees real client IPs.
  TRUST_PROXY: z
    .enum(['true', 'false'])
    .default('false')
    .transform((value) => value === 'true'),

  // Key that encrypts users' bank tokens in the database (AES-256-GCM).
  // Exactly 32 random bytes, base64. Generate:  openssl rand -base64 32
  // If you lose it, saved bank tokens can't be decrypted (users reconnect).
  ENCRYPTION_KEY: z
    .string()
    .refine(
      (value) => Buffer.from(value, 'base64').length === 32,
      'ENCRYPTION_KEY must be 32 bytes in base64 (openssl rand -base64 32)',
    ),

  // "true" opens the Sign up page for everyone. Keep "false" on your own
  // laptop; turn on only on a server meant for other people.
  ALLOW_REGISTRATION: z
    .enum(['true', 'false'])
    .default('false')
    .transform((value) => value === 'true'),

  // "strict" when frontend and API share one site (recommended).
  // "none" only if they live on different domains (requires HTTPS).
  COOKIE_SAMESITE: z.enum(['strict', 'lax', 'none']).default('strict'),
});

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  console.error('❌ Invalid environment variables:');

  for (const issue of parsed.error.issues) {
    console.error(`  - ${issue.path.join('.')}: ${issue.message}`);
  }

  console.error('See backend/.env.example');
  process.exit(1);
}

const env = parsed.data;

if (env.COOKIE_SAMESITE === 'none' && env.NODE_ENV !== 'production') {
  console.error(
    '❌ COOKIE_SAMESITE=none needs HTTPS. Use it only with NODE_ENV=production.',
  );
  process.exit(1);
}

const weakSecrets = ['change_me', 'secret', 'your_jwt_secret'];

if (weakSecrets.some((weak) => env.JWT_SECRET.toLowerCase().includes(weak))) {
  console.error(
    '❌ JWT_SECRET looks like a placeholder. Generate a real one: openssl rand -base64 48',
  );
  process.exit(1);
}

if (Buffer.from(env.ENCRYPTION_KEY, 'base64').toString('base64') === env.JWT_SECRET) {
  console.error('❌ ENCRYPTION_KEY must be different from JWT_SECRET');
  process.exit(1);
}

export const config = {
  isProduction: env.NODE_ENV === 'production',
  port: env.PORT,
  jwtSecret: env.JWT_SECRET,
  sessionMs: env.SESSION_HOURS * 60 * 60 * 1000,
  frontendOrigins: env.FRONTEND_ORIGIN.split(',')
    .map((origin) => origin.trim())
    .filter(Boolean),
  trustProxy: env.TRUST_PROXY,
  cookieSameSite: env.COOKIE_SAMESITE,
  encryptionKey: Buffer.from(env.ENCRYPTION_KEY, 'base64'),
  allowRegistration: env.ALLOW_REGISTRATION,
};
