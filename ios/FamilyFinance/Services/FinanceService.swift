import Foundation

// =========================
// FINANCE SERVICE
// Everything the app can ask for. There are two implementations:
//   - APIClient:   talks to your real backend over the network
//   - DemoService: invented data inside the app, works offline
// Screens only know this protocol, so they work the same in both modes.
// =========================

protocol FinanceService: AnyObject {
    var isDemo: Bool { get }

    // Auth
    func currentUser() async throws -> CurrentUser?
    func login(email: String, password: String) async throws -> CurrentUser
    func register(email: String, password: String) async throws -> CurrentUser
    func registrationEnabled() async -> Bool
    func logout() async
    func logoutAll() async throws
    func changePassword(current: String, new: String) async throws

    // Data
    func accounts() async throws -> [AccountSummary]
    func categories() async throws -> [Category]
    func transactions() async throws -> [Transaction]
    func setCategory(transactionId: Int, categoryId: Int) async throws
    func recategorizeAll() async throws -> Int

    // Merchant rules
    func merchantRules() async throws -> [MerchantRule]
    func addRule(merchant: String, categoryId: Int) async throws
    func updateRule(id: Int, merchant: String, categoryId: Int) async throws
    func deleteRule(id: Int) async throws

    // Reports
    func expenseReport(days: Int) async throws -> ExpenseReport
    func summary() async throws -> SummaryReport
    func analytics(_ query: AnalyticsQuery) async throws -> AnalyticsReport

    // Bank
    /// Returns how many new transactions arrived
    func syncMonobank() async throws -> Int

    // Settings & account
    func settings() async throws -> UserSettings
    func connectMonobank(token: String) async throws
    func disconnectMonobank() async throws
    func saveMarkers(transfer: String, familyIncome: String) async throws
    func securityLog() async throws -> [SecurityEvent]
    func exportData() async throws -> Data
    func deleteAccount(password: String) async throws
}

/// Errors with a message that can be shown to the user
enum AppError: LocalizedError, Equatable {
    case invalidCredentials
    case unauthorized
    case network
    case notInDemo(String)
    case server(String)

    var errorDescription: String? {
        switch self {
        case .invalidCredentials:
            "Invalid email or password"
        case .unauthorized:
            "Your session has expired. Please sign in again."
        case .network:
            "Can't reach the server. Check the server address and that the backend is running."
        case .notInDemo(let message), .server(let message):
            message
        }
    }
}
