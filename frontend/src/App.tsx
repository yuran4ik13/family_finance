import { useEffect, useState } from 'react';
import AnalyticsPage from './AnalyticsPage';
import './theme.css';
import './App.css';
import { apiFetch, useAuth } from './api';

type ExpenseReport = {
  currency: string;
  days: number;
  from: string;
  total: number;
  byCategory: Record<string, number>;
};

type Category = {
  id: number;
  name: string;
};

type MerchantRule = {
  id: number;
  merchant: string;
  categoryId: number;
  categoryName: string;
  source: string;
  createdAt: string;
  updatedAt: string;
};

type Transaction = {
  id: number;
  amount: string;
  currency: string;
  description: string | null;
  merchant: string | null;
  type: 'INCOME' | 'EXPENSE' | 'TRANSFER';
  date: string;
  category: {
    name: string;
  } | null;
  categorySource?: 'AUTO' | 'MANUAL';
};

type AccountSummary = {
  id: number;
  name: string;
  accountType: string | null;
  currency: string;
  balance: string;
  bank: {
    name: string;
  };
};

type CurrencyTotals = {
  income: number;
  expenses: number;
  transfers: number;
};

type PeriodTotals = Record<string, CurrencyTotals>;

type AnalyticsSummary = {
  today: PeriodTotals;
  week: PeriodTotals;
  month: PeriodTotals;
};

type Page =
  | 'dashboard'
  | 'transactions'
  | 'accounts'
  | 'categories'
  | 'analytics'
  | 'rules';

type Period = 1 | 7 | 30;

type Theme = 'light' | 'dark';

const THEME_STORAGE_KEY = 'family-finance-theme';

// Збережений вибір, а якщо його нема - тема системи
function getInitialTheme(): Theme {
  try {
    const saved = localStorage.getItem(THEME_STORAGE_KEY);

    if (saved === 'light' || saved === 'dark') {
      return saved;
    }
  } catch {
    // localStorage може бути недоступний (приватний режим)
  }

  return window.matchMedia('(prefers-color-scheme: dark)').matches
    ? 'dark'
    : 'light';
} 

async function fetchReport(days: Period): Promise<ExpenseReport> {
  const response = await apiFetch(
    `/api/reports/expenses?days=${days}`,
  );

  if (!response.ok) {
    throw new Error('Failed to load report');
  }

  return response.json();
}

async function fetchTransactions(): Promise<Transaction[]> {
  const response = await apiFetch(
    `/api/transactions/simple`,
  );

  if (!response.ok) {
    throw new Error('Failed to load transactions');
  }

  return response.json();
}

async function fetchAccounts(): Promise<AccountSummary[]> {
  const response = await apiFetch(
    `/api/accounts/summary`,
  );

  if (!response.ok) {
    throw new Error('Failed to load accounts');
  }

  return response.json();
}

async function fetchCategories(): Promise<Category[]> {
  const response = await apiFetch(
    `/api/categories`,
  );

  if (!response.ok) {
    throw new Error('Failed to load categories');
  }

  return response.json();
}

async function fetchMerchantRules(): Promise<MerchantRule[]> {
  const response = await apiFetch(
    `/api/merchant-rules`,
  );

  if (!response.ok) {
    throw new Error('Failed to load merchant rules');
  }

  return response.json();
}

async function fetchAnalytics(): Promise<AnalyticsSummary> {
  const response = await apiFetch(
    `/api/reports/summary`,
  );

  if (!response.ok) {
    throw new Error('Failed to load analytics');
  }

  return response.json();
}

function App() {
  const { user, onLogout } = useAuth();
  // The demo account is read-only: no bank syncs, no edits
  const readOnly = user.role === 'DEMO';

  const [report, setReport] = useState<ExpenseReport | null>(null);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [accounts, setAccounts] = useState<AccountSummary[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [analytics, setAnalytics] =
    useState<AnalyticsSummary | null>(null);
  const [merchantRules, setMerchantRules] =
    useState<MerchantRule[]>([]);
  const [newRuleMerchant, setNewRuleMerchant] =
    useState('');
  const [newRuleCategoryId, setNewRuleCategoryId] =
    useState('');
  const [savingRule, setSavingRule] =
    useState(false);

  const [transactionSearch, setTransactionSearch] =
    useState('');
  const [transactionTypeFilter, setTransactionTypeFilter] =
    useState<'ALL' | 'INCOME' | 'EXPENSE' | 'TRANSFER'>('ALL');
  const [transactionCategoryFilter, setTransactionCategoryFilter] =
    useState('ALL');

  const [page, setPage] = useState<Page>('dashboard');
  const [theme, setTheme] = useState<Theme>(getInitialTheme);

  useEffect(() => {
    document.documentElement.dataset.theme = theme;

    try {
      localStorage.setItem(THEME_STORAGE_KEY, theme);
    } catch {
      // не вдалось зберегти - тема просто не запам'ятається
    }
  }, [theme]);
  const [period, setPeriod] = useState<Period>(7);

  const [isSyncing, setIsSyncing] = useState(false);
  const [syncMessage, setSyncMessage] = useState('');

  const [updatingTransactionId, setUpdatingTransactionId] =
    useState<number | null>(null);

  useEffect(() => {
    let cancelled = false;

    Promise.all([
      fetchReport(period),
      fetchTransactions(),
      fetchAccounts(),
      fetchCategories(),
      fetchAnalytics(),
      fetchMerchantRules(),
    ])
      .then(
        ([
          reportData,
          transactionsData,
          accountsData,
          categoriesData,
          analyticsData,
          merchantRulesData,
        ]) => {
          if (cancelled) {
            return;
          }

          setReport(reportData);
          setTransactions(transactionsData);
          setAccounts(accountsData);
          setCategories(categoriesData);
          setAnalytics(analyticsData);
          setMerchantRules(merchantRulesData);
        },
      )
      .catch((error) => {
        console.error('Failed to load data:', error);
      });

    return () => {
      cancelled = true;
    };
  }, [period]);

  const reloadFinancialData = async () => {
    const [
      reportData,
      transactionsData,
      accountsData,
      analyticsData,
    ] = await Promise.all([
      fetchReport(period),
      fetchTransactions(),
      fetchAccounts(),
      fetchAnalytics(),
    ]);

    setReport(reportData);
    setTransactions(transactionsData);
    setAccounts(accountsData);
    setAnalytics(analyticsData);
  };

  const syncMonobank = async () => {
    try {
      setIsSyncing(true);
      setSyncMessage('');

      const accountsResponse = await apiFetch(
        `/api/monobank/sync-accounts`,
        {
          method: 'POST',
        },
      );

      if (!accountsResponse.ok) {
        throw new Error('Failed to sync accounts');
      }

      const transactionsResponse = await apiFetch(
        `/api/monobank/sync-all-transactions`,
        {
          method: 'POST',
        },
      );

      if (!transactionsResponse.ok) {
        throw new Error('Failed to sync transactions');
      }

      const result = await transactionsResponse.json();

      await reloadFinancialData();

      setSyncMessage(
        `Synced. New transactions: ${result.created}`,
      );
    } catch (error) {
      console.error('Sync failed:', error);
      setSyncMessage('Sync failed');
    } finally {
      setIsSyncing(false);
    }
  };

  useEffect(() => {
    let cancelled = false;

    const autoSync = async () => {
      if (document.hidden || readOnly) {
        return;
      }

      try {
        await apiFetch(
          `/api/monobank/sync-accounts`,
          {
            method: 'POST',
          },
        );

        await apiFetch(
          `/api/monobank/sync-all-transactions`,
          {
            method: 'POST',
          },
        );

        const [
          reportData,
          transactionsData,
          accountsData,
          analyticsData,
        ] = await Promise.all([
          fetchReport(period),
          fetchTransactions(),
          fetchAccounts(),
          fetchAnalytics(),
        ]);

        if (cancelled) {
          return;
        }

        setReport(reportData);
        setTransactions(transactionsData);
        setAccounts(accountsData);
        setAnalytics(analyticsData);
      } catch (error) {
        console.error('Automatic sync failed:', error);
      }
    };

    void autoSync();

    const intervalId = window.setInterval(() => {
      void autoSync();
    }, 600_000);

    return () => {
      cancelled = true;
      window.clearInterval(intervalId);
    };
  }, [period, readOnly]);

  const changeTransactionCategory = async (
    transactionId: number,
    categoryId: number,
  ) => {
    try {
      setUpdatingTransactionId(transactionId);

      const response = await apiFetch(
        `/api/transactions/${transactionId}`,
        {
          method: 'PATCH',

          headers: {
            'Content-Type': 'application/json',
          },

          body: JSON.stringify({
            categoryId,
          }),
        },
      );

      if (!response.ok) {
        throw new Error('Failed to update category');
      }

      await reloadFinancialData();
    } catch (error) {
      console.error('Failed to change category:', error);
    } finally {
      setUpdatingTransactionId(null);
    }
  };

  const reloadMerchantRules = async () => {
    const rules = await fetchMerchantRules();

    setMerchantRules(rules);
  };

  const addMerchantRule = async () => {
    const merchant = newRuleMerchant.trim();
    const categoryId = Number(newRuleCategoryId);

    if (
      !merchant ||
      !Number.isInteger(categoryId)
    ) {
      return;
    }

    try {
      setSavingRule(true);

      const response = await apiFetch(
        `/api/merchant-rules`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            merchant,
            categoryId,
          }),
        },
      );

      if (!response.ok) {
        throw new Error(
          'Failed to add merchant rule',
        );
      }

      setNewRuleMerchant('');
      setNewRuleCategoryId('');

      await reloadMerchantRules();
    } catch (error) {
      console.error(
        'Failed to add merchant rule:',
        error,
      );
    } finally {
      setSavingRule(false);
    }
  };

  const updateMerchantRule = async (
    rule: MerchantRule,
    categoryId: number,
  ) => {
    try {
      const response = await apiFetch(
        `/api/merchant-rules/${rule.id}`,
        {
          method: 'PATCH',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            merchant: rule.merchant,
            categoryId,
          }),
        },
      );

      if (!response.ok) {
        throw new Error(
          'Failed to update merchant rule',
        );
      }

      await reloadMerchantRules();
    } catch (error) {
      console.error(
        'Failed to update merchant rule:',
        error,
      );
    }
  };

  const deleteMerchantRule = async (
    ruleId: number,
  ) => {
    try {
      const response = await apiFetch(
        `/api/merchant-rules/${ruleId}`,
        {
          method: 'DELETE',
        },
      );

      if (!response.ok) {
        throw new Error(
          'Failed to delete merchant rule',
        );
      }

      await reloadMerchantRules();
    } catch (error) {
      console.error(
        'Failed to delete merchant rule:',
        error,
      );
    }
  };

  const getTransactionStatus = (
    transaction: Transaction,
  ): 'AUTO' | 'MANUAL' | 'REVIEW' => {
    if (
      transaction.category?.name === 'Other' ||
      !transaction.category
    ) {
      return 'REVIEW';
    }

    return transaction.categorySource ?? 'AUTO';
  };

  const formatDate = (date: string) =>
    new Date(date).toLocaleDateString('uk-UA', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
    });

  const formatMoney = (
    amount: number | string,
    currency: string,
  ) =>
    `${Math.abs(Number(amount)).toFixed(2)} ${currency}`;

  const renderRules = () => (
    <section className="page-section">
      <div className="section-heading">
        <div>
          <span className="eyebrow">Automation</span>
          <h2>Merchant rules</h2>

          <p>
            Teach Family Finance how specific merchants should be categorized.
          </p>
        </div>

        <span className="count-pill">
          {merchantRules.length} rules
        </span>
      </div>

      <div className="rule-form">
        <input
          className="rule-form__input"
          value={newRuleMerchant}
          placeholder="Merchant, e.g. Apple"
          onChange={(event) =>
            setNewRuleMerchant(event.target.value)
          }
        />

        <select
          className="rule-form__select"
          value={newRuleCategoryId}
          onChange={(event) =>
            setNewRuleCategoryId(event.target.value)
          }
        >
          <option value="">
            Select category
          </option>

          {categories.map((category) => (
            <option
              key={category.id}
              value={category.id}
            >
              {category.name}
            </option>
          ))}
        </select>

        <button
          className="rule-form__button"
          disabled={
            savingRule ||
            !newRuleMerchant.trim() ||
            !newRuleCategoryId
          }
          onClick={() => void addMerchantRule()}
        >
          {savingRule ? 'Saving...' : 'Add rule'}
        </button>
      </div>

      <div className="rules-table">
        <div className="rules-table__head">
          <span>Merchant</span>
          <span>Category</span>
          <span>Source</span>
          <span />
        </div>

        {merchantRules.length === 0 ? (
          <p className="empty-message rules-table__empty">
            No merchant rules yet
          </p>
        ) : (
          merchantRules.map((rule) => (
            <div
              className="rules-table__row"
              key={rule.id}
            >
              <strong>{rule.merchant}</strong>

              <select
                className="rule-form__select"
                value={rule.categoryId}
                onChange={(event) =>
                  void updateMerchantRule(
                    rule,
                    Number(event.target.value),
                  )
                }
              >
                {categories.map((category) => (
                  <option
                    key={category.id}
                    value={category.id}
                  >
                    {category.name}
                  </option>
                ))}
              </select>

              <span className="rule-source">
                Manual rule
              </span>

              <button
                className="rule-delete"
                onClick={() =>
                  void deleteMerchantRule(rule.id)
                }
              >
                Delete
              </button>
            </div>
          ))
        )}
      </div>
    </section>
  );

  if (!report) {
    return <div className="loading">Loading...</div>;
  }

  const renderAccounts = () => (
    <section className="page-section">
      <div className="section-heading">
        <div>
          <span className="eyebrow">Connected accounts</span>
          <h2>Accounts</h2>
          <p>
            Live balances from Monobank. Balances update automatically.
          </p>
        </div>

        <span className="count-pill">
          {accounts.length} accounts
        </span>
      </div>

      <div className="account-grid">
        {accounts.map((account) => (
          <article className="account-card" key={account.id}>
            <div className="account-card__top">
              <div className="account-card__icon">
                {account.currency.slice(0, 1)}
              </div>

              <div>
                <span className="account-card__bank">
                  {account.bank.name}
                </span>
                <h3>{account.name}</h3>
              </div>
            </div>

            <div className="account-card__balance">
              {Number(account.balance).toFixed(2)}
              <span>{account.currency}</span>
            </div>

            <div className="account-card__footer">
              <span>
                {account.accountType ?? 'Bank account'}
              </span>
              <span className="status-dot-label">
                <i />
                Connected
              </span>
            </div>
          </article>
        ))}
      </div>
    </section>
  );

  const filteredTransactions = transactions.filter(
    (transaction) => {
      const searchable = `${
        transaction.merchant ?? ''
      } ${transaction.description ?? ''}`.toLowerCase();

      const matchesSearch = searchable.includes(
        transactionSearch.trim().toLowerCase(),
      );

      const isTransfer =
        transaction.type === 'TRANSFER' ||
        transaction.category?.name === 'Money Transfer';

      const normalizedType = isTransfer
        ? 'TRANSFER'
        : transaction.type;

      const matchesType =
        transactionTypeFilter === 'ALL' ||
        normalizedType === transactionTypeFilter;

      const matchesCategory =
        transactionCategoryFilter === 'ALL' ||
        transaction.category?.name ===
          transactionCategoryFilter;

      return (
        matchesSearch &&
        matchesType &&
        matchesCategory
      );
    },
  );

  const reviewCount = transactions.filter(
    (transaction) =>
      getTransactionStatus(transaction) === 'REVIEW',
  ).length;

  const renderTransactions = () => (
    <section className="page-section">
      <div className="section-heading">
        <div>
          <span className="eyebrow">Activity</span>
          <h2>Transactions</h2>
          <p>
            Search, review and recategorize your latest transactions.
          </p>
        </div>

        {reviewCount > 0 && (
          <span className="review-counter">
            {reviewCount} need review
          </span>
        )}
      </div>

      <div className="transaction-toolbar">
        <label className="search-field">
          <span>⌕</span>
          <input
            value={transactionSearch}
            placeholder="Search merchant..."
            onChange={(event) =>
              setTransactionSearch(event.target.value)
            }
          />
        </label>

        <select
          className="filter-select"
          value={transactionTypeFilter}
          onChange={(event) =>
            setTransactionTypeFilter(
              event.target.value as
                | 'ALL'
                | 'INCOME'
                | 'EXPENSE'
                | 'TRANSFER',
            )
          }
        >
          <option value="ALL">All types</option>
          <option value="EXPENSE">Expenses</option>
          <option value="INCOME">Income</option>
          <option value="TRANSFER">Transfers</option>
        </select>

        <select
          className="filter-select"
          value={transactionCategoryFilter}
          onChange={(event) =>
            setTransactionCategoryFilter(
              event.target.value,
            )
          }
        >
          <option value="ALL">All categories</option>

          {categories.map((category) => (
            <option
              key={category.id}
              value={category.name}
            >
              {category.name}
            </option>
          ))}
        </select>
      </div>

      <div className="transaction-table">
        {filteredTransactions.length === 0 ? (
          <div className="empty-state">
            <span className="empty-state__icon">⌕</span>
            <strong>No transactions found</strong>
            <p>Try changing your search or filters.</p>
          </div>
        ) : (
          filteredTransactions.map((transaction) => {
            const isTransfer =
              transaction.type === 'TRANSFER' ||
              transaction.category?.name ===
                'Money Transfer';

            const status =
              getTransactionStatus(transaction);

            return (
              <div
                className="transaction-item"
                key={transaction.id}
              >
                <div className="transaction-item__merchant">
                  <div
                    className={`transaction-icon transaction-icon--${
                      isTransfer
                        ? 'transfer'
                        : transaction.type.toLowerCase()
                    }`}
                  >
                    {isTransfer
                      ? '↔'
                      : transaction.type === 'INCOME'
                        ? '↓'
                        : '↑'}
                  </div>

                  <div>
                    <strong>
                      {transaction.merchant ??
                        transaction.description ??
                        'Unknown'}
                    </strong>
                    <span>
                      {formatDate(transaction.date)}
                    </span>
                  </div>
                </div>

                <div className="transaction-item__category">
                  {isTransfer ? (
                    <span className="category-chip">
                      Money Transfer
                    </span>
                  ) : transaction.type === 'EXPENSE' ? (
                    <select
                      className="category-select"
                      value={
                        transaction.category?.name ?? ''
                      }
                      disabled={
                        updatingTransactionId ===
                        transaction.id
                      }
                      onChange={(event) => {
                        const category =
                          categories.find(
                            (item) =>
                              item.name ===
                              event.target.value,
                          );

                        if (!category) {
                          return;
                        }

                        void changeTransactionCategory(
                          transaction.id,
                          category.id,
                        );
                      }}
                    >
                      {!transaction.category && (
                        <option value="">
                          Uncategorized
                        </option>
                      )}

                      {categories.map((category) => (
                        <option
                          value={category.name}
                          key={category.id}
                        >
                          {category.name}
                        </option>
                      ))}
                    </select>
                  ) : (
                    <span className="category-chip">
                      {transaction.category?.name ??
                        'Income'}
                    </span>
                  )}

                  <span
                    className={`source-badge source-badge--${status.toLowerCase()}`}
                  >
                    {status === 'REVIEW'
                      ? 'Needs review'
                      : status === 'MANUAL'
                        ? 'Manual'
                        : 'Auto'}
                  </span>
                </div>

                <div
                  className={`transaction-item__amount ${
                    transaction.type === 'INCOME' &&
                    !isTransfer
                      ? 'is-income'
                      : isTransfer
                        ? 'is-transfer'
                        : 'is-expense'
                  }`}
                >
                  <strong>
                    {transaction.type === 'INCOME' &&
                    !isTransfer
                      ? '+'
                      : transaction.type === 'EXPENSE' &&
                          !isTransfer
                        ? '-'
                        : ''}
                    {formatMoney(
                      transaction.amount,
                      transaction.currency,
                    )}
                  </strong>
                </div>
              </div>
            );
          })
        )}
      </div>
    </section>
  );

  const renderCategories = () => {
    const categoryEntries = Object.entries(
      report.byCategory,
    ).sort(([, a], [, b]) => b - a);

    const total = categoryEntries.reduce(
      (sum, [, amount]) => sum + amount,
      0,
    );

    return (
      <section className="page-section">
        <div className="section-heading">
          <div>
            <span className="eyebrow">Spending</span>
            <h2>Expenses by category</h2>
            <p>
              Breakdown for the selected period in {report.currency}.
            </p>
          </div>

          <div className="section-total">
            <span>Total</span>
            <strong>
              {total.toFixed(2)} {report.currency}
            </strong>
          </div>
        </div>

        {categoryEntries.length === 0 ? (
          <div className="empty-state">
            <span className="empty-state__icon">◌</span>
            <strong>No expenses yet</strong>
            <p>
              Category analytics will appear after transactions are synced.
            </p>
          </div>
        ) : (
          <div className="category-grid">
            {categoryEntries.map(
              ([category, amount]) => {
                const percentage =
                  total > 0
                    ? (amount / total) * 100
                    : 0;

                return (
                  <article
                    className="category-card"
                    key={category}
                  >
                    <div className="category-card__top">
                      <div>
                        <span className="category-card__name">
                          {category}
                        </span>
                        <strong>
                          {amount.toFixed(2)}{' '}
                          {report.currency}
                        </strong>
                      </div>

                      <span className="category-card__percent">
                        {percentage.toFixed(1)}%
                      </span>
                    </div>

                    <div className="progress-track">
                      <div
                        className="progress-fill"
                        style={{
                          width: `${Math.min(
                            percentage,
                            100,
                          )}%`,
                        }}
                      />
                    </div>
                  </article>
                );
              },
            )}
          </div>
        )}
      </section>
    );
  };

  const balancesByCurrency = accounts.reduce<
    Record<string, number>
  >((result, account) => {
    const current = result[account.currency] ?? 0;

    return {
      ...result,
      [account.currency]:
        current + Number(account.balance),
    };
  }, {});

  const orderedBalances = Object.entries(
    balancesByCurrency,
  ).sort(([currencyA], [currencyB]) => {
    const order = ['UAH', 'EUR', 'USD'];

    const indexA = order.indexOf(currencyA);
    const indexB = order.indexOf(currencyB);

    if (indexA === -1 && indexB === -1) {
      return currencyA.localeCompare(currencyB);
    }

    if (indexA === -1) {
      return 1;
    }

    if (indexB === -1) {
      return -1;
    }

    return indexA - indexB;
  });

  const periodStart = new Date();

  periodStart.setHours(0, 0, 0, 0);
  periodStart.setDate(
    periodStart.getDate() - (period - 1),
  );

  const expenseTransactionsForPeriod = transactions.filter(
    (transaction) => {
      const transactionDate = new Date(transaction.date);

      return (
        transaction.type === 'EXPENSE' &&
        transaction.category?.name !== 'Money Transfer' &&
        transaction.currency === report.currency &&
        transactionDate >= periodStart
      );
    },
  );

  const dailyExpenses = Array.from(
    { length: period },
    (_, index) => {
      const day = new Date(periodStart);

      day.setDate(periodStart.getDate() + index);

      const dayKey = day.toLocaleDateString('sv-SE');

      const total = expenseTransactionsForPeriod
        .filter((transaction) => {
          const transactionDay = new Date(
            transaction.date,
          ).toLocaleDateString('sv-SE');

          return transactionDay === dayKey;
        })
        .reduce(
          (sum, transaction) =>
            sum + Math.abs(Number(transaction.amount)),
          0,
        );

      return {
        key: dayKey,
        label:
          period === 1
            ? 'Today'
            : day.toLocaleDateString('uk-UA', {
                day: '2-digit',
                month: '2-digit',
              }),
        total,
      };
    },
  );

  const maxDailyExpense = Math.max(
    ...dailyExpenses.map((day) => day.total),
    1,
  );

  const categoryBreakdown = Object.entries(
    report.byCategory,
  )
    .map(([name, amount]) => ({
      name,
      amount,
      percentage:
        report.total > 0
          ? (amount / report.total) * 100
          : 0,
    }))
    .sort((a, b) => b.amount - a.amount);

  
  const pageTitle = {
    dashboard: 'Dashboard',
    transactions: 'Transactions',
    accounts: 'Accounts',
    categories: 'Categories',
    analytics: 'Analytics',
    rules: 'Rules',
  }[page];

  const pageDescription = {
    dashboard: 'A clear view of balances, spending and recent activity',
    transactions: 'Search, review and organize every operation',
    accounts: 'Balances from all connected bank accounts',
    categories: 'See exactly where your money goes',
    analytics: 'Compare income, expenses, transfers and net results',
    rules: 'Manage merchant categorization rules',
  }[page];

  return (
    <div className="app">
      <aside className="sidebar">
        <div className="brand">
          <div className="brand__mark">F</div>
          <div>
            <strong>Family Finance</strong>
            <span>Private dashboard</span>
          </div>
        </div>

        <nav className="nav">
          <button
            className={`nav__item ${
              page === 'dashboard'
                ? 'nav__item--active'
                : ''
            }`}
            onClick={() => setPage('dashboard')}
          >
            Dashboard
          </button>

          <button
            className={`nav__item ${
              page === 'transactions'
                ? 'nav__item--active'
                : ''
            }`}
            onClick={() => setPage('transactions')}
          >
            Transactions
          </button>

          <button
            className={`nav__item ${
              page === 'accounts'
                ? 'nav__item--active'
                : ''
            }`}
            onClick={() => setPage('accounts')}
          >
            Accounts
          </button>

          <button
            className={`nav__item ${
              page === 'categories'
                ? 'nav__item--active'
                : ''
            }`}
            onClick={() => setPage('categories')}
          >
            Categories
          </button>

          <button
            className={`nav__item ${
              page === 'analytics'
                ? 'nav__item--active'
                : ''
            }`}
            onClick={() => setPage('analytics')}
          >
            Analytics
          </button>

          <button
            className={`nav__item ${
              page === 'rules'
                ? 'nav__item--active'
                : ''
            }`}
            onClick={() => setPage('rules')}
          >
            Rules
          </button>
        </nav>
      </aside>

      <main className="dashboard">
        <div className="top-bar">
          <div>
            <h1>{pageTitle}</h1>
            <p>{pageDescription}</p>
          </div>

          <div className="top-actions">
                        <button
              type="button"
              className="theme-toggle"
              onClick={() =>
                setTheme(theme === 'dark' ? 'light' : 'dark')
              }
            >
              {theme === 'dark' ? '☀ Light' : '☾ Dark'}
            </button>
            {readOnly ? (
              <span className="read-only-badge">
                Demo · read-only
              </span>
            ) : (
              <>
                <div className="live-status">
                  <span className="live-status__dot" />
                  Auto-sync every 10 min
                </div>

                <div className="sync">
                  <button
                    className="sync__button"
                    onClick={syncMonobank}
                    disabled={isSyncing}
                  >
                    {isSyncing
                      ? 'Syncing...'
                      : 'Sync Monobank'}
                  </button>

                  {syncMessage && (
                    <span className="sync__message">
                      {syncMessage}
                    </span>
                  )}
                </div>
              </>
            )}

            <button
              type="button"
              className="theme-toggle"
              onClick={onLogout}
              title={user.email}
            >
              Log out
            </button>
          </div>
        </div>

        {(page === 'dashboard' ||
          page === 'categories') && (
          <div className="period-filter">
            <button
              className={`period-filter__button ${
                period === 1
                  ? 'period-filter__button--active'
                  : ''
              }`}
              onClick={() => setPeriod(1)}
            >
              Today
            </button>

            <button
              className={`period-filter__button ${
                period === 7
                  ? 'period-filter__button--active'
                  : ''
              }`}
              onClick={() => setPeriod(7)}
            >
              7 days
            </button>

            <button
              className={`period-filter__button ${
                period === 30
                  ? 'period-filter__button--active'
                  : ''
              }`}
              onClick={() => setPeriod(30)}
            >
              30 days
            </button>
          </div>
        )}

        {page === 'dashboard' && (
          <>
            <section className="accounts">
              <div className="section-header">
                <div>
                  <h2>Current balances</h2>
                  <p className="section-description">
                    Current balances across all connected accounts
                  </p>
                </div>
              </div>

              <section className="summary">
                {orderedBalances.map(([currency, balance]) => (
                  <article className="balance-card" key={currency}>
                    <div className="balance-card__top">
                      <span>{currency} balance</span>
                      <span className="currency-badge">
                        {currency}
                      </span>
                    </div>

                    <strong>
                      {balance.toFixed(2)}
                      <small>{currency}</small>
                    </strong>

                    <span className="balance-card__caption">
                      Available now
                    </span>
                  </article>
                ))}

              </section>
            </section>

            {analytics && (
              <section className="analytics">
                <div className="section-header">
                  <div>
                    <h2>
                      {period === 1
                        ? 'Today'
                        : period === 7
                          ? 'Last 7 days'
                          : 'Last 30 days'}
                    </h2>

                    <p className="section-description">
                      Income, expenses and net result
                    </p>
                  </div>
                </div>

                <div className="dashboard-currency-groups">
                  {Object.entries(
                    period === 1
                      ? analytics.today
                      : period === 7
                        ? analytics.week
                        : analytics.month,
                  ).map(([currency, totals]) => {
                    const net =
                      totals.income - totals.expenses;

                    return (
                      <div
                        className="dashboard-currency-group"
                        key={currency}
                      >
                        <div className="dashboard-currency-group__title">
                          {currency}
                        </div>

                        <div className="dashboard-currency-group__cards">
                          <article className="card">
                            <span className="card__label">
                              Income
                            </span>

                            <strong className="card__value analytics-value--income">
                              +{totals.income.toFixed(2)} {currency}
                            </strong>
                          </article>

                          <article className="card">
                            <span className="card__label">
                              Expenses
                            </span>

                            <strong className="card__value analytics-value--expense">
                              -{totals.expenses.toFixed(2)} {currency}
                            </strong>
                          </article>

                          <article className="card">
                            <span className="card__label">
                              Transfers
                            </span>

                            <strong className="card__value">
                              {totals.transfers.toFixed(2)} {currency}
                            </strong>
                          </article>

                          <article className="card">
                            <span className="card__label">
                              Net
                            </span>

                            <strong className="card__value">
                              {net >= 0 ? '+' : ''}
                              {net.toFixed(2)} {currency}
                            </strong>
                          </article>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </section>
            )}

            <section className="dashboard-insights">
              <div className="dashboard-insights__grid">
                <article className="dashboard-chart-card">
                  <div className="section-header">
                    <div>
                      <h2>Expenses by day</h2>

                      <p className="section-description">
                        {period === 1
                          ? 'Today'
                          : `Daily ${report.currency} spending for the selected period`}
                      </p>
                    </div>
                  </div>

                  {dailyExpenses.every((day) => day.total === 0) ? (
                    <p className="empty-message">
                      No expenses for this period
                    </p>
                  ) : (
                    <div className="daily-chart">
                      {dailyExpenses.map((day) => {
                        const height =
                          (day.total / maxDailyExpense) * 100;

                        return (
                          <div
                            className="daily-chart__column"
                            key={day.key}
                          >
                            <div className="daily-chart__value">
                              {day.total > 0
                                ? day.total.toFixed(0)
                                : ''}
                            </div>

                            <div className="daily-chart__bar-area">
                              <div
                                className="daily-chart__bar"
                                style={{
                                  height: `${Math.max(
                                    height,
                                    day.total > 0 ? 4 : 0,
                                  )}%`,
                                }}
                                title={`${day.total.toFixed(2)} ${report.currency}`}
                              />
                            </div>

                            <span className="daily-chart__label">
                              {day.label}
                            </span>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </article>

                <article className="dashboard-chart-card">
                  <div className="section-header">
                    <div>
                      <h2>Category share</h2>

                      <p className="section-description">
                        Share of total {report.currency} expenses
                      </p>
                    </div>
                  </div>

                  {categoryBreakdown.length === 0 ? (
                    <p className="empty-message">
                      No category data for this period
                    </p>
                  ) : (
                    <div className="category-share-list">
                      {categoryBreakdown.map((category) => (
                        <div
                          className="category-share"
                          key={category.name}
                        >
                          <div className="category-share__header">
                            <span>{category.name}</span>

                            <strong>
                              {category.amount.toFixed(2)}{' '}
                              {report.currency}
                            </strong>
                          </div>

                          <div className="category-share__meta">
                            <div className="category-share__track">
                              <div
                                className="category-share__bar"
                                style={{
                                  width: `${Math.min(
                                    category.percentage,
                                    100,
                                  )}%`,
                                }}
                              />
                            </div>

                            <span>
                              {category.percentage.toFixed(1)}%
                            </span>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </article>
              </div>
            </section>
          </>
        )}

        {page === 'transactions' &&
          renderTransactions()}

        {page === 'accounts' &&
          renderAccounts()}

        {page === 'categories' &&
          renderCategories()}

            {page === 'analytics' && (
            <AnalyticsPage refreshKey={transactions.length} />
           )}

        {page === 'rules' && renderRules()}
      </main>
    </div>
  );
}

export default App




