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

    private var filtered: [Transaction] {
        let text = search.trimmingCharacters(in: .whitespaces).lowercased()

        return model.transactions.filter { transaction in
            guard typeFilter.matches(transaction) else {
                return false
            }

            if let categoryFilter, (transaction.categoryName ?? "Other") != categoryFilter {
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

    var body: some View {
        NavigationStack {
            List {
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
                    } else {
                        ContentUnavailableView.search(text: search)
                    }
                }
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
