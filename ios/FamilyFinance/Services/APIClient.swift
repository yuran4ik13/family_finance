import Foundation

// =========================
// API CLIENT: talks to the family_finance backend
//
// Security:
//   - the login session (ff_session cookie) is stored in the Keychain,
//     bound to the server address, so it is never sent to another server
//   - the URLSession is "ephemeral": no cookies or responses are written to disk
//   - iOS (App Transport Security) only allows plain http:// for localhost and
//     local IP addresses. A real server must use https://
// =========================

final class APIClient: FinanceService {
    let baseURL: URL
    private let session: URLSession
    private let sessionStore: KeychainStore

    var isDemo: Bool { false }

    private static let cookieName = "ff_session"

    init(baseURL: URL) {
        self.baseURL = baseURL

        let configuration = URLSessionConfiguration.ephemeral
        // We handle the session cookie ourselves (Keychain), so URLSession
        // must not keep its own copy.
        configuration.httpShouldSetCookies = false
        configuration.httpCookieAcceptPolicy = .never
        configuration.urlCache = nil
        configuration.requestCachePolicy = .reloadIgnoringLocalCacheData
        configuration.timeoutIntervalForRequest = 30
        session = URLSession(configuration: configuration)

        sessionStore = KeychainStore(
            service: "FamilyFinance.session",
            account: baseURL.absoluteString
        )
    }

    // MARK: - Request helpers

    private func makeRequest(
        _ path: String,
        method: String = "GET",
        query: [URLQueryItem] = [],
        json: [String: Any]? = nil,
        timeout: TimeInterval = 30
    ) throws -> URLRequest {
        var url = baseURL.appending(path: path)

        if !query.isEmpty {
            url.append(queryItems: query)
        }

        var request = URLRequest(url: url, timeoutInterval: timeout)
        request.httpMethod = method
        request.setValue("application/json", forHTTPHeaderField: "Accept")

        if let json {
            request.httpBody = try JSONSerialization.data(withJSONObject: json)
            request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        }

        if let token = sessionStore.read() {
            request.setValue("\(Self.cookieName)=\(token)", forHTTPHeaderField: "Cookie")
        }

        return request
    }

    /// Sends a request and returns the body. Turns HTTP errors into AppError.
    @discardableResult
    private func send(_ request: URLRequest) async throws -> Data {
        let data: Data
        let response: URLResponse

        do {
            (data, response) = try await session.data(for: request)
        } catch let error as URLError where error.code == .cancelled {
            throw CancellationError()
        } catch {
            throw AppError.network
        }

        guard let http = response as? HTTPURLResponse else {
            throw AppError.network
        }

        rememberSession(from: http)

        switch http.statusCode {
        case 200...299:
            return data
        case 401:
            throw AppError.unauthorized
        default:
            throw AppError.server(
                Self.serverMessage(in: data) ?? "Server error (\(http.statusCode))"
            )
        }
    }

    private func get<T: Decodable>(
        _ path: String,
        query: [URLQueryItem] = []
    ) async throws -> T {
        let data = try await send(try makeRequest(path, query: query))
        return try decode(data)
    }

    private func decode<T: Decodable>(_ data: Data) throws -> T {
        do {
            return try JSON.decoder.decode(T.self, from: data)
        } catch {
            print("Decoding \(T.self) failed:", error)
            throw AppError.server("Unexpected response from the server")
        }
    }

    /// Saves (or removes) the session cookie the server sent
    private func rememberSession(from response: HTTPURLResponse) {
        var headers: [String: String] = [:]

        for (key, value) in response.allHeaderFields {
            if let key = key as? String, let value = value as? String {
                headers[key] = value
            }
        }

        let cookies = HTTPCookie.cookies(
            withResponseHeaderFields: headers,
            for: response.url ?? baseURL
        )

        guard let cookie = cookies.first(where: { $0.name == Self.cookieName }) else {
            return
        }

        let isExpired = cookie.expiresDate.map { $0 <= .now } ?? false

        if cookie.value.isEmpty || isExpired {
            sessionStore.delete()
        } else {
            sessionStore.save(cookie.value)
        }
    }

    /// The backend sends errors as { "message": "..." }
    private static func serverMessage(in data: Data) -> String? {
        guard
            let object = try? JSONSerialization.jsonObject(with: data) as? [String: Any],
            let message = object["message"] as? String
        else {
            return nil
        }

        return message
    }

    // MARK: - Auth

    func currentUser() async throws -> CurrentUser? {
        guard sessionStore.read() != nil else {
            return nil
        }

        do {
            return try await get("api/auth/me")
        } catch AppError.unauthorized {
            sessionStore.delete()
            return nil
        }
    }

    func login(email: String, password: String) async throws -> CurrentUser {
        let request = try makeRequest(
            "api/auth/login",
            method: "POST",
            json: ["email": email, "password": password]
        )

        do {
            return try decode(try await send(request))
        } catch AppError.unauthorized {
            throw AppError.invalidCredentials
        }
    }

    func register(email: String, password: String) async throws -> CurrentUser {
        let request = try makeRequest(
            "api/auth/register",
            method: "POST",
            json: ["email": email, "password": password]
        )

        return try decode(try await send(request))
    }

    func registrationEnabled() async -> Bool {
        struct AuthConfig: Decodable {
            let registrationEnabled: Bool
        }

        let config: AuthConfig? = try? await get("api/auth/config")
        return config?.registrationEnabled ?? false
    }

    func logout() async {
        if let request = try? makeRequest("api/auth/logout", method: "POST") {
            _ = try? await send(request)
        }

        sessionStore.delete()
    }

    func logoutAll() async throws {
        try await send(try makeRequest("api/auth/logout-all", method: "POST"))
        sessionStore.delete()
    }

    func changePassword(current: String, new: String) async throws {
        try await send(try makeRequest(
            "api/auth/change-password",
            method: "POST",
            json: ["currentPassword": current, "newPassword": new]
        ))
    }

    // MARK: - Data

    func accounts() async throws -> [AccountSummary] {
        try await get("api/accounts/summary")
    }

    func categories() async throws -> [Category] {
        try await get("api/categories")
    }

    func transactions() async throws -> [Transaction] {
        try await get("api/transactions/simple")
    }

    func setCategory(transactionId: Int, categoryId: Int) async throws {
        try await send(try makeRequest(
            "api/transactions/\(transactionId)",
            method: "PATCH",
            json: ["categoryId": categoryId]
        ))
    }

    func recategorizeAll() async throws -> Int {
        struct Result: Decodable {
            let updated: Int
        }

        let data = try await send(try makeRequest(
            "api/transactions/recategorize",
            method: "POST",
            timeout: 120
        ))
        let result: Result = try decode(data)
        return result.updated
    }

    // MARK: - Merchant rules

    func merchantRules() async throws -> [MerchantRule] {
        try await get("api/merchant-rules")
    }

    func addRule(merchant: String, categoryId: Int) async throws {
        try await send(try makeRequest(
            "api/merchant-rules",
            method: "POST",
            json: ["merchant": merchant, "categoryId": categoryId]
        ))
    }

    func updateRule(id: Int, merchant: String, categoryId: Int) async throws {
        try await send(try makeRequest(
            "api/merchant-rules/\(id)",
            method: "PATCH",
            json: ["merchant": merchant, "categoryId": categoryId]
        ))
    }

    func deleteRule(id: Int) async throws {
        try await send(try makeRequest("api/merchant-rules/\(id)", method: "DELETE"))
    }

    // MARK: - Reports

    func expenseReport(days: Int) async throws -> ExpenseReport {
        try await get(
            "api/reports/expenses",
            query: [URLQueryItem(name: "days", value: String(days))]
        )
    }

    func summary() async throws -> SummaryReport {
        try await get("api/reports/summary")
    }

    func analytics(_ query: AnalyticsQuery) async throws -> AnalyticsReport {
        try await get(
            "api/reports/analytics",
            query: [
                URLQueryItem(name: "from", value: query.from.dayKey),
                URLQueryItem(name: "to", value: query.to.dayKey),
                URLQueryItem(name: "currency", value: query.currency),
                URLQueryItem(name: "type", value: query.type.rawValue),
                URLQueryItem(name: "includeTransfers", value: query.includeTransfers ? "true" : "false"),
            ]
        )
    }

    // MARK: - Bank

    func syncMonobank() async throws -> Int {
        struct SyncResult: Decodable {
            let created: Int
        }

        // Monobank allows one request per minute, so a sync can take a few
        // minutes: long timeouts on purpose.
        try await send(try makeRequest(
            "api/monobank/sync-accounts",
            method: "POST",
            timeout: 300
        ))

        let data = try await send(try makeRequest(
            "api/monobank/sync-all-transactions",
            method: "POST",
            timeout: 900
        ))

        let result: SyncResult = try decode(data)
        return result.created
    }

    // MARK: - Settings & account

    func settings() async throws -> UserSettings {
        try await get("api/settings")
    }

    func connectMonobank(token: String) async throws {
        try await send(try makeRequest(
            "api/settings/monobank",
            method: "PUT",
            json: ["token": token],
            timeout: 120
        ))
    }

    func disconnectMonobank() async throws {
        try await send(try makeRequest("api/settings/monobank", method: "DELETE"))
    }

    func saveMarkers(transfer: String, familyIncome: String) async throws {
        try await send(try makeRequest(
            "api/settings/markers",
            method: "PATCH",
            json: ["transferMarkers": transfer, "familyIncomeMarkers": familyIncome]
        ))
    }

    func securityLog() async throws -> [SecurityEvent] {
        try await get("api/settings/security-log")
    }

    func exportData() async throws -> Data {
        try await send(try makeRequest("api/account/export"))
    }

    func deleteAccount(password: String) async throws {
        try await send(try makeRequest(
            "api/account",
            method: "DELETE",
            json: ["password": password, "confirm": "DELETE"]
        ))
        sessionStore.delete()
    }
}
