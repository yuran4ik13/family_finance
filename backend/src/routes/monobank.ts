import type { Request, Response } from 'express';
import { Router } from 'express';
import { z } from 'zod';

import { currentUser } from '../auth';
import {
  buildContext,
  getAccountTypeName,
  getCategoryMap,
  getCurrency,
  resolveTransactionCategoryId,
  type CategorizeContext,
  type CategoryMap,
} from '../categorize';
import { decryptSecret, monobankTokenAad } from '../crypto';
import {
  getMonobankClientInfo,
  getMonobankStatement,
  MonobankAuthError,
  type MonobankStatementItem,
} from '../monobank';
import { prisma } from '../prisma';

// =========================
// MONOBANK SYNC
// Uses the logged-in user's OWN token (decrypted only for the request).
// Synced accounts and transactions always get that user's id.
// =========================

export const monobankRouter = Router();

// Monobank gives at most 31 days and 500 transactions per request
const MAX_RANGE_SECONDS = 31 * 24 * 60 * 60;
const PAGE_SIZE = 500;

// One sync at a time per user: protects the bank quota and stops a
// user from starting dozens of parallel syncs.
const runningSyncs = new Set<number>();

class NoTokenError extends Error {}

async function getUserToken(userId: number): Promise<string> {
  const user = await prisma.user.findUniqueOrThrow({
    where: { id: userId },
    select: { monobankTokenEnc: true },
  });

  const token = user.monobankTokenEnc
    ? decryptSecret(user.monobankTokenEnc, monobankTokenAad(userId))
    : null;

  if (!token) {
    throw new NoTokenError();
  }

  return token;
}

// Runs a sync with the per-user lock and turns known errors into
// clear messages for the user.
async function withSync(
  req: Request,
  res: Response,
  work: (userId: number, token: string) => Promise<unknown>,
) {
  const user = currentUser(req);

  if (runningSyncs.has(user.id)) {
    return res.status(409).json({ message: 'A sync is already running' });
  }

  runningSyncs.add(user.id);

  try {
    const token = await getUserToken(user.id);

    return res.json(await work(user.id, token));
  } catch (error) {
    if (error instanceof NoTokenError) {
      return res.status(400).json({
        message: 'Connect your Monobank token in Settings first',
      });
    }

    if (error instanceof MonobankAuthError) {
      return res.status(400).json({
        message: 'Monobank rejected your token. Update it in Settings.',
      });
    }

    console.error('Monobank sync failed:', error);

    return res.status(502).json({ message: 'Monobank sync failed' });
  } finally {
    runningSyncs.delete(user.id);
  }
}

async function getMonobankBankId(): Promise<number> {
  const bank = await prisma.bank.upsert({
    where: { name: 'Monobank' },
    update: {},
    create: { name: 'Monobank' },
    select: { id: true },
  });

  return bank.id;
}

async function getDefaultFamilyMemberId(userId: number): Promise<number> {
  const existing = await prisma.familyMember.findFirst({
    where: { userId },
    orderBy: { id: 'asc' },
    select: { id: true },
  });

  if (existing) {
    return existing.id;
  }

  const created = await prisma.familyMember.create({
    data: { userId, name: 'Me' },
    select: { id: true },
  });

  return created.id;
}

async function syncAccounts(userId: number, token: string) {
  const [clientInfo, bankId, familyMemberId] = await Promise.all([
    getMonobankClientInfo(token),
    getMonobankBankId(),
    getDefaultFamilyMemberId(userId),
  ]);

  const synced = [];

  for (const monoAccount of clientInfo.accounts) {
    const currency = getCurrency(monoAccount.currencyCode);
    const accountType = monoAccount.type ?? 'unknown';
    const name = `Monobank ${getAccountTypeName(accountType)} ${currency}`;
    const balance = monoAccount.balance / 100;

    const account = await prisma.account.upsert({
      where: {
        userId_bankId_externalId: {
          userId,
          bankId,
          externalId: monoAccount.id,
        },
      },
      update: { name, accountType, currency, balance },
      create: {
        userId,
        bankId,
        familyMemberId,
        externalId: monoAccount.id,
        name,
        accountType,
        currency,
        balance,
      },
      select: {
        id: true,
        name: true,
        accountType: true,
        currency: true,
        balance: true,
      },
    });

    synced.push(account);
  }

  return { synced: synced.length, accounts: synced };
}

type SyncAccount = {
  id: number;
  externalId: string | null;
  currency: string;
};

async function importItems(
  context: CategorizeContext,
  categoryByName: CategoryMap,
  account: SyncAccount,
  items: MonobankStatementItem[],
) {
  let created = 0;
  let skipped = 0;

  for (const item of items) {
    const description = (item.description ?? '').slice(0, 500);
    const type = item.amount >= 0 ? 'INCOME' : 'EXPENSE';

    try {
      await prisma.transaction.create({
        data: {
          userId: context.userId,
          accountId: account.id,
          externalId: item.id,
          amount: item.amount / 100,
          currency: account.currency,
          description,
          merchant: description || null,
          type,
          date: new Date(item.time * 1000),
          categoryId: await resolveTransactionCategoryId(
            context,
            description,
            description || null,
            type,
            categoryByName,
          ),
        },
      });

      created++;
    } catch (error: unknown) {
      if (
        typeof error === 'object' &&
        error !== null &&
        'code' in error &&
        error.code === 'P2002'
      ) {
        skipped++;
        continue;
      }

      throw error;
    }
  }

  return { created, skipped };
}

async function getConnectedAccounts(userId: number, accountId?: number) {
  return prisma.account.findMany({
    where: {
      userId,
      externalId: { not: null },
      ...(accountId !== undefined ? { id: accountId } : {}),
    },
    select: { id: true, name: true, externalId: true, currency: true },
  });
}

// Imports a period for the given accounts, walking back in 31-day windows
async function importPeriod(
  userId: number,
  token: string,
  accounts: Awaited<ReturnType<typeof getConnectedAccounts>>,
  days: number,
) {
  const user = await prisma.user.findUniqueOrThrow({
    where: { id: userId },
    select: { id: true, transferMarkers: true, familyIncomeMarkers: true },
  });

  const context = buildContext(user);
  const categoryByName = await getCategoryMap(userId);

  const now = Math.floor(Date.now() / 1000);
  const start = now - days * 24 * 60 * 60;

  let requests = 0;
  let received = 0;
  let created = 0;
  let skipped = 0;

  for (const account of accounts) {
    if (!account.externalId) {
      continue;
    }

    let windowTo = now;

    while (windowTo > start) {
      const windowFrom = Math.max(start, windowTo - MAX_RANGE_SECONDS);

      const statement = await getMonobankStatement(
        token,
        account.externalId,
        windowFrom,
        windowTo,
      );

      requests++;
      received += statement.length;

      const result = await importItems(context, categoryByName, account, statement);

      created += result.created;
      skipped += result.skipped;

      if (statement.length >= PAGE_SIZE) {
        // The bank returned only the newest 500 - continue with older ones
        const oldestTime = Math.min(...statement.map((item) => item.time));

        windowTo = oldestTime < windowTo ? oldestTime : windowFrom;
      } else {
        windowTo = windowFrom;
      }
    }
  }

  return { accounts: accounts.length, days, requests, received, created, skipped };
}

// =========================
// ROUTES
// =========================

monobankRouter.get('/api/monobank/client-info', (req, res) =>
  withSync(req, res, async (userId, token) => {
    const clientInfo = await getMonobankClientInfo(token);

    return {
      accounts: clientInfo.accounts.map((account) => ({
        id: account.id,
        currencyCode: account.currencyCode,
        balance: account.balance,
        type: account.type,
      })),
    };
  }),
);

monobankRouter.post('/api/monobank/sync-accounts', (req, res) =>
  withSync(req, res, syncAccounts),
);

monobankRouter.post('/api/monobank/sync-transactions/:id', async (req, res) => {
  const accountId = z.coerce.number().int().positive().safeParse(req.params.id);

  if (!accountId.success) {
    return res.status(400).json({ message: 'Invalid account id' });
  }

  const accounts = await getConnectedAccounts(currentUser(req).id, accountId.data);

  if (accounts.length === 0) {
    return res.status(404).json({ message: 'Account not found' });
  }

  return withSync(req, res, async (userId, token) => {
    const result = await importPeriod(userId, token, accounts, 1);

    return { received: result.received, created: result.created, skipped: result.skipped };
  });
});

monobankRouter.post('/api/monobank/sync-all-transactions', (req, res) =>
  withSync(req, res, async (userId, token) => {
    const accounts = await getConnectedAccounts(userId);
    const result = await importPeriod(userId, token, accounts, 31);

    return {
      accounts: result.accounts,
      received: result.received,
      created: result.created,
      skipped: result.skipped,
    };
  }),
);

// POST /api/monobank/backfill?days=60 - loads older history
monobankRouter.post('/api/monobank/backfill', (req, res) => {
  const days = Number(req.query.days ?? 60);

  if (!Number.isInteger(days) || days < 1 || days > 365) {
    return res.status(400).json({ message: 'days must be between 1 and 365' });
  }

  return withSync(req, res, async (userId, token) => {
    const accounts = await getConnectedAccounts(userId);

    return importPeriod(userId, token, accounts, days);
  });
});
