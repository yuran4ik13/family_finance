import type {
  CookieOptions,
  NextFunction,
  Request,
  Response,
} from 'express';
import { Router } from 'express';
import rateLimit, { ipKeyGenerator } from 'express-rate-limit';
import jwt from 'jsonwebtoken';
import { z } from 'zod';

import { config } from './config';
import {
  getDummyHash,
  MAX_PASSWORD_LENGTH,
  verifyPassword,
} from './password';
import { prisma } from './prisma';

// =========================
// AUTH
// Login with email + password. After a successful login the server
// puts a signed token into an httpOnly cookie:
//   - httpOnly  -> JavaScript in the page can't read it (protects from XSS)
//   - secure    -> sent only over HTTPS (in production)
//   - sameSite  -> other websites can't send requests with it (CSRF)
// =========================

export const SESSION_COOKIE = 'ff_session';

export type AuthUser = {
  id: number;
  email: string;
  role: 'OWNER' | 'DEMO';
};

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      user?: AuthUser;
    }
  }
}

type TokenPayload = {
  sub: string;
  tv: number;
};

function cookieOptions(): CookieOptions {
  return {
    httpOnly: true,
    secure: config.isProduction,
    sameSite: config.cookieSameSite,
    path: '/',
  };
}

function signToken(userId: number, tokenVersion: number): string {
  const payload: TokenPayload = {
    sub: String(userId),
    tv: tokenVersion,
  };

  return jwt.sign(payload, config.jwtSecret, {
    algorithm: 'HS256',
    expiresIn: Math.floor(config.sessionMs / 1000),
  });
}

async function getUserFromRequest(
  req: Request,
): Promise<AuthUser | null> {
  const token: unknown = req.cookies?.[SESSION_COOKIE];

  if (typeof token !== 'string' || token.length === 0) {
    return null;
  }

  let payload: TokenPayload;

  try {
    // algorithms is pinned so a forged token with "alg: none" is rejected
    payload = jwt.verify(token, config.jwtSecret, {
      algorithms: ['HS256'],
    }) as TokenPayload;
  } catch {
    return null;
  }

  const userId = Number(payload.sub);

  if (!Number.isInteger(userId)) {
    return null;
  }

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      id: true,
      email: true,
      role: true,
      tokenVersion: true,
    },
  });

  // User deleted, or logged out everywhere -> old tokens stop working
  if (!user || user.tokenVersion !== payload.tv) {
    return null;
  }

  return {
    id: user.id,
    email: user.email,
    role: user.role,
  };
}

// Protects every route registered after it
export async function requireAuth(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  const user = await getUserFromRequest(req);

  if (!user) {
    return res.status(401).json({
      message: 'Not authenticated',
    });
  }

  req.user = user;

  return next();
}

// The demo account can look around but can't change anything
// and can't trigger bank syncs.
export function blockDemoWrites(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  const isReadOnlyMethod = ['GET', 'HEAD', 'OPTIONS'].includes(req.method);

  if (req.user?.role === 'DEMO' && !isReadOnlyMethod) {
    return res.status(403).json({
      message: 'The demo account is read-only',
    });
  }

  return next();
}

// =========================
// ROUTES: /api/auth/*
// =========================

export const authRouter = Router();

// Max 5 failed logins per email+IP in 15 minutes...
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 5,
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  skipSuccessfulRequests: true,
  keyGenerator: (req) => {
    const email = String(req.body?.email ?? '')
      .toLowerCase()
      .slice(0, 254);

    return `${ipKeyGenerator(req.ip ?? '')}|${email}`;
  },
  message: {
    message: 'Too many login attempts. Try again in 15 minutes.',
  },
});

// ...and max 20 login attempts per IP in 15 minutes for any emails
const loginIpLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 20,
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  message: {
    message: 'Too many login attempts. Try again in 15 minutes.',
  },
});

const loginSchema = z.object({
  email: z.string().trim().toLowerCase().email().max(254),
  password: z.string().min(1).max(MAX_PASSWORD_LENGTH),
});

authRouter.post(
  '/api/auth/login',
  loginIpLimiter,
  loginLimiter,
  async (req, res) => {
    const parsed = loginSchema.safeParse(req.body);

    if (!parsed.success) {
      return res.status(400).json({
        message: 'Email and password are required',
      });
    }

    const { email, password } = parsed.data;

    const user = await prisma.user.findUnique({
      where: { email },
    });

    // Always run the slow hash check, even for unknown emails
    const passwordOk = await verifyPassword(
      password,
      user?.passwordHash ?? (await getDummyHash()),
    );

    if (!user || !passwordOk) {
      // Same message for both cases: don't reveal which part was wrong
      return res.status(401).json({
        message: 'Invalid email or password',
      });
    }

    res.cookie(SESSION_COOKIE, signToken(user.id, user.tokenVersion), {
      ...cookieOptions(),
      maxAge: config.sessionMs,
    });

    return res.json({
      id: user.id,
      email: user.email,
      role: user.role,
    });
  },
);

authRouter.post('/api/auth/logout', (req, res) => {
  res.clearCookie(SESSION_COOKIE, cookieOptions());

  return res.status(204).end();
});

// Logs out on every device by invalidating all existing tokens
authRouter.post(
  '/api/auth/logout-all',
  requireAuth,
  blockDemoWrites,
  async (req, res) => {
    await prisma.user.update({
      where: { id: req.user!.id },
      data: { tokenVersion: { increment: 1 } },
    });

    res.clearCookie(SESSION_COOKIE, cookieOptions());

    return res.status(204).end();
  },
);

authRouter.get('/api/auth/me', requireAuth, (req, res) => {
  return res.json(req.user);
});
