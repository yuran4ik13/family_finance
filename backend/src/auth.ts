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

import { logEvent } from './audit';
import { getCategoryMap } from './categorize';
import { config } from './config';
import {
  checkNewPassword,
  getDummyHash,
  hashPassword,
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

export type UserRole = 'OWNER' | 'USER' | 'DEMO';

export type AuthUser = {
  id: number;
  email: string;
  role: UserRole;
  transferMarkers: string;
  familyIncomeMarkers: string;
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

export function setSessionCookie(
  res: Response,
  userId: number,
  tokenVersion: number,
): void {
  res.cookie(SESSION_COOKIE, signToken(userId, tokenVersion), {
    ...cookieOptions(),
    maxAge: config.sessionMs,
  });
}

export function clearSessionCookie(res: Response): void {
  res.clearCookie(SESSION_COOKIE, cookieOptions());
}

// What the frontend is allowed to know about the logged-in user
export function publicUser(user: AuthUser) {
  return {
    id: user.id,
    email: user.email,
    role: user.role,
  };
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
      transferMarkers: true,
      familyIncomeMarkers: true,
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
    transferMarkers: user.transferMarkers,
    familyIncomeMarkers: user.familyIncomeMarkers,
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

// Use inside routes that run after requireAuth
export function currentUser(req: Request): AuthUser {
  if (!req.user) {
    throw new Error('currentUser() used on a route without requireAuth');
  }

  return req.user;
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

export function requireOwner(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  if (req.user?.role !== 'OWNER') {
    return res.status(403).json({ message: 'Only the server owner can do this' });
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

// Max 5 new accounts per IP per hour (stops mass fake sign-ups)
const registerLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  limit: 5,
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  message: { message: 'Too many sign-ups from this network. Try later.' },
});

// Password changes / account deletion: 10 per hour per IP
const sensitiveActionLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  limit: 10,
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  message: { message: 'Too many attempts. Try later.' },
});

const emailSchema = z.string().trim().toLowerCase().email().max(254);

const loginSchema = z.object({
  email: emailSchema,
  password: z.string().min(1).max(MAX_PASSWORD_LENGTH),
});

// Tells the frontend whether to show the "Sign up" link
authRouter.get('/api/auth/config', (req, res) => {
  return res.json({
    registrationEnabled: config.allowRegistration,
  });
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
      await logEvent(user?.id ?? null, 'login_failed', req);

      // Same message for both cases: don't reveal which part was wrong
      return res.status(401).json({
        message: 'Invalid email or password',
      });
    }

    setSessionCookie(res, user.id, user.tokenVersion);
    await logEvent(user.id, 'login_success', req);

    return res.json({
      id: user.id,
      email: user.email,
      role: user.role,
    });
  },
);

const registerSchema = z.object({
  email: emailSchema,
  password: z.string().max(MAX_PASSWORD_LENGTH),
});

function registrationOpen(req: Request, res: Response, next: NextFunction) {
  if (!config.allowRegistration) {
    return res.status(403).json({ message: 'Sign up is disabled on this server' });
  }

  return next();
}

authRouter.post('/api/auth/register', registrationOpen, registerLimiter, async (req, res) => {
  const parsed = registerSchema.safeParse(req.body);

  if (!parsed.success) {
    return res.status(400).json({ message: 'Enter a valid email and password' });
  }

  const { email, password } = parsed.data;
  const passwordProblem = checkNewPassword(password, email);

  if (passwordProblem) {
    return res.status(400).json({ message: passwordProblem });
  }

  const passwordHash = await hashPassword(password);

  try {
    const user = await prisma.user.create({
      data: {
        email,
        passwordHash,
        role: 'USER',
        familyMembers: { create: { name: 'Me' } },
      },
    });

    await getCategoryMap(user.id);
    await logEvent(user.id, 'register', req);

    setSessionCookie(res, user.id, user.tokenVersion);

    return res.status(201).json({
      id: user.id,
      email: user.email,
      role: user.role,
    });
  } catch (error: unknown) {
    if (
      typeof error === 'object' &&
      error !== null &&
      'code' in error &&
      error.code === 'P2002'
    ) {
      // Trade-off: saying "already registered" reveals that the email
      // has an account. Sign-up is rate limited to make that expensive.
      return res.status(409).json({
        message: 'An account with this email already exists',
      });
    }

    throw error;
  }
});

authRouter.post('/api/auth/logout', (req, res) => {
  clearSessionCookie(res);

  return res.status(204).end();
});

// Logs out on every device by invalidating all existing tokens
authRouter.post(
  '/api/auth/logout-all',
  requireAuth,
  blockDemoWrites,
  async (req, res) => {
    const user = currentUser(req);

    await prisma.user.update({
      where: { id: user.id },
      data: { tokenVersion: { increment: 1 } },
    });

    await logEvent(user.id, 'logout_all', req);
    clearSessionCookie(res);

    return res.status(204).end();
  },
);

const changePasswordSchema = z.object({
  currentPassword: z.string().min(1).max(MAX_PASSWORD_LENGTH),
  newPassword: z.string().max(MAX_PASSWORD_LENGTH),
});

// Changing the password logs out every other device
authRouter.post(
  '/api/auth/change-password',
  sensitiveActionLimiter,
  requireAuth,
  blockDemoWrites,
  async (req, res) => {
    const parsed = changePasswordSchema.safeParse(req.body);

    if (!parsed.success) {
      return res.status(400).json({ message: 'Invalid request data' });
    }

    const authUser = currentUser(req);
    const user = await prisma.user.findUniqueOrThrow({
      where: { id: authUser.id },
    });

    if (!(await verifyPassword(parsed.data.currentPassword, user.passwordHash))) {
      return res.status(400).json({ message: 'Current password is wrong' });
    }

    const passwordProblem = checkNewPassword(parsed.data.newPassword, user.email);

    if (passwordProblem) {
      return res.status(400).json({ message: passwordProblem });
    }

    const updated = await prisma.user.update({
      where: { id: user.id },
      data: {
        passwordHash: await hashPassword(parsed.data.newPassword),
        tokenVersion: { increment: 1 },
      },
    });

    await logEvent(user.id, 'password_changed', req);

    // Keep THIS device logged in with a fresh token
    setSessionCookie(res, updated.id, updated.tokenVersion);

    return res.status(204).end();
  },
);

authRouter.get('/api/auth/me', requireAuth, (req, res) => {
  return res.json(publicUser(currentUser(req)));
});

export { sensitiveActionLimiter };
