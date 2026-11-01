import Foundation

/// A bank card / account with its balance. Same data as GET /api/accounts/summary.
struct AccountSummary: Identifiable, Hashable {
    let id: Int
    var name: String
    var accountType: String?
    var currency: String
    var balance: Double
    var bankName: String
}

extension AccountSummary: Decodable {
    private enum CodingKeys: String, CodingKey {
        case id, name, accountType, currency, balance, bank
    }

    private struct BankRef: Decodable {
        let name: String
    }

    init(from decoder: Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)

        id = try container.decode(Int.self, forKey: .id)
        name = try container.decode(String.self, forKey: .name)
        accountType = try container.decodeIfPresent(String.self, forKey: .accountType)
        currency = try container.decode(String.self, forKey: .currency)
        balance = try container.decodeNumber(forKey: .balance)
        bankName = try container.decodeIfPresent(BankRef.self, forKey: .bank)?.name ?? "Bank"
    }
}
