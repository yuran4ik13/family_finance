import Foundation

enum TransactionType: String, Codable, CaseIterable, Hashable {
    case income = "INCOME"
    case expense = "EXPENSE"
    case transfer = "TRANSFER"
}

/// Who chose the category: the app (AUTO) or the user (MANUAL)
enum CategorySource: String, Codable, Hashable {
    case auto = "AUTO"
    case manual = "MANUAL"
}

/// One bank operation. Same data as GET /api/transactions/simple.
struct Transaction: Identifiable, Hashable {
    let id: Int
    var amount: Double
    var currency: String
    var description: String?
    var merchant: String?
    var type: TransactionType
    var date: Date
    var categoryName: String?
    var categorySource: CategorySource = .auto

    /// What to show as the name: merchant, or description, or "Unknown"
    var title: String {
        merchant?.nilIfBlank ?? description?.nilIfBlank ?? "Unknown"
    }

    /// Transfers between your own cards are not income and not expenses
    var isTransfer: Bool {
        type == .transfer || categoryName == "Money Transfer"
    }
}

// The decoding lives in an extension on purpose: if `init(from:)` were
// inside the struct, Swift would remove the automatic
// `Transaction(id:amount:...)` initializer that the demo data uses.
extension Transaction: Decodable {
    private enum CodingKeys: String, CodingKey {
        case id, amount, currency, description, merchant, type, date, category, categorySource
    }

    /// The backend sends the category as an object: { "name": "Groceries" }
    private struct CategoryRef: Decodable {
        let name: String
    }

    init(from decoder: Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)

        id = try container.decode(Int.self, forKey: .id)
        amount = try container.decodeNumber(forKey: .amount)
        currency = try container.decode(String.self, forKey: .currency)
        description = try container.decodeIfPresent(String.self, forKey: .description)
        merchant = try container.decodeIfPresent(String.self, forKey: .merchant)
        type = (try? container.decode(TransactionType.self, forKey: .type))
            ?? (amount >= 0 ? .income : .expense)
        date = try container.decode(Date.self, forKey: .date)
        categoryName = try container.decodeIfPresent(CategoryRef.self, forKey: .category)?.name
        categorySource = (try? container.decode(CategorySource.self, forKey: .categorySource)) ?? .auto
    }
}
