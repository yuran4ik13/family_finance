// =========================
// SECURITY TESTS
// Two users, A and B. B tries every route to read or change A's data.
// Every attempt must fail. Run:  npm test  (needs a TEST database)
// =========================

import './guard';

import assert from 'node:assert/strict';
import type { AddressInfo } from 'node:net';
import { after, before, describe, test } from 'node:test';

import { app } from '../src/app';
import { config } from '../src/config';
import { decryptSecret, encryptSecret, monobankTokenAad } from '../src/crypto';
import { hashPassword } from '../src/password';
import { prisma } from '../src/prisma';

const RUN = Date.now().toString(36);
const PASSWORD = 'correct-horse-battery-staple';
const SECRET_MERCHANT = `SECRET-A-MERCHANT-${RUN}`;

let baseUrl = '';
let server: ReturnType<typeof app.listen>;

type Client = {
  cookie: string;
  request: (method: string, path: string, body?: unknown) => Promise<{
    status: number;
    text: string;
    json: () => unknown;
  }>;
};

function client(cookie = ''): Client {
  const self: Client = {
    cookie,
    async request(method, path, body) {
      const response = await fetch(`${baseUrl}${path}`, {
        method,
        headers: {
          ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
          ...(self.cookie ? { Cookie: self.cookie } : {}),
        },
        body: body !== undefined ? JSON.stringify(body) : null,
      });

      const setCookie = response.headers.get('set-cookie');

      if (setCookie) {
        self.cookie = setCookie.split(';')[0] ?? '';
      }

      const text = await response.text();

      return { status: response.status, text, json: () => JSON.parse(text) };
    },
  };

  return self;
}

async function register(email: string): Promise<Client> {
  const c = client();
  const response = await c.request('POST', '/api/auth/register', {
    email,
    password: PASSWORD,
  });

  assert.equal(response.status, 201, response.text);

  return c;
}

const emailA = `a-${RUN}@test.example`;
const emailB = `b-${RUN}@test.example`;
const emailDemo = `demo-${RUN}@test.example`;

let alice: Client;
let bob: Client;
let aliceId = 0;
let bobId = 0;

const aliceData = {
  accountId: 0,
  transactionId: 0,
  categoryId: 0,
  ruleId: 0,
  familyMemberId: 0,
};
let bobTransactionId = 0;

before(async () => {
  server = app.listen(0);
  await new Promise((resolve) => server.once('listening', resolve));
  baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;

  alice = await register(emailA);
  bob = await register(emailB);

  aliceId = (await prisma.user.findUniqueOrThrow({ where: { email: emailA } })).id;
  bobId = (await prisma.user.findUniqueOrThrow({ where: { email: emailB } })).id;

  // Give both users some data directly in the database
  const bank = await prisma.bank.upsert({
    where: { name: 'Monobank' },
    update: {},
    create: { name: 'Monobank' },
  });

  for (const userId of [aliceId, bobId]) {
    const member = await prisma.familyMember.findFirstOrThrow({ where: { userId } });
    const category = await prisma.category.create({
      data: { userId, name: `Private-${userId}` },
    });
    const account = await prisma.account.create({
      data: {
        userId,
        familyMemberId: member.id,
        bankId: bank.id,
        // SAME bank account id for both users: must not collide
        externalId: `shared-ext-${RUN}`,
        name: `Card of ${userId}`,
        currency: 'UAH',
        balance: 1000,
      },
    });
    const transaction = await prisma.transaction.create({
      data: {
        userId,
        accountId: account.id,
        externalId: `tx-${RUN}`,
        amount: -123.45,
        currency: 'UAH',
        description: userId === aliceId ? SECRET_MERCHANT : 'Bob shop',
        merchant: userId === aliceId ? SECRET_MERCHANT : 'Bob shop',
        type: 'EXPENSE',
        date: new Date(),
        categoryId: category.id,
      },
    });

    if (userId === aliceId) {
      const rule = await prisma.merchantRule.create({
        data: {
          userId,
          merchant: SECRET_MERCHANT,
          merchantKey: SECRET_MERCHANT.toLowerCase(),
          categoryId: category.id,
        },
      });

      Object.assign(aliceData, {
        accountId: account.id,
        transactionId: transaction.id,
        categoryId: category.id,
        ruleId: rule.id,
        familyMemberId: member.id,
      });

      await prisma.user.update({
        where: { id: aliceId },
        data: {
          monobankTokenEnc: encryptSecret('alice-token-xyz', monobankTokenAad(aliceId)),
          transferMarkers: 'від: alice secret relative',
        },
      });
    } else {
      bobTransactionId = transaction.id;
    }
  }
});

after(async () => {
  await prisma.user.deleteMany({
    where: { email: { in: [emailA, emailB, emailDemo] } },
  });
  server.close();
  await prisma.$disconnect();
});

describe('login wall', () => {
  const protectedRoutes = [
    ['GET', '/api/transactions'],
    ['GET', '/api/transactions/simple'],
    ['GET', '/api/accounts'],
    ['GET', '/api/accounts/summary'],
    ['GET', '/api/categories'],
    ['GET', '/api/merchant-rules'],
    ['GET', '/api/family-members'],
    ['GET', '/api/reports/summary'],
    ['GET', '/api/reports/expenses'],
    ['GET', '/api/reports/analytics'],
    ['GET', '/api/settings'],
    ['GET', '/api/settings/security-log'],
    ['GET', '/api/account/export'],
    ['POST', '/api/monobank/sync-accounts'],
    ['PATCH', '/api/transactions/1'],
    ['DELETE', '/api/account'],
  ] as const;

  for (const [method, path] of protectedRoutes) {
    test(`${method} ${path} without login -> 401`, async () => {
      const response = await client().request(method, path, method === 'GET' ? undefined : {});
      assert.equal(response.status, 401);
    });
  }

  test('forged token is rejected', async () => {
    const forged = client('ff_session=eyJhbGciOiJub25lIn0.eyJzdWIiOiIxIiwidHYiOjB9.');
    assert.equal((await forged.request('GET', '/api/auth/me')).status, 401);
  });
});

describe('user B cannot READ user A data', () => {
  const readRoutes = [
    '/api/transactions',
    '/api/transactions/simple',
    '/api/accounts',
    '/api/accounts/summary',
    '/api/categories',
    '/api/merchant-rules',
    '/api/family-members',
    '/api/reports/summary',
    '/api/reports/expenses?days=30',
    '/api/settings',
    '/api/settings/security-log',
    '/api/account/export',
  ];

  for (const path of readRoutes) {
    test(`GET ${path} shows only B's own data`, async () => {
      const response = await bob.request('GET', path);

      assert.equal(response.status, 200, response.text);
      assert.ok(!response.text.includes(SECRET_MERCHANT), 'leaked A merchant');
      assert.ok(!response.text.includes(`Private-${aliceId}`), 'leaked A category');
      assert.ok(!response.text.includes(`Card of ${aliceId}`), 'leaked A account');
      assert.ok(!response.text.includes('alice secret relative'), 'leaked A markers');
      assert.ok(!response.text.includes(emailA), 'leaked A email');
    });
  }

  test("analytics filtered by A's account id returns nothing", async () => {
    const response = await bob.request(
      'GET',
      `/api/reports/analytics?accountIds=${aliceData.accountId}&type=ALL`,
    );
    const body = response.json() as { totals: { count: number } };

    assert.equal(response.status, 200);
    assert.equal(body.totals.count, 0);
    assert.ok(!response.text.includes(SECRET_MERCHANT));
  });

  test('A still sees A data (sanity check)', async () => {
    const response = await alice.request('GET', '/api/transactions/simple');

    assert.ok(response.text.includes(SECRET_MERCHANT));
    assert.ok(!response.text.includes('Bob shop'));
  });
});

describe('user B cannot CHANGE user A data', () => {
  test("PATCH A's transaction -> 404, unchanged", async () => {
    const bobCategory = await prisma.category.findFirstOrThrow({ where: { userId: bobId } });
    const response = await bob.request('PATCH', `/api/transactions/${aliceData.transactionId}`, {
      categoryId: bobCategory.id,
    });

    assert.equal(response.status, 404);

    const tx = await prisma.transaction.findUniqueOrThrow({ where: { id: aliceData.transactionId } });
    assert.equal(tx.categoryId, aliceData.categoryId);
  });

  test("B can't put own transaction into A's category", async () => {
    const response = await bob.request('PATCH', `/api/transactions/${bobTransactionId}`, {
      categoryId: aliceData.categoryId,
    });

    assert.equal(response.status, 404);
  });

  test("B can't create a transaction on A's account", async () => {
    const response = await bob.request('POST', '/api/transactions', {
      accountId: aliceData.accountId,
      amount: -1,
      currency: 'UAH',
      type: 'EXPENSE',
      date: new Date().toISOString(),
    });

    assert.equal(response.status, 404);
  });

  test("B can't create an account for A's family member", async () => {
    const bank = await prisma.bank.findUniqueOrThrow({ where: { name: 'Monobank' } });
    const response = await bob.request('POST', '/api/accounts', {
      name: 'hijack',
      currency: 'UAH',
      familyMemberId: aliceData.familyMemberId,
      bankId: bank.id,
    });

    assert.equal(response.status, 404);
  });

  test("B can't edit or delete A's merchant rule", async () => {
    const bobCategory = await prisma.category.findFirstOrThrow({ where: { userId: bobId } });

    const patch = await bob.request('PATCH', `/api/merchant-rules/${aliceData.ruleId}`, {
      merchant: 'hacked',
      categoryId: bobCategory.id,
    });
    const del = await bob.request('DELETE', `/api/merchant-rules/${aliceData.ruleId}`);

    assert.equal(patch.status, 404);
    assert.equal(del.status, 404);

    const rule = await prisma.merchantRule.findUniqueOrThrow({ where: { id: aliceData.ruleId } });
    assert.equal(rule.merchant, SECRET_MERCHANT);
  });

  test("B can't sync A's bank account", async () => {
    const response = await bob.request(
      'POST',
      `/api/monobank/sync-transactions/${aliceData.accountId}`,
    );

    assert.equal(response.status, 404);
  });

  test("B can't add banks to the shared list (owner only)", async () => {
    const response = await bob.request('POST', '/api/banks', { name: `Evil Bank ${RUN}` });

    assert.equal(response.status, 403);
  });

  test("B's recategorize touches only B's transactions", async () => {
    await bob.request('POST', '/api/transactions/recategorize');

    const tx = await prisma.transaction.findUniqueOrThrow({ where: { id: aliceData.transactionId } });
    assert.equal(tx.categoryId, aliceData.categoryId);
  });
});

describe('secrets', () => {
  test('bank token is stored encrypted and never returned', async () => {
    const user = await prisma.user.findUniqueOrThrow({ where: { id: aliceId } });

    assert.ok(user.monobankTokenEnc?.startsWith('v1.'));
    assert.ok(!user.monobankTokenEnc?.includes('alice-token-xyz'));

    for (const path of ['/api/settings', '/api/account/export', '/api/auth/me']) {
      const response = await alice.request('GET', path);

      assert.ok(!response.text.includes('alice-token-xyz'), `${path} leaked token`);
      assert.ok(!response.text.includes(user.monobankTokenEnc ?? '???'), `${path} leaked ciphertext`);
      assert.ok(!response.text.includes('passwordHash'), `${path} leaked hash`);
    }

    const settings = (await alice.request('GET', '/api/settings')).json() as {
      monobankConnected: boolean;
    };
    assert.equal(settings.monobankConnected, true);
  });

  test("A's encrypted token can't be decrypted as B's", async () => {
    const user = await prisma.user.findUniqueOrThrow({ where: { id: aliceId } });
    const enc = user.monobankTokenEnc ?? '';

    assert.equal(decryptSecret(enc, monobankTokenAad(aliceId)), 'alice-token-xyz');
    assert.equal(decryptSecret(enc, monobankTokenAad(bobId)), null);
  });

  test('tampered ciphertext is rejected', () => {
    const enc = encryptSecret('secret-value', 'ctx');
    const parts = enc.split('.');
    const data = Buffer.from(parts[3] ?? '', 'base64url');
    data[0] = (data[0] ?? 0) ^ 1;
    parts[3] = data.toString('base64url');

    assert.equal(decryptSecret(parts.join('.'), 'ctx'), null);
  });
});

describe('accounts and passwords', () => {
  test('weak passwords are rejected at sign up', async () => {
    for (const password of ['short', 'aaaaaaaaaaaaaa', 'password1234']) {
      const response = await client().request('POST', '/api/auth/register', {
        email: `weak-${RUN}@test.example`,
        password,
      });

      assert.equal(response.status, 400, password);
    }
  });

  test('sign up can be switched off', async () => {
    config.allowRegistration = false;

    try {
      const response = await client().request('POST', '/api/auth/register', {
        email: `off-${RUN}@test.example`,
        password: PASSWORD,
      });

      assert.equal(response.status, 403);
    } finally {
      config.allowRegistration = true;
    }
  });

  test('demo account is read-only', async () => {
    await prisma.user.create({
      data: { email: emailDemo, passwordHash: await hashPassword(PASSWORD), role: 'DEMO' },
    });

    const demo = client();
    assert.equal(
      (await demo.request('POST', '/api/auth/login', { email: emailDemo, password: PASSWORD })).status,
      200,
    );
    assert.equal((await demo.request('GET', '/api/categories')).status, 200);
    assert.equal((await demo.request('POST', '/api/categories', { name: 'x' })).status, 403);
    assert.equal(
      (await demo.request('DELETE', '/api/account', { password: PASSWORD, confirm: 'DELETE' })).status,
      403,
    );
  });

  test('changing the password logs out other sessions', async () => {
    const otherDevice = client();
    await otherDevice.request('POST', '/api/auth/login', { email: emailB, password: PASSWORD });
    assert.equal((await otherDevice.request('GET', '/api/auth/me')).status, 200);

    const newPassword = 'another-long-passphrase-42';
    const change = await bob.request('POST', '/api/auth/change-password', {
      currentPassword: PASSWORD,
      newPassword,
    });

    assert.equal(change.status, 204, change.text);
    assert.equal((await otherDevice.request('GET', '/api/auth/me')).status, 401);
    assert.equal((await bob.request('GET', '/api/auth/me')).status, 200);
  });

  test('security log records logins', async () => {
    const response = await alice.request('GET', '/api/settings/security-log');
    const events = (response.json() as Array<{ event: string }>).map((e) => e.event);

    assert.ok(events.includes('register'));
  });

  test('deleting B removes all B data and nothing of A', async () => {
    const wrong = await bob.request('DELETE', '/api/account', {
      password: 'wrong-password-123',
      confirm: 'DELETE',
    });
    assert.equal(wrong.status, 400);

    const response = await bob.request('DELETE', '/api/account', {
      password: 'another-long-passphrase-42',
      confirm: 'DELETE',
    });
    assert.equal(response.status, 204, response.text);

    assert.equal(await prisma.user.count({ where: { id: bobId } }), 0);
    assert.equal(await prisma.transaction.count({ where: { userId: bobId } }), 0);
    assert.equal(await prisma.account.count({ where: { userId: bobId } }), 0);
    assert.equal(await prisma.category.count({ where: { userId: bobId } }), 0);
    assert.equal(await prisma.auditLog.count({ where: { userId: bobId } }), 0);

    assert.equal(await prisma.transaction.count({ where: { userId: aliceId } }), 1);
    assert.equal((await bob.request('GET', '/api/auth/me')).status, 401);
  });
});
