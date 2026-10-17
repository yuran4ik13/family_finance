import cors from 'cors';
import express from 'express';

import {
  getMonobankClientInfo,
  getMonobankStatement,
} from './monobank';
import { analyticsRouter } from './analytics';
import { prisma } from './prisma';

const app = express();
const PORT = 3000;

app.use(
  cors({
    origin: 'http://localhost:5173',
  }),
);

app.use(express.json());

// =========================
// HELPERS
// =========================

// Personal data (names, card numbers) is NOT stored in code.
// It is read from .env, so it never gets to GitHub.
function listFromEnv(name: string): string[] {
  return (process.env[name] ?? '')
    .split(',')
    .map((item) => item.trim().toLowerCase())
    .filter(Boolean);
}

function matchesFamilyIncome(value: string): boolean {
  return listFromEnv('FAMILY_INCOME_MARKERS').some((marker) =>
    value.includes(marker),
  );
}

function getCurrency(currencyCode: number): string {
  const currencies: Record<number, string> = {
    980: 'UAH',
    840: 'USD',
    978: 'EUR',
  };

  return currencies[currencyCode] ?? String(currencyCode);
}

function getAccountTypeName(type: string): string {
  const names: Record<string, string> = {
    black: 'Black',
    white: 'White',
    madeInUkraine: 'Made in Ukraine',
    diia: 'Diia',
  };

  return names[type] ?? type;
}

function isTransferTransaction(
  description: string | null,
  merchant: string | null,
): boolean {
  const value = `${description ?? ''} ${merchant ?? ''}`
    .toLowerCase()
    .trim();

  const transferMarkers = [
    'переказ на картку',
    'з єврової картки',
    'з доларової картки',
    'з гривневої картки',
    'city24',
    'каса укргазбанку',
    ...listFromEnv('PERSONAL_TRANSFER_MARKERS'),
  ];

  if (transferMarkers.some((marker) => value.includes(marker))) {
    return true;
  }

  // Masked card number, e.g. 123456******7890
  return /\d{4,6}\*{4,}\d{4}/.test(value);
}

function getExpenseCategoryId(
  description: string,
  categoryByName: Record<string, number>,
): number | null {
  const value = description.toLowerCase().trim();

  // GROCERIES
  if (
    value.includes('атб') ||
    value.includes('atb') ||
    value.includes('сільпо') ||
    value.includes('silpo') ||
    value.includes('novus') ||
    value.includes('varus') ||
    value.includes('auchan') ||
    value.includes('ашан') ||
    value.includes('metro cash') ||
    value.includes('fora') ||
    value.includes('фора') ||
    value.includes('копійочка') ||
    value.includes('kopiyochka') ||
    value.includes('lidl') ||
    value.includes('tesco') ||
    value.includes('billa') ||
    value.includes('kaufland')
  ) {
    return categoryByName.Groceries ?? null;
  }

  // FUEL
  if (
    value.includes('wog') ||
    value.includes('okko') ||
    value.includes('upg') ||
    value.includes('socar') ||
    value.includes('shell') ||
    value.includes('brsm')
  ) {
    return categoryByName.Fuel ?? null;
  }

  // TRANSPORT
  if (
    value.includes('bolt') ||
    value.includes('uber') ||
    value.includes('uklon') ||
    value.includes('e-wings') ||
    value.includes('ewings') ||
    value.includes('taxi') ||
    value.includes('таксі') ||
    value.includes('metro kyiv') ||
    value.includes('kyiv digital') ||
    value.includes('укрзалізниця')
  ) {
    return categoryByName.Transport ?? null;
  }

  // CAFES & RESTAURANTS
  if (
    value.includes('mcdonald') ||
    value.includes('kfc') ||
    value.includes('burger king') ||
    value.includes('пузата хата') ||
    value.includes('restaurant') ||
    value.includes('ресторан') ||
    value.includes('cafe') ||
    value.includes('coffee') ||
    value.includes('кафе') ||
    value === 'kafe' ||
    value.includes(' kafe') ||
    value.includes('starbucks') ||
    value.includes('dominos') ||
    value.includes("domino's") ||
    value.includes('pizza') ||
    value.includes('піца')
  ) {
    return categoryByName['Cafes & Restaurants'] ?? null;
  }

  // CHARITY & DONATIONS
  if (
    value.includes('благод') ||
    value.includes('charity') ||
    value.includes('donation') ||
    value.includes('донат') ||
    value.includes('укол-elevidys') ||
    value.includes('на "укол-elevidys"') ||
    value.includes("на 'укол-elevidys'")
  ) {
    return categoryByName['Charity & Donations'] ?? null;
  }

  // SHOPPING & HOME
  if (
    value.includes('епіцентр') ||
    value.includes('epicentr') ||
    value.includes('ikea') ||
    value.includes('jysk') ||
    value.includes('leroy merlin') ||
    value.includes('нова лінія') ||
    value.includes('rozetka')
  ) {
    return categoryByName['Shopping & Home'] ?? null;
  }

  // SUBSCRIPTIONS
  if (
    value.includes('netflix') ||
    value.includes('spotify') ||
    value.includes('youtube') ||
    value.includes('icloud') ||
    value.includes('apple.com/bill') ||
    value.includes('google one') ||
    value.includes('megogo') ||
    value.includes('sweet.tv')
  ) {
    return categoryByName.Subscriptions ?? null;
  }

  // HEALTH
  if (
    value.includes('аптека') ||
    value.includes('apteka') ||
    value.includes('pharmacy') ||
    value.includes('tabletki') ||
    value.includes('лікар') ||
    value.includes('doctor') ||
    value.includes('clinic') ||
    value.includes('клініка') ||
    value.includes('medical') ||
    value.includes('стомат') ||
    value.includes('dental') ||
    value.includes('vivadent')
  ) {
    return categoryByName.Health ?? null;
  }

  // SPORTS
  if (
    value.includes('gym') ||
    value.includes('fitness') ||
    value.includes('sport') ||
    value.includes('спорт') ||
    value.includes('basin') ||
    value.includes('pool')
  ) {
    return categoryByName.Sports ?? null;
  }

  // ENTERTAINMENT
  if (
    value.includes('cinema') ||
    value.includes('кіно') ||
    value.includes('multiplex') ||
    value.includes('planetakino') ||
    value.includes('bowling') ||
    value.includes('боулінг') ||
    value.includes('steam') ||
    value.includes('playstation') ||
    value.includes('xbox')
  ) {
    return categoryByName.Entertainment ?? null;
  }

  // UTILITIES
  if (
    value.includes('комун') ||
    value.includes('utility') ||
    value.includes('electric') ||
    value.includes('electricity') ||
    value.includes('water') ||
    value.includes('газ') ||
    value.includes('gas') ||
    value.includes('опалення') ||
    value.includes('kyivstar') ||
    value.includes('vodafone') ||
    value.includes('lifecell')
  ) {
    return categoryByName.Utilities ?? null;
  }

  return categoryByName.Other ?? null;
}

function getTransactionCategoryId(
  description: string | null,
  merchant: string | null,
  type: 'INCOME' | 'EXPENSE' | 'TRANSFER',
  categoryByName: Record<string, number>,
): number | null {
  if (
    type === 'TRANSFER' ||
    isTransferTransaction(description, merchant)
  ) {
    return categoryByName['Money Transfer'] ?? null;
  }

  if (type === 'INCOME') {
    return null;
  }

  return getExpenseCategoryId(
    description ?? merchant ?? '',
    categoryByName,
  );
}

async function getCategoryMap(): Promise<Record<string, number>> {
  let categories = await prisma.category.findMany();

  const requiredCategories = [
    'Money Transfer',
    'Shopping & Home',
    'Charity & Donations',
    'Family Income',
    'Salary',
    'Refund',
    'Other Income',
  ];

  for (const name of requiredCategories) {
    const exists = categories.some(
      (category) => category.name === name,
    );

    if (!exists) {
      await prisma.category.create({
        data: {
          name,
        },
      });
    }
  }

  categories = await prisma.category.findMany();

  return Object.fromEntries(
    categories.map((category) => [
      category.name,
      category.id,
    ]),
  );
}


async function getLearnedCategoryId(
  description: string | null,
  merchant: string | null,
): Promise<number | null> {
  const value = (merchant ?? description ?? '').trim();

  if (!value) {
    return null;
  }

  const normalized = value.toLowerCase();

  // These names are payment platforms / broad merchants and can represent
  // very different purchases, so don't auto-learn a single category for them.
  const ambiguousMerchants = [
    'portmone',
    'apple',
    'google',
    'liqpay',
    'wayforpay',
  ];

  if (
    ambiguousMerchants.some((name) =>
      normalized === name ||
      normalized.startsWith(`${name} `),
    )
  ) {
    return null;
  }

  const learnedTransaction =
    await prisma.transaction.findFirst({
      where: {
        OR: [
          {
            merchant: {
              equals: value,
              mode: 'insensitive',
            },
          },
          {
            description: {
              equals: value,
              mode: 'insensitive',
            },
          },
        ],

        categoryId: {
          not: null,
        },

        category: {
          name: {
            notIn: [
              'Other',
              'Other Income',
            ],
          },
        },
      },

      orderBy: {
        updatedAt: 'desc',
      },

      select: {
        categoryId: true,
      },
    });

  return learnedTransaction?.categoryId ?? null;
}

async function resolveTransactionCategoryId(
  description: string | null,
  merchant: string | null,
  type: 'INCOME' | 'EXPENSE' | 'TRANSFER',
  categoryByName: Record<string, number>,
): Promise<number | null> {
  if (
    type === 'TRANSFER' ||
    isTransferTransaction(description, merchant)
  ) {
    return categoryByName['Money Transfer'] ?? null;
  }

  const value = `${description ?? ''} ${merchant ?? ''}`
    .toLowerCase()
    .trim();

  if (type === 'INCOME') {
    if (
      value.includes('salary') ||
      value.includes('зарплат') ||
      value.includes('заробіт')
    ) {
      return categoryByName.Salary ?? null;
    }

    if (matchesFamilyIncome(value)) {
      return categoryByName['Family Income'] ?? null;
    }

    if (
      value.includes('refund') ||
      value.includes('повернення') ||
      value.includes('reversal')
    ) {
      return categoryByName.Refund ?? null;
    }

    return categoryByName['Other Income'] ?? null;
  }

  const merchantRuleCategoryId =
    await getMerchantRuleCategoryId(
      description,
      merchant,
    );

  if (merchantRuleCategoryId !== null) {
    return merchantRuleCategoryId;
  }

  const learnedCategoryId = await getLearnedCategoryId(
    description,
    merchant,
  );

  if (learnedCategoryId !== null) {
    return learnedCategoryId;
  }

  return getExpenseCategoryId(
    `${description ?? ''} ${merchant ?? ''}`,
    categoryByName,
  );
}


async function getTransactionCategorySource(
  transaction: {
    id: number;
    categoryId: number | null;
    description: string | null;
    merchant: string | null;
    type: 'INCOME' | 'EXPENSE' | 'TRANSFER';
    createdAt: Date;
  },
  categoryByName: Record<string, number>,
): Promise<'AUTO' | 'MANUAL'> {
  if (transaction.categoryId === null) {
    return 'AUTO';
  }

  const value =
    `${transaction.description ?? ''} ${transaction.merchant ?? ''}`
      .toLowerCase()
      .trim();

  let ruleCategoryId: number | null = null;

  if (
    transaction.type === 'TRANSFER' ||
    isTransferTransaction(
      transaction.description,
      transaction.merchant,
    )
  ) {
    ruleCategoryId =
      categoryByName['Money Transfer'] ?? null;
  } else if (transaction.type === 'INCOME') {
    if (
      value.includes('salary') ||
      value.includes('зарплат') ||
      value.includes('заробіт')
    ) {
      ruleCategoryId = categoryByName.Salary ?? null;
    } else if (matchesFamilyIncome(value)) {
      ruleCategoryId =
        categoryByName['Family Income'] ?? null;
    } else if (
      value.includes('refund') ||
      value.includes('повернення') ||
      value.includes('reversal')
    ) {
      ruleCategoryId = categoryByName.Refund ?? null;
    } else {
      ruleCategoryId =
        categoryByName['Other Income'] ?? null;
    }
  } else {
    ruleCategoryId = getExpenseCategoryId(
      `${transaction.description ?? ''} ${transaction.merchant ?? ''}`,
      categoryByName,
    );
  }

  if (ruleCategoryId === transaction.categoryId) {
    return 'AUTO';
  }

  const merchantValue =
    (transaction.merchant ??
      transaction.description ??
      '').trim();

  if (!merchantValue) {
    return 'MANUAL';
  }

  const learnedBefore =
    await prisma.transaction.findFirst({
      where: {
        id: {
          not: transaction.id,
        },

        createdAt: {
          lt: transaction.createdAt,
        },

        OR: [
          {
            merchant: {
              equals: merchantValue,
              mode: 'insensitive',
            },
          },
          {
            description: {
              equals: merchantValue,
              mode: 'insensitive',
            },
          },
        ],

        categoryId: {
          not: null,
        },

        category: {
          name: {
            notIn: [
              'Other',
              'Other Income',
            ],
          },
        },
      },

      orderBy: {
        createdAt: 'desc',
      },

      select: {
        categoryId: true,
      },
    });

  if (
    learnedBefore?.categoryId ===
    transaction.categoryId
  ) {
    return 'AUTO';
  }

  return 'MANUAL';
}


type MerchantRuleRow = {
  id: number;
  merchant: string;
  category_id: number;
  created_at: Date;
  updated_at: Date;
};

async function ensureMerchantRulesTable(): Promise<void> {
  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS merchant_rules (
      id SERIAL PRIMARY KEY,
      merchant TEXT NOT NULL,
      category_id INTEGER NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);

  await prisma.$executeRawUnsafe(`
    CREATE UNIQUE INDEX IF NOT EXISTS merchant_rules_merchant_lower_key
    ON merchant_rules (LOWER(merchant))
  `);
}

async function getMerchantRuleCategoryId(
  description: string | null,
  merchant: string | null,
): Promise<number | null> {
  const value = (merchant ?? description ?? '').trim();

  if (!value) {
    return null;
  }

  await ensureMerchantRulesTable();

  const rows = await prisma.$queryRawUnsafe<MerchantRuleRow[]>(
    `
      SELECT id, merchant, category_id, created_at, updated_at
      FROM merchant_rules
      WHERE LOWER(merchant) = LOWER($1)
      LIMIT 1
    `,
    value,
  );

  return rows[0]?.category_id ?? null;
}

async function upsertMerchantRule(
  merchant: string,
  categoryId: number,
): Promise<void> {
  const value = merchant.trim();

  if (!value) {
    return;
  }

  await ensureMerchantRulesTable();

  const existing = await prisma.$queryRawUnsafe<MerchantRuleRow[]>(
    `
      SELECT id, merchant, category_id, created_at, updated_at
      FROM merchant_rules
      WHERE LOWER(merchant) = LOWER($1)
      LIMIT 1
    `,
    value,
  );

  const current = existing[0];

  if (current) {
    await prisma.$executeRawUnsafe(
      `
        UPDATE merchant_rules
        SET merchant = $1,
            category_id = $2,
            updated_at = NOW()
        WHERE id = $3
      `,
      value,
      categoryId,
      current.id,
    );

    return;
  }

  await prisma.$executeRawUnsafe(
    `
      INSERT INTO merchant_rules (merchant, category_id)
      VALUES ($1, $2)
    `,
    value,
    categoryId,
  );
}

// =========================
// ROOT
// =========================

app.get('/', (req, res) => {
  res.json({
    message: 'Family Finance API is working!',
  });
});

// =========================
// FAMILY MEMBERS
// =========================

app.get('/api/family-members', async (req, res) => {
  try {
    const familyMembers =
      await prisma.familyMember.findMany();

    return res.json(familyMembers);
  } catch (error) {
    console.error(error);

    return res.status(500).json({
      message: 'Failed to fetch family members',
    });
  }
});

// =========================
// BANKS
// =========================

app.get('/api/banks', async (req, res) => {
  try {
    const banks = await prisma.bank.findMany();

    return res.json(banks);
  } catch (error) {
    console.error(error);

    return res.status(500).json({
      message: 'Failed to fetch banks',
    });
  }
});

app.post('/api/banks', async (req, res) => {
  try {
    const { name } = req.body;

    const bank = await prisma.bank.create({
      data: {
        name,
      },
    });

    return res.status(201).json(bank);
  } catch (error) {
    console.error(error);

    return res.status(500).json({
      message: 'Failed to create bank',
    });
  }
});

// =========================
// ACCOUNTS
// =========================

app.get('/api/accounts', async (req, res) => {
  try {
    const accounts = await prisma.account.findMany({
      include: {
        familyMember: true,
        bank: true,
      },
      orderBy: {
        id: 'asc',
      },
    });

    return res.json(accounts);
  } catch (error) {
    console.error(error);

    return res.status(500).json({
      message: 'Failed to fetch accounts',
    });
  }
});

app.post('/api/accounts', async (req, res) => {
  try {
    const {
      name,
      currency,
      familyMemberId,
      bankId,
    } = req.body;

    const account = await prisma.account.create({
      data: {
        name,
        currency,
        familyMemberId,
        bankId,
      },
      include: {
        familyMember: true,
        bank: true,
      },
    });

    return res.status(201).json(account);
  } catch (error) {
    console.error(error);

    return res.status(500).json({
      message: 'Failed to create account',
    });
  }
});

app.get('/api/accounts/summary', async (req, res) => {
  try {
    const accounts = await prisma.account.findMany({
      where: {
        externalId: {
          not: null,
        },
      },

      select: {
        id: true,
        name: true,
        accountType: true,
        currency: true,
        balance: true,

        bank: {
          select: {
            name: true,
          },
        },
      },

      orderBy: {
        id: 'asc',
      },
    });

    return res.json(accounts);
  } catch (error) {
    console.error(error);

    return res.status(500).json({
      message: 'Failed to fetch account summary',
    });
  }
});

// =========================
// CATEGORIES
// =========================

app.get('/api/categories', async (req, res) => {
  try {
    const categories = await prisma.category.findMany({
      orderBy: {
        name: 'asc',
      },
    });

    return res.json(categories);
  } catch (error) {
    console.error(error);

    return res.status(500).json({
      message: 'Failed to fetch categories',
    });
  }
});

app.post('/api/categories', async (req, res) => {
  try {
    const { name } = req.body;

    const category = await prisma.category.create({
      data: {
        name,
      },
    });

    return res.status(201).json(category);
  } catch (error) {
    console.error(error);

    return res.status(500).json({
      message: 'Failed to create category',
    });
  }
});

// =========================
// TRANSACTIONS
// =========================

app.get('/api/transactions', async (req, res) => {
  try {
    const transactions =
      await prisma.transaction.findMany({
        include: {
          account: {
            include: {
              bank: true,
              familyMember: true,
            },
          },

          category: true,
        },

        orderBy: {
          date: 'desc',
        },
      });

    return res.json(transactions);
  } catch (error) {
    console.error(error);

    return res.status(500).json({
      message: 'Failed to fetch transactions',
    });
  }
});

app.get('/api/transactions/simple', async (req, res) => {
  try {
    const categoryByName = await getCategoryMap();

    const transactions =
      await prisma.transaction.findMany({
        where: {
          account: {
            externalId: {
              not: null,
            },
          },
        },

        orderBy: {
          date: 'desc',
        },

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

          category: {
            select: {
              name: true,
            },
          },
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
        categorySource:
          await getTransactionCategorySource(
            transaction,
            categoryByName,
          ),
      })),
    );

    return res.json(result);
  } catch (error) {
    console.error(error);

    return res.status(500).json({
      message: 'Failed to fetch transactions',
    });
  }
});

app.post('/api/transactions', async (req, res) => {
  try {
    const {
      accountId,
      amount,
      currency,
      description,
      merchant,
      type,
      date,
      externalId,
      categoryId,
    } = req.body;

    const transaction =
      await prisma.transaction.create({
        data: {
          accountId,
          amount,
          currency,
          description,
          merchant,
          type,
          date: new Date(date),
          externalId,
          categoryId: categoryId ?? null,
        },
      });

    return res.status(201).json(transaction);
  } catch (error: any) {
    if (error.code === 'P2002') {
      return res.status(409).json({
        message: 'Transaction already exists',
      });
    }

    console.error(error);

    return res.status(500).json({
      message: 'Internal server error',
    });
  }
});

app.patch('/api/transactions/:id', async (req, res) => {
  try {
    const id = Number(req.params.id);
    const categoryId = Number(req.body.categoryId);

    if (!Number.isInteger(categoryId)) {
      return res.status(400).json({
        message: 'categoryId must be an integer',
      });
    }

    const transaction =
      await prisma.transaction.update({
        where: {
          id,
        },

        data: {
          categoryId,
        },

        include: {
          category: true,
        },
      });

    const merchant =
      transaction.merchant ??
      transaction.description ??
      '';

    if (
      transaction.type === 'EXPENSE' &&
      merchant.trim()
    ) {
      await upsertMerchantRule(
        merchant,
        categoryId,
      );
    }

    return res.json(transaction);
  } catch (error) {
    console.error(error);

    return res.status(500).json({
      message: 'Failed to update transaction',
    });
  }
});



// =========================
// MERCHANT RULES
// =========================

app.get('/api/merchant-rules', async (req, res) => {
  try {
    await ensureMerchantRulesTable();

    const rows = await prisma.$queryRawUnsafe<MerchantRuleRow[]>(`
      SELECT id, merchant, category_id, created_at, updated_at
      FROM merchant_rules
      ORDER BY LOWER(merchant) ASC
    `);

    const categoryIds = [
      ...new Set(rows.map((row) => row.category_id)),
    ];

    const categories =
      categoryIds.length > 0
        ? await prisma.category.findMany({
            where: {
              id: {
                in: categoryIds,
              },
            },
          })
        : [];

    const categoryById = new Map(
      categories.map((category) => [
        category.id,
        category.name,
      ]),
    );

    return res.json(
      rows.map((row) => ({
        id: row.id,
        merchant: row.merchant,
        categoryId: row.category_id,
        categoryName:
          categoryById.get(row.category_id) ??
          'Unknown',
        source: 'Manual rule',
        createdAt: row.created_at,
        updatedAt: row.updated_at,
      })),
    );
  } catch (error) {
    console.error(error);

    return res.status(500).json({
      message: 'Failed to fetch merchant rules',
    });
  }
});

app.post('/api/merchant-rules', async (req, res) => {
  try {
    const merchant = String(
      req.body.merchant ?? '',
    ).trim();

    const categoryId = Number(
      req.body.categoryId,
    );

    if (
      !merchant ||
      !Number.isInteger(categoryId)
    ) {
      return res.status(400).json({
        message:
          'merchant and categoryId are required',
      });
    }

    const category =
      await prisma.category.findUnique({
        where: {
          id: categoryId,
        },
      });

    if (!category) {
      return res.status(404).json({
        message: 'Category not found',
      });
    }

    await upsertMerchantRule(
      merchant,
      categoryId,
    );

    return res.status(201).json({
      merchant,
      categoryId,
      categoryName: category.name,
    });
  } catch (error) {
    console.error(error);

    return res.status(500).json({
      message: 'Failed to create merchant rule',
    });
  }
});

app.patch(
  '/api/merchant-rules/:id',
  async (req, res) => {
    try {
      await ensureMerchantRulesTable();

      const id = Number(req.params.id);
      const merchant = String(
        req.body.merchant ?? '',
      ).trim();
      const categoryId = Number(
        req.body.categoryId,
      );

      if (
        !Number.isInteger(id) ||
        !merchant ||
        !Number.isInteger(categoryId)
      ) {
        return res.status(400).json({
          message:
            'Valid id, merchant and categoryId are required',
        });
      }

      const category =
        await prisma.category.findUnique({
          where: {
            id: categoryId,
          },
        });

      if (!category) {
        return res.status(404).json({
          message: 'Category not found',
        });
      }

      await prisma.$executeRawUnsafe(
        `
          UPDATE merchant_rules
          SET merchant = $1,
              category_id = $2,
              updated_at = NOW()
          WHERE id = $3
        `,
        merchant,
        categoryId,
        id,
      );

      return res.json({
        id,
        merchant,
        categoryId,
        categoryName: category.name,
      });
    } catch (error) {
      console.error(error);

      return res.status(500).json({
        message: 'Failed to update merchant rule',
      });
    }
  },
);

app.delete(
  '/api/merchant-rules/:id',
  async (req, res) => {
    try {
      await ensureMerchantRulesTable();

      const id = Number(req.params.id);

      if (!Number.isInteger(id)) {
        return res.status(400).json({
          message: 'Invalid rule id',
        });
      }

      await prisma.$executeRawUnsafe(
        `
          DELETE FROM merchant_rules
          WHERE id = $1
        `,
        id,
      );

      return res.json({
        deleted: true,
        id,
      });
    } catch (error) {
      console.error(error);

      return res.status(500).json({
        message: 'Failed to delete merchant rule',
      });
    }
  },
);

// =========================
// RECATEGORIZE ALL
// =========================

app.post(
  '/api/transactions/recategorize',
  async (req, res) => {
    try {
      const categoryByName = await getCategoryMap();

      const transactions =
        await prisma.transaction.findMany({
          where: {
            account: {
              externalId: {
                not: null,
              },
            },
          },
        });

      let updated = 0;

      for (const transaction of transactions) {
        const categoryId =
          await resolveTransactionCategoryId(
            transaction.description,
            transaction.merchant,
            transaction.type,
            categoryByName,
          );

        if (
          categoryId !== null &&
          transaction.categoryId !== categoryId
        ) {
          await prisma.transaction.update({
            where: {
              id: transaction.id,
            },
            data: {
              categoryId,
            },
          });

          updated++;
        }
      }

      return res.json({
        updated,
      });
    } catch (error) {
      console.error(error);

      return res.status(500).json({
        message:
          'Failed to recategorize transactions',
      });
    }
  },
);

// =========================
// MONOBANK CLIENT INFO
// =========================

app.get(
  '/api/monobank/client-info',
  async (req, res) => {
    try {
      const clientInfo: any =
        await getMonobankClientInfo();

      const safeAccounts =
        clientInfo.accounts.map(
          (account: any) => ({
            id: account.id,
            currencyCode:
              account.currencyCode,
            balance: account.balance,
            type: account.type,
          }),
        );

      return res.json({
        accounts: safeAccounts,
      });
    } catch (error) {
      console.error(error);

      return res.status(500).json({
        message:
          'Failed to fetch Monobank client info',
      });
    }
  },
);

// =========================
// SYNC MONOBANK ACCOUNTS
// =========================

app.post(
  '/api/monobank/sync-accounts',
  async (req, res) => {
    try {
      const clientInfo: any =
        await getMonobankClientInfo();

      const syncedAccounts = [];

      for (const monoAccount of clientInfo.accounts) {
        if (monoAccount.type !== 'black') {
          continue;
        }
        const currency = getCurrency(
          monoAccount.currencyCode,
        );

        const accountType =
          monoAccount.type ?? 'unknown';

        const displayType =
          getAccountTypeName(accountType);

        const accountName =
          `Monobank ${displayType} ${currency}`;

        const account =
          await prisma.account.upsert({
            where: {
              bankId_externalId: {
                bankId: 1,
                externalId: monoAccount.id,
              },
            },

            update: {
              name: accountName,
              accountType,
              currency,
              balance:
                monoAccount.balance / 100,
            },

            create: {
              externalId: monoAccount.id,
              name: accountName,
              accountType,
              currency,
              balance:
                monoAccount.balance / 100,
              familyMemberId: 1,
              bankId: 1,
            },
          });

        syncedAccounts.push(account);
      }

      return res.json({
        synced: syncedAccounts.length,
        accounts: syncedAccounts,
      });
    } catch (error) {
      console.error(error);

      return res.status(500).json({
        message:
          'Failed to sync Monobank accounts',
      });
    }
  },
);

// =========================
// TEST MONOBANK STATEMENT
// =========================

app.get(
  '/api/monobank/test-statement/:id',
  async (req, res) => {
    try {
      const id = Number(req.params.id);

      const account =
        await prisma.account.findUnique({
          where: {
            id,
          },
        });

      if (!account) {
        return res.status(404).json({
          message: 'Account not found',
        });
      }

      if (!account.externalId) {
        return res.status(400).json({
          message:
            'Account is not connected to Monobank',
        });
      }

      const to =
        Math.floor(Date.now() / 1000);

      const from =
        to - 24 * 60 * 60;

      const statement =
        await getMonobankStatement(
          account.externalId,
          from,
          to,
        );

      return res.json(statement);
    } catch (error) {
      console.error(error);

      return res.status(500).json({
        message:
          'Failed to fetch Monobank statement',
      });
    }
  },
);

// =========================
// SYNC ONE ACCOUNT
// =========================

app.post(
  '/api/monobank/sync-transactions/:id',
  async (req, res) => {
    try {
      const id = Number(req.params.id);

      const account =
        await prisma.account.findUnique({
          where: {
            id,
          },
        });

      if (!account) {
        return res.status(404).json({
          message: 'Account not found',
        });
      }

      if (!account.externalId) {
        return res.status(400).json({
          message:
            'Account is not connected to Monobank',
        });
      }

      const to =
        Math.floor(Date.now() / 1000);

      const from =
        to - 24 * 60 * 60;

      const statement: any =
        await getMonobankStatement(
          account.externalId,
          from,
          to,
        );

      const categoryByName =
        await getCategoryMap();

      let created = 0;
      let skipped = 0;

      for (const item of statement) {
        try {
          const description =
            item.description ?? '';

          await prisma.transaction.create({
            data: {
              externalId: item.id,
              accountId: account.id,

              amount:
                item.amount / 100,

              currency:
                account.currency,

              description,

              merchant:
                item.description ?? null,

              type:
                item.amount >= 0
                  ? 'INCOME'
                  : 'EXPENSE',

              date: new Date(
                item.time * 1000,
              ),

              categoryId:
                await resolveTransactionCategoryId(
                  description,
                  item.description ?? null,
                  item.amount >= 0
                    ? 'INCOME'
                    : 'EXPENSE',
                  categoryByName,
                ),
            },
          });

          created++;
        } catch (error: any) {
          if (error.code === 'P2002') {
            skipped++;
            continue;
          }

          throw error;
        }
      }

      return res.json({
        received: statement.length,
        created,
        skipped,
      });
    } catch (error) {
      console.error(error);

      return res.status(500).json({
        message:
          'Failed to sync Monobank transactions',
      });
    }
  },
);

// =========================
// SYNC ALL MONOBANK TRANSACTIONS
// =========================

app.post(
  '/api/monobank/sync-all-transactions',
  async (req, res) => {
    try {
      const accounts =
        await prisma.account.findMany({
          where: {
            externalId: {
              not: null,
            },
          },
        });

      const categoryByName =
        await getCategoryMap();

      let received = 0;
      let created = 0;
      let skipped = 0;

      for (const account of accounts) {
        if (!account.externalId) {
          continue;
        }

        const to =
          Math.floor(Date.now() / 1000);

        const from =
          to - 31 * 24 * 60 * 60;

        const statement: any =
          await getMonobankStatement(
            account.externalId,
            from,
            to,
          );

        received += statement.length;

        for (const item of statement) {
          try {
            const description =
              item.description ?? '';

            await prisma.transaction.create({
              data: {
                externalId: item.id,
                accountId: account.id,

                amount:
                  item.amount / 100,

                currency:
                  account.currency,

                description,

                merchant:
                  item.description ?? null,

                type:
                  item.amount >= 0
                    ? 'INCOME'
                    : 'EXPENSE',

                date: new Date(
                  item.time * 1000,
                ),

                categoryId:
                  await resolveTransactionCategoryId(
                    description,
                    item.description ?? null,
                    item.amount >= 0
                      ? 'INCOME'
                      : 'EXPENSE',
                    categoryByName,
                  ),
              },
            });

            created++;
          } catch (error: any) {
            if (error.code === 'P2002') {
              skipped++;
              continue;
            }

            throw error;
          }
        }
      }

      return res.json({
        accounts: accounts.length,
        received,
        created,
        skipped,
      });
    } catch (error) {
      console.error(error);

      return res.status(500).json({
        message:
          'Failed to sync all Monobank transactions',
      });
    }
  },
);

// =========================
// BACKFILL MONOBANK HISTORY
// Дотягує старі транзакції, яких немає в базі.
// POST /api/monobank/backfill?days=60
// =========================

// monobank віддає виписку максимум за 31 день і максимум 500 транзакцій за раз
const MONOBANK_MAX_RANGE_SECONDS = 31 * 24 * 60 * 60;
const MONOBANK_PAGE_SIZE = 500;

app.post(
  '/api/monobank/backfill',
  async (req, res) => {
    try {
      const days = Number(req.query.days ?? 60);

      if (
        !Number.isInteger(days) ||
        days < 1 ||
        days > 365
      ) {
        return res.status(400).json({
          message: 'days must be between 1 and 365',
        });
      }

      const accounts =
        await prisma.account.findMany({
          where: {
            externalId: {
              not: null,
            },
          },
        });

      const categoryByName =
        await getCategoryMap();

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

        // Йдемо від сьогодні назад шматками по 31 дню
        let windowTo = now;

        while (windowTo > start) {
          const windowFrom = Math.max(
            start,
            windowTo - MONOBANK_MAX_RANGE_SECONDS,
          );

          console.log(
            `[backfill] ${account.name}: ` +
              `${new Date(windowFrom * 1000).toLocaleDateString('uk-UA')} – ` +
              `${new Date(windowTo * 1000).toLocaleDateString('uk-UA')}`,
          );

          const statement: any =
            await getMonobankStatement(
              account.externalId,
              windowFrom,
              windowTo,
            );

          requests++;
          received += statement.length;

          for (const item of statement) {
            // вже є в базі - пропускаємо
            const exists =
              await prisma.transaction.findFirst({
                where: {
                  externalId: item.id,
                },
                select: {
                  id: true,
                },
              });

            if (exists) {
              skipped++;
              continue;
            }

            const description =
              item.description ?? '';

            const type =
              item.amount >= 0
                ? 'INCOME'
                : 'EXPENSE';

            await prisma.transaction.create({
              data: {
                externalId: item.id,
                accountId: account.id,
                amount: item.amount / 100,
                currency: account.currency,
                description,
                merchant:
                  item.description ?? null,
                type,
                date: new Date(
                  item.time * 1000,
                ),
                categoryId:
                  await resolveTransactionCategoryId(
                    description,
                    item.description ?? null,
                    type,
                    categoryByName,
                  ),
              },
            });

            created++;
          }

          if (statement.length >= MONOBANK_PAGE_SIZE) {
            // Банк віддав тільки 500 найновіших - дочитуємо старіші
            const oldestTime = Math.min(
              ...statement.map(
                (item: any) => item.time,
              ),
            );

            windowTo =
              oldestTime < windowTo
                ? oldestTime
                : windowFrom;
          } else {
            windowTo = windowFrom;
          }
        }
      }

      console.log(
        `[backfill] done: ${created} new, ${skipped} already saved`,
      );

      return res.json({
        accounts: accounts.length,
        days,
        requests,
        received,
        created,
        skipped,
      });
    } catch (error) {
      console.error('Backfill failed:', error);

      return res.status(500).json({
        message:
          'Failed to backfill Monobank history',
      });
    }
  },
);

// =========================
// EXPENSE REPORT
// =========================

app.get(
  '/api/reports/expenses',
  async (req, res) => {
    try {
      const days = Number(req.query.days ?? 30);

      if (
        !Number.isInteger(days) ||
        days < 1 ||
        days > 365
      ) {
        return res.status(400).json({
          message:
            'Days must be between 1 and 365',
        });
      }

      const from = new Date();

      from.setHours(0, 0, 0, 0);
      from.setDate(
        from.getDate() - (days - 1),
      );

      const transactions =
        await prisma.transaction.findMany({
          where: {
            type: 'EXPENSE',

            date: {
              gte: from,
            },

            account: {
              externalId: {
                not: null,
              },
            },
          },

          include: {
            category: true,
          },
        });

      let total = 0;

      const byCategory: Record<string, number> = {};

      for (const transaction of transactions) {
        if (
          transaction.category?.name ===
          'Money Transfer'
        ) {
          continue;
        }

        const amount = Math.abs(
          Number(transaction.amount),
        );

        const category =
          transaction.category?.name ?? 'Other';

        const previousAmount =
          byCategory[category] ?? 0;

        byCategory[category] =
          previousAmount + amount;

        total += amount;
      }

      const roundedByCategory: Record<
        string,
        number
      > = {};

      for (const [category, amount] of Object.entries(
        byCategory,
      )) {
        roundedByCategory[category] = Number(
          amount.toFixed(2),
        );
      }

      return res.json({
        currency: 'UAH',
        days,
        from,
        total: Number(total.toFixed(2)),
        byCategory: roundedByCategory,
      });
    } catch (error) {
      console.error(error);

      return res.status(500).json({
        message:
          'Failed to generate expense report',
      });
    }
  },
);

// =========================
// ANALYTICS SUMMARY
// =========================

app.get(
  '/api/reports/summary',
  async (req, res) => {
    try {
      const periods = [
        {
          key: 'today',
          days: 1,
        },
        {
          key: 'week',
          days: 7,
        },
        {
          key: 'month',
          days: 30,
        },
      ] as const;

      type CurrencyTotals = {
        income: number;
        expenses: number;
        transfers: number;
      };

      type PeriodResult = Record<
        string,
        CurrencyTotals
      >;

      const result: Record<
        string,
        PeriodResult
      > = {};

      for (const period of periods) {
        const from = new Date();

        from.setHours(0, 0, 0, 0);
        from.setDate(
          from.getDate() - (period.days - 1),
        );

        const transactions =
          await prisma.transaction.findMany({
            where: {
              date: {
                gte: from,
              },

              account: {
                externalId: {
                  not: null,
                },
              },
            },

            include: {
              category: true,
            },

            orderBy: {
              date: 'desc',
            },
          });

        const currencies: PeriodResult = {};

        for (const transaction of transactions) {
          const currency = transaction.currency;

          const amount = Math.abs(
            Number(transaction.amount),
          );

          const current: CurrencyTotals =
            currencies[currency] ?? {
              income: 0,
              expenses: 0,
              transfers: 0,
            };

          if (
            transaction.category?.name ===
            'Money Transfer'
          ) {
            current.transfers += amount;
          } else if (
            transaction.type === 'INCOME'
          ) {
            current.income += amount;
          } else {
            current.expenses += amount;
          }

          currencies[currency] = current;
        }

        const rounded: PeriodResult = {};

        for (const [currency, totals] of Object.entries(
          currencies,
        )) {
          rounded[currency] = {
            income: Number(
              totals.income.toFixed(2),
            ),
            expenses: Number(
              totals.expenses.toFixed(2),
            ),
            transfers: Number(
              totals.transfers.toFixed(2),
            ),
          };
        }

        result[period.key] = rounded;
      }

      return res.json(result);
    } catch (error) {
      console.error(
        'Failed to generate analytics summary:',
        error,
      );

      return res.status(500).json({
        message:
          'Failed to generate analytics summary',
      });
    }
  },
);

// =========================0
// START SERVER
// =========================


app.use(analyticsRouter);

app.listen(PORT, () => {
  console.log(
    `Server is running on http://localhost:${PORT}`,
  );
});