import Foundation
import Charts
import SwiftUI

// =========================
// ANALYTICS: same report as the Analytics page on the website
// Period, currency and type at the top; charts and tops below.
// =========================

struct AnalyticsView: View {
    @Environment(AppModel.self) private var model

    @State private var preset: AnalyticsPreset = .month
    @State private var currency = "UAH"
    @State private var type: AnalyticsType = .all
    @State private var includeTransfers = false

    @State private var report: AnalyticsReport?
    @State private var isLoading = false

    private let currencies = ["UAH", "EUR", "USD"]

    /// Everything that should reload the report when it changes
    private struct Key: Hashable {
        var query: AnalyticsQuery
        var version: Int
    }

    private var query: AnalyticsQuery {
        let range = preset.range()

        return AnalyticsQuery(
            from: range.from,
            to: range.to,
            currency: currency,
            type: type,
            includeTransfers: includeTransfers
        )
    }

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(alignment: .leading, spacing: 16) {
                    filters

                    if let report {
                        totals(report)
                        dayChart(report)
                        categoriesChart(report)
                        merchants(report)
                        biggest(report)
                    } else if isLoading {
                        ProgressView()
                            .frame(maxWidth: .infinity, minHeight: 200)
                    }
                }
                .padding()
            }
            .background(Color.appBackground)
            .navigationTitle("Analytics")
            .toolbar {
                ToolbarItem(placement: .topBarTrailing) {
                    Menu {
                        Picker("Period", selection: $preset) {
                            ForEach(AnalyticsPreset.allCases) { item in
                                Text(item.title).tag(item)
                            }
                        }
                    } label: {
                        Label(preset.title, systemImage: "calendar")
                            .labelStyle(.titleAndIcon)
                    }
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

    // MARK: - Filters

    private var filters: some View {
        VStack(spacing: 12) {
            Picker("Currency", selection: $currency) {
                ForEach(currencies, id: \.self) { item in
                    Text(item).tag(item)
                }
            }
            .pickerStyle(.segmented)

            Picker("Type", selection: $type) {
                ForEach(AnalyticsType.allCases) { item in
                    Text(item.title).tag(item)
                }
            }
            .pickerStyle(.segmented)

            Toggle("Include transfers between my cards", isOn: $includeTransfers)
                .font(.subheadline)
        }
    }

    // MARK: - Totals

    private func totals(_ report: AnalyticsReport) -> some View {
        let incomeChange = ChangeLabel.make(report.change.income, increaseIsGood: true)
        let expenseChange = ChangeLabel.make(report.change.expenses, increaseIsGood: false)

        return VStack(spacing: 12) {
            HStack(spacing: 12) {
                StatCard(
                    title: "Income",
                    value: Text(report.totals.income, format: .currency(code: report.currency)),
                    tint: .income,
                    subtitle: incomeChange.text,
                    subtitleColor: incomeChange.color
                )

                StatCard(
                    title: "Expenses",
                    value: Text(report.totals.expenses, format: .currency(code: report.currency)),
                    tint: .expense,
                    subtitle: expenseChange.text,
                    subtitleColor: expenseChange.color
                )
            }

            HStack(spacing: 12) {
                StatCard(
                    title: "Balance",
                    value: Text(report.totals.net, format: .currency(code: report.currency)),
                    tint: report.totals.net >= 0 ? .income : .expense
                )

                StatCard(
                    title: "Operations",
                    value: Text("\(report.totals.count)"),
                    subtitle: "\(report.period.days) days"
                )
            }
        }
    }

    // MARK: - Charts

    private func dayChart(_ report: AnalyticsReport) -> some View {
        Card("By day") {
            if report.byDay.allSatisfy({ $0.income == 0 && $0.expenses == 0 }) {
                Text("No operations in this period")
                    .foregroundStyle(.secondary)
            } else {
                Chart {
                    ForEach(report.byDay) { day in
                        if type != .income {
                            BarMark(
                                x: .value("Day", day.day, unit: .day),
                                y: .value("Amount", day.expenses)
                            )
                            .foregroundStyle(by: .value("Kind", "Expenses"))
                            .position(by: .value("Kind", "Expenses"))
                        }

                        if type != .expense {
                            BarMark(
                                x: .value("Day", day.day, unit: .day),
                                y: .value("Amount", day.income)
                            )
                            .foregroundStyle(by: .value("Kind", "Income"))
                            .position(by: .value("Kind", "Income"))
                        }
                    }
                }
                .chartForegroundStyleScale(["Expenses": Color.expense, "Income": Color.income])
                .chartLegend(position: .bottom)
                .frame(height: 220)
            }
        }
    }

    /// Top 6 categories, the rest go to "Other"
    private func slices(_ report: AnalyticsReport) -> [AnalyticsReport.CategoryItem] {
        let sorted = report.byCategory.sorted { $0.amount > $1.amount }

        guard sorted.count > 6 else {
            return sorted
        }

        let rest = sorted.dropFirst(6)
        let restAmount = rest.reduce(0) { $0 + $1.amount }
        let restShare = rest.reduce(0) { $0 + $1.share }
        let restCount = rest.reduce(0) { $0 + $1.count }

        return Array(sorted.prefix(6)) + [
            AnalyticsReport.CategoryItem(
                categoryId: nil,
                name: "All the rest",
                amount: restAmount,
                count: restCount,
                share: restShare
            ),
        ]
    }

    private func categoriesChart(_ report: AnalyticsReport) -> some View {
        Card(report.focus == "INCOME" ? "Income by category" : "Expenses by category") {
            if report.byCategory.isEmpty {
                Text("Nothing here for this period")
                    .foregroundStyle(.secondary)
            } else {
                Chart(slices(report)) { item in
                    SectorMark(
                        angle: .value("Amount", item.amount),
                        innerRadius: .ratio(0.6),
                        angularInset: 1.5
                    )
                    .cornerRadius(4)
                    .foregroundStyle(by: .value("Category", item.name))
                }
                .chartLegend(position: .bottom)
                .frame(height: 260)

                Divider()

                ForEach(report.byCategory) { item in
                    HStack {
                        CategoryIcon(name: item.name, size: 28)

                        VStack(alignment: .leading) {
                            Text(item.name)
                                .font(.subheadline)

                            Text("\(item.count) operations · \(item.share.formatted(.number.precision(.fractionLength(0...1))))%")
                                .font(.caption)
                                .foregroundStyle(.secondary)
                        }

                        Spacer()

                        Text(item.amount, format: .currency(code: report.currency))
                            .font(.subheadline.weight(.semibold))
                            .monospacedDigit()
                    }
                }
            }
        }
    }

    // MARK: - Tops

    @ViewBuilder
    private func merchants(_ report: AnalyticsReport) -> some View {
        if !report.topMerchants.isEmpty {
            Card("Top merchants") {
                ForEach(Array(report.topMerchants.enumerated()), id: \.element.id) { index, item in
                    HStack {
                        Text("\(index + 1)")
                            .font(.caption.bold())
                            .foregroundStyle(.secondary)
                            .frame(width: 20)

                        VStack(alignment: .leading) {
                            Text(item.merchant)
                                .font(.subheadline)
                                .lineLimit(1)

                            Text("\(item.count) times")
                                .font(.caption)
                                .foregroundStyle(.secondary)
                        }

                        Spacer()

                        Text(item.amount, format: .currency(code: report.currency))
                            .font(.subheadline.weight(.semibold))
                            .monospacedDigit()
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
                        CategoryIcon(name: item.category, size: 32)

                        VStack(alignment: .leading) {
                            Text(item.description)
                                .font(.subheadline)
                                .lineLimit(1)

                            Text(item.date, format: .dateTime.day().month())
                                .font(.caption)
                                .foregroundStyle(.secondary)
                        }

                        Spacer()

                        AmountText(amount: item.amount, currency: report.currency)
                            .font(.subheadline.weight(.semibold))
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
            report = try await model.service.analytics(query)
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
