import Foundation

// =========================
// REPORT BUILDER
// Calculates the same reports as the backend, but from transactions that
// are already in memory. Demo mode uses it, so demo numbers behave exactly
// like the real ones.
// =========================

enum ReportBuilder {
    private static func round2(_ value: Double) -> Double {
        (value * 100).rounded() / 100
    }

    /// Midnight of the first day of a period that ends today
    static func startOfPeriod(days: Int, now: Date = .now) -> Date {
        let calendar = Calendar.current
        let today = calendar.startOfDay(for: now)
        return calendar.date(byAdding: .day, value: -(days - 1), to: today) ?? today
    }

    // MARK: - Expenses by category (GET /api/reports/expenses)

    static func expenseReport(_ transactions: [Transaction], days: Int) -> ExpenseReport {
        let from = startOfPeriod(days: days)
        var byCategory: [String: Double] = [:]
        var total = 0.0

        for transaction in transactions {
            guard
                transaction.type == .expense,
                transaction.date >= from,
                transaction.categoryName != "Money Transfer"
            else {
                continue
            }

            let amount = abs(transaction.amount)
            byCategory[transaction.categoryName ?? "Other", default: 0] += amount
            total += amount
        }

        return ExpenseReport(
            currency: "UAH",
            days: days,
            total: round2(total),
            byCategory: byCategory.mapValues { round2($0) }
        )
    }

    // MARK: - Today / week / month (GET /api/reports/summary)

    static func summary(_ transactions: [Transaction]) -> SummaryReport {
        func totals(days: Int) -> [String: CurrencyTotals] {
            let from = startOfPeriod(days: days)
            var result: [String: CurrencyTotals] = [:]

            for transaction in transactions where transaction.date >= from {
                let amount = abs(transaction.amount)
                var current = result[transaction.currency] ?? CurrencyTotals()

                if transaction.categoryName == "Money Transfer" {
                    current.transfers += amount
                } else if transaction.type == .income {
                    current.income += amount
                } else {
                    current.expenses += amount
                }

                result[transaction.currency] = current
            }

            return result.mapValues {
                CurrencyTotals(
                    income: round2($0.income),
                    expenses: round2($0.expenses),
                    transfers: round2($0.transfers)
                )
            }
        }

        return SummaryReport(
            today: totals(days: 1),
            week: totals(days: 7),
            month: totals(days: 30)
        )
    }

    // MARK: - Analytics (GET /api/reports/analytics)

    static func analytics(
        _ transactions: [Transaction],
        query: AnalyticsQuery,
        categoryIds: [String: Int]
    ) -> AnalyticsReport {
        let calendar = Calendar.current
        let from = calendar.startOfDay(for: query.from)
        let lastDay = calendar.startOfDay(for: query.to)
        let endExclusive = calendar.date(byAdding: .day, value: 1, to: lastDay) ?? lastDay
        let days = max(1, calendar.dateComponents([.day], from: from, to: endExclusive).day ?? 1)

        let previousFrom = calendar.date(byAdding: .day, value: -days, to: from) ?? from
        let previousTo = calendar.date(byAdding: .day, value: -1, to: from) ?? from

        func load(_ start: Date, _ end: Date) -> [Transaction] {
            transactions.filter { transaction in
                guard
                    transaction.date >= start,
                    transaction.date < end,
                    transaction.currency == query.currency
                else {
                    return false
                }

                if query.type != .all && transaction.type.rawValue != query.type.rawValue {
                    return false
                }

                return query.includeTransfers || !transaction.isTransfer
            }
        }

        func sum(_ items: [Transaction]) -> AnalyticsReport.Totals {
            let income = items.filter { $0.amount >= 0 }.reduce(0) { $0 + $1.amount }
            let expenses = items.filter { $0.amount < 0 }.reduce(0) { $0 + abs($1.amount) }

            return AnalyticsReport.Totals(
                income: round2(income),
                expenses: round2(expenses),
                net: round2(income - expenses),
                count: items.count
            )
        }

        func percentChange(_ current: Double, _ previous: Double) -> Double? {
            if previous == 0 {
                return current == 0 ? 0 : nil
            }

            return round2((current - previous) / previous * 100)
        }

        let current = load(from, endExclusive)
        let previous = load(previousFrom, from)
        let totals = sum(current)
        let previousTotals = sum(previous)

        // Pie chart and tops: income if "Income" is chosen, otherwise expenses
        let focusIsIncome = query.type == .income
        let focused = current.filter { focusIsIncome ? $0.amount >= 0 : $0.amount < 0 }
        let focusTotal = focusIsIncome ? totals.income : totals.expenses

        // By category
        var categoryAmounts: [String: (amount: Double, count: Int)] = [:]

        for transaction in focused {
            let name = transaction.categoryName ?? "Uncategorized"
            let entry = categoryAmounts[name] ?? (0, 0)
            categoryAmounts[name] = (entry.amount + abs(transaction.amount), entry.count + 1)
        }

        let byCategory = categoryAmounts
            .map { name, entry in
                AnalyticsReport.CategoryItem(
                    categoryId: categoryIds[name],
                    name: name,
                    amount: round2(entry.amount),
                    count: entry.count,
                    share: focusTotal > 0 ? round2(entry.amount / focusTotal * 100) : 0
                )
            }
            .sorted { $0.amount > $1.amount }

        // By day (empty days too, so the chart has no gaps)
        var dayTotals: [String: (income: Double, expenses: Double)] = [:]
        var dayKeys: [String] = []
        var day = from

        while day < endExclusive {
            dayKeys.append(day.dayKey)
            dayTotals[day.dayKey] = (0, 0)
            day = calendar.date(byAdding: .day, value: 1, to: day) ?? endExclusive
        }

        for transaction in current {
            let key = transaction.date.dayKey

            guard let entry = dayTotals[key] else {
                continue
            }

            if transaction.amount >= 0 {
                dayTotals[key] = (entry.income + transaction.amount, entry.expenses)
            } else {
                dayTotals[key] = (entry.income, entry.expenses + abs(transaction.amount))
            }
        }

        let byDay = dayKeys.map { key in
            AnalyticsReport.DayItem(
                date: key,
                income: round2(dayTotals[key]?.income ?? 0),
                expenses: round2(dayTotals[key]?.expenses ?? 0)
            )
        }

        // Top merchants
        var merchants: [String: (name: String, amount: Double, count: Int)] = [:]

        for transaction in focused {
            let key = transaction.title.lowercased()
            let entry = merchants[key] ?? (transaction.title, 0, 0)
            merchants[key] = (entry.name, entry.amount + abs(transaction.amount), entry.count + 1)
        }

        let topMerchants = merchants.values
            .map { AnalyticsReport.MerchantItem(merchant: $0.name, amount: round2($0.amount), count: $0.count) }
            .sorted { $0.amount > $1.amount }
            .prefix(10)

        // Biggest single transactions
        let topTransactions = focused
            .sorted { abs($0.amount) > abs($1.amount) }
            .prefix(10)
            .map {
                AnalyticsReport.TopTransaction(
                    id: $0.id,
                    date: $0.date,
                    description: $0.title,
                    amount: round2($0.amount),
                    category: $0.categoryName ?? "Uncategorized"
                )
            }

        return AnalyticsReport(
            currency: query.currency,
            period: AnalyticsReport.Period(from: from.dayKey, to: lastDay.dayKey, days: days),
            totals: totals,
            previous: AnalyticsReport.Previous(
                from: previousFrom.dayKey,
                to: previousTo.dayKey,
                income: previousTotals.income,
                expenses: previousTotals.expenses,
                net: previousTotals.net,
                count: previousTotals.count
            ),
            change: AnalyticsReport.Change(
                income: percentChange(totals.income, previousTotals.income),
                expenses: percentChange(totals.expenses, previousTotals.expenses)
            ),
            focus: focusIsIncome ? "INCOME" : "EXPENSE",
            byCategory: byCategory,
            byDay: byDay,
            topMerchants: Array(topMerchants),
            topTransactions: Array(topTransactions)
        )
    }
}
