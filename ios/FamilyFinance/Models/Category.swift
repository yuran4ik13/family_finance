import Foundation

/// GET /api/categories
struct Category: Identifiable, Hashable, Decodable {
    let id: Int
    var name: String
}

/// "Always put this merchant into this category". GET /api/merchant-rules
struct MerchantRule: Identifiable, Hashable, Decodable {
    let id: Int
    var merchant: String
    var categoryId: Int
    var categoryName: String
}
