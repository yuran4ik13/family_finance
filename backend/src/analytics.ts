import { Router } from 'express';

import { prisma } from './prisma';

// =========================
// ANALYTICS
// GET /api/reports/analytics
//
// Параметри (усі необов'язкові):
//   from=2026-09-01        початок періоду (включно)
//   to=2026-09-30          кінець періоду (включно)
//   currency=UAH           UAH | EUR | USD (різні валюти не змішуємо)
//   accountIds=2,4         тільки ці картки
//   categoryIds=14,22      тільки ці категорії
//   type=EXPENSE           ALL | INCOME | EXPENSE
//   includeTransfers=true  показувати перекази між своїми картками
// =========================

export const analyticsRouter = Router();

const DAY_MS = 24 * 60 * 60 * 1000;
const MAX_DAYS = 366;

type AnalyticsType = 'ALL' | 'INCOME' | 'EXPENSE';

type Filters = {
  currency: string;
  accountIds: number[];
  categoryIds: number[];
  type: AnalyticsType;
  includeTransfers: boolean;
};

// ---------- helpers ----------

// "2026-09-01" -> Date (локальна північ). Невалідне -> null
// "2026-09-01" -> Date (локальна північ). Невалідне -> null
function parseDate(value: unknown): Date | null {
  if (typeof value !== 'string') {
    return null;
  }

  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);

  if (!match) {
    return null;
  }

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);

  const date = new Date(year, month - 1, day);

  // відсікає дати типу 2026-02-31
  if (
    date.getFullYear() !== year ||
    date.getMonth() !== month - 1 ||
    date.getDate() !== day
  ) {
    return null;
  }

  return date;
}

// "2,4,abc" -> [2, 4]
function parseIdList(value: unknown): number[] {
  if (typeof value !== 'string' || !value.trim()) {
    return [];
  }

  return value
    .split(',')
    .map((part) => Number(part.trim()))
    .filter((id) => Number.isInteger(id) && id > 0);
}

// setDate замість мілісекунд, щоб перехід на літній/зимовий час не зсував дні
function addDays(date: Date, days: number): Date {
  const result = new Date(date);
  result.setDate(result.getDate() + days);
  return result;
}

function toDayKey(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');

  return `${year}-${month}-${day}`;
}

function round(value: number): number {
  return Math.round(value * 100) / 100;
}

// На скільки % змінилось. null = минулого разу був 0, порівнювати нема з чим
function percentChange(current: number, previous: number): number | null {
  if (previous === 0) {
    return current === 0 ? 0 : null;
  }

  return round(((current - previous) / previous) * 100);
}

// ---------- запит до бази ----------

async function loadTransactions(
  start: Date,
  endExclusive: Date,
  filters: Filters,
) {
  const transactions = await prisma.transaction.findMany({
    where: {
      date: {
        gte: start,
        lt: endExclusive,
      },

      currency: filters.currency,

      // тільки рахунки, підключені до банку
      account: {
        externalId: {
          not: null,
        },
      },

      ...(filters.accountIds.length > 0
        ? { accountId: { in: filters.accountIds } }
        : {}),

      ...(filters.categoryIds.length > 0
        ? { categoryId: { in: filters.categoryIds } }
        : {}),

      ...(filters.type !== 'ALL' ? { type: filters.type } : {}),
    },

    include: {
      category: true,
    },

    orderBy: {
      date: 'asc',
    },
  });

  if (filters.includeTransfers) {
    return transactions;
  }

  // перекази між своїми картками - це не дохід і не витрата
  return transactions.filter(
    (transaction) =>
      transaction.type !== 'TRANSFER' &&
      transaction.category?.name !== 'Money Transfer',
  );
}

type LoadedTransaction = Awaited<
  ReturnType<typeof loadTransactions>
>[number];

function sumTotals(transactions: LoadedTransaction[]) {
  let income = 0;
  let expenses = 0;

  for (const transaction of transactions) {
    const amount = Number(transaction.amount);

    if (amount >= 0) {
      income += amount;
    } else {
      expenses += Math.abs(amount);
    }
  }

  return {
    income: round(income),
    expenses: round(expenses),
    net: round(income - expenses),
    count: transactions.length,
  };
}

// ---------- маршрут ----------

analyticsRouter.get('/api/reports/analytics', async (req, res) => {
  try {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    // за замовчуванням - останні 30 днів
    const from = parseDate(req.query.from) ?? addDays(today, -29);
    const to = parseDate(req.query.to) ?? today;

    if (from > to) {
      return res.status(400).json({
        message: '"from" must be before "to"',
      });
    }

    const endExclusive = addDays(to, 1);
    const days = Math.round(
      (endExclusive.getTime() - from.getTime()) / DAY_MS,
    );

    if (days > MAX_DAYS) {
      return res.status(400).json({
        message: `Period can be at most ${MAX_DAYS} days`,
      });
    }

    const rawType = String(req.query.type ?? 'ALL').toUpperCase();
    const type: AnalyticsType =
      rawType === 'INCOME' || rawType === 'EXPENSE' ? rawType : 'ALL';

    const rawCurrency = String(req.query.currency ?? 'UAH').toUpperCase();
    const currency = /^[A-Z]{3}$/.test(rawCurrency) ? rawCurrency : 'UAH';

    const filters: Filters = {
      currency,
      accountIds: parseIdList(req.query.accountIds),
      categoryIds: parseIdList(req.query.categoryIds),
      type,
      includeTransfers: req.query.includeTransfers === 'true',
    };

    // минулий період такої ж довжини, що йде одразу перед обраним
    const previousFrom = addDays(from, -days);
    const previousTo = addDays(from, -1);

    const [current, previous] = await Promise.all([
      loadTransactions(from, endExclusive, filters),
      loadTransactions(previousFrom, from, filters),
    ]);

    const totals = sumTotals(current);
    const previousTotals = sumTotals(previous);

    // Кругова діаграма і топи: якщо обрано "доходи" - рахуємо доходи,
    // інакше - витрати
    const focus: 'INCOME' | 'EXPENSE' =
      type === 'INCOME' ? 'INCOME' : 'EXPENSE';

    const focused = current.filter((transaction) =>
      focus === 'INCOME'
        ? Number(transaction.amount) >= 0
        : Number(transaction.amount) < 0,
    );

    const focusTotal = focus === 'INCOME' ? totals.income : totals.expenses;

    // --- по категоріях ---
    const categoryMap = new Map<
      string,
      { categoryId: number | null; name: string; amount: number; count: number }
    >();

    for (const transaction of focused) {
      const key = String(transaction.categoryId ?? 'none');
      const entry = categoryMap.get(key) ?? {
        categoryId: transaction.categoryId,
        name: transaction.category?.name ?? 'Uncategorized',
        amount: 0,
        count: 0,
      };

      entry.amount += Math.abs(Number(transaction.amount));
      entry.count += 1;
      categoryMap.set(key, entry);
    }

    const byCategory = [...categoryMap.values()]
      .map((entry) => ({
        ...entry,
        amount: round(entry.amount),
        share: focusTotal > 0 ? round((entry.amount / focusTotal) * 100) : 0,
      }))
      .sort((a, b) => b.amount - a.amount);

    // --- по днях (порожні дні теж, щоб графік був неперервним) ---
    const dayMap = new Map<string, { income: number; expenses: number }>();

    for (let day = new Date(from); day < endExclusive; day = addDays(day, 1)) {
      dayMap.set(toDayKey(day), { income: 0, expenses: 0 });
    }

    for (const transaction of current) {
      const entry = dayMap.get(toDayKey(new Date(transaction.date)));

      if (!entry) {
        continue;
      }

      const amount = Number(transaction.amount);

      if (amount >= 0) {
        entry.income += amount;
      } else {
        entry.expenses += Math.abs(amount);
      }
    }

    const byDay = [...dayMap.entries()].map(([date, entry]) => ({
      date,
      income: round(entry.income),
      expenses: round(entry.expenses),
    }));

    // --- топ магазинів / відправників ---
    const merchantMap = new Map<string, { merchant: string; amount: number; count: number }>();

    for (const transaction of focused) {
      const name =
        (transaction.merchant ?? transaction.description ?? '').trim() ||
        'Unknown';
      const key = name.toLowerCase();
      const entry = merchantMap.get(key) ?? { merchant: name, amount: 0, count: 0 };

      entry.amount += Math.abs(Number(transaction.amount));
      entry.count += 1;
      merchantMap.set(key, entry);
    }

    const topMerchants = [...merchantMap.values()]
      .map((entry) => ({ ...entry, amount: round(entry.amount) }))
      .sort((a, b) => b.amount - a.amount)
      .slice(0, 10);

    // --- найбільші окремі транзакції ---
    const topTransactions = [...focused]
      .sort(
        (a, b) =>
          Math.abs(Number(b.amount)) - Math.abs(Number(a.amount)),
      )
      .slice(0, 10)
      .map((transaction) => ({
        id: transaction.id,
        date: transaction.date,
        description: transaction.merchant ?? transaction.description ?? '',
        amount: round(Number(transaction.amount)),
        category: transaction.category?.name ?? 'Uncategorized',
      }));

    return res.json({
      currency,
      period: {
        from: toDayKey(from),
        to: toDayKey(to),
        days,
      },
      filters: {
        accountIds: filters.accountIds,
        categoryIds: filters.categoryIds,
        type: filters.type,
        includeTransfers: filters.includeTransfers,
      },
      totals,
      previous: {
        from: toDayKey(previousFrom),
        to: toDayKey(previousTo),
        ...previousTotals,
      },
      change: {
        income: percentChange(totals.income, previousTotals.income),
        expenses: percentChange(totals.expenses, previousTotals.expenses),
      },
      focus,
      byCategory,
      byDay,
      topMerchants,
      topTransactions,
    });
  } catch (error) {
    console.error('Failed to build analytics:', error);

    return res.status(500).json({
      message: 'Failed to build analytics',
    });
  }
});