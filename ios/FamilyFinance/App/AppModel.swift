import Foundation
import Observation

// =========================
// APP MODEL: the "brain" of the app
// Holds who is signed in, which service is used (server or demo) and the
// loaded data. Screens read it with @Environment(AppModel.self) and update
// automatically when it changes (@Observable), like a global state in React.
// =========================

struct AppAlert: Identifiable {
    let id = UUID()
    var title: String
    var message: String
}

@Observable
final class AppModel {
    enum Phase: Equatable {
        case launching
        case signedOut
        case signedIn
    }

    var phase: Phase = .launching
    var user: CurrentUser?
    private(set) var service: any FinanceService
    private(set) var serverURLString: String

    // Loaded data
    var accounts: [AccountSummary] = []
    var categories: [Category] = []
    var transactions: [Transaction] = []
    var rules: [MerchantRule] = []
    var summary: SummaryReport?
    var bankConnected = false

    var isRefreshing = false
    var isSyncing = false
    var alert: AppAlert?

    /// Goes up after every data change, so screens with their own reports
    /// (Dashboard categories, Analytics) know they should reload
    private(set) var dataVersion = 0

    var isDemo: Bool {
        service.isDemo
    }

    var isReadOnly: Bool {
        user?.isReadOnly ?? false
    }

    static let defaultServer = "http://localhost:3000"
    private static let serverKey = "serverURL"

    init() {
        let saved = UserDefaults.standard.string(forKey: Self.serverKey) ?? Self.defaultServer
        serverURLString = saved
        service = Self.makeClient(saved)
    }

    private static func makeClient(_ address: String) -> APIClient {
        APIClient(baseURL: URL(string: address) ?? URL(string: defaultServer)!)
    }

    // MARK: - Start, sign in, sign out

    /// On app launch: is there a saved session for the server?
    func start() async {
        do {
            if let user = try await service.currentUser() {
                signedIn(as: user)
                await refresh()
            } else {
                phase = .signedOut
            }
        } catch {
            phase = .signedOut
        }
    }

    func signIn(email: String, password: String) async throws {
        let user = try await service.login(
            email: email.trimmingCharacters(in: .whitespaces),
            password: password
        )
        signedIn(as: user)
        await refresh()
    }

    func register(email: String, password: String) async throws {
        let user = try await service.register(
            email: email.trimmingCharacters(in: .whitespaces),
            password: password
        )
        signedIn(as: user)
        await refresh()
    }

    func startDemo() {
        service = DemoService()
        signedIn(as: CurrentUser(id: 0, email: "demo@familyfinance.app", role: "OWNER"))
        Task { await refresh() }
    }

    func signOut() async {
        await service.logout()
        signOutLocally()
    }

    func logoutEverywhere() async {
        do {
            try await service.logoutAll()
            signOutLocally()
        } catch {
            handle(error)
        }
    }

    func changePassword(current: String, new: String) async throws {
        try await service.changePassword(current: current, new: new)
    }

    func deleteAccount(password: String) async throws {
        try await service.deleteAccount(password: password)
        signOutLocally()
    }

    private func signedIn(as user: CurrentUser) {
        self.user = user
        phase = .signedIn
    }

    private func signOutLocally(message: String? = nil) {
        user = nil
        accounts = []
        categories = []
        transactions = []
        rules = []
        summary = nil
        bankConnected = false
        dataVersion += 1

        // Leaving demo mode -> back to the real server
        if service.isDemo {
            service = Self.makeClient(serverURLString)
        }

        phase = .signedOut

        if let message {
            alert = AppAlert(title: "Signed out", message: message)
        }
    }

    // MARK: - Server address

    /// Changes the backend address. Only http(s) addresses are accepted.
    func setServer(_ text: String) throws {
        let address = text.trimmingCharacters(in: .whitespacesAndNewlines)
            .trimmingCharacters(in: CharacterSet(charactersIn: "/"))

        guard
            let url = URL(string: address),
            let scheme = url.scheme?.lowercased(),
            scheme == "http" || scheme == "https",
            url.host() != nil
        else {
            throw AppError.server("Enter an address like http://localhost:3000 or https://your-domain.com")
        }

        serverURLString = address
        UserDefaults.standard.set(address, forKey: Self.serverKey)
        service = APIClient(baseURL: url)
    }

    // MARK: - Loading data

    func refresh() async {
        guard phase == .signedIn else {
            return
        }

        isRefreshing = true
        defer { isRefreshing = false }

        do {
            accounts = try await service.accounts()
            categories = try await service.categories()
            transactions = try await service.transactions()
            rules = try await service.merchantRules()
            summary = try await service.summary()
            bankConnected = (try? await service.settings().monobankConnected) ?? false
            dataVersion += 1
        } catch {
            handle(error)
        }
    }

    /// Runs a change, shows errors, then reloads data. Returns true on success.
    @discardableResult
    private func perform(_ action: () async throws -> Void) async -> Bool {
        do {
            try await action()
            await refresh()
            return true
        } catch {
            handle(error)
            return false
        }
    }

    func handle(_ error: Error) {
        if error is CancellationError {
            return
        }

        if let appError = error as? AppError, appError == .unauthorized {
            signOutLocally(message: appError.localizedDescription)
            return
        }

        alert = AppAlert(title: "Something went wrong", message: error.localizedDescription)
    }

    func notify(_ title: String, _ message: String) {
        alert = AppAlert(title: title, message: message)
    }

    // MARK: - Actions

    func setCategory(of transaction: Transaction, to categoryId: Int) async {
        await perform {
            try await service.setCategory(transactionId: transaction.id, categoryId: categoryId)
        }
    }

    @discardableResult
    func addRule(merchant: String, categoryId: Int) async -> Bool {
        await perform {
            try await service.addRule(merchant: merchant, categoryId: categoryId)
        }
    }

    @discardableResult
    func updateRule(id: Int, merchant: String, categoryId: Int) async -> Bool {
        await perform {
            try await service.updateRule(id: id, merchant: merchant, categoryId: categoryId)
        }
    }

    func deleteRule(id: Int) async {
        await perform {
            try await service.deleteRule(id: id)
        }
    }

    func recategorize() async {
        var updated = 0

        let success = await perform {
            updated = try await service.recategorizeAll()
        }

        if success {
            notify("Rules applied", "Updated transactions: \(updated)")
        }
    }

    func sync() async {
        guard !isSyncing else {
            return
        }

        isSyncing = true
        defer { isSyncing = false }

        do {
            let created = try await service.syncMonobank()
            await refresh()
            notify("Sync finished", created == 0 ? "Everything is up to date" : "New transactions: \(created)")
        } catch {
            handle(error)
        }
    }

    @discardableResult
    func connectMonobank(token: String) async -> Bool {
        await perform {
            try await service.connectMonobank(token: token)
        }
    }

    func disconnectMonobank() async {
        await perform {
            try await service.disconnectMonobank()
        }
    }

    @discardableResult
    func saveMarkers(transfer: String, familyIncome: String) async -> Bool {
        await perform {
            try await service.saveMarkers(transfer: transfer, familyIncome: familyIncome)
        }
    }

    // MARK: - Preview

    /// A demo model for Xcode previews (Canvas)
    static var preview: AppModel {
        let model = AppModel()
        model.startDemo()
        return model
    }
}
