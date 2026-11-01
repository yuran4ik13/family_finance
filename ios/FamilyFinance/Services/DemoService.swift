import Foundation

// =========================
// DEMO SERVICE
// Works fully offline with invented data. Everything you change (categories,
// rules) is kept in memory and disappears when you leave demo mode.
// =========================

final class DemoService: FinanceService {
    var isDemo: Bool { true }

    private let user = CurrentUser(id: 0, email: "demo@familyfinance.app", role: "OWNER")
    private var accountsStore: [AccountSummary]
    private var categoriesStore: [Category]
    private var transactionsStore: [Transaction]
    private var rulesStore: [MerchantRule] = []
    private var transferMarkers = ""
    private var familyIncomeMarkers = ""
    private var events: [SecurityEvent]
    private var nextRuleId = 1

    init() {
        let data = DemoData.make()

        accountsStore = data.accounts
        transactionsStore = data.transactions
        categoriesStore = DemoData.categoryNames.enumerated().map { index, name in
            Category(id: index + 1, name: name)
        }
        events = [SecurityEvent(event: "login_success", ip: "demo", createdAt: .now)]
    }

    private func notAvailable(_ what: String) -> AppError {
        .notInDemo("\(what) is not available in demo mode. Sign out and connect to your server to use it.")
    }

    private var categoryIdsByName: [String: Int] {
        Dictionary(uniqueKeysWithValues: categoriesStore.map { ($0.name, $0.id) })
    }

    // MARK: - Auth

    func currentUser() async throws -> CurrentUser? {
        user
    }

    func login(email: String, password: String) async throws -> CurrentUser {
        user
    }

    func register(email: String, password: String) async throws -> CurrentUser {
        throw notAvailable("Sign up")
    }

    func registrationEnabled() async -> Bool {
        false
    }

    func logout() async {}

    func logoutAll() async throws {
        throw notAvailable("Signing out on all devices")
    }

    func changePassword(current: String, new: String) async throws {
        throw notAvailable("Changing the password")
    }

    // MARK: - Data

    func accounts() async throws -> [AccountSummary] {
        accountsStore
    }

    func categories() async throws -> [Category] {
        categoriesStore.sorted { $0.name < $1.name }
    }

    func transactions() async throws -> [Transaction] {
        transactionsStore
    }

    func setCategory(transactionId: Int, categoryId: Int) async throws {
        guard
            let index = transactionsStore.firstIndex(where: { $0.id == transactionId }),
            let category = categoriesStore.first(where: { $0.id == categoryId })
        else {
            throw AppError.server("Transaction or category not found")
        }

        transactionsStore[index].categoryName = category.name
        transactionsStore[index].categorySource = .manual

        // Like the backend: remember the choice for this merchant
        let transaction = transactionsStore[index]

        if transaction.type == .expense {
            try await addRule(merchant: transaction.title, categoryId: categoryId)
        }
    }

    func recategorizeAll() async throws -> Int {
        var updated = 0

        for index in transactionsStore.indices where transactionsStore[index].type == .expense {
            let key = transactionsStore[index].title.lowercased()

            guard
                let rule = rulesStore.first(where: { $0.merchant.lowercased() == key }),
                transactionsStore[index].categoryName != rule.categoryName
            else {
                continue
            }

            transactionsStore[index].categoryName = rule.categoryName
            updated += 1
        }

        return updated
    }

    // MARK: - Merchant rules

    func merchantRules() async throws -> [MerchantRule] {
        rulesStore.sorted { $0.merchant.lowercased() < $1.merchant.lowercased() }
    }

    func addRule(merchant: String, categoryId: Int) async throws {
        guard let category = categoriesStore.first(where: { $0.id == categoryId }) else {
            throw AppError.server("Category not found")
        }

        let name = merchant.trimmingCharacters(in: .whitespaces)

        if let index = rulesStore.firstIndex(where: { $0.merchant.lowercased() == name.lowercased() }) {
            rulesStore[index].merchant = name
            rulesStore[index].categoryId = category.id
            rulesStore[index].categoryName = category.name
        } else {
            rulesStore.append(MerchantRule(
                id: nextRuleId,
                merchant: name,
                categoryId: category.id,
                categoryName: category.name
            ))
            nextRuleId += 1
        }
    }

    func updateRule(id: Int, merchant: String, categoryId: Int) async throws {
        guard
            let index = rulesStore.firstIndex(where: { $0.id == id }),
            let category = categoriesStore.first(where: { $0.id == categoryId })
        else {
            throw AppError.server("Rule or category not found")
        }

        rulesStore[index].merchant = merchant.trimmingCharacters(in: .whitespaces)
        rulesStore[index].categoryId = category.id
        rulesStore[index].categoryName = category.name
    }

    func deleteRule(id: Int) async throws {
        rulesStore.removeAll { $0.id == id }
    }

    // MARK: - Reports

    func expenseReport(days: Int) async throws -> ExpenseReport {
        ReportBuilder.expenseReport(transactionsStore, days: days)
    }

    func summary() async throws -> SummaryReport {
        ReportBuilder.summary(transactionsStore)
    }

    func analytics(_ query: AnalyticsQuery) async throws -> AnalyticsReport {
        ReportBuilder.analytics(transactionsStore, query: query, categoryIds: categoryIdsByName)
    }

    // MARK: - Bank

    /// Pretends a new coffee purchase arrived from the bank
    func syncMonobank() async throws -> Int {
        try await Task.sleep(for: .seconds(1))

        let nextId = (transactionsStore.map(\.id).max() ?? 0) + 1

        transactionsStore.insert(Transaction(
            id: nextId,
            amount: -85,
            currency: "UAH",
            description: "Aroma Kava",
            merchant: "Aroma Kava",
            type: .expense,
            date: .now,
            categoryName: "Cafes & Restaurants"
        ), at: 0)

        if let index = accountsStore.firstIndex(where: { $0.currency == "UAH" }) {
            accountsStore[index].balance -= 85
        }

        return 1
    }

    // MARK: - Settings & account

    func settings() async throws -> UserSettings {
        UserSettings(
            email: user.email,
            role: user.role,
            monobankConnected: true,
            transferMarkers: transferMarkers,
            familyIncomeMarkers: familyIncomeMarkers
        )
    }

    func connectMonobank(token: String) async throws {
        throw notAvailable("Connecting a bank")
    }

    func disconnectMonobank() async throws {
        throw notAvailable("Disconnecting the bank")
    }

    func saveMarkers(transfer: String, familyIncome: String) async throws {
        transferMarkers = transfer
        familyIncomeMarkers = familyIncome
    }

    func securityLog() async throws -> [SecurityEvent] {
        events
    }

    func exportData() async throws -> Data {
        let formatter = ISO8601DateFormatter()

        let export: [String: Any] = [
            "exportedAt": formatter.string(from: .now),
            "note": "Demo data, invented",
            "accounts": accountsStore.map {
                ["name": $0.name, "currency": $0.currency, "balance": $0.balance] as [String: Any]
            },
            "transactions": transactionsStore.map {
                [
                    "id": $0.id,
                    "date": formatter.string(from: $0.date),
                    "amount": $0.amount,
                    "currency": $0.currency,
                    "merchant": $0.title,
                    "category": $0.categoryName ?? "Other",
                ] as [String: Any]
            },
            "merchantRules": rulesStore.map {
                ["merchant": $0.merchant, "category": $0.categoryName]
            },
        ]

        return try JSONSerialization.data(withJSONObject: export, options: [.prettyPrinted, .sortedKeys])
    }

    func deleteAccount(password: String) async throws {
        throw notAvailable("Deleting the account")
    }
}
