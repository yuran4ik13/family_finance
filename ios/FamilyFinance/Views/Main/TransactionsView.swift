import Foundation
import SwiftUI

// =========================
// TRANSACTIONS: grouped by day, with search and filters
// (cards, dates, type, category) and totals for exactly what is shown
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
            case .all: "All types"
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
            guard typeFilter.matches(transaction), period.contains(transaction.date) else {
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
        Dictionary(grouping: filtered) { $0.date.startOfDay }
            .map { DayGroup(day: $0.key, items: $0.value.sorted { $0.date > $1.date }) }
            .sorted { $0.day > $1.day }
    }

    private var isFiltering: Bool {
        typeFilter != .all || categoryFilter != nil || !accountFilter.isEmpty || period.kind != .allTime
    }

    /// Main currency of what is on the screen (UAH unless only other cards are chosen)
    private var currency: String {
        let currencies = Set(filtered.map(\.currency))
        return currencies.count == 1 ? currencies.first ?? "UAH" : "UAH"
    }

    var body: some View {
        NavigationStack {
            ScrollView {
                LazyVStack(alignment: .leading, spacing: 0, pinnedViews: []) {
                    FilterBar {
                        if model.accounts.count > 1 {
                            AccountFilterMenu(accounts: model.accounts, selection: $accountFilter)
                        }

                        PeriodButton(selection: $period, allowsAllTime: true)

                        typeMenu

                        if isFiltering {
                            Button {
                                withAnimation(Motion.spring) {
                                    resetFilters()
                                }
                            } label: {
                                Chip(title: "Reset", icon: "xmark")
                            }
                            .buttonStyle(.pressable)
                            .transition(.scale.combined(with: .opacity))
                        }
                    }
                    .padding(.horizontal, -20)
                    .appearAnimation(0)

                    if !filtered.isEmpty {
                        totalsCard
                            .padding(.top, 14)
                            .appearAnimation(1)
                    }

                    ForEach(Array(groups.enumerated()), id: \.element.id) { index, group in
                        daySection(group)
                            .padding(.top, 22)
                            .appearAnimation(min(index + 2, 8))
                    }
                }
                .padding(.horizontal, 20)
                .padding(.bottom, 24)
                .animation(Motion.spring, value: filtered.map(\.id))
            }
            .background(Color.appBackground)
            .scrollIndicators(.hidden)
            .overlay {
                emptyState
            }
            .navigationTitle("Transactions")
            .searchable(text: $search, prompt: "Merchant, category, note")
            .refreshable {
                await model.refresh()
            }
            .navigationDestination(for: Transaction.self) { transaction in
                TransactionDetailView(transactionId: transaction.id)
            }
        }
    }

    // MARK: - Parts

    private var typeMenu: some View {
        Menu {
            Picker("Type", selection: $typeFilter.animation(Motion.spring)) {
                ForEach(TypeFilter.allCases) { item in
                    Text(item.title).tag(item)
                }
            }

            Picker("Category", selection: $categoryFilter.animation(Motion.spring)) {
                Text("All categories").tag(String?.none)

                ForEach(model.categories) { category in
                    Label(category.name, systemImage: CategoryStyle.icon(for: category.name))
                        .tag(String?.some(category.name))
                }
            }
            .pickerStyle(.menu)
        } label: {
            Chip(
                title: categoryFilter ?? typeFilter.title,
                icon: "line.3.horizontal.decrease",
                isOn: typeFilter != .all || categoryFilter != nil,
                isFilter: true
            )
        }
    }

    private var totalsCard: some View {
        let shown = filtered.filter { !$0.isTransfer && $0.currency == currency }
        let income = shown.filter { $0.amount > 0 }.reduce(0) { $0 + $1.amount }
        let expenses = shown.filter { $0.amount < 0 }.reduce(0) { $0 + abs($1.amount) }

        return HStack(spacing: 8) {
            totalItem("In") {
                MoneyText(amount: income, currency: currency, sign: true, decimals: false)
                    .foregroundStyle(Color.income)
            }

            totalItem("Out") {
                MoneyText(amount: expenses, currency: currency, decimals: false)
                    .foregroundStyle(Color.textPrimary)
            }

            totalItem("Operations") {
                Text("\(filtered.count)")
                    .foregroundStyle(Color.textPrimary)
                    .contentTransition(.numericText(value: Double(filtered.count)))
            }
        }
        .padding(.horizontal, 16)
        .padding(.vertical, 14)
        .background(Color.cardBackground, in: RoundedRectangle(cornerRadius: 18, style: .continuous))
    }

    private func totalItem<Value: View>(_ title: String, @ViewBuilder value: () -> Value) -> some View {
        VStack(alignment: .leading, spacing: 3) {
            Text(title)
                .font(.system(size: 12))
                .foregroundStyle(Color.textSecondary)

            value()
                .font(.system(size: 16, weight: .bold))
                .lineLimit(1)
                .minimumScaleFactor(0.6)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
    }

    private func daySection(_ group: DayGroup) -> some View {
        VStack(alignment: .leading, spacing: 6) {
            DayHeader(day: group.day, items: group.items)

            VStack(spacing: 0) {
                ForEach(group.items) { transaction in
                    NavigationLink(value: transaction) {
                        TransactionRow(transaction: transaction)
                    }
                    .buttonStyle(.pressable)

                    if transaction.id != group.items.last?.id {
                        Rectangle()
                            .fill(Color.divider)
                            .frame(height: 1)
                            .padding(.leading, 56)
                    }
                }
            }
            .padding(.horizontal, 14)
            .padding(.vertical, 4)
            .background(Color.cardBackground, in: RoundedRectangle(cornerRadius: 20, style: .continuous))
        }
    }

    @ViewBuilder
    private var emptyState: some View {
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
                    description: Text("No transactions for these filters.")
                )
            }
        }
    }

    private func resetFilters() {
        typeFilter = .all
        categoryFilter = nil
        accountFilter = []
        period = PeriodSelection(.allTime)
    }
}

/// "Today · −₴1,585.40" above each day
private struct DayHeader: View {
    let day: Date
    let items: [Transaction]

    /// Result of the day in UAH, transfers not counted
    private var total: Double {
        items
            .filter { !$0.isTransfer && $0.currency == "UAH" }
            .reduce(0) { $0 + $1.amount }
    }

    private var title: String {
        let calendar = Calendar.current

        if calendar.isDateInToday(day) {
            return "Today"
        }

        if calendar.isDateInYesterday(day) {
            return "Yesterday · " + day.formatted(.dateTime.weekday(.abbreviated).day().month(.abbreviated))
        }

        return day.formatted(.dateTime.weekday(.abbreviated).day().month(.abbreviated))
    }

    var body: some View {
        HStack(alignment: .firstTextBaseline) {
            Text(title)
                .font(.system(size: 15, weight: .bold))
                .foregroundStyle(Color.textPrimary)

            Spacer()

            if total != 0 {
                MoneyText(amount: total, currency: "UAH", sign: true)
                    .font(.system(size: 13))
                    .foregroundStyle(Color.textSecondary)
            }
        }
        .padding(.horizontal, 4)
    }
}

#Preview {
    TransactionsView()
        .environment(AppModel.preview)
}
