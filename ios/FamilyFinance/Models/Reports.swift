import Foundation

// =========================
// REPORTS: the numbers behind Dashboard, Categories and Analytics
// =========================

struct CurrencyTotals: Decodable, Hashable {
    var income: Double = 0
    var expenses: Double = 0
    var transfers: Double = 0

    var net: Double {
        income - expenses
    }
}

/// Today / 7 days / 30 days on the Dashboard
enum SummaryPeriod: String, CaseIterable, Identifiable {
    case today
    case week
    case month

    var id: Self { self }

    var days: Int {
        switch self {
        case .today: 1
        case .week: 7
        case .month: 30
        }
    }

    var title: String {
        switch self {
        case .today: "Today"
        case .week: "7 days"
        case .month: "30 days"
        }
    }
}

/// GET /api/reports/summary: totals per period, per currency
struct SummaryReport: Decodable, Hashable {
    var today: [String: CurrencyTotals]
    var week: [String: CurrencyTotals]
    var month: [String: CurrencyTotals]

    func totals(for period: SummaryPeriod) -> [String: CurrencyTotals] {
        switch period {
        case .today: today
        case .week: week
        case .month: month
        }
    }
}

/// GET /api/reports/expenses?days=30: expenses by category
struct ExpenseReport: Decodable, Hashable {
    var currency: String
    var days: Int
    var total: Double
    var byCategory: [String: Double]
}

// ---------- Analytics ----------

enum AnalyticsType: String, CaseIterable, Identifiable, Hashable {
    case all = "ALL"
    case expense = "EXPENSE"
    case income = "INCOME"

    var id: Self { self }

    var title: String {
        switch self {
        case .all: "All"
        case .expense: "Expenses"
        case .income: "Income"
        }
    }
}

enum AnalyticsPreset: String, CaseIterable, Identifiable {
    case week
    case month
    case thisMonth
    case lastMonth
    case quarter

    var id: Self { self }

    var title: String {
        switch self {
        case .week: "7 days"
        case .month: "30 days"
        case .thisMonth: "This month"
        case .lastMonth: "Last month"
        case .quarter: "90 days"
        }
    }

    /// First and last day of the period (both included)
    func range(now: Date = .now) -> (from: Date, to: Date) {
        let calendar = Calendar.current
        let today = calendar.startOfDay(for: now)

        func daysBack(_ days: Int) -> Date {
            calendar.date(byAdding: .day, value: -days, to: today) ?? today
        }

        switch self {
        case .week:
            return (daysBack(6), today)
        case .month:
            return (daysBack(29), today)
        case .quarter:
            return (daysBack(89), today)
        case .thisMonth:
            let start = calendar.dateInterval(of: .month, for: today)?.start ?? today
            return (start, today)
        case .lastMonth:
            let thisMonthStart = calendar.dateInterval(of: .month, for: today)?.start ?? today
            let lastDay = calendar.date(byAdding: .day, value: -1, to: thisMonthStart) ?? today
            let start = calendar.dateInterval(of: .month, for: lastDay)?.start ?? lastDay
            return (start, lastDay)
        }
    }
}

struct AnalyticsQuery: Hashable {
    var from: Date
    var to: Date
    var currency: String = "UAH"
    var type: AnalyticsType = .all
    var includeTransfers = false
}

/// GET /api/reports/analytics
struct AnalyticsReport: Decodable, Hashable {
    struct Period: Decodable, Hashable {
        var from: String
        var to: String
        var days: Int
    }

    struct Totals: Decodable, Hashable {
        var income: Double
        var expenses: Double
        var net: Double
        var count: Int
    }

    struct Previous: Decodable, Hashable {
        var from: String
        var to: String
        var income: Double
        var expenses: Double
        var net: Double
        var count: Int
    }

    /// % change compared to the previous period. nil = nothing to compare with
    struct Change: Decodable, Hashable {
        var income: Double?
        var expenses: Double?
    }

    struct CategoryItem: Decodable, Hashable, Identifiable {
        var categoryId: Int?
        var name: String
        var amount: Double
        var count: Int
        var share: Double

        var id: String { name }
    }

    struct DayItem: Decodable, Hashable, Identifiable {
        var date: String
        var income: Double
        var expenses: Double

        var id: String { date }

        var day: Date {
            Date.fromDayKey(date) ?? .distantPast
        }
    }

    struct MerchantItem: Decodable, Hashable, Identifiable {
        var merchant: String
        var amount: Double
        var count: Int

        var id: String { merchant }
    }

    struct TopTransaction: Decodable, Hashable, Identifiable {
        var id: Int
        var date: Date
        var description: String
        var amount: Double
        var category: String
    }

    var currency: String
    var period: Period
    var totals: Totals
    var previous: Previous
    var change: Change
    var focus: String
    var byCategory: [CategoryItem]
    var byDay: [DayItem]
    var topMerchants: [MerchantItem]
    var topTransactions: [TopTransaction]
}
