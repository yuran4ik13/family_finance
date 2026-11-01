import Foundation
import SwiftUI

// =========================
// HOME: cards, totals for a period, top categories, last transactions
// =========================

struct DashboardView: View {
    @Environment(AppModel.self) private var model
    @State private var period: SummaryPeriod = .month
    @State private var expenses: ExpenseReport?

    private let mainCurrency = "UAH"

    private var totals: CurrencyTotals {
        model.summary?.totals(for: period)[mainCurrency] ?? CurrencyTotals()
    }

    /// Other currencies that had movement in this period
    private var otherCurrencies: [String] {
        let all = model.summary?.totals(for: period) ?? [:]
        return all.keys.filter { $0 != mainCurrency }.sorted()
    }

    private var topCategories: [(name: String, amount: Double)] {
        let items = expenses?.byCategory ?? [:]

        return items
            .map { (name: $0.key, amount: $0.value) }
            .sorted { $0.amount > $1.amount }
            .prefix(5)
            .map { $0 }
    }

    private var recent: [Transaction] {
        Array(model.transactions.prefix(5))
    }

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(alignment: .leading, spacing: 16) {
                    if model.isDemo {
                        DemoBanner()
                    }

                    accountsSection

                    Picker("Period", selection: $period) {
                        ForEach(SummaryPeriod.allCases) { item in
                            Text(item.title).tag(item)
                        }
                    }
                    .pickerStyle(.segmented)

                    statsGrid

                    if !otherCurrencies.isEmpty {
                        otherCurrenciesCard
                    }

                    categoriesCard

                    recentCard
                }
                .padding()
            }
            .background(Color.appBackground)
            .navigationTitle("Family Finance")
            .toolbar {
                ToolbarItem(placement: .topBarTrailing) {
                    syncButton
                }
            }
            .refreshable {
                await model.refresh()
            }
            .task(id: "\(period.rawValue)-\(model.dataVersion)") {
                await loadExpenses()
            }
            .navigationDestination(for: Transaction.self) { transaction in
                TransactionDetailView(transactionId: transaction.id)
            }
        }
    }

    // MARK: - Parts

    @ViewBuilder
    private var accountsSection: some View {
        if model.accounts.isEmpty {
            Card {
                Label(
                    model.bankConnected
                        ? "No accounts yet. Tap ↻ to sync with Monobank."
                        : "Connect Monobank in More → Settings to see your cards.",
                    systemImage: "creditcard"
                )
                .foregroundStyle(.secondary)
            }
        } else {
            ScrollView(.horizontal, showsIndicators: false) {
                HStack(spacing: 12) {
                    ForEach(model.accounts) { account in
                        AccountCard(account: account)
                    }
                }
            }
            .scrollClipDisabled()
        }
    }

    private var statsGrid: some View {
        LazyVGrid(columns: [GridItem(.flexible()), GridItem(.flexible())], spacing: 12) {
            StatCard(
                title: "Income",
                value: Text(totals.income, format: .currency(code: mainCurrency)),
                tint: .income
            )

            StatCard(
                title: "Expenses",
                value: Text(totals.expenses, format: .currency(code: mainCurrency)),
                tint: .expense
            )

            StatCard(
                title: "Transfers",
                value: Text(totals.transfers, format: .currency(code: mainCurrency)),
                tint: .transfer,
                subtitle: "Not counted"
            )

            StatCard(
                title: "Balance",
                value: Text(totals.net, format: .currency(code: mainCurrency)),
                tint: totals.net >= 0 ? .income : .expense
            )
        }
    }

    private var otherCurrenciesCard: some View {
        Card("Other currencies") {
            ForEach(otherCurrencies, id: \.self) { currency in
                let item = model.summary?.totals(for: period)[currency] ?? CurrencyTotals()

                HStack {
                    Text(currency)
                        .font(.subheadline.bold())

                    Spacer()

                    Text(item.income, format: .currency(code: currency))
                        .foregroundStyle(Color.income)

                    Text(-item.expenses, format: .currency(code: currency))
                        .foregroundStyle(Color.expense)
                }
                .font(.subheadline)
                .monospacedDigit()
            }
        }
    }

    private var categoriesCard: some View {
        Card("Where the money went") {
            if topCategories.isEmpty {
                Text("No expenses in this period")
                    .foregroundStyle(.secondary)
            } else {
                let total = max(expenses?.total ?? 0, 1)

                ForEach(topCategories, id: \.name) { item in
                    VStack(alignment: .leading, spacing: 6) {
                        HStack {
                            CategoryIcon(name: item.name, size: 28)

                            Text(item.name)
                                .font(.subheadline)

                            Spacer()

                            Text(item.amount, format: .currency(code: mainCurrency))
                                .font(.subheadline.weight(.semibold))
                                .monospacedDigit()
                        }

                        ProgressView(value: item.amount, total: total)
                            .tint(CategoryStyle.color(for: item.name))
                    }
                }
            }
        }
    }

    private var recentCard: some View {
        Card("Recent transactions") {
            if recent.isEmpty {
                Text("No transactions yet")
                    .foregroundStyle(.secondary)
            } else {
                ForEach(recent) { transaction in
                    NavigationLink(value: transaction) {
                        TransactionRow(transaction: transaction)
                    }
                    .buttonStyle(.plain)

                    if transaction.id != recent.last?.id {
                        Divider()
                    }
                }
            }
        }
    }

    @ViewBuilder
    private var syncButton: some View {
        if model.isSyncing {
            ProgressView()
        } else {
            Button {
                Task { await model.sync() }
            } label: {
                Image(systemName: "arrow.triangle.2.circlepath")
            }
            .accessibilityLabel("Sync with Monobank")
            .disabled(!model.bankConnected || model.isReadOnly)
        }
    }

    private func loadExpenses() async {
        do {
            expenses = try await model.service.expenseReport(days: period.days)
        } catch {
            model.handle(error)
        }
    }
}

#Preview {
    DashboardView()
        .environment(AppModel.preview)
}
