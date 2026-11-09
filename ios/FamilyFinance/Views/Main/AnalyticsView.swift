import Foundation
import Charts
import SwiftUI

// =========================
// ANALYTICS: same report as the Analytics page on the website.
// Period (calendar), cards, currency and type at the top; headline,
// charts that grow in, and tops below.
// =========================

struct AnalyticsView: View {
    @Environment(AppModel.self) private var model
    @Environment(\.accessibilityReduceMotion) private var reduceMotion

    @State private var period = PeriodSelection(.preset(.thisMonth))
    @State private var accountFilter: Set<Int> = []
    @State private var currency = "UAH"
    @State private var type: AnalyticsType = .all
    @State private var includeTransfers = false

    @State private var report: AnalyticsReport?
    @State private var isLoading = false
    /// 0 → 1: charts grow from zero after every new report
    @State private var chartProgress = 0.0

    private let currencies = ["UAH", "EUR", "USD"]

    /// Only cards in the chosen currency can be picked (amounts in
    /// different currencies are never mixed)
    private var accountsInCurrency: [AccountSummary] {
        model.accounts.filter { $0.currency == currency }
    }

    /// Everything that should reload the report when it changes
    private struct Key: Hashable {
        var query: AnalyticsQuery
        var version: Int
    }

    private var query: AnalyticsQuery {
        let range = period.range ?? AnalyticsPreset.month.range()

        return AnalyticsQuery(
            from: range.from,
            to: range.to,
            currency: currency,
            type: type,
            includeTransfers: includeTransfers,
            accountIds: accountFilter.sorted()
        )
    }

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(alignment: .leading, spacing: 12) {
                    FilterBar {
                        PeriodButton(selection: $period, neutralKind: .preset(.thisMonth))

                        if accountsInCurrency.count > 1 {
                            AccountFilterMenu(accounts: accountsInCurrency, selection: $accountFilter)
                        }
                    }
                    .padding(.horizontal, -20)
                    .appearAnimation(0)

                    PillPicker(items: currencies, selection: $currency) { item in
                        "\(Money.symbol(item).trimmingCharacters(in: .whitespaces)) \(item)"
                    }
                    .appearAnimation(1)

                    PillPicker(items: AnalyticsType.allCases, selection: $type) { $0.title }
                        .appearAnimation(1)

                    Toggle(isOn: $includeTransfers.animation(Motion.spring)) {
                        Text("Include transfers between my cards")
                            .font(.system(size: 14))
                            .foregroundStyle(Color.textSecondary)
                    }
                    .tint(Color.brand)
                    .padding(.horizontal, 4)
                    .appearAnimation(2)

                    if let report {
                        headline(report)
                            .padding(.top, 10)
                            .appearAnimation(2)

                        dayChart(report)
                            .appearAnimation(3)

                        categoriesChart(report)
                            .appearAnimation(4)

                        insights(report)
                            .appearAnimation(5)

                        merchants(report)
                            .appearAnimation(6)

                        biggest(report)
                            .appearAnimation(7)
                    } else if isLoading {
                        ProgressView()
                            .tint(Color.brand)
                            .frame(maxWidth: .infinity, minHeight: 240)
                    }
                }
                .padding(.horizontal, 20)
                .padding(.bottom, 24)
            }
            .background(Color.appBackground)
            .scrollIndicators(.hidden)
            .navigationTitle("Analytics")
            .onChange(of: currency) {
                // Cards from another currency don't apply any more
                accountFilter = accountFilter.filter { id in
                    accountsInCurrency.contains { $0.id == id }
                }
            }
            .refreshable {
                await load()
            }
            .task(id: Key(query: query, version: model.dataVersion)) {
                await load()
            }
        }
    }

    // MARK: - Headline

    private func headline(_ report: AnalyticsReport) -> some View {
        let showsIncome = type == .income
        let amount = showsIncome ? report.totals.income : report.totals.expenses
        let change = ChangeLabel.make(
            showsIncome ? report.change.income : report.change.expenses,
            increaseIsGood: showsIncome
        )

        return VStack(alignment: .leading, spacing: 4) {
            Text(showsIncome ? "Received · \(period.title)" : "Spent · \(period.title)")
                .font(.system(size: 14))
                .foregroundStyle(Color.textSecondary)

            MoneyText(amount: amount, currency: report.currency)
                .font(.system(size: 40, weight: .heavy))
                .tracking(-1.2)
                .foregroundStyle(showsIncome ? Color.income : Color.textPrimary)
                .lineLimit(1)
                .minimumScaleFactor(0.5)

            Text(change.text)
                .font(.system(size: 14, weight: .semibold))
                .foregroundStyle(change.color)
                .contentTransition(.opacity)
        }
        .animation(Motion.spring, value: amount)
    }

    // MARK: - Charts

    private func dayChart(_ report: AnalyticsReport) -> some View {
        Card("By day") {
            if report.byDay.allSatisfy({ $0.income == 0 && $0.expenses == 0 }) {
                Text("No operations in this period")
                    .font(.system(size: 15))
                    .foregroundStyle(Color.textSecondary)
            } else {
                Chart {
                    ForEach(report.byDay) { day in
                        if type != .income {
                            BarMark(
                                x: .value("Day", day.day, unit: .day),
                                y: .value("Amount", day.expenses * chartProgress)
                            )
                            .foregroundStyle(by: .value("Kind", "Spent"))
                            .position(by: .value("Kind", "Spent"))
                            .cornerRadius(3)
                        }

                        if type != .expense {
                            BarMark(
                                x: .value("Day", day.day, unit: .day),
                                y: .value("Amount", day.income * chartProgress)
                            )
                            .foregroundStyle(by: .value("Kind", "Income"))
                            .position(by: .value("Kind", "Income"))
                            .cornerRadius(3)
                        }
                    }
                }
                .chartForegroundStyleScale(["Spent": Color.brand, "Income": Color.income])
                .chartLegend(position: .top, alignment: .trailing)
                .chartXAxis {
                    AxisMarks(values: .automatic(desiredCount: 4)) { _ in
                        AxisValueLabel(format: .dateTime.day().month(.abbreviated))
                            .foregroundStyle(Color.textSecondary)
                    }
                }
                .chartYAxis {
                    AxisMarks(position: .trailing, values: .automatic(desiredCount: 3)) { _ in
                        AxisGridLine().foregroundStyle(Color.line)
                        AxisValueLabel().foregroundStyle(Color.textSecondary)
                    }
                }
                .frame(height: 190)
            }
        }
    }

    /// Top 6 categories, the rest go to "All the rest"
    private func slices(_ report: AnalyticsReport) -> [AnalyticsReport.CategoryItem] {
        let sorted = report.byCategory.sorted { $0.amount > $1.amount }

        guard sorted.count > 6 else {
            return sorted
        }

        let rest = sorted.dropFirst(6)

        return Array(sorted.prefix(6)) + [
            AnalyticsReport.CategoryItem(
                categoryId: nil,
                name: "All the rest",
                amount: rest.reduce(0) { $0 + $1.amount },
                count: rest.reduce(0) { $0 + $1.count },
                share: rest.reduce(0) { $0 + $1.share }
            ),
        ]
    }

    private func sliceColor(_ name: String) -> Color {
        name == "All the rest" ? Color.textFaint : CategoryStyle.color(for: name)
    }

    private func categoriesChart(_ report: AnalyticsReport) -> some View {
        Card(report.focus == "INCOME" ? "Income by category" : "Categories") {
            if report.byCategory.isEmpty {
                Text("Nothing here for this period")
                    .font(.system(size: 15))
                    .foregroundStyle(Color.textSecondary)
            } else {
                let items = slices(report)
                let total = items.reduce(0) { $0 + $1.amount }

                HStack(spacing: 18) {
                    Chart(items) { item in
                        SectorMark(
                            angle: .value("Amount", item.amount * chartProgress),
                            innerRadius: .ratio(0.68),
                            angularInset: 2
                        )
                        .cornerRadius(4)
                        .foregroundStyle(sliceColor(item.name))
                    }
                    .chartLegend(.hidden)
                    .frame(width: 140, height: 140)
                    .overlay {
                        VStack(spacing: 2) {
                            Text("\(report.totals.count) ops")
                                .font(.system(size: 12))
                                .foregroundStyle(Color.textSecondary)

                            MoneyText(amount: total, currency: report.currency, decimals: false)
                                .font(.system(size: 15, weight: .bold))
                                .foregroundStyle(Color.textPrimary)
                                .minimumScaleFactor(0.6)
                                .lineLimit(1)
                        }
                        .frame(width: 88)
                    }
                    .rotationEffect(.degrees(reduceMotion ? 0 : (1 - chartProgress) * -90))

                    VStack(alignment: .leading, spacing: 8) {
                        ForEach(items) { item in
                            HStack(spacing: 8) {
                                Circle()
                                    .fill(sliceColor(item.name))
                                    .frame(width: 8, height: 8)

                                Text(item.name)
                                    .lineLimit(1)
                                    .foregroundStyle(Color.textPrimary)

                                Spacer(minLength: 4)

                                Text("\(item.share.formatted(.number.precision(.fractionLength(0))))%")
                                    .foregroundStyle(Color.textSecondary)
                            }
                            .font(.system(size: 13))
                        }
                    }
                }
            }
        }
    }

    // MARK: - Insights

    private func insights(_ report: AnalyticsReport) -> some View {
        let days = max(report.period.days, 1)

        return LazyVGrid(columns: [GridItem(.flexible(), spacing: 12), GridItem(.flexible())], spacing: 12) {
            StatCard(
                title: "Average a day",
                value: Text(Money.format(report.totals.expenses / Double(days), currency: report.currency, decimals: false))
            )

            StatCard(
                title: type == .income ? "Spent" : "Income",
                value: Text(type == .income
                    ? Money.format(report.totals.expenses, currency: report.currency, decimals: false)
                    : Money.format(report.totals.income, currency: report.currency, sign: true, decimals: false)),
                tint: type == .income ? .textPrimary : .income
            )

            StatCard(
                title: "Balance",
                value: Text(Money.format(report.totals.net, currency: report.currency, sign: true, decimals: false)),
                tint: report.totals.net >= 0 ? .income : .danger
            )

            StatCard(
                title: "Operations",
                value: Text("\(report.totals.count)"),
                subtitle: "\(report.period.days) days"
            )
        }
    }

    // MARK: - Tops

    @ViewBuilder
    private func merchants(_ report: AnalyticsReport) -> some View {
        if let first = report.topMerchants.first {
            Card("Top merchants") {
                ForEach(Array(report.topMerchants.prefix(5).enumerated()), id: \.element.id) { index, item in
                    VStack(alignment: .leading, spacing: 6) {
                        HStack {
                            Text("\(index + 1)")
                                .foregroundStyle(Color.textSecondary)
                                .frame(width: 18, alignment: .leading)

                            Text(item.merchant)
                                .foregroundStyle(Color.textPrimary)
                                .lineLimit(1)

                            Spacer()

                            MoneyText(amount: item.amount, currency: report.currency)
                                .fontWeight(.semibold)
                                .foregroundStyle(Color.textPrimary)
                        }
                        .font(.system(size: 14))

                        GrowingBar(
                            fraction: first.amount > 0 ? item.amount / first.amount : 0,
                            height: 6,
                            delay: 0.25 + Double(index) * 0.06
                        )
                    }
                }
            }
        }
    }

    @ViewBuilder
    private func biggest(_ report: AnalyticsReport) -> some View {
        if !report.topTransactions.isEmpty {
            Card("Biggest operations") {
                ForEach(report.topTransactions) { item in
                    HStack(spacing: 12) {
                        CategoryIcon(name: item.category, size: 38)

                        VStack(alignment: .leading, spacing: 2) {
                            Text(item.description)
                                .font(.system(size: 15, weight: .medium))
                                .foregroundStyle(Color.textPrimary)
                                .lineLimit(1)

                            Text(item.date, format: .dateTime.day().month(.abbreviated))
                                .font(.system(size: 12))
                                .foregroundStyle(Color.textSecondary)
                        }

                        Spacer()

                        AmountText(amount: item.amount, currency: report.currency)
                            .font(.system(size: 15, weight: .semibold))
                    }
                }
            }
        }
    }

    // MARK: - Loading

    private func load() async {
        isLoading = true
        defer { isLoading = false }

        do {
            let newReport = try await model.service.analytics(query)

            // Charts start from zero and grow to the new numbers
            chartProgress = reduceMotion ? 1 : 0
            report = newReport

            if !reduceMotion {
                withAnimation(Motion.grow.delay(0.15)) {
                    chartProgress = 1
                }
            }
        } catch is CancellationError {
            // The filters changed while loading: a new request is already running
        } catch {
            model.handle(error)
        }
    }
}

#Preview {
    AnalyticsView()
        .environment(AppModel.preview)
}
