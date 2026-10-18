import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';

import './AnalyticsPage.css';
import { apiFetch } from './api';


// =========================
// TYPES
// =========================

type AnalyticsType = 'ALL' | 'EXPENSE' | 'INCOME';

type Preset = '7d' | '30d' | 'thisMonth' | 'lastMonth' | '90d' | 'custom';

type Totals = {
  income: number;
  expenses: number;
  net: number;
  count: number;
};

type AnalyticsResponse = {
  currency: string;
  period: {
    from: string;
    to: string;
    days: number;
  };
  totals: Totals;
  previous: Totals & {
    from: string;
    to: string;
  };
  change: {
    income: number | null;
    expenses: number | null;
  };
  focus: 'INCOME' | 'EXPENSE';
  byCategory: {
    categoryId: number | null;
    name: string;
    amount: number;
    count: number;
    share: number;
  }[];
  byDay: {
    date: string;
    income: number;
    expenses: number;
  }[];
  topMerchants: {
    merchant: string;
    amount: number;
    count: number;
  }[];
  topTransactions: {
    id: number;
    date: string;
    description: string;
    amount: number;
    category: string;
  }[];
};

type AccountOption = {
  id: number;
  name: string;
  currency: string;
};

type CategoryOption = {
  id: number;
  name: string;
};

type TooltipEntry = {
  name?: string | number;
  value?: number | string;
  color?: string;
  payload?: {
    share?: number;
  };
};

// =========================
// CONSTANTS
// =========================

const PRESETS: { id: Exclude<Preset, 'custom'>; label: string }[] = [
  { id: '7d', label: '7 days' },
  { id: '30d', label: '30 days' },
  { id: 'thisMonth', label: 'This month' },
  { id: 'lastMonth', label: 'Last month' },
  { id: '90d', label: '90 days' },
];

const TYPES: { id: AnalyticsType; label: string }[] = [
  { id: 'ALL', label: 'All' },
  { id: 'EXPENSE', label: 'Expenses' },
  { id: 'INCOME', label: 'Income' },
];

const CURRENCY_ORDER = ['UAH', 'EUR', 'USD'];

// Кольори - CSS-змінні з AnalyticsPage.css, тому самі міняються
// разом зі світлою/темною темою. Порядок фіксований і перевірений
// на розрізнення при порушеннях кольорового зору. Решта - сіре "Other".
const CATEGORY_COLORS = [
  'var(--series-1)',
  'var(--series-2)',
  'var(--series-3)',
  'var(--series-4)',
  'var(--series-5)',
];
const OTHER_COLOR = 'var(--series-other)';

const EXPENSE_COLOR = 'var(--series-1)';
const INCOME_COLOR = 'var(--series-3)';

const MAX_DONUT_SLICES = CATEGORY_COLORS.length;

// =========================
// HELPERS
// =========================

function toInputDate(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');

  return `${year}-${month}-${day}`;
}

function getPresetRange(preset: Exclude<Preset, 'custom'>) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const daysAgo = (days: number) => {
    const date = new Date(today);
    date.setDate(date.getDate() - days);
    return date;
  };

  switch (preset) {
    case '7d':
      return { from: toInputDate(daysAgo(6)), to: toInputDate(today) };

    case '30d':
      return { from: toInputDate(daysAgo(29)), to: toInputDate(today) };

    case '90d':
      return { from: toInputDate(daysAgo(89)), to: toInputDate(today) };

    case 'thisMonth':
      return {
        from: toInputDate(new Date(today.getFullYear(), today.getMonth(), 1)),
        to: toInputDate(today),
      };

    case 'lastMonth':
      return {
        from: toInputDate(
          new Date(today.getFullYear(), today.getMonth() - 1, 1),
        ),
        // день 0 поточного місяця = останній день минулого
        to: toInputDate(new Date(today.getFullYear(), today.getMonth(), 0)),
      };
  }
}

// "2026-09-01" -> "01.09"
function formatShortDate(value: string): string {
  const [, month, day] = value.split('-');
  return `${day}.${month}`;
}

// "2026-09-01" -> "01.09.2026"
function formatFullDate(value: string): string {
  const [year, month, day] = value.split('-');
  return `${day}.${month}.${year}`;
}

function formatAmount(value: number): string {
  return value.toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

// 12500 -> "12.5k" для осі графіка
function formatCompact(value: number): string {
  if (Math.abs(value) >= 1000) {
    return `${Number((value / 1000).toFixed(1))}k`;
  }

  return String(Math.round(value));
}

function toggleId(list: number[], id: number): number[] {
  return list.includes(id)
    ? list.filter((item) => item !== id)
    : [...list, id];
}

// =========================
// SMALL COMPONENTS
// =========================

function ChartTooltip({
  active,
  payload,
  label,
  currency,
  showShare,
}: {
  active?: boolean;
  payload?: readonly TooltipEntry[];
  label?: string | number;
  currency: string;
  showShare?: boolean;
}) {
  if (!active || !payload || payload.length === 0) {
    return null;
  }

  return (
    <div className="an-tooltip">
      {typeof label === 'string' && label && (
        <div className="an-tooltip__title">{formatFullDate(label)}</div>
      )}

      {payload.map((entry) => (
        <div className="an-tooltip__row" key={String(entry.name)}>
          <span
            className="an-tooltip__swatch"
            style={{ background: entry.color }}
          />
          <span className="an-tooltip__name">{entry.name}</span>
          <strong>
            {formatAmount(Number(entry.value ?? 0))} {currency}
          </strong>
          {showShare && entry.payload?.share !== undefined && (
            <span className="an-tooltip__share">
              {entry.payload.share.toFixed(1)}%
            </span>
          )}
        </div>
      ))}
    </div>
  );
}

function Delta({
  change,
  previousValue,
  higherIsGood,
  currency,
}: {
  change: number | null;
  previousValue: number;
  higherIsGood: boolean;
  currency: string;
}) {
  if (change === null) {
    return (
      <span className="an-delta an-delta--neutral">
        No data in previous period
      </span>
    );
  }

  if (change === 0) {
    return (
      <span className="an-delta an-delta--neutral">
        Same as previous period
      </span>
    );
  }

  const isUp = change > 0;
  const isGood = isUp === higherIsGood;

  return (
    <span
      className={`an-delta ${isGood ? 'an-delta--good' : 'an-delta--bad'}`}
      title={`Previous period: ${formatAmount(previousValue)} ${currency}`}
    >
      {isUp ? '▲' : '▼'} {Math.abs(change).toFixed(1)}%{' '}
      {isUp ? 'more' : 'less'} than before
    </span>
  );
}

// =========================
// PAGE
// =========================

type AnalyticsPageProps = {
  // змінюється після синхронізації - сторінка перезавантажує дані
  refreshKey?: number;
};

function AnalyticsPage({ refreshKey = 0 }: AnalyticsPageProps) {
  const initialRange = getPresetRange('30d');

  // --- фільтри ---
  const [preset, setPreset] = useState<Preset>('30d');
  const [from, setFrom] = useState(initialRange.from);
  const [to, setTo] = useState(initialRange.to);
  const [currency, setCurrency] = useState('UAH');
  const [type, setType] = useState<AnalyticsType>('ALL');
  const [accountIds, setAccountIds] = useState<number[]>([]);
  const [categoryIds, setCategoryIds] = useState<number[]>([]);
  const [includeTransfers, setIncludeTransfers] = useState(false);

  // --- дані ---
  const [accounts, setAccounts] = useState<AccountOption[]>([]);
  const [categories, setCategories] = useState<CategoryOption[]>([]);
  const [data, setData] = useState<AnalyticsResponse | null>(null);
  const [error, setError] = useState('');
  // ключ запиту, на який вже прийшла відповідь (успішна чи з помилкою)
  const [loadedKey, setLoadedKey] = useState('');
  const [showDailyTable, setShowDailyTable] = useState(false);

  const categoryMenuRef = useRef<HTMLDetailsElement>(null);

  // Рахунки і категорії для фільтрів - один раз при відкритті
  useEffect(() => {
    Promise.all([
      apiFetch(`/api/accounts/summary`).then((response) =>
        response.json(),
      ),
      apiFetch(`/api/categories`).then((response) =>
        response.json(),
      ),
    ])
      .then(([accountsData, categoriesData]) => {
        setAccounts(accountsData as AccountOption[]);
        setCategories(categoriesData as CategoryOption[]);
      })
      .catch((loadError) => {
        console.error('Failed to load filters:', loadError);
      });
  }, []);

  // Закрити меню категорій кліком поза ним
  useEffect(() => {
    const handleClick = (event: MouseEvent) => {
      const menu = categoryMenuRef.current;

      if (menu && menu.open && !menu.contains(event.target as Node)) {
        menu.open = false;
      }
    };

    document.addEventListener('mousedown', handleClick);

    return () => document.removeEventListener('mousedown', handleClick);
  }, []);

  const isRangeValid = Boolean(from && to && from <= to);

  // Рядок параметрів запиту з усіх фільтрів
  const query = useMemo(() => {
    const params = new URLSearchParams({ from, to, currency, type });

    if (accountIds.length > 0) {
      params.set('accountIds', accountIds.join(','));
    }

    if (categoryIds.length > 0) {
      params.set('categoryIds', categoryIds.join(','));
    }

    if (includeTransfers) {
      params.set('includeTransfers', 'true');
    }

    return params.toString();
  }, [from, to, currency, type, accountIds, categoryIds, includeTransfers]);

  // Унікальний ключ поточного запиту. Поки відповідь на нього не прийшла,
  // сторінка "завантажується". Так не треба окремо вмикати isLoading.
  const requestKey = `${query}#${refreshKey}`;
  const isLoading = isRangeValid && loadedKey !== requestKey;

  // Сама аналітика - при кожній зміні фільтрів
  useEffect(() => {
    if (!isRangeValid) {
      return;
    }

    const controller = new AbortController();

    apiFetch(`/api/reports/analytics?${query}`, {
      signal: controller.signal,
    })
      .then(async (response) => {
        if (!response.ok) {
          const body = (await response.json().catch(() => null)) as {
            message?: string;
          } | null;

          throw new Error(body?.message ?? 'Failed to load analytics');
        }

        return response.json() as Promise<AnalyticsResponse>;
      })
      .then((result) => {
        setData(result);
        setError('');
        setLoadedKey(requestKey);
      })
      .catch((loadError: unknown) => {
        if (controller.signal.aborted) {
          return;
        }

        console.error('Failed to load analytics:', loadError);
        setError(
          loadError instanceof Error
            ? loadError.message
            : 'Failed to load analytics',
        );
        setLoadedKey(requestKey);
      });

    return () => controller.abort();
  }, [query, requestKey, isRangeValid]);

  // --- похідні дані ---

  const currencies = useMemo(() => {
    const unique = [...new Set(accounts.map((account) => account.currency))];

    if (unique.length === 0) {
      return ['UAH'];
    }

    return unique.sort((a, b) => {
      const indexA = CURRENCY_ORDER.indexOf(a);
      const indexB = CURRENCY_ORDER.indexOf(b);

      return (indexA === -1 ? 99 : indexA) - (indexB === -1 ? 99 : indexB);
    });
  }, [accounts]);

  const accountsInCurrency = accounts.filter(
    (account) => account.currency === currency,
  );

  const donutData = useMemo(() => {
    if (!data) {
      return [];
    }

    const top = data.byCategory
      .slice(0, MAX_DONUT_SLICES)
      .map((category, index) => ({
        name: category.name,
        amount: category.amount,
        share: category.share,
        color: CATEGORY_COLORS[index] ?? OTHER_COLOR,
      }));

    const rest = data.byCategory.slice(MAX_DONUT_SLICES);

    if (rest.length > 0) {
      top.push({
        name: `Other (${rest.length})`,
        amount: rest.reduce((sum, category) => sum + category.amount, 0),
        share: rest.reduce((sum, category) => sum + category.share, 0),
        color: OTHER_COLOR,
      });
    }

    return top;
  }, [data]);

  const activeDays = data
    ? data.byDay.filter((day) => day.income > 0 || day.expenses > 0)
    : [];

  const maxMerchantAmount = data
    ? Math.max(...data.topMerchants.map((merchant) => merchant.amount), 1)
    : 1;

  const showExpenses = type !== 'INCOME';
  const showIncome = type !== 'EXPENSE';

  // --- обробники фільтрів ---

  const choosePreset = (id: Exclude<Preset, 'custom'>) => {
    const range = getPresetRange(id);
    setPreset(id);
    setFrom(range.from);
    setTo(range.to);
  };

  const chooseCurrency = (value: string) => {
    setCurrency(value);
    // картки іншої валюти тут вже не мають сенсу
    setAccountIds([]);
  };

  const resetFilters = () => {
    choosePreset('30d');
    setCurrency(currencies[0] ?? 'UAH');
    setType('ALL');
    setAccountIds([]);
    setCategoryIds([]);
    setIncludeTransfers(false);
  };

  const categoryLabel =
    categoryIds.length === 0
      ? 'All categories'
      : categoryIds.length === 1
        ? (categories.find((category) => category.id === categoryIds[0])
            ?.name ?? '1 category')
        : `${categoryIds.length} categories`;

  const focusLabel = data?.focus === 'INCOME' ? 'Income' : 'Expenses';

  // =========================
  // RENDER
  // =========================

  return (
    <div className="an-page">
      {/* ---------- ФІЛЬТРИ ---------- */}
      <section className="an-filters">
        <div className="an-filters__row">
          <div className="an-segmented" role="group" aria-label="Period">
            {PRESETS.map((item) => (
              <button
                key={item.id}
                type="button"
                className={`an-segmented__button ${
                  preset === item.id ? 'an-segmented__button--active' : ''
                }`}
                onClick={() => choosePreset(item.id)}
              >
                {item.label}
              </button>
            ))}
          </div>

          <div className="an-dates">
            <label className="an-date">
              <span>From</span>
              <input
                type="date"
                value={from}
                max={to || undefined}
                onChange={(event) => {
                  setPreset('custom');
                  setFrom(event.target.value);
                }}
              />
            </label>

            <span className="an-dates__dash">–</span>

            <label className="an-date">
              <span>To</span>
              <input
                type="date"
                value={to}
                min={from || undefined}
                onChange={(event) => {
                  setPreset('custom');
                  setTo(event.target.value);
                }}
              />
            </label>
          </div>
        </div>

        <div className="an-filters__row">
          <div className="an-segmented" role="group" aria-label="Currency">
            {currencies.map((item) => (
              <button
                key={item}
                type="button"
                className={`an-segmented__button ${
                  currency === item ? 'an-segmented__button--active' : ''
                }`}
                onClick={() => chooseCurrency(item)}
              >
                {item}
              </button>
            ))}
          </div>

          <div className="an-segmented" role="group" aria-label="Type">
            {TYPES.map((item) => (
              <button
                key={item.id}
                type="button"
                className={`an-segmented__button ${
                  type === item.id ? 'an-segmented__button--active' : ''
                }`}
                onClick={() => setType(item.id)}
              >
                {item.label}
              </button>
            ))}
          </div>

          <details className="an-menu" ref={categoryMenuRef}>
            <summary className="an-menu__trigger">
              {categoryLabel}
              <span aria-hidden="true">▾</span>
            </summary>

            <div className="an-menu__panel">
              <button
                type="button"
                className="an-menu__clear"
                onClick={() => setCategoryIds([])}
                disabled={categoryIds.length === 0}
              >
                Show all categories
              </button>

              {categories.map((category) => (
                <label className="an-menu__option" key={category.id}>
                  <input
                    type="checkbox"
                    checked={categoryIds.includes(category.id)}
                    onChange={() =>
                      setCategoryIds((current) =>
                        toggleId(current, category.id),
                      )
                    }
                  />
                  {category.name}
                </label>
              ))}
            </div>
          </details>

          <label className="an-switch">
            <input
              type="checkbox"
              checked={includeTransfers}
              onChange={(event) => setIncludeTransfers(event.target.checked)}
            />
            <span className="an-switch__track" aria-hidden="true" />
            Include transfers
          </label>

          <button type="button" className="an-reset" onClick={resetFilters}>
            Reset
          </button>
        </div>

        {accountsInCurrency.length > 1 && (
          <div className="an-filters__row">
            <span className="an-filters__label">Cards</span>

            <button
              type="button"
              className={`an-chip ${
                accountIds.length === 0 ? 'an-chip--active' : ''
              }`}
              onClick={() => setAccountIds([])}
            >
              All {currency} cards
            </button>

            {accountsInCurrency.map((account) => (
              <button
                key={account.id}
                type="button"
                className={`an-chip ${
                  accountIds.includes(account.id) ? 'an-chip--active' : ''
                }`}
                onClick={() =>
                  setAccountIds((current) => toggleId(current, account.id))
                }
              >
                {account.name}
              </button>
            ))}
          </div>
        )}
      </section>

      {!isRangeValid && (
        <p className="an-message an-message--error">
          "From" date must be before "To" date.
        </p>
      )}

      {isRangeValid && !isLoading && error && (
        <p className="an-message an-message--error">{error}</p>
      )}

      {!data && isLoading && (
        <p className="an-message">Loading analytics...</p>
      )}

      {data && (
        <div className={`an-content ${isLoading ? 'an-content--loading' : ''}`}>
          <p className="an-period">
            {formatFullDate(data.period.from)} –{' '}
            {formatFullDate(data.period.to)} · {data.period.days}{' '}
            {data.period.days === 1 ? 'day' : 'days'} · compared with{' '}
            {formatFullDate(data.previous.from)} –{' '}
            {formatFullDate(data.previous.to)}
          </p>

          {/* ---------- ПІДСУМКИ ---------- */}
          <section className="an-stats">
            {showIncome && (
              <article className="an-stat">
                <span className="an-stat__label">Income</span>
                <strong className="an-stat__value an-stat__value--income">
                  +{formatAmount(data.totals.income)}
                  <small>{data.currency}</small>
                </strong>
                <Delta
                  change={data.change.income}
                  previousValue={data.previous.income}
                  higherIsGood
                  currency={data.currency}
                />
              </article>
            )}

            {showExpenses && (
              <article className="an-stat">
                <span className="an-stat__label">Expenses</span>
                <strong className="an-stat__value an-stat__value--expense">
                  −{formatAmount(data.totals.expenses)}
                  <small>{data.currency}</small>
                </strong>
                <Delta
                  change={data.change.expenses}
                  previousValue={data.previous.expenses}
                  higherIsGood={false}
                  currency={data.currency}
                />
              </article>
            )}

            {type === 'ALL' ? (
              <article className="an-stat">
                <span className="an-stat__label">Net result</span>
                <strong className="an-stat__value">
                  {data.totals.net >= 0 ? '+' : '−'}
                  {formatAmount(Math.abs(data.totals.net))}
                  <small>{data.currency}</small>
                </strong>
                <span className="an-delta an-delta--neutral">
                  Before: {data.previous.net >= 0 ? '+' : '−'}
                  {formatAmount(Math.abs(data.previous.net))} {data.currency}
                </span>
              </article>
            ) : (
              <article className="an-stat">
                <span className="an-stat__label">Average per day</span>
                <strong className="an-stat__value">
                  {formatAmount(
                    (type === 'INCOME'
                      ? data.totals.income
                      : data.totals.expenses) / data.period.days,
                  )}
                  <small>{data.currency}</small>
                </strong>
                <span className="an-delta an-delta--neutral">
                  Over {data.period.days}{' '}
                  {data.period.days === 1 ? 'day' : 'days'}
                </span>
              </article>
            )}

            <article className="an-stat">
              <span className="an-stat__label">Transactions</span>
              <strong className="an-stat__value">{data.totals.count}</strong>
              <span className="an-delta an-delta--neutral">
                Before: {data.previous.count}
              </span>
            </article>
          </section>

          {data.totals.count === 0 ? (
            <section className="an-card an-empty">
              <strong>No transactions for these filters</strong>
              <p>Try a longer period or remove some filters.</p>
            </section>
          ) : (
            <>
              {/* ---------- ГРАФІКИ ---------- */}
              <section className="an-grid">
                <article className="an-card">
                  <div className="an-card__header">
                    <div>
                      <h2>By day</h2>
                      <p>
                        {showExpenses && showIncome
                          ? 'Income and expenses for every day'
                          : `${showIncome ? 'Income' : 'Expenses'} for every day`}
                      </p>
                    </div>

                    <button
                      type="button"
                      className="an-link"
                      onClick={() => setShowDailyTable((value) => !value)}
                    >
                      {showDailyTable ? 'Show chart' : 'Show table'}
                    </button>
                  </div>

                  {showExpenses && showIncome && (
                    <div className="an-legend">
                      <span>
                        <i style={{ background: EXPENSE_COLOR }} /> Expenses
                      </span>
                      <span>
                        <i style={{ background: INCOME_COLOR }} /> Income
                      </span>
                    </div>
                  )}

                  {showDailyTable ? (
                    <div className="an-table-wrap">
                      <table className="an-table">
                        <thead>
                          <tr>
                            <th>Date</th>
                            {showExpenses && <th>Expenses</th>}
                            {showIncome && <th>Income</th>}
                          </tr>
                        </thead>
                        <tbody>
                          {activeDays.map((day) => (
                            <tr key={day.date}>
                              <td>{formatFullDate(day.date)}</td>
                              {showExpenses && (
                                <td>{formatAmount(day.expenses)}</td>
                              )}
                              {showIncome && (
                                <td>{formatAmount(day.income)}</td>
                              )}
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  ) : (
                    <div className="an-chart">
                      <ResponsiveContainer width="100%" height="100%">
                        <BarChart
                          data={data.byDay}
                          margin={{ top: 8, right: 4, left: 0, bottom: 0 }}
                          barGap={2}
                        >
                          <CartesianGrid
                            vertical={false}
                            stroke="var(--chart-grid)"
                          />
                          <XAxis
                            dataKey="date"
                            tickFormatter={formatShortDate}
                            tickLine={false}
                            axisLine={{ stroke: 'var(--chart-axis)' }}
                            tick={{ fill: 'var(--chart-tick)', fontSize: 11 }}
                            minTickGap={16}
                          />
                          <YAxis
                            tickFormatter={formatCompact}
                            tickLine={false}
                            axisLine={false}
                            tick={{ fill: 'var(--chart-tick)', fontSize: 11 }}
                            width={44}
                          />
                          <Tooltip
                            cursor={{ fill: 'var(--chart-cursor)' }}
                            content={<ChartTooltip currency={data.currency} />}
                          />
                          {showExpenses && (
                            <Bar
                              dataKey="expenses"
                              name="Expenses"
                              fill={EXPENSE_COLOR}
                              radius={[4, 4, 0, 0]}
                              maxBarSize={26}
                              isAnimationActive={false}
                            />
                          )}
                          {showIncome && (
                            <Bar
                              dataKey="income"
                              name="Income"
                              fill={INCOME_COLOR}
                              radius={[4, 4, 0, 0]}
                              maxBarSize={26}
                              isAnimationActive={false}
                            />
                          )}
                        </BarChart>
                      </ResponsiveContainer>
                    </div>
                  )}
                </article>

                <article className="an-card">
                  <div className="an-card__header">
                    <div>
                      <h2>{focusLabel} by category</h2>
                      <p>Share of the total for the period</p>
                    </div>
                  </div>

                  {donutData.length === 0 ? (
                    <p className="an-message">No data</p>
                  ) : (
                    <div className="an-donut">
                      <div className="an-donut__chart">
                        <ResponsiveContainer width="100%" height="100%">
                          <PieChart>
                            <Pie
                              data={donutData}
                              dataKey="amount"
                              nameKey="name"
                              innerRadius="64%"
                              outerRadius="96%"
                              startAngle={90}
                              endAngle={-270}
                              stroke="var(--chart-gap)"
                              strokeWidth={2}
                              isAnimationActive={false}
                            >
                              {donutData.map((slice) => (
                                <Cell key={slice.name} fill={slice.color} />
                              ))}
                            </Pie>
                            <Tooltip
                              content={
                                <ChartTooltip
                                  currency={data.currency}
                                  showShare
                                />
                              }
                            />
                          </PieChart>
                        </ResponsiveContainer>

                        <div className="an-donut__center">
                          <span>Total</span>
                          <strong>
                            {formatAmount(
                              data.focus === 'INCOME'
                                ? data.totals.income
                                : data.totals.expenses,
                            )}
                          </strong>
                          <small>{data.currency}</small>
                        </div>
                      </div>

                      <ul className="an-donut__legend">
                        {donutData.map((slice) => (
                          <li key={slice.name}>
                            <i style={{ background: slice.color }} />
                            <span className="an-donut__name">{slice.name}</span>
                            <span className="an-donut__value">
                              <strong>{formatAmount(slice.amount)}</strong>
                              <small>{slice.share.toFixed(1)}%</small>
                            </span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                </article>
              </section>

              {/* ---------- ТОПИ ---------- */}
              <section className="an-grid">
                <article className="an-card">
                  <div className="an-card__header">
                    <div>
                      <h2>
                        Top {data.focus === 'INCOME' ? 'sources' : 'merchants'}
                      </h2>
                      <p>
                        Where most of your{' '}
                        {data.focus === 'INCOME' ? 'income came from' : 'money went'}
                      </p>
                    </div>
                  </div>

                  <ol className="an-bars">
                    {data.topMerchants.map((merchant) => (
                      <li key={merchant.merchant}>
                        <div className="an-bars__header">
                          <span>{merchant.merchant}</span>
                          <strong>
                            {formatAmount(merchant.amount)} {data.currency}
                          </strong>
                        </div>
                        <div className="an-bars__meta">
                          <div className="an-bars__track">
                            <div
                              className="an-bars__fill"
                              style={{
                                width: `${Math.max(
                                  (merchant.amount / maxMerchantAmount) * 100,
                                  2,
                                )}%`,
                              }}
                            />
                          </div>
                          <span>
                            {merchant.count}{' '}
                            {merchant.count === 1 ? 'time' : 'times'}
                          </span>
                        </div>
                      </li>
                    ))}
                  </ol>
                </article>

                <article className="an-card">
                  <div className="an-card__header">
                    <div>
                      <h2>Largest {focusLabel.toLowerCase()}</h2>
                      <p>Biggest single transactions</p>
                    </div>
                  </div>

                  <ul className="an-list">
                    {data.topTransactions.map((transaction) => (
                      <li key={transaction.id}>
                        <div className="an-list__main">
                          <strong>{transaction.description || '—'}</strong>
                          <span>
                            {new Date(transaction.date).toLocaleDateString(
                              'uk-UA',
                            )}{' '}
                            · {transaction.category}
                          </span>
                        </div>
                        <strong
                          className={
                            transaction.amount >= 0
                              ? 'an-amount--income'
                              : 'an-amount--expense'
                          }
                        >
                          {transaction.amount >= 0 ? '+' : '−'}
                          {formatAmount(Math.abs(transaction.amount))}
                        </strong>
                      </li>
                    ))}
                  </ul>
                </article>
              </section>
            </>
          )}
        </div>
      )}
    </div>
  );
}

export default AnalyticsPage;