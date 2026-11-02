import Foundation
import SwiftUI

// =========================
// HOME: balance, cards, totals for a period, categories, recent operations
// Everything here is counted in the app from the loaded transactions,
// so any card and any dates can be chosen.
// =========================

/// Periods on the Home screen
enum HomePeriod: String, CaseIterable, Identifiable {
    case today
    case week
    case month
    case dates

    var id: Self { self }

    var title: String {
        switch self {
        case .today: "Today"
        case .week: "7 days"
        case .month: "30 days"
        case .dates: "Dates"
        }
    }
}

/// Numbers for one period of one card (or all cards)
struct PeriodStats {
    struct CategoryItem: Identifiable {
        let name: String
        let amount: Double
        let count: Int

        var id: String { name }
    }

    var income = 0.0
    var expenses = 0.0
    var transfers = 0.0
    var categories: [CategoryItem] = []

    var saved: Double {
        income - expenses
    }

    /// Same rules as the backend: transfers between own cards are not
    /// income and not expenses
    init(_ transactions: [Transaction], from: Date, to: Date, currency: String) {
        let end = Calendar.current.date(byAdding: .day, value: 1, to: to) ?? to
        var byCategory: [String: (amount: Double, count: Int)] = [:]

        for transaction in transactions where transaction.currency == currency
            && transaction.date >= from && transaction.date < end {
            let amount = abs(transaction.amount)

            if transaction.isTransfer {
                transfers += amount
            } else if transaction.amount > 0 {
                income += amount
            } else {
                expenses += amount
                let name = transaction.categoryName ?? "Other"
                let current = byCategory[name] ?? (0, 0)
                byCategory[name] = (current.amount + amount, current.count + 1)
            }
        }

        categories = byCategory
            .map { CategoryItem(name: $0.key, amount: $0.value.amount, count: $0.value.count) }
            .sorted { $0.amount > $1.amount }
    }
}

struct DashboardView: View {
    @Environment(AppModel.self) private var model
    @AppStorage("hideBalances") private var hideBalances = false

    @State private var period: HomePeriod = .month
    @State private var customDates = PeriodSelection(.custom)
    @State private var showDates = false
    /// nil = all cards
    @State private var selectedAccountId: Int?

    // MARK: - Data

    private var selectedAccount: AccountSummary? {
        model.accounts.first { $0.id == selectedAccountId }
    }

    private var currency: String {
        selectedAccount?.currency ?? "UAH"
    }

    private var visibleTransactions: [Transaction] {
        guard let selectedAccountId else {
            return model.transactions
        }

        return model.transactions.filter { $0.accountId == selectedAccountId }
    }

    private var range: (from: Date, to: Date) {
        let today = Date.now.startOfDay
        let calendar = Calendar.current

        switch period {
        case .today:
            return (today, today)
        case .week:
            return (calendar.date(byAdding: .day, value: -6, to: today) ?? today, today)
        case .month:
            return (calendar.date(byAdding: .day, value: -29, to: today) ?? today, today)
        case .dates:
            return customDates.range ?? (today, today)
        }
    }

    private var previousRange: (from: Date, to: Date) {
        let calendar = Calendar.current
        let days = (calendar.dateComponents([.day], from: range.from, to: range.to).day ?? 0) + 1
        let to = calendar.date(byAdding: .day, value: -1, to: range.from) ?? range.from
        let from = calendar.date(byAdding: .day, value: -(days - 1), to: to) ?? to
        return (from, to)
    }

    private var stats: PeriodStats {
        PeriodStats(visibleTransactions, from: range.from, to: range.to, currency: currency)
    }

    private var previousStats: PeriodStats {
        PeriodStats(visibleTransactions, from: previousRange.from, to: previousRange.to, currency: currency)
    }

    /// Balance shown at the top: the chosen card, or all cards in UAH
    private var mainBalance: Double {
        if let selectedAccount {
            return selectedAccount.balance
        }

        return model.accounts.filter { $0.currency == "UAH" }.reduce(0) { $0 + $1.balance }
    }

    /// "+ €1,320.75 · $860.00 on other cards"
    private var otherBalances: String? {
        if let selectedAccount {
            return selectedAccount.name
        }

        if hideBalances {
            return nil
        }

        let others = Dictionary(grouping: model.accounts.filter { $0.currency != "UAH" }, by: \.currency)
            .sorted { $0.key < $1.key }
            .map { Money.format($0.value.reduce(0) { $0 + $1.balance }, currency: $0.key) }

        return others.isEmpty ? nil : "+ " + others.joined(separator: " · ") + " on other cards"
    }

    private func change(_ now: Double, _ before: Double) -> Double? {
        before == 0 ? nil : (now - before) / before * 100
    }

    // MARK: - Body

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(alignment: .leading, spacing: 0) {
                    header
                        .appearAnimation(0)

                    if model.isDemo {
                        DemoBanner()
                            .padding(.top, 16)
                            .appearAnimation(1)
                    }

                    balance
                        .padding(.top, 24)
                        .appearAnimation(1)

                    if model.accounts.isEmpty {
                        emptyAccounts
                            .padding(.top, 20)
                    } else {
                        accountChips
                            .padding(.top, 22)
                            .appearAnimation(2)

                        cards
                            .padding(.top, 14)
                            .appearAnimation(3)
                    }

                    PillPicker(items: HomePeriod.allCases, selection: periodBinding) { item in
                        item == .dates && period == .dates ? customDates.title : item.title
                    }
                    .padding(.top, 22)
                    .appearAnimation(4)

                    statsGrid
                        .padding(.top, 12)
                        .appearAnimation(5)

                    categoriesCard
                        .padding(.top, 12)
                        .appearAnimation(6)

                    recentSection
                        .padding(.top, 24)
                        .appearAnimation(7)
                }
                .padding(.horizontal, 20)
                .padding(.bottom, 24)
            }
            .background(Color.appBackground)
            .scrollIndicators(.hidden)
            .toolbar(.hidden, for: .navigationBar)
            .refreshable {
                await model.refresh()
            }
            .sheet(isPresented: $showDates) {
                PeriodSheet(selection: $customDates, presetsAllowed: false)
            }
            .navigationDestination(for: Transaction.self) { transaction in
                TransactionDetailView(transactionId: transaction.id)
            }
        }
    }

    /// Choosing "Dates" opens the calendar instead of just switching
    private var periodBinding: Binding<HomePeriod> {
        Binding(
            get: { period },
            set: { newValue in
                if newValue == .dates {
                    showDates = true
                }

                period = newValue
            }
        )
    }

    // MARK: - Parts

    private var greeting: String {
        switch Calendar.current.component(.hour, from: .now) {
        case 5..<12: "Good morning"
        case 12..<18: "Good afternoon"
        default: "Good evening"
        }
    }

    private var header: some View {
        HStack(spacing: 12) {
            Text(String(model.user?.email.prefix(1).uppercased() ?? "?"))
                .font(.system(size: 17, weight: .bold))
                .foregroundStyle(Color.brand)
                .frame(width: 40, height: 40)
                .background(Color.raised, in: Circle())

            VStack(alignment: .leading, spacing: 1) {
                Text(greeting)
                    .font(.system(size: 13))
                    .foregroundStyle(Color.textSecondary)

                Text(model.isDemo ? "Demo" : (model.user?.email.components(separatedBy: "@").first ?? ""))
                    .font(.system(size: 17, weight: .semibold))
                    .foregroundStyle(Color.textPrimary)
                    .lineLimit(1)
            }

            Spacer()

            CircleButton(icon: hideBalances ? "eye.slash" : "eye", label: hideBalances ? "Show balances" : "Hide balances") {
                withAnimation(Motion.spring) {
                    hideBalances.toggle()
                }
            }

            CircleButton(icon: "arrow.triangle.2.circlepath", label: "Sync with Monobank", isSpinning: model.isSyncing) {
                Task { await model.sync() }
            }
            .disabled(!model.bankConnected || model.isReadOnly || model.isSyncing)
        }
        .padding(.top, 8)
    }

    private var balance: some View {
        let saved = stats.saved
        let hasMovement = stats.income > 0 || stats.expenses > 0

        return VStack(alignment: .leading, spacing: 6) {
            Text(selectedAccount == nil ? "Total balance · UAH" : "Card balance · \(currency)")
                .font(.system(size: 14))
                .foregroundStyle(Color.textSecondary)

            MoneyText(amount: mainBalance, currency: currency)
                .font(.system(size: 44, weight: .heavy))
                .tracking(-1.5)
                .foregroundStyle(Color.textPrimary)
                .lineLimit(1)
                .minimumScaleFactor(0.5)

            if let otherBalances {
                Text(otherBalances)
                    .font(.system(size: 14))
                    .foregroundStyle(Color.textSecondary)
                    .lineLimit(1)
            }

            if hasMovement {
                HStack(spacing: 4) {
                    Text(saved >= 0 ? "▲" : "▼")
                    MoneyText(amount: abs(saved), currency: currency)
                    Text(saved >= 0 ? "saved" : "overspent")
                }
                .font(.system(size: 13, weight: .semibold))
                .foregroundStyle(saved >= 0 ? Color.income : Color.danger)
                .padding(.horizontal, 10)
                .padding(.vertical, 6)
                .background(
                    (saved >= 0 ? Color.income : Color.danger).opacity(0.12),
                    in: RoundedRectangle(cornerRadius: 10, style: .continuous)
                )
                .padding(.top, 6)
                .transition(.scale(scale: 0.8).combined(with: .opacity))
            }
        }
        .animation(Motion.spring, value: hasMovement)
    }

    private var emptyAccounts: some View {
        Card {
            Label(
                model.bankConnected
                    ? "No cards yet. Tap ↻ to sync with Monobank."
                    : "Connect Monobank in More → Settings to see your cards.",
                systemImage: "creditcard"
            )
            .font(.system(size: 15))
            .foregroundStyle(Color.textSecondary)
        }
    }

    private var accountChips: some View {
        ScrollView(.horizontal) {
            HStack(spacing: 8) {
                Button {
                    select(nil)
                } label: {
                    Chip(title: "All accounts", isOn: selectedAccountId == nil)
                }

                ForEach(model.accounts) { account in
                    Button {
                        select(account.id)
                    } label: {
                        Chip(title: account.shortName, isOn: selectedAccountId == account.id)
                    }
                }
            }
            .buttonStyle(.pressable)
        }
        .scrollIndicators(.hidden)
        .scrollClipDisabled()
        .sensoryFeedback(.selection, trigger: selectedAccountId)
    }

    private var cards: some View {
        ScrollViewReader { proxy in
            ScrollView(.horizontal) {
                HStack(spacing: 12) {
                    ForEach(model.accounts) { account in
                        Button {
                            select(selectedAccountId == account.id ? nil : account.id)
                        } label: {
                            AccountCard(
                                account: account,
                                isSelected: selectedAccountId == account.id,
                                isDimmed: selectedAccountId != nil && selectedAccountId != account.id
                            )
                        }
                        .buttonStyle(.pressable)
                        .id(account.id)
                    }
                }
                .scrollTargetLayout()
            }
            .scrollIndicators(.hidden)
            .scrollClipDisabled()
            .scrollTargetBehavior(.viewAligned)
            .onChange(of: selectedAccountId) { _, id in
                if let id {
                    withAnimation(Motion.spring) {
                        proxy.scrollTo(id, anchor: .leading)
                    }
                }
            }
        }
    }

    private func select(_ id: Int?) {
        withAnimation(Motion.spring) {
            selectedAccountId = id
        }
    }

    private var statsGrid: some View {
        let stats = stats
        let previous = previousStats
        let incomeChange = ChangeLabel.make(change(stats.income, previous.income), increaseIsGood: true)
        let expenseChange = ChangeLabel.make(change(stats.expenses, previous.expenses), increaseIsGood: false)

        return VStack(spacing: 12) {
            HStack(spacing: 12) {
                StatCard(
                    title: "Income",
                    value: Text(hideBalances ? "••••" : Money.format(stats.income, currency: currency, sign: true, decimals: false)),
                    tint: .income,
                    subtitle: incomeChange.text,
                    subtitleColor: incomeChange.color,
                    icon: "arrow.down.left",
                    iconColor: .income
                )

                StatCard(
                    title: "Expenses",
                    value: Text(hideBalances ? "••••" : Money.format(stats.expenses, currency: currency, decimals: false)),
                    subtitle: expenseChange.text,
                    subtitleColor: expenseChange.color,
                    icon: "arrow.up.right",
                    iconColor: .danger
                )
            }
            .animation(Motion.spring, value: stats.income)
            .animation(Motion.spring, value: stats.expenses)

            VStack(alignment: .leading, spacing: 12) {
                HStack(alignment: .firstTextBaseline) {
                    Text("Saved")
                        .font(.system(size: 14))
                        .foregroundStyle(Color.textSecondary)

                    Spacer()

                    MoneyText(amount: stats.saved, currency: currency)
                        .font(.system(size: 20, weight: .bold))
                        .foregroundStyle(stats.saved >= 0 ? Color.textPrimary : Color.danger)
                }

                GrowingBar(fraction: stats.income > 0 ? max(stats.saved, 0) / stats.income : 0)

                Text(savedNote(stats))
                    .font(.system(size: 12))
                    .foregroundStyle(Color.textSecondary)
            }
            .padding(16)
            .background(Color.cardBackground, in: RoundedRectangle(cornerRadius: 20, style: .continuous))
        }
    }

    private func savedNote(_ stats: PeriodStats) -> String {
        var parts: [String] = []

        if stats.income > 0 {
            let share = max(stats.saved, 0) / stats.income * 100
            parts.append("\(share.formatted(.number.precision(.fractionLength(0))))% of income kept")
        }

        if stats.transfers > 0 && !hideBalances {
            parts.append("\(Money.format(stats.transfers, currency: currency, decimals: false)) between your cards not counted")
        }

        return parts.isEmpty ? "No income or expenses in this period" : parts.joined(separator: " · ")
    }

    private var categoriesCard: some View {
        let stats = stats
        let top = Array(stats.categories.prefix(5))
        let total = max(stats.expenses, 1)

        return Card("Where the money went") {
            if top.isEmpty {
                Text("No expenses in this period")
                    .font(.system(size: 15))
                    .foregroundStyle(Color.textSecondary)
            } else {
                CategoryStrip(items: stats.categories, total: total)

                ForEach(top) { item in
                    HStack(spacing: 12) {
                        CategoryIcon(name: item.name, size: 38, circle: false)

                        VStack(alignment: .leading, spacing: 2) {
                            Text(item.name)
                                .font(.system(size: 15, weight: .medium))
                                .foregroundStyle(Color.textPrimary)
                                .lineLimit(1)

                            Text(item.count == 1 ? "1 payment" : "\(item.count) payments")
                                .font(.system(size: 12))
                                .foregroundStyle(Color.textSecondary)
                        }

                        Spacer()

                        VStack(alignment: .trailing, spacing: 2) {
                            MoneyText(amount: item.amount, currency: currency)
                                .font(.system(size: 15, weight: .semibold))
                                .foregroundStyle(Color.textPrimary)

                            Text("\((item.amount / total * 100).formatted(.number.precision(.fractionLength(0))))%")
                                .font(.system(size: 12))
                                .foregroundStyle(Color.textSecondary)
                        }
                    }
                    .transition(.opacity.combined(with: .move(edge: .bottom)))
                }
            }
        }
        .animation(Motion.spring, value: top.map(\.name))
    }

    private var recentSection: some View {
        let recent = Array(visibleTransactions.prefix(5))

        return VStack(alignment: .leading, spacing: 4) {
            Text("Recent")
                .font(.system(size: 17, weight: .bold))
                .foregroundStyle(Color.textPrimary)
                .padding(.bottom, 4)

            if recent.isEmpty {
                Text("No transactions yet")
                    .font(.system(size: 15))
                    .foregroundStyle(Color.textSecondary)
            } else {
                ForEach(recent) { transaction in
                    NavigationLink(value: transaction) {
                        TransactionRow(transaction: transaction)
                    }
                    .buttonStyle(.pressable)
                }
            }
        }
        .animation(Motion.spring, value: recent.map(\.id))
    }
}

/// Coloured strip: each category's share of the spending
struct CategoryStrip: View {
    let items: [PeriodStats.CategoryItem]
    let total: Double

    @State private var isShown = false
    @Environment(\.accessibilityReduceMotion) private var reduceMotion

    var body: some View {
        let top = Array(items.prefix(5))
        let rest = items.dropFirst(5).reduce(0) { $0 + $1.amount }

        GeometryReader { proxy in
            HStack(spacing: 2) {
                ForEach(top) { item in
                    Rectangle()
                        .fill(CategoryStyle.color(for: item.name))
                        .frame(width: max(proxy.size.width * item.amount / total - 2, 2))
                }

                if rest > 0 {
                    Rectangle()
                        .fill(Color.line)
                }
            }
            .frame(width: proxy.size.width * (isShown ? 1 : 0), alignment: .leading)
            .clipShape(Capsule())
        }
        .frame(height: 10)
        .accessibilityHidden(true)
        .onAppear {
            if reduceMotion {
                isShown = true
            } else {
                withAnimation(Motion.grow.delay(0.3)) {
                    isShown = true
                }
            }
        }
    }
}

/// Round icon button used in headers
struct CircleButton: View {
    let icon: String
    let label: String
    var isSpinning = false
    let action: () -> Void

    var body: some View {
        Button(action: action) {
            Image(systemName: icon)
                .font(.system(size: 16, weight: .semibold))
                .foregroundStyle(Color.textPrimary)
                .symbolEffect(.rotate, options: .repeat(.continuous), isActive: isSpinning)
                .contentTransition(.symbolEffect(.replace))
                .frame(width: 40, height: 40)
                .background(Color.cardBackground, in: Circle())
                .overlay(Circle().strokeBorder(Color.line, lineWidth: 1))
        }
        .buttonStyle(.pressable)
        .accessibilityLabel(label)
    }
}

#Preview {
    DashboardView()
        .environment(AppModel.preview)
}
