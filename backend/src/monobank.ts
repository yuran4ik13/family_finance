import 'dotenv/config';
 
const MONOBANK_API_URL = 'https://api.monobank.ua';
 
function getMonobankToken(): string {
  const token = process.env.MONOBANK_TOKEN;
 
  if (!token) {
    throw new Error('MONOBANK_TOKEN is not defined');
  }
 
  return token;
}
 
function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
 
// Спільний "воротар" — гарантує, що між будь-якими двома запитами
// до monobank API пройде щонайменше 61 секунда, незалежно від того,
// з якого місця коду і для якого рахунку йде виклик.
let lastRequestAt = 0;
const MIN_INTERVAL_MS = 61_000;
 
async function throttle(): Promise<void> {
  const now = Date.now();
  const elapsed = now - lastRequestAt;
 
  if (elapsed < MIN_INTERVAL_MS) {
    await sleep(MIN_INTERVAL_MS - elapsed);
  }
 
  lastRequestAt = Date.now();
}
 
async function monobankFetch(
  url: string,
  retriesLeft = 3,
): Promise<Response> {
  await throttle();
 
  const token = getMonobankToken();
 
  const response = await fetch(url, {
    headers: {
      'X-Token': token,
    },
  });
 
  if (response.status === 429) {
    if (retriesLeft <= 0) {
      throw new Error(
        `Monobank API error: 429 Too Many Requests (retries exhausted)`,
      );
    }
 
    // Поважаємо Retry-After, якщо банк його надіслав, інакше чекаємо 60с
    const retryAfterHeader = response.headers.get('Retry-After');
    const retryAfterMs = retryAfterHeader
      ? Number(retryAfterHeader) * 1000
      : 60_000;
 
    console.warn(
      `[monobank] 429, чекаю ${Math.round(retryAfterMs / 1000)}с і пробую ще раз (лишилось спроб: ${retriesLeft})`,
    );
 
    await sleep(retryAfterMs);
    lastRequestAt = Date.now();
 
    return monobankFetch(url, retriesLeft - 1);
  }
 
  if (!response.ok) {
    throw new Error(
      `Monobank API error: ${response.status} ${response.statusText}`,
    );
  }
 
  return response;
}
 
// client-info майже не змінюється — кешуємо на 5 хвилин,
// щоб не палити ліміт запитів даремно
let clientInfoCache: { data: any; fetchedAt: number } | null = null;
const CLIENT_INFO_TTL_MS = 5 * 60 * 1000;
 
export async function getMonobankClientInfo() {
  if (
    clientInfoCache &&
    Date.now() - clientInfoCache.fetchedAt < CLIENT_INFO_TTL_MS
  ) {
    return clientInfoCache.data;
  }
 
  const response = await monobankFetch(
    `${MONOBANK_API_URL}/personal/client-info`,
  );
 
  const data = await response.json();
  clientInfoCache = { data, fetchedAt: Date.now() };
 
  return data;
}
 
export async function getMonobankStatement(
  accountId: string,
  from: number,
  to: number,
) {
  const response = await monobankFetch(
    `${MONOBANK_API_URL}/personal/statement/${accountId}/${from}/${to}`,
  );
 
  return response.json();
}
 