import { prisma } from './prisma';

// =========================
// CATEGORIZATION
// Decides which category a transaction belongs to.
// Everything here works for ONE user: their own categories, their own
// merchant rules, their own history and their own personal markers.
// =========================

export type TransactionKind = 'INCOME' | 'EXPENSE' | 'TRANSFER';

export type CategorizeContext = {
  userId: number;
  // lowercase text that marks transfers between the user's own cards
  transferMarkers: string[];
  // lowercase text that marks income from family members
  familyIncomeMarkers: string[];
};

export type CategoryMap = Record<string, number>;

// "від: Name, from: Other" -> ["від: name", "from: other"]
export function parseMarkers(value: string): string[] {
  return value
    .split(',')
    .map((item) => item.trim().toLowerCase())
    .filter(Boolean)
    .slice(0, 50);
}

export function buildContext(user: {
  id: number;
  transferMarkers: string;
  familyIncomeMarkers: string;
}): CategorizeContext {
  return {
    userId: user.id,
    transferMarkers: parseMarkers(user.transferMarkers),
    familyIncomeMarkers: parseMarkers(user.familyIncomeMarkers),
  };
}

function matchesFamilyIncome(
  context: CategorizeContext,
  value: string,
): boolean {
  return context.familyIncomeMarkers.some((marker) => value.includes(marker));
}

export function getCurrency(currencyCode: number): string {
  const currencies: Record<number, string> = {
    980: 'UAH',
    840: 'USD',
    978: 'EUR',
  };

  return currencies[currencyCode] ?? String(currencyCode);
}

export function getAccountTypeName(type: string): string {
  const names: Record<string, string> = {
    black: 'Black',
    white: 'White',
    madeInUkraine: 'Made in Ukraine',
    diia: 'Diia',
  };

  return names[type] ?? type;
}

function isTransferTransaction(
  context: CategorizeContext,
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
    ...context.transferMarkers,
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


// Categories every user gets automatically
export const DEFAULT_CATEGORIES = [
  'Groceries',
  'Cafes & Restaurants',
  'Transport',
  'Fuel',
  'Subscriptions',
  'Utilities',
  'Health',
  'Sports',
  'Entertainment',
  'Shopping & Home',
  'Charity & Donations',
  'Money Transfer',
  'Salary',
  'Family Income',
  'Refund',
  'Other Income',
  'Other',
];

// The user's categories by name. Creates missing default ones.
export async function getCategoryMap(userId: number): Promise<CategoryMap> {
  const existing = await prisma.category.findMany({
    where: { userId },
    select: { id: true, name: true },
  });

  const missing = DEFAULT_CATEGORIES.filter(
    (name) => !existing.some((category) => category.name === name),
  );

  if (missing.length > 0) {
    await prisma.category.createMany({
      data: missing.map((name) => ({ userId, name })),
      skipDuplicates: true,
    });
  }

  const categories =
    missing.length > 0
      ? await prisma.category.findMany({
          where: { userId },
          select: { id: true, name: true },
        })
      : existing;

  return Object.fromEntries(
    categories.map((category) => [category.name, category.id]),
  );
}

export function merchantKey(value: string): string {
  return value.trim().toLowerCase();
}

async function getMerchantRuleCategoryId(
  context: CategorizeContext,
  description: string | null,
  merchant: string | null,
): Promise<number | null> {
  const value = (merchant ?? description ?? '').trim();

  if (!value) {
    return null;
  }

  const rule = await prisma.merchantRule.findUnique({
    where: {
      userId_merchantKey: {
        userId: context.userId,
        merchantKey: merchantKey(value),
      },
    },
    select: { categoryId: true },
  });

  return rule?.categoryId ?? null;
}

export async function upsertMerchantRule(
  userId: number,
  merchant: string,
  categoryId: number,
): Promise<void> {
  const value = merchant.trim();

  if (!value) {
    return;
  }

  await prisma.merchantRule.upsert({
    where: {
      userId_merchantKey: { userId, merchantKey: merchantKey(value) },
    },
    update: { merchant: value, categoryId },
    create: {
      userId,
      merchant: value,
      merchantKey: merchantKey(value),
      categoryId,
    },
  });
}

// Payment platforms / broad merchants can mean very different purchases,
// so a single category is not learned for them.
const AMBIGUOUS_MERCHANTS = [
  'portmone',
  'apple',
  'google',
  'liqpay',
  'wayforpay',
];

function isAmbiguousMerchant(value: string): boolean {
  const normalized = value.toLowerCase();

  return AMBIGUOUS_MERCHANTS.some(
    (name) => normalized === name || normalized.startsWith(`${name} `),
  );
}

// Same merchant categorized before BY THIS USER -> reuse that category
async function getLearnedCategoryId(
  context: CategorizeContext,
  description: string | null,
  merchant: string | null,
): Promise<number | null> {
  const value = (merchant ?? description ?? '').trim();

  if (!value || isAmbiguousMerchant(value)) {
    return null;
  }

  const learned = await prisma.transaction.findFirst({
    where: {
      userId: context.userId,
      OR: [
        { merchant: { equals: value, mode: 'insensitive' } },
        { description: { equals: value, mode: 'insensitive' } },
      ],
      categoryId: { not: null },
      category: { name: { notIn: ['Other', 'Other Income'] } },
    },
    orderBy: { updatedAt: 'desc' },
    select: { categoryId: true },
  });

  return learned?.categoryId ?? null;
}

// Built-in rules only (no database): used to tell AUTO from MANUAL
function getRuleCategoryId(
  context: CategorizeContext,
  description: string | null,
  merchant: string | null,
  type: TransactionKind,
  categoryByName: CategoryMap,
): number | null {
  if (type === 'TRANSFER' || isTransferTransaction(context, description, merchant)) {
    return categoryByName['Money Transfer'] ?? null;
  }

  const value = `${description ?? ''} ${merchant ?? ''}`.toLowerCase().trim();

  if (type === 'INCOME') {
    if (
      value.includes('salary') ||
      value.includes('зарплат') ||
      value.includes('заробіт')
    ) {
      return categoryByName.Salary ?? null;
    }

    if (matchesFamilyIncome(context, value)) {
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

  return getExpenseCategoryId(
    `${description ?? ''} ${merchant ?? ''}`,
    categoryByName,
  );
}

export async function resolveTransactionCategoryId(
  context: CategorizeContext,
  description: string | null,
  merchant: string | null,
  type: TransactionKind,
  categoryByName: CategoryMap,
): Promise<number | null> {
  if (type === 'EXPENSE' && !isTransferTransaction(context, description, merchant)) {
    const ruleCategoryId = await getMerchantRuleCategoryId(
      context,
      description,
      merchant,
    );

    if (ruleCategoryId !== null) {
      return ruleCategoryId;
    }

    const learnedCategoryId = await getLearnedCategoryId(
      context,
      description,
      merchant,
    );

    if (learnedCategoryId !== null) {
      return learnedCategoryId;
    }
  }

  return getRuleCategoryId(context, description, merchant, type, categoryByName);
}

// AUTO = the app chose the category, MANUAL = the user changed it
export async function getTransactionCategorySource(
  context: CategorizeContext,
  transaction: {
    id: number;
    categoryId: number | null;
    description: string | null;
    merchant: string | null;
    type: TransactionKind;
    createdAt: Date;
  },
  categoryByName: CategoryMap,
): Promise<'AUTO' | 'MANUAL'> {
  if (transaction.categoryId === null) {
    return 'AUTO';
  }

  const ruleCategoryId = getRuleCategoryId(
    context,
    transaction.description,
    transaction.merchant,
    transaction.type,
    categoryByName,
  );

  if (ruleCategoryId === transaction.categoryId) {
    return 'AUTO';
  }

  const merchantValue = (transaction.merchant ?? transaction.description ?? '').trim();

  if (!merchantValue) {
    return 'MANUAL';
  }

  const learnedBefore = await prisma.transaction.findFirst({
    where: {
      userId: context.userId,
      id: { not: transaction.id },
      createdAt: { lt: transaction.createdAt },
      OR: [
        { merchant: { equals: merchantValue, mode: 'insensitive' } },
        { description: { equals: merchantValue, mode: 'insensitive' } },
      ],
      categoryId: { not: null },
      category: { name: { notIn: ['Other', 'Other Income'] } },
    },
    orderBy: { createdAt: 'desc' },
    select: { categoryId: true },
  });

  return learnedBefore?.categoryId === transaction.categoryId
    ? 'AUTO'
    : 'MANUAL';
}
