import Foundation
import SwiftUI

// =========================
// TRANSACTIONS: list grouped by day, search and filters
// =========================

struct TransactionsView: View {
    @Environment(AppModel.self) private var model

    enum TypeFilter: String, CaseIterable, Identifiable {
        case all
        case expenses
        case income
        case transfers

        var id: Self { self }

        var title: String {
            switch self {
            case .all: "All"
            case .expenses: "Expenses"
            case .income: "Income"
            case .transfers: "Transfers"
            }
        }

        func matches(_ transaction: Transaction) -> Bool {
            switch self {
            case .all: true
            case .expenses: !transaction.isTransfer && transaction.amount < 0
            case .income: !transaction.isTransfer && transaction.amount > 0
            case .transfers: transaction.isTransfer
            }
        }
    }

    /// All transactions of one day
    struct DayGroup: Identifiable {
        let day: Date
        let items: [Transaction]

        var id: Date { day }
    }

    @State private var search = ""
    @State private var typeFilter: TypeFilter = .all
    @State private var categoryFilter: String?
    @State private var accountFilter: Set<Int> = []
    @State private var period = PeriodSelection(.allTime)

    private var filtered: [Transaction] {
        let text = search.trimmingCharacters(in: .whitespaces).lowercased()

        return model.transactions.filter { transaction in
            guard typeFilter.matches(transaction) else {
                return false
            }

            if let categoryFilter, (transaction.categoryName ?? "Other") != categoryFilter {
                return false
            }

            if !accountFilter.isEmpty {
                guard let accountId = transaction.accountId, accountFilter.contains(accountId) else {
                    return false
                }
            }

            if !period.contains(transaction.date) {
                return false
            }

            if text.isEmpty {
                return true
            }

            let haystack = [transaction.merchant, transaction.description, transaction.categoryName]
                .compactMap { $0 }
                .joined(separator: " ")
                .lowercased()

            return haystack.contains(text)
        }
    }

    private var groups: [DayGroup] {
        let byDay = Dictionary(grouping: filtered) { $0.date.startOfDay }

        return byDay
            .map { DayGroup(day: $0.key, items: $0.value.sorted { $0.date > $1.date }) }
            .sorted { $0.day > $1.day }
    }

    private var isFiltering: Bool {
        typeFilter != .all || categoryFilter != nil
    }

    /// Card or dates chosen: show totals for exactly what is on the screen
    private var showsTotals: Bool {
        !accountFilter.isEmpty || period.kind != .allTime
    }

    /// Income and expenses of the filtered list, per currency
    private var totals: [(currency: String, income: Double, expenses: Double)] {
        let byCurrency = Dictionary(grouping: filtered.filter { !$0.isTransfer }, by: \.currency)

        return byCurrency
            .map { currency, items in
                (
                    currency: currency,
                    income: items.filter { $0.amount > 0 }.reduce(0) { $0 + $1.amount },
                    expenses: items.filter { $0.amount < 0 }.reduce(0) { $0 + $1.amount }
                )
            }
            .sorted { $0.currency < $1.currency }
    }

    var body: some View {
        NavigationStack {
            List {
                if showsTotals && !totals.isEmpty {
                    Section("Total for the selection") {
                        ForEach(totals, id: \.currency) { item in
                            HStack {
                                Text(item.currency)
                                    .font(.subheadline.bold())

                                Spacer()

                                AmountText(amount: item.income, currency: item.currency)

                                AmountText(amount: item.expenses, currency: item.currency)
                                    .padding(.leading, 8)
                            }
                            .font(.subheadline)
                        }
                    }
                }

                ForEach(groups) { group in
                    Section {
                        ForEach(group.items) { transaction in
                            NavigationLink(value: transaction) {
                                TransactionRow(transaction: transaction)
                            }
                        }
                    } header: {
                        DayHeader(day: group.day, items: group.items)
                    }
                }
            }
            .overlay {
                if groups.isEmpty {
                    if model.transactions.isEmpty {
                        ContentUnavailableView(
                            "No transactions yet",
                            systemImage: "tray",
                            description: Text("Connect Monobank in More → Settings and sync.")
                        )
                    } else if !search.isEmpty {
                        ContentUnavailableView.search(text: search)
                    } else {
                        ContentUnavailableView(
                            "Nothing here",
                            systemImage: "calendar.badge.exclamationmark",
                            description: Text("No transactions for these cards and dates.")
                        )
                    }
                }
            }
            .safeAreaInset(edge: .top, spacing: 0) {
                FilterBar {
                    if model.accounts.count > 1 {
                        AccountFilterMenu(accounts: model.accounts, selection: $accountFilter)
                    }

                    PeriodButton(selection: $period, allowsAllTime: true)

                    if showsTotals {
                        Button("Reset", systemImage: "xmark") {
                            accountFilter = []
                            period = PeriodSelection(.allTime)
                        }
                    }
                }
                .background(.bar)
            }
            .navigationTitle("Transactions")
            .searchable(text: $search, prompt: "Merchant, description, category")
            .toolbar {
                ToolbarItem(placement: .topBarTrailing) {
                    filterMenu
                }
            }
            .refreshable {
                await model.refresh()
            }
            .navigationDestination(for: Transaction.self) { transaction in
                TransactionDetailView(transactionId: transaction.id)
            }
        }
    }

    private var filterMenu: some View {
        Menu {
            Picker("Type", selection: $typeFilter) {
                ForEach(TypeFilter.allCases) { item in
                    Text(item.title).tag(item)
                }
            }

            Picker("Category", selection: $categoryFilter) {
                Text("All categories").tag(String?.none)

                ForEach(model.categories) { category in
                    Label(category.name, systemImage: CategoryStyle.icon(for: category.name))
                        .tag(String?.some(category.name))
                }
            }
            .pickerStyle(.menu)

            if isFiltering {
                Button("Reset filters", role: .destructive) {
                    typeFilter = .all
                    categoryFilter = nil
                }
            }
        } label: {
            Image(systemName: isFiltering
                  ? "line.3.horizontal.decrease.circle.fill"
                  : "line.3.horizontal.decrease.circle")
        }
        .accessibilityLabel("Filters")
    }
}

/// "Today · −1 250 ₴" above each day
private struct DayHeader: View {
    let day: Date
    let items: [Transaction]

    /// Spent this day in UAH, transfers not counted
    private var spent: Double {
        items
            .filter { !$0.isTransfer && $0.amount < 0 && $0.currency == "UAH" }
            .reduce(0) { $0 + $1.amount }
    }

    private var title: String {
        let calendar = Calendar.current

        if calendar.isDateInToday(day) {
            return "Today"
        }

        if calendar.isDateInYesterday(day) {
            return "Yesterday"
        }

        return day.formatted(.dateTime.weekday(.wide).day().month(.wide))
    }

    var body: some View {
        HStack {
            Text(title)

            Spacer()

            if spent < 0 {
                Text(spent, format: .currency(code: "UAH"))
                    .monospacedDigit()
            }
        }
    }
}

#Preview {
    TransactionsView()
        .environment(AppModel.preview)
}
