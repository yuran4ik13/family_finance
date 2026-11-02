import Foundation

/// GET /api/auth/me
struct CurrentUser: Decodable, Hashable {
    let id: Int
    let email: String
    let role: String

    /// The DEMO role on the server can look but not change anything
    var isReadOnly: Bool {
        role == "DEMO"
    }
}

/// GET /api/settings
struct UserSettings: Decodable, Hashable {
    var email: String
    var role: String
    var monobankConnected: Bool
    var transferMarkers: String
    var familyIncomeMarkers: String
}

/// One line of the security log: GET /api/settings/security-log
struct SecurityEvent: Decodable, Identifiable, Hashable {
    var event: String
    var ip: String?
    var createdAt: Date

    var id: String {
        "\(createdAt.timeIntervalSince1970)-\(event)"
    }

    var title: String {
        switch event {
        case "register": "Account created"
        case "login_success": "Signed in"
        case "login_failed": "Failed sign-in attempt"
        case "logout_all": "Signed out on all devices"
        case "password_changed": "Password changed"
        case "monobank_connected": "Monobank connected"
        case "monobank_removed": "Monobank disconnected"
        case "data_exported": "Data downloaded"
        default: event
        }
    }

    var isWarning: Bool {
        event == "login_failed"
    }
}
