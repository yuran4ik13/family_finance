import Foundation
import LocalAuthentication

// =========================
// FACE ID / TOUCH ID
// .deviceOwnerAuthentication = Face ID, and if it fails, the phone passcode.
// =========================

enum BiometricAuth {
    /// true if the phone has Face ID / Touch ID or at least a passcode
    static var isAvailable: Bool {
        LAContext().canEvaluatePolicy(.deviceOwnerAuthentication, error: nil)
    }

    static func authenticate(reason: String) async -> Bool {
        let context = LAContext()

        // No Face ID and no passcode on this phone: nothing to check with,
        // don't lock the user out of their own app.
        guard context.canEvaluatePolicy(.deviceOwnerAuthentication, error: nil) else {
            return true
        }

        do {
            return try await context.evaluatePolicy(
                .deviceOwnerAuthentication,
                localizedReason: reason
            )
        } catch {
            return false
        }
    }
}
