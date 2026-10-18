// Creates a read-only DEMO login filled with FAKE data: invented family
// members, cards and ~90 days of transactions. Use it for screenshots and
// for a public demo, so real bank data never ends up on the internet.
//
//   DEMO_EMAIL=demo@example.com DEMO_PASSWORD='long-password' npm run seed:demo
//   ... npm run seed:demo -- --reset   (re-creates the demo user's data)
//
// The fake data belongs ONLY to the demo user. Other users' data is never
// touched, and --reset deletes nothing but the demo user's own records.
// For a public demo server still use a separate database.

import { getCategoryMap } from '../src/categorize';
import { Prisma } from '../src/generated/prisma/client';
import { checkNewPassword, hashPassword } from '../src/password';
import { prisma } from '../src/prisma';

// merchant, category, typical amount range in UAH, how often per month
const EXPENSES: Array<[string, string, number, number, number]> = [
  ['Silpo', 'Groceries', 250, 1400, 9],
  ['ATB', 'Groceries', 120, 650, 7],
  ['Novus', 'Groceries', 300, 1100, 3],
  ['Aroma Kava', 'Cafes & Restaurants', 70, 180, 8],
  ['Puzata Hata', 'Cafes & Restaurants', 180, 420, 4],
  ['Glovo', 'Cafes & Restaurants', 250, 650, 3],
  ['Uklon', 'Transport', 90, 320, 6],
  ['Bolt', 'Transport', 80, 260, 4],
  ['OKKO', 'Fuel', 900, 1900, 3],
  ['WOG', 'Fuel', 800, 1700, 2],
  ['Apteka ANC', 'Health', 120, 900, 2],
  ['Sport Life', 'Sports', 900, 900, 1],
  ['Multiplex', 'Entertainment', 220, 480, 1],
  ['Rozetka', 'Shopping & Home', 300, 3500, 2],
  ['Epicentr', 'Shopping & Home', 400, 2500, 1],
];

const SUBSCRIPTIONS: Array<[string, number, number]> = [
  ['Netflix', 299, 5],
  ['Spotify', 169, 12],
  ['Google One', 89, 20],
  ['Kyivstar', 250, 3],
];

const UTILITIES: Array<[string, number, number]> = [
  ['Kyivteploenergo', 1850, 10],
  ['YASNO electricity', 980, 11],
  ['Kyivvodokanal', 420, 12],
];

// Deterministic "random" so the demo looks the same every time
let seed = 42;
function random(): number {
  seed = (seed * 1664525 + 1013904223) % 4294967296;
  return seed / 4294967296;
}

function between(min: number, max: number): number {
  return Math.round((min + random() * (max - min)) * 100) / 100;
}

function daysAgo(days: number, hour: number): Date {
  const date = new Date();
  date.setDate(date.getDate() - days);
  date.setHours(hour, Math.floor(random() * 60), 0, 0);
  return date;
}

async function main() {
  const reset = process.argv.includes('--reset');
  const demoEmail = process.env.DEMO_EMAIL?.trim().toLowerCase();
  const demoPassword = process.env.DEMO_PASSWORD ?? '';

  if (!demoEmail) {
    console.error(
      "❌ Set DEMO_EMAIL and DEMO_PASSWORD, e.g.:\n" +
        "   DEMO_EMAIL=demo@example.com DEMO_PASSWORD='choose-a-long-password' npm run seed:demo",
    );
    process.exit(1);
  }

  const passwordProblem = checkNewPassword(demoPassword, demoEmail);

  if (passwordProblem) {
    console.error(`❌ DEMO_PASSWORD: ${passwordProblem}`);
    process.exit(1);
  }

  const existingUser = await prisma.user.findUnique({ where: { email: demoEmail } });

  if (existingUser && existingUser.role !== 'DEMO') {
    console.error(
      `❌ ${demoEmail} is a real (${existingUser.role}) account. ` +
        'Demo data can only go into a DEMO account. Use another email.',
    );
    process.exit(1);
  }

  const passwordHash = await hashPassword(demoPassword);

  const demoUser = existingUser
    ? await prisma.user.update({
        where: { id: existingUser.id },
        data: { passwordHash, tokenVersion: { increment: 1 } },
      })
    : await prisma.user.create({
        data: { email: demoEmail, passwordHash, role: 'DEMO' },
      });

  const userId = demoUser.id;
  const existing = await prisma.transaction.count({ where: { userId } });

  if (existing > 0 && !reset) {
    console.error(
      `❌ The demo account already has ${existing} transactions. ` +
        'Run with --reset to re-create its data.',
    );
    process.exit(1);
  }

  if (reset) {
    console.log(`⚠️  --reset: deleting data of ${demoEmail} only...`);
    await prisma.transaction.deleteMany({ where: { userId } });
    await prisma.merchantRule.deleteMany({ where: { userId } });
    await prisma.account.deleteMany({ where: { userId } });
    await prisma.familyMember.deleteMany({ where: { userId } });
    await prisma.category.deleteMany({ where: { userId } });
  }

  const categoryIds = await getCategoryMap(userId);

  const bank = await prisma.bank.upsert({
    where: { name: 'Monobank' },
    update: {},
    create: { name: 'Monobank' },
  });

  const alex = await prisma.familyMember.create({
    data: { userId, name: 'Alex Demo' },
  });
  const maria = await prisma.familyMember.create({
    data: { userId, name: 'Maria Demo' },
  });

  const uah = await prisma.account.create({
    data: {
      userId,
      name: 'Monobank Black UAH',
      externalId: 'demo-uah',
      accountType: 'black',
      currency: 'UAH',
      balance: new Prisma.Decimal(48250.4),
      familyMemberId: alex.id,
      bankId: bank.id,
    },
  });

  const eur = await prisma.account.create({
    data: {
      userId,
      name: 'Monobank Black EUR',
      externalId: 'demo-eur',
      accountType: 'black',
      currency: 'EUR',
      balance: new Prisma.Decimal(1320.75),
      familyMemberId: alex.id,
      bankId: bank.id,
    },
  });

  await prisma.account.create({
    data: {
      userId,
      name: 'Monobank Black USD',
      externalId: 'demo-usd',
      accountType: 'black',
      currency: 'USD',
      balance: new Prisma.Decimal(860),
      familyMemberId: maria.id,
      bankId: bank.id,
    },
  });

  type Row = Prisma.TransactionCreateManyInput;
  const rows: Row[] = [];
  let counter = 0;

  const add = (
    accountId: number,
    currency: string,
    amount: number,
    merchant: string,
    category: string,
    type: 'INCOME' | 'EXPENSE' | 'TRANSFER',
    date: Date,
  ) => {
    counter++;
    rows.push({
      userId,
      externalId: `demo-${counter}`,
      accountId,
      currency,
      amount: new Prisma.Decimal(amount),
      description: merchant,
      merchant,
      type,
      date,
      categoryId: categoryIds[category] ?? null,
    });
  };

  const DAYS = 90;

  for (let day = 0; day < DAYS; day++) {
    for (const [merchant, category, min, max, perMonth] of EXPENSES) {
      if (random() < perMonth / 30) {
        add(
          uah.id,
          'UAH',
          -between(min, max),
          merchant,
          category,
          'EXPENSE',
          daysAgo(day, 8 + Math.floor(random() * 13)),
        );
      }
    }
  }

  for (let month = 0; month < 3; month++) {
    for (const [merchant, amount, dayOfMonth] of SUBSCRIPTIONS) {
      add(
        uah.id,
        'UAH',
        -amount,
        merchant,
        'Subscriptions',
        'EXPENSE',
        daysAgo(month * 30 + (30 - dayOfMonth), 9),
      );
    }

    for (const [merchant, amount, dayOfMonth] of UTILITIES) {
      add(
        uah.id,
        'UAH',
        -between(amount * 0.85, amount * 1.15),
        merchant,
        'Utilities',
        'EXPENSE',
        daysAgo(month * 30 + (30 - dayOfMonth), 11),
      );
    }

    add(uah.id, 'UAH', 42000, 'Demo Company LLC', 'Salary', 'INCOME',
      daysAgo(month * 30 + 25, 10));
    add(uah.id, 'UAH', 5000, 'Maria Demo', 'Family Income', 'INCOME',
      daysAgo(month * 30 + 12, 18));
    add(uah.id, 'UAH', -100, 'Come Back Alive', 'Charity & Donations',
      'EXPENSE', daysAgo(month * 30 + 8, 20));
    add(uah.id, 'UAH', -8000, 'Transfer to EUR card', 'Money Transfer',
      'EXPENSE', daysAgo(month * 30 + 20, 12));
    add(eur.id, 'EUR', 180, 'Transfer from UAH card', 'Money Transfer',
      'INCOME', daysAgo(month * 30 + 20, 12));
    add(eur.id, 'EUR', -between(20, 90), 'Booking.com', 'Entertainment',
      'EXPENSE', daysAgo(month * 30 + 15, 14));
  }

  add(uah.id, 'UAH', 349, 'Rozetka refund', 'Refund', 'INCOME',
    daysAgo(17, 13));

  await prisma.transaction.createMany({ data: rows });

  console.log(
    `✅ Demo login ${demoEmail} (read-only): 2 family members, 3 cards, ${rows.length} transactions`,
  );
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
