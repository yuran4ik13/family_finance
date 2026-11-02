import Foundation
import SwiftUI

// =========================
// MORE: profile, Monobank, money settings, security, sign out
// =========================

struct MoreView: View {
    @Environment(AppModel.self) private var model
    @State private var confirmSignOut = false
    @State private var confirmLogoutAll = false

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(alignment: .leading, spacing: 12) {
                    profileCard
                        .appearAnimation(0)

                    monobankCard
                        .appearAnimation(1)

                    group("Money", index: 2) {
                        linkRow("Accounts", value: "\(model.accounts.count)", icon: "creditcard.fill", color: .brand) {
                            AccountsView()
                        }

                        linkRow("Categories", value: "\(model.categories.count)", icon: "square.grid.2x2.fill", color: Color(hex: 0xFB923C)) {
                            CategoriesView()
                        }

                        linkRow("Merchant rules", value: "\(model.rules.count)", icon: "wand.and.stars", color: .income) {
                            RulesView()
                        }

                        linkRow("Bank, markers & data", value: "", icon: "gearshape.fill", color: Color(hex: 0x22D3EE), isLast: true) {
                            SettingsView()
                        }
                    }

                    group("Security", index: 3) {
                        rowShell(icon: "faceid", color: Color(hex: 0x60A5FA), isLast: model.isDemo) {
                            FaceIDToggle()
                                .labelStyle(.titleOnly)
                        }

                        if !model.isDemo {
                            linkRow("Change password", value: "", icon: "key.fill", color: .warning) {
                                ChangePasswordView()
                            }
                            .disabled(model.isReadOnly)

                            linkRow("Security log", value: "", icon: "list.bullet.clipboard.fill", color: Color(hex: 0xF472B6)) {
                                SecurityLogView()
                            }

                            Button {
                                confirmLogoutAll = true
                            } label: {
                                rowShell(icon: "rectangle.portrait.and.arrow.right", color: .transfer, isLast: true) {
                                    Text("Sign out on all devices")
                                        .foregroundStyle(Color.textPrimary)
                                    Spacer()
                                }
                            }
                            .buttonStyle(.pressable)
                        }
                    }

                    Button {
                        confirmSignOut = true
                    } label: {
                        Text(model.isDemo ? "Exit demo" : "Sign out")
                            .font(.system(size: 16, weight: .semibold))
                            .foregroundStyle(Color.danger)
                            .frame(maxWidth: .infinity)
                            .frame(height: 50)
                            .background(Color.cardBackground, in: Capsule())
                            .overlay(Capsule().strokeBorder(Color.line, lineWidth: 1))
                    }
                    .buttonStyle(.pressable)
                    .padding(.top, 10)
                    .appearAnimation(4)
                }
                .padding(.horizontal, 20)
                .padding(.bottom, 24)
            }
            .background(Color.appBackground)
            .scrollIndicators(.hidden)
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
            .confirmationDialog("Sign out on all devices?", isPresented: $confirmLogoutAll, titleVisibility: .visible) {
                Button("Sign out everywhere", role: .destructive) {
                    Task { await model.logoutEverywhere() }
                }
            } message: {
                Text("Every phone and browser where you are signed in will need the password again.")
            }
        }
    }

    // MARK: - Parts

    private var profileCard: some View {
        HStack(spacing: 14) {
            Text(String(model.user?.email.prefix(1).uppercased() ?? "?"))
                .font(.system(size: 20, weight: .heavy))
                .foregroundStyle(.white)
                .frame(width: 52, height: 52)
                .background(CardStyle.brandGradient, in: Circle())

            VStack(alignment: .leading, spacing: 2) {
                Text(model.user?.email ?? "")
                    .font(.system(size: 17, weight: .semibold))
                    .foregroundStyle(Color.textPrimary)
                    .lineLimit(1)

                Text(modeTitle)
                    .font(.system(size: 13))
                    .foregroundStyle(Color.textSecondary)
                    .lineLimit(1)
            }

            Spacer()
        }
        .padding(16)
        .background(Color.cardBackground, in: RoundedRectangle(cornerRadius: 20, style: .continuous))
    }

    private var monobankCard: some View {
        VStack(alignment: .leading, spacing: 14) {
            HStack(spacing: 12) {
                Text("mono")
                    .font(.system(size: 13, weight: .heavy))
                    .foregroundStyle(Color.appBackground)
                    .frame(width: 40, height: 40)
                    .background(Color.textPrimary, in: RoundedRectangle(cornerRadius: 12, style: .continuous))

                VStack(alignment: .leading, spacing: 2) {
                    Text("Monobank")
                        .font(.system(size: 15, weight: .semibold))
                        .foregroundStyle(Color.textPrimary)

                    Text(model.bankConnected ? "● Connected" : "Not connected")
                        .font(.system(size: 13))
                        .foregroundStyle(model.bankConnected ? Color.income : Color.textSecondary)
                }
            }

            HStack(spacing: 8) {
                Button {
                    Task { await model.sync() }
                } label: {
                    HStack(spacing: 8) {
                        if model.isSyncing {
                            ProgressView()
                                .tint(Color.appBackground)
                        }

                        Text(model.isSyncing ? "Syncing…" : "Sync now")
                    }
                    .font(.system(size: 15, weight: .bold))
                    .foregroundStyle(Color.appBackground)
                    .frame(maxWidth: .infinity)
                    .frame(height: 42)
                    .background(Color.brand, in: Capsule())
                }
                .buttonStyle(.pressable)
                .disabled(!model.bankConnected || model.isSyncing || model.isReadOnly)
                .opacity(model.bankConnected ? 1 : 0.5)

                NavigationLink {
                    SettingsView()
                } label: {
                    Text(model.bankConnected ? "Replace token" : "Connect")
                        .font(.system(size: 15, weight: .semibold))
                        .foregroundStyle(Color.textPrimary)
                        .frame(maxWidth: .infinity)
                        .frame(height: 42)
                        .background(Color.raised, in: Capsule())
                        .overlay(Capsule().strokeBorder(Color.line, lineWidth: 1))
                }
                .buttonStyle(.pressable)
            }
        }
        .padding(16)
        .background(Color.cardBackground, in: RoundedRectangle(cornerRadius: 20, style: .continuous))
        .animation(Motion.spring, value: model.isSyncing)
    }

    private func group<Content: View>(_ title: String, index: Int, @ViewBuilder content: () -> Content) -> some View {
        VStack(alignment: .leading, spacing: 8) {
            Text(title.uppercased())
                .font(.system(size: 13, weight: .semibold))
                .tracking(0.6)
                .foregroundStyle(Color.textSecondary)
                .padding(.leading, 4)

            VStack(spacing: 0) {
                content()
            }
            .padding(.horizontal, 14)
            .background(Color.cardBackground, in: RoundedRectangle(cornerRadius: 20, style: .continuous))
        }
        .padding(.top, 10)
        .appearAnimation(index)
    }

    private func rowShell<Content: View>(icon: String, color: Color, isLast: Bool = false, @ViewBuilder content: () -> Content) -> some View {
        HStack(spacing: 12) {
            Image(systemName: icon)
                .font(.system(size: 14, weight: .semibold))
                .foregroundStyle(color)
                .frame(width: 32, height: 32)
                .background(color.opacity(0.14), in: RoundedRectangle(cornerRadius: 10, style: .continuous))

            content()
        }
        .font(.system(size: 15, weight: .medium))
        .foregroundStyle(Color.textPrimary)
        .padding(.vertical, 10)
        .overlay(alignment: .bottom) {
            if !isLast {
                Rectangle().fill(Color.divider).frame(height: 1).padding(.leading, 44)
            }
        }
        .contentShape(Rectangle())
    }

    private func linkRow<Destination: View>(
        _ title: String,
        value: String,
        icon: String,
        color: Color,
        isLast: Bool = false,
        @ViewBuilder destination: @escaping () -> Destination
    ) -> some View {
        NavigationLink {
            destination()
        } label: {
            rowShell(icon: icon, color: color, isLast: isLast) {
                Text(title)

                Spacer()

                Text(value)
                    .font(.system(size: 14))
                    .foregroundStyle(Color.textSecondary)

                Image(systemName: "chevron.right")
                    .font(.system(size: 13, weight: .semibold))
                    .foregroundStyle(Color.textFaint)
            }
        }
        .buttonStyle(.pressable)
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
                                .fill(CardStyle.gradient(for: account))
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
        .themedList()
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
        .themedList()
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
