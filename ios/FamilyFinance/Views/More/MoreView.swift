import Foundation
import SwiftUI

// =========================
// MORE: accounts, categories, rules, settings, sign out
// =========================

struct MoreView: View {
    @Environment(AppModel.self) private var model
    @State private var confirmSignOut = false

    var body: some View {
        NavigationStack {
            List {
                Section {
                    HStack(spacing: 12) {
                        Image(systemName: "person.crop.circle.fill")
                            .font(.system(size: 44))
                            .foregroundStyle(.tint)

                        VStack(alignment: .leading, spacing: 2) {
                            Text(model.user?.email ?? "")
                                .font(.headline)

                            Text(modeTitle)
                                .font(.subheadline)
                                .foregroundStyle(.secondary)
                        }
                    }
                    .padding(.vertical, 4)
                }

                Section {
                    NavigationLink {
                        AccountsView()
                    } label: {
                        Label("Accounts", systemImage: "creditcard.fill")
                    }

                    NavigationLink {
                        CategoriesView()
                    } label: {
                        Label("Categories", systemImage: "square.grid.2x2.fill")
                    }

                    NavigationLink {
                        RulesView()
                    } label: {
                        Label("Merchant rules", systemImage: "wand.and.stars")
                    }
                }

                Section {
                    NavigationLink {
                        SettingsView()
                    } label: {
                        Label("Settings", systemImage: "gearshape.fill")
                    }
                }

                Section {
                    Button(model.isDemo ? "Exit demo" : "Sign out", role: .destructive) {
                        confirmSignOut = true
                    }
                }
            }
            .navigationTitle("More")
            .confirmationDialog(
                model.isDemo ? "Exit demo mode?" : "Sign out?",
                isPresented: $confirmSignOut,
                titleVisibility: .visible
            ) {
                Button(model.isDemo ? "Exit demo" : "Sign out", role: .destructive) {
                    Task { await model.signOut() }
                }
            }
        }
    }

    private var modeTitle: String {
        if model.isDemo {
            return "Demo mode · invented data"
        }

        if model.isReadOnly {
            return "Read-only demo account"
        }

        return model.serverURLString
    }
}

// MARK: - Accounts

struct AccountsView: View {
    @Environment(AppModel.self) private var model

    /// Total balance per currency
    private var totals: [(currency: String, amount: Double)] {
        let grouped = Dictionary(grouping: model.accounts, by: \.currency)

        return grouped
            .map { (currency: $0.key, amount: $0.value.reduce(0) { $0 + $1.balance }) }
            .sorted { $0.currency < $1.currency }
    }

    var body: some View {
        List {
            if model.accounts.isEmpty {
                ContentUnavailableView(
                    "No accounts",
                    systemImage: "creditcard",
                    description: Text("Connect Monobank in Settings and sync.")
                )
                .listRowBackground(Color.clear)
            } else {
                Section("Total") {
                    ForEach(totals, id: \.currency) { item in
                        LabeledContent(item.currency) {
                            Text(item.amount, format: .currency(code: item.currency))
                                .monospacedDigit()
                        }
                    }
                }

                Section("Cards") {
                    ForEach(model.accounts) { account in
                        HStack(spacing: 12) {
                            RoundedRectangle(cornerRadius: 6)
                                .fill(CardStyle.gradient(for: account.currency))
                                .frame(width: 44, height: 30)

                            VStack(alignment: .leading) {
                                Text(account.name)
                                    .font(.subheadline.weight(.medium))

                                Text(account.bankName)
                                    .font(.caption)
                                    .foregroundStyle(.secondary)
                            }

                            Spacer()

                            Text(account.balance, format: .currency(code: account.currency))
                                .font(.subheadline.weight(.semibold))
                                .monospacedDigit()
                        }
                    }
                }
            }
        }
        .navigationTitle("Accounts")
        .refreshable {
            await model.refresh()
        }
    }
}

// MARK: - Categories

struct CategoriesView: View {
    @Environment(AppModel.self) private var model
    @State private var period: SummaryPeriod = .month
    @State private var report: ExpenseReport?

    private var items: [(name: String, amount: Double)] {
        (report?.byCategory ?? [:])
            .map { (name: $0.key, amount: $0.value) }
            .sorted { $0.amount > $1.amount }
    }

    var body: some View {
        List {
            Section {
                Picker("Period", selection: $period) {
                    ForEach(SummaryPeriod.allCases) { item in
                        Text(item.title).tag(item)
                    }
                }
                .pickerStyle(.segmented)
                .listRowBackground(Color.clear)
                .listRowInsets(EdgeInsets())
            }

            if let report {
                Section {
                    LabeledContent("Spent") {
                        Text(report.total, format: .currency(code: report.currency))
                            .font(.headline)
                            .monospacedDigit()
                    }
                }

                Section("Expenses by category") {
                    if items.isEmpty {
                        Text("No expenses in this period")
                            .foregroundStyle(.secondary)
                    }

                    ForEach(items, id: \.name) { item in
                        VStack(alignment: .leading, spacing: 6) {
                            HStack {
                                CategoryIcon(name: item.name, size: 30)

                                Text(item.name)

                                Spacer()

                                Text(item.amount, format: .currency(code: report.currency))
                                    .monospacedDigit()
                            }

                            ProgressView(value: item.amount, total: max(report.total, 1))
                                .tint(CategoryStyle.color(for: item.name))
                        }
                    }
                }
            }

            Section("All categories") {
                ForEach(model.categories) { category in
                    Label {
                        Text(category.name)
                    } icon: {
                        CategoryIcon(name: category.name, size: 28)
                    }
                }
            }
        }
        .navigationTitle("Categories")
        .task(id: "\(period.rawValue)-\(model.dataVersion)") {
            do {
                report = try await model.service.expenseReport(days: period.days)
            } catch {
                model.handle(error)
            }
        }
    }
}

#Preview {
    MoreView()
        .environment(AppModel.preview)
}
