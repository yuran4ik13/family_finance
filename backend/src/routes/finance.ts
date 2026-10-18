import { Router } from 'express';
import { z } from 'zod';

import { currentUser, requireOwner } from '../auth';
import {
  buildContext,
  getCategoryMap,
  getTransactionCategorySource,
  merchantKey,
  resolveTransactionCategoryId,
  upsertMerchantRule,
} from '../categorize';
import { prisma } from '../prisma';

// =========================
// FINANCE ROUTES
// RULE: every query includes `userId: user.id`.
// Ids coming from the browser (account, category, transaction, rule) are
// always looked up TOGETHER with userId, so guessing someone else's id
// returns "not found" instead of their data.
// =========================

export const financeRouter = Router();

const idSchema = z.coerce.number().int().positive();

const nameSchema = z.object({
  name: z.string().trim().min(1).max(100),
});

const createAccountSchema = z.object({
  name: z.string().trim().min(1).max(100),
  currency: z.string().trim().toUpperCase().regex(/^[A-Z]{3}$/),
  familyMemberId: z.number().int().positive(),
  bankId: z.number().int().positive(),
});

const createTransactionSchema = z.object({
  accountId: z.number().int().positive(),
  amount: z.number().finite().refine((value) => Math.abs(value) < 1e12),
  currency: z.string().trim().toUpperCase().regex(/^[A-Z]{3}$/),
  description: z.string().max(500).optional(),
  merchant: z.string().max(200).optional(),
  type: z.enum(['INCOME', 'EXPENSE', 'TRANSFER']),
  date: z.coerce.date(),
  externalId: z.string().max(100).optional(),
  categoryId: z.number().int().positive().nullable().optional(),
});

const merchantRuleSchema = z.object({
  merchant: z.string().trim().min(1).max(200),
  categoryId: z.coerce.number().int().positive(),
});

function isUniqueViolation(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    error.code === 'P2002'
  );
}

async function userOwnsCategory(userId: number, categoryId: number) {
  return prisma.category.findFirst({
    where: { id: categoryId, userId },
    select: { id: true, name: true },
  });
}

// =========================
// FAMILY MEMBERS
// =========================

financeRouter.get('/api/family-members', async (req, res) => {
  const user = currentUser(req);

  const familyMembers = await prisma.familyMember.findMany({
    where: { userId: user.id },
    select: { id: true, name: true, createdAt: true, updatedAt: true },
    orderBy: { id: 'asc' },
  });

  return res.json(familyMembers);
});

// =========================
// BANKS (shared list of bank names, no personal data)
// =========================

financeRouter.get('/api/banks', async (req, res) => {
  const banks = await prisma.bank.findMany({ orderBy: { id: 'asc' } });

  return res.json(banks);
});

// Only the server owner may add banks to the shared list
financeRouter.post('/api/banks', requireOwner, async (req, res) => {
  const parsed = nameSchema.safeParse(req.body);

  if (!parsed.success) {
    return res.status(400).json({ message: 'Invalid request data' });
  }

  try {
    const bank = await prisma.bank.create({ data: { name: parsed.data.name } });

    return res.status(201).json(bank);
  } catch (error) {
    if (isUniqueViolation(error)) {
      return res.status(409).json({ message: 'Bank already exists' });
    }

    throw error;
  }
});

// =========================
// ACCOUNTS
// =========================

const accountSelect = {
  id: true,
  name: true,
  accountType: true,
  currency: true,
  balance: true,
  familyMemberId: true,
  bankId: true,
  createdAt: true,
  updatedAt: true,
  familyMember: { select: { id: true, name: true } },
  bank: { select: { id: true, name: true } },
} as const;

financeRouter.get('/api/accounts', async (req, res) => {
  const user = currentUser(req);

  const accounts = await prisma.account.findMany({
    where: { userId: user.id },
    select: accountSelect,
    orderBy: { id: 'asc' },
  });

  return res.json(accounts);
});

financeRouter.post('/api/accounts', async (req, res) => {
  const user = currentUser(req);
  const parsed = createAccountSchema.safeParse(req.body);

  if (!parsed.success) {
    return res.status(400).json({ message: 'Invalid request data' });
  }

  const { name, currency, familyMemberId, bankId } = parsed.data;

  const [familyMember, bank] = await Promise.all([
    prisma.familyMember.findFirst({
      where: { id: familyMemberId, userId: user.id },
      select: { id: true },
    }),
    prisma.bank.findUnique({ where: { id: bankId }, select: { id: true } }),
  ]);

  if (!familyMember || !bank) {
    return res.status(404).json({ message: 'Family member or bank not found' });
  }

  const account = await prisma.account.create({
    data: { userId: user.id, name, currency, familyMemberId, bankId },
    select: accountSelect,
  });

  return res.status(201).json(account);
});

financeRouter.get('/api/accounts/summary', async (req, res) => {
  const user = currentUser(req);

  const accounts = await prisma.account.findMany({
    where: { userId: user.id, externalId: { not: null } },
    select: {
      id: true,
      name: true,
      accountType: true,
      currency: true,
      balance: true,
      bank: { select: { name: true } },
    },
    orderBy: { id: 'asc' },
  });

  return res.json(accounts);
});

// =========================
// CATEGORIES
// =========================

financeRouter.get('/api/categories', async (req, res) => {
  const user = currentUser(req);

  // Makes sure the default categories exist for this user
  await getCategoryMap(user.id);

  const categories = await prisma.category.findMany({
    where: { userId: user.id },
    select: { id: true, name: true, createdAt: true, updatedAt: true },
    orderBy: { name: 'asc' },
  });

  return res.json(categories);
});

financeRouter.post('/api/categories', async (req, res) => {
  const user = currentUser(req);
  const parsed = nameSchema.safeParse(req.body);

  if (!parsed.success) {
    return res.status(400).json({ message: 'Invalid request data' });
  }

  try {
    const category = await prisma.category.create({
      data: { userId: user.id, name: parsed.data.name },
      select: { id: true, name: true, createdAt: true, updatedAt: true },
    });

    return res.status(201).json(category);
  } catch (error) {
    if (isUniqueViolation(error)) {
      return res.status(409).json({ message: 'Category already exists' });
    }

    throw error;
  }
});

// =========================
// TRANSACTIONS
// =========================

financeRouter.get('/api/transactions', async (req, res) => {
  const user = currentUser(req);

  const transactions = await prisma.transaction.findMany({
    where: { userId: user.id },
    select: {
      id: true,
      accountId: true,
      categoryId: true,
      amount: true,
      currency: true,
      description: true,
      merchant: true,
      type: true,
      date: true,
      createdAt: true,
      updatedAt: true,
      account: { select: accountSelect },
      category: { select: { id: true, name: true } },
    },
    orderBy: { date: 'desc' },
  });

  return res.json(transactions);
});

financeRouter.get('/api/transactions/simple', async (req, res) => {
  const user = currentUser(req);
  const context = buildContext(user);
  const categoryByName = await getCategoryMap(user.id);

  const transactions = await prisma.transaction.findMany({
    where: {
      userId: user.id,
      account: { externalId: { not: null } },
    },
    orderBy: { date: 'desc' },
    select: {
      id: true,
      categoryId: true,
      amount: true,
      currency: true,
      description: true,
      merchant: true,
      type: true,
      date: true,
      createdAt: true,
      category: { select: { name: true } },
    },
  });

  const result = await Promise.all(
    transactions.map(async (transaction) => ({
      id: transaction.id,
      amount: transaction.amount,
      currency: transaction.currency,
      description: transaction.description,
      merchant: transaction.merchant,
      type: transaction.type,
      date: transaction.date,
      category: transaction.category,
      categorySource: await getTransactionCategorySource(
        context,
        transaction,
        categoryByName,
      ),
    })),
  );

  return res.json(result);
});

financeRouter.post('/api/transactions', async (req, res) => {
  const user = currentUser(req);
  const parsed = createTransactionSchema.safeParse(req.body);

  if (!parsed.success) {
    return res.status(400).json({ message: 'Invalid request data' });
  }

  const data = parsed.data;

  const account = await prisma.account.findFirst({
    where: { id: data.accountId, userId: user.id },
    select: { id: true },
  });

  if (!account) {
    return res.status(404).json({ message: 'Account not found' });
  }

  if (
    data.categoryId !== undefined &&
    data.categoryId !== null &&
    !(await userOwnsCategory(user.id, data.categoryId))
  ) {
    return res.status(404).json({ message: 'Category not found' });
  }

  try {
    const transaction = await prisma.transaction.create({
      data: {
        userId: user.id,
        accountId: account.id,
        amount: data.amount,
        currency: data.currency,
        description: data.description ?? null,
        merchant: data.merchant ?? null,
        type: data.type,
        date: data.date,
        externalId: data.externalId ?? null,
        categoryId: data.categoryId ?? null,
      },
    });

    return res.status(201).json(transaction);
  } catch (error) {
    if (isUniqueViolation(error)) {
      return res.status(409).json({ message: 'Transaction already exists' });
    }

    throw error;
  }
});

financeRouter.patch('/api/transactions/:id', async (req, res) => {
  const user = currentUser(req);
  const id = idSchema.safeParse(req.params.id);
  const categoryId = idSchema.safeParse(req.body?.categoryId);

  if (!id.success || !categoryId.success) {
    return res.status(400).json({
      message: 'Valid transaction id and categoryId are required',
    });
  }

  const [transaction, category] = await Promise.all([
    prisma.transaction.findFirst({
      where: { id: id.data, userId: user.id },
      select: { id: true },
    }),
    userOwnsCategory(user.id, categoryId.data),
  ]);

  if (!transaction || !category) {
    return res.status(404).json({ message: 'Transaction or category not found' });
  }

  const updated = await prisma.transaction.update({
    where: { id: transaction.id },
    data: { categoryId: category.id },
    include: { category: { select: { id: true, name: true } } },
  });

  // Remember the choice for this merchant (for this user only)
  const merchant = updated.merchant ?? updated.description ?? '';

  if (updated.type === 'EXPENSE' && merchant.trim()) {
    await upsertMerchantRule(user.id, merchant, category.id);
  }

  return res.json(updated);
});

// =========================
// MERCHANT RULES
// =========================

financeRouter.get('/api/merchant-rules', async (req, res) => {
  const user = currentUser(req);

  const rules = await prisma.merchantRule.findMany({
    where: { userId: user.id },
    include: { category: { select: { name: true } } },
    orderBy: { merchantKey: 'asc' },
  });

  return res.json(
    rules.map((rule) => ({
      id: rule.id,
      merchant: rule.merchant,
      categoryId: rule.categoryId,
      categoryName: rule.category.name,
      source: 'Manual rule',
      createdAt: rule.createdAt,
      updatedAt: rule.updatedAt,
    })),
  );
});

financeRouter.post('/api/merchant-rules', async (req, res) => {
  const user = currentUser(req);
  const parsed = merchantRuleSchema.safeParse(req.body);

  if (!parsed.success) {
    return res.status(400).json({ message: 'merchant and categoryId are required' });
  }

  const category = await userOwnsCategory(user.id, parsed.data.categoryId);

  if (!category) {
    return res.status(404).json({ message: 'Category not found' });
  }

  await upsertMerchantRule(user.id, parsed.data.merchant, category.id);

  return res.status(201).json({
    merchant: parsed.data.merchant,
    categoryId: category.id,
    categoryName: category.name,
  });
});

financeRouter.patch('/api/merchant-rules/:id', async (req, res) => {
  const user = currentUser(req);
  const id = idSchema.safeParse(req.params.id);
  const parsed = merchantRuleSchema.safeParse(req.body);

  if (!id.success || !parsed.success) {
    return res.status(400).json({
      message: 'Valid id, merchant and categoryId are required',
    });
  }

  const category = await userOwnsCategory(user.id, parsed.data.categoryId);

  if (!category) {
    return res.status(404).json({ message: 'Category not found' });
  }

  try {
    const result = await prisma.merchantRule.updateMany({
      where: { id: id.data, userId: user.id },
      data: {
        merchant: parsed.data.merchant,
        merchantKey: merchantKey(parsed.data.merchant),
        categoryId: category.id,
      },
    });

    if (result.count === 0) {
      return res.status(404).json({ message: 'Rule not found' });
    }
  } catch (error) {
    if (isUniqueViolation(error)) {
      return res.status(409).json({ message: 'A rule for this merchant already exists' });
    }

    throw error;
  }

  return res.json({
    id: id.data,
    merchant: parsed.data.merchant,
    categoryId: category.id,
    categoryName: category.name,
  });
});

financeRouter.delete('/api/merchant-rules/:id', async (req, res) => {
  const user = currentUser(req);
  const id = idSchema.safeParse(req.params.id);

  if (!id.success) {
    return res.status(400).json({ message: 'Invalid rule id' });
  }

  const result = await prisma.merchantRule.deleteMany({
    where: { id: id.data, userId: user.id },
  });

  if (result.count === 0) {
    return res.status(404).json({ message: 'Rule not found' });
  }

  return res.json({ deleted: true, id: id.data });
});

// =========================
// RECATEGORIZE ALL (this user's transactions)
// =========================

financeRouter.post('/api/transactions/recategorize', async (req, res) => {
  const user = currentUser(req);
  const context = buildContext(user);
  const categoryByName = await getCategoryMap(user.id);

  const transactions = await prisma.transaction.findMany({
    where: { userId: user.id, account: { externalId: { not: null } } },
    select: {
      id: true,
      categoryId: true,
      description: true,
      merchant: true,
      type: true,
    },
  });

  let updated = 0;

  for (const transaction of transactions) {
    const categoryId = await resolveTransactionCategoryId(
      context,
      transaction.description,
      transaction.merchant,
      transaction.type,
      categoryByName,
    );

    if (categoryId !== null && transaction.categoryId !== categoryId) {
      await prisma.transaction.update({
        where: { id: transaction.id },
        data: { categoryId },
      });

      updated++;
    }
  }

  return res.json({ updated });
});

// =========================
// REPORTS
// =========================

function startOfPeriod(days: number): Date {
  const from = new Date();

  from.setHours(0, 0, 0, 0);
  from.setDate(from.getDate() - (days - 1));

  return from;
}

financeRouter.get('/api/reports/expenses', async (req, res) => {
  const user = currentUser(req);
  const days = Number(req.query.days ?? 30);

  if (!Number.isInteger(days) || days < 1 || days > 365) {
    return res.status(400).json({ message: 'Days must be between 1 and 365' });
  }

  const from = startOfPeriod(days);

  const transactions = await prisma.transaction.findMany({
    where: {
      userId: user.id,
      type: 'EXPENSE',
      date: { gte: from },
      account: { externalId: { not: null } },
    },
    select: { amount: true, category: { select: { name: true } } },
  });

  let total = 0;
  const byCategory: Record<string, number> = {};

  for (const transaction of transactions) {
    if (transaction.category?.name === 'Money Transfer') {
      continue;
    }

    const amount = Math.abs(Number(transaction.amount));
    const category = transaction.category?.name ?? 'Other';

    byCategory[category] = (byCategory[category] ?? 0) + amount;
    total += amount;
  }

  const roundedByCategory = Object.fromEntries(
    Object.entries(byCategory).map(([category, amount]) => [
      category,
      Number(amount.toFixed(2)),
    ]),
  );

  return res.json({
    currency: 'UAH',
    days,
    from,
    total: Number(total.toFixed(2)),
    byCategory: roundedByCategory,
  });
});

financeRouter.get('/api/reports/summary', async (req, res) => {
  const user = currentUser(req);

  type CurrencyTotals = { income: number; expenses: number; transfers: number };
  type PeriodResult = Record<string, CurrencyTotals>;

  const periods = [
    { key: 'today', days: 1 },
    { key: 'week', days: 7 },
    { key: 'month', days: 30 },
  ] as const;

  const result: Record<string, PeriodResult> = {};

  for (const period of periods) {
    const transactions = await prisma.transaction.findMany({
      where: {
        userId: user.id,
        date: { gte: startOfPeriod(period.days) },
        account: { externalId: { not: null } },
      },
      select: {
        amount: true,
        currency: true,
        type: true,
        category: { select: { name: true } },
      },
    });

    const currencies: PeriodResult = {};

    for (const transaction of transactions) {
      const amount = Math.abs(Number(transaction.amount));
      const current = currencies[transaction.currency] ?? {
        income: 0,
        expenses: 0,
        transfers: 0,
      };

      if (transaction.category?.name === 'Money Transfer') {
        current.transfers += amount;
      } else if (transaction.type === 'INCOME') {
        current.income += amount;
      } else {
        current.expenses += amount;
      }

      currencies[transaction.currency] = current;
    }

    result[period.key] = Object.fromEntries(
      Object.entries(currencies).map(([currency, totals]) => [
        currency,
        {
          income: Number(totals.income.toFixed(2)),
          expenses: Number(totals.expenses.toFixed(2)),
          transfers: Number(totals.transfers.toFixed(2)),
        },
      ]),
    );
  }

  return res.json(result);
});
