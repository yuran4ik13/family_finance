import { createHash } from 'node:crypto';

const MONOBANK_API_URL = 'https://api.monobank.ua';

// =========================
// MONOBANK API CLIENT
// Every user has their own token. Monobank allows one request per
// 60 seconds PER TOKEN, so the waiting queue and the cache are kept
// separately for each token: one user's sync never slows down another's.
// Tokens are only kept in memory as a hash key, never logged.
// =========================

export class MonobankAuthError extends Error {
  constructor() {
    super('Monobank rejected the token');
    this.name = 'MonobankAuthError';
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function tokenKey(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

const MIN_INTERVAL_MS = 61_000;

// Per token: when the next request is allowed. Requests for the same
// token are chained, so they never run in parallel.
const queues = new Map<string, Promise<void>>();
const lastRequestAt = new Map<string, number>();

function throttle(key: string): Promise<void> {
  const previous = queues.get(key) ?? Promise.resolve();

  const next = previous.then(async () => {
    const elapsed = Date.now() - (lastRequestAt.get(key) ?? 0);

    if (elapsed < MIN_INTERVAL_MS) {
      await sleep(MIN_INTERVAL_MS - elapsed);
    }

    lastRequestAt.set(key, Date.now());
  });

  queues.set(key, next.catch(() => undefined));

  return next;
}

async function monobankFetch(
  token: string,
  path: string,
  retriesLeft = 3,
): Promise<Response> {
  const key = tokenKey(token);

  await throttle(key);

  const response = await fetch(`${MONOBANK_API_URL}${path}`, {
    headers: {
      'X-Token': token,
    },
  });

  if (response.status === 401 || response.status === 403) {
    throw new MonobankAuthError();
  }

  if (response.status === 429) {
    if (retriesLeft <= 0) {
      throw new Error(
        'Monobank API error: 429 Too Many Requests (retries exhausted)',
      );
    }

    // Respect Retry-After if the bank sent it, otherwise wait 60s
    const retryAfterHeader = Number(response.headers.get('Retry-After'));
    const retryAfterMs =
      Number.isFinite(retryAfterHeader) && retryAfterHeader > 0
        ? retryAfterHeader * 1000
        : 60_000;

    console.warn(
      `[monobank] 429, waiting ${Math.round(retryAfterMs / 1000)}s (retries left: ${retriesLeft})`,
    );

    await sleep(retryAfterMs);
    lastRequestAt.set(key, Date.now());

    return monobankFetch(token, path, retriesLeft - 1);
  }

  if (!response.ok) {
    throw new Error(
      `Monobank API error: ${response.status} ${response.statusText}`,
    );
  }

  return response;
}

export type MonobankAccount = {
  id: string;
  currencyCode: number;
  balance: number;
  type?: string;
};

export type MonobankClientInfo = {
  accounts: MonobankAccount[];
};

export type MonobankStatementItem = {
  id: string;
  time: number;
  description?: string;
  amount: number;
};

// client-info rarely changes - cache it for 5 minutes per token
const clientInfoCache = new Map<
  string,
  { data: MonobankClientInfo; fetchedAt: number }
>();
const CLIENT_INFO_TTL_MS = 5 * 60 * 1000;

export async function getMonobankClientInfo(
  token: string,
  { skipCache = false } = {},
): Promise<MonobankClientInfo> {
  const key = tokenKey(token);
  const cached = clientInfoCache.get(key);

  if (
    !skipCache &&
    cached &&
    Date.now() - cached.fetchedAt < CLIENT_INFO_TTL_MS
  ) {
    return cached.data;
  }

  const response = await monobankFetch(token, '/personal/client-info');
  const raw = (await response.json()) as { accounts?: unknown };

  // Keep only the fields we use: the bank also returns the owner's
  // name and other personal details we don't need to hold in memory.
  const accounts = Array.isArray(raw.accounts)
    ? raw.accounts.flatMap((account: Record<string, unknown>) =>
        typeof account.id === 'string' &&
        typeof account.currencyCode === 'number' &&
        typeof account.balance === 'number'
          ? [
              {
                id: account.id,
                currencyCode: account.currencyCode,
                balance: account.balance,
                ...(typeof account.type === 'string'
                  ? { type: account.type }
                  : {}),
              },
            ]
          : [],
      )
    : [];

  const data = { accounts };

  clientInfoCache.set(key, { data, fetchedAt: Date.now() });

  return data;
}

export async function getMonobankStatement(
  token: string,
  accountId: string,
  from: number,
  to: number,
): Promise<MonobankStatementItem[]> {
  // accountId comes from the bank, but never trust it inside a URL path
  const safeAccountId = encodeURIComponent(accountId);

  const response = await monobankFetch(
    token,
    `/personal/statement/${safeAccountId}/${Math.floor(from)}/${Math.floor(to)}`,
  );

  const raw = await response.json();

  if (!Array.isArray(raw)) {
    return [];
  }

  return raw.flatMap((item: Record<string, unknown>) =>
    typeof item.id === 'string' &&
    typeof item.time === 'number' &&
    typeof item.amount === 'number'
      ? [
          {
            id: item.id,
            time: item.time,
            amount: item.amount,
            ...(typeof item.description === 'string'
              ? { description: item.description }
              : {}),
          },
        ]
      : [],
  );
}

export function forgetMonobankToken(token: string): void {
  const key = tokenKey(token);

  clientInfoCache.delete(key);
  queues.delete(key);
  lastRequestAt.delete(key);
}
