import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { z } from 'zod';

import { logEvent } from '../audit';
import {
  clearSessionCookie,
  currentUser,
  sensitiveActionLimiter,
} from '../auth';
import { decryptSecret, encryptSecret, monobankTokenAad } from '../crypto';
import {
  forgetMonobankToken,
  getMonobankClientInfo,
  MonobankAuthError,
} from '../monobank';
import { MAX_PASSWORD_LENGTH, verifyPassword } from '../password';
import { prisma } from '../prisma';

// =========================
// SETTINGS & ACCOUNT
// Everything here acts only on the logged-in user's own account.
// =========================

export const settingsRouter = Router();

// Connecting a bank token calls Monobank: 10 tries per hour per IP
const tokenLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  limit: 10,
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  message: { message: 'Too many attempts. Try later.' },
});

// Data export builds a large file: 5 per hour per IP
const exportLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  limit: 5,
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  message: { message: 'Too many exports. Try later.' },
});

settingsRouter.get('/api/settings', async (req, res) => {
  const authUser = currentUser(req);

  const user = await prisma.user.findUniqueOrThrow({
    where: { id: authUser.id },
    select: {
      email: true,
      role: true,
      createdAt: true,
      monobankTokenEnc: true,
      transferMarkers: true,
      familyIncomeMarkers: true,
    },
  });

  return res.json({
    email: user.email,
    role: user.role,
    createdAt: user.createdAt,
    // The token itself is NEVER sent back to the browser
    monobankConnected: user.monobankTokenEnc !== null,
    transferMarkers: user.transferMarkers,
    familyIncomeMarkers: user.familyIncomeMarkers,
  });
});

// Monobank personal tokens are long strings of letters, digits, - and _
const tokenSchema = z.object({
  token: z
    .string()
    .trim()
    .min(20)
    .max(200)
    .regex(/^[A-Za-z0-9_-]+$/),
});

settingsRouter.put('/api/settings/monobank', tokenLimiter, async (req, res) => {
  const user = currentUser(req);
  const parsed = tokenSchema.safeParse(req.body);

  if (!parsed.success) {
    return res.status(400).json({ message: 'This does not look like a Monobank token' });
  }

  const token = parsed.data.token;

  // Check the token with the bank before saving it
  try {
    await getMonobankClientInfo(token, { skipCache: true });
  } catch (error) {
    if (error instanceof MonobankAuthError) {
      return res.status(400).json({ message: 'Monobank rejected this token' });
    }

    console.error('Monobank token check failed:', error);

    return res.status(502).json({ message: 'Could not reach Monobank, try again later' });
  }

  const previous = await prisma.user.findUniqueOrThrow({
    where: { id: user.id },
    select: { monobankTokenEnc: true },
  });

  await prisma.user.update({
    where: { id: user.id },
    data: { monobankTokenEnc: encryptSecret(token, monobankTokenAad(user.id)) },
  });

  if (previous.monobankTokenEnc) {
    const oldToken = decryptSecret(previous.monobankTokenEnc, monobankTokenAad(user.id));

    if (oldToken) {
      forgetMonobankToken(oldToken);
    }
  }

  await logEvent(user.id, 'monobank_connected', req);

  return res.json({ monobankConnected: true });
});

settingsRouter.delete('/api/settings/monobank', async (req, res) => {
  const user = currentUser(req);

  const previous = await prisma.user.findUniqueOrThrow({
    where: { id: user.id },
    select: { monobankTokenEnc: true },
  });

  await prisma.user.update({
    where: { id: user.id },
    data: { monobankTokenEnc: null },
  });

  if (previous.monobankTokenEnc) {
    const oldToken = decryptSecret(previous.monobankTokenEnc, monobankTokenAad(user.id));

    if (oldToken) {
      forgetMonobankToken(oldToken);
    }

    await logEvent(user.id, 'monobank_removed', req);
  }

  return res.json({ monobankConnected: false });
});

const markersSchema = z.object({
  transferMarkers: z.string().max(1000),
  familyIncomeMarkers: z.string().max(1000),
});

settingsRouter.patch('/api/settings/markers', async (req, res) => {
  const user = currentUser(req);
  const parsed = markersSchema.safeParse(req.body);

  if (!parsed.success) {
    return res.status(400).json({ message: 'Invalid request data' });
  }

  const updated = await prisma.user.update({
    where: { id: user.id },
    data: {
      transferMarkers: parsed.data.transferMarkers.trim(),
      familyIncomeMarkers: parsed.data.familyIncomeMarkers.trim(),
    },
    select: { transferMarkers: true, familyIncomeMarkers: true },
  });

  return res.json(updated);
});

settingsRouter.get('/api/settings/security-log', async (req, res) => {
  const user = currentUser(req);

  const events = await prisma.auditLog.findMany({
    where: { userId: user.id },
    orderBy: { createdAt: 'desc' },
    take: 20,
    select: { event: true, ip: true, createdAt: true },
  });

  return res.json(events);
});

// =========================
// GDPR: download all my data
// =========================

settingsRouter.get('/api/account/export', exportLimiter, async (req, res) => {
  const authUser = currentUser(req);

  const [user, familyMembers, accounts, categories, merchantRules, transactions] =
    await Promise.all([
      prisma.user.findUniqueOrThrow({
        where: { id: authUser.id },
        select: {
          email: true,
          role: true,
          createdAt: true,
          transferMarkers: true,
          familyIncomeMarkers: true,
          monobankTokenEnc: true,
        },
      }),
      prisma.familyMember.findMany({
        where: { userId: authUser.id },
        select: { id: true, name: true, createdAt: true },
      }),
      prisma.account.findMany({
        where: { userId: authUser.id },
        select: {
          id: true,
          name: true,
          accountType: true,
          currency: true,
          balance: true,
          familyMemberId: true,
          bank: { select: { name: true } },
          createdAt: true,
        },
      }),
      prisma.category.findMany({
        where: { userId: authUser.id },
        select: { id: true, name: true },
      }),
      prisma.merchantRule.findMany({
        where: { userId: authUser.id },
        select: { merchant: true, categoryId: true, createdAt: true },
      }),
      prisma.transaction.findMany({
        where: { userId: authUser.id },
        orderBy: { date: 'asc' },
        select: {
          id: true,
          accountId: true,
          date: true,
          amount: true,
          currency: true,
          type: true,
          description: true,
          merchant: true,
          category: { select: { name: true } },
        },
      }),
    ]);

  await logEvent(authUser.id, 'data_exported', req);

  const { monobankTokenEnc, ...profile } = user;

  res.setHeader(
    'Content-Disposition',
    'attachment; filename="family-finance-export.json"',
  );

  return res.json({
    exportedAt: new Date().toISOString(),
    profile: { ...profile, monobankConnected: monobankTokenEnc !== null },
    familyMembers,
    accounts,
    categories,
    merchantRules,
    transactions,
  });
});

// =========================
// GDPR: delete my account and ALL my data
// =========================

const deleteSchema = z.object({
  password: z.string().min(1).max(MAX_PASSWORD_LENGTH),
  confirm: z.literal('DELETE'),
});

settingsRouter.delete('/api/account', sensitiveActionLimiter, async (req, res) => {
  const authUser = currentUser(req);
  const parsed = deleteSchema.safeParse(req.body);

  if (!parsed.success) {
    return res.status(400).json({
      message: 'Enter your password and type DELETE to confirm',
    });
  }

  const user = await prisma.user.findUniqueOrThrow({
    where: { id: authUser.id },
    select: { id: true, passwordHash: true, monobankTokenEnc: true },
  });

  if (!(await verifyPassword(parsed.data.password, user.passwordHash))) {
    return res.status(400).json({ message: 'Password is wrong' });
  }

  if (user.monobankTokenEnc) {
    const token = decryptSecret(user.monobankTokenEnc, monobankTokenAad(user.id));

    if (token) {
      forgetMonobankToken(token);
    }
  }

  // Cascade deletes accounts, transactions, categories, rules and logs
  await prisma.user.delete({ where: { id: user.id } });

  clearSessionCookie(res);

  return res.status(204).end();
});
