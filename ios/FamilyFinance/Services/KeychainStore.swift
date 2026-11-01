import Foundation
import Security

// =========================
// KEYCHAIN
// The safest place on iPhone for secrets. It's encrypted by the system
// and other apps can't read it.
// We keep the login session here (not in UserDefaults or a file).
//
// kSecAttrAccessibleWhenUnlockedThisDeviceOnly:
//   - readable only while the phone is unlocked
//   - never copied to iCloud backups or to another phone
// =========================

struct KeychainStore {
    let service: String
    let account: String

    private var baseQuery: [String: Any] {
        [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrService as String: service,
            kSecAttrAccount as String: account,
        ]
    }

    func save(_ value: String) {
        let attributes: [String: Any] = [
            kSecValueData as String: Data(value.utf8),
            kSecAttrAccessible as String: kSecAttrAccessibleWhenUnlockedThisDeviceOnly,
        ]

        let status = SecItemUpdate(baseQuery as CFDictionary, attributes as CFDictionary)

        if status == errSecItemNotFound {
            let newItem = baseQuery.merging(attributes) { _, new in new }
            SecItemAdd(newItem as CFDictionary, nil)
        }
    }

    func read() -> String? {
        var query = baseQuery
        query[kSecReturnData as String] = true
        query[kSecMatchLimit as String] = kSecMatchLimitOne

        var result: AnyObject?
        let status = SecItemCopyMatching(query as CFDictionary, &result)

        guard status == errSecSuccess, let data = result as? Data else {
            return nil
        }

        return String(data: data, encoding: .utf8)
    }

    func delete() {
        SecItemDelete(baseQuery as CFDictionary)
    }
}
