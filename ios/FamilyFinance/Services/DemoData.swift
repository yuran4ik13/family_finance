import Foundation

// =========================
// DEMO DATA
// Invented family, cards and ~90 days of transactions.
// The same generator as backend/scripts/seed-demo.ts, so the app and the
// website demo look alike. Nothing here is real.
// =========================

enum DemoData {
    static let categoryNames = [
        "Groceries",
        "Cafes & Restaurants",
        "Transport",
        "Fuel",
        "Subscriptions",
        "Utilities",
        "Health",
        "Sports",
        "Entertainment",
        "Shopping & Home",
        "Charity & Donations",
        "Money Transfer",
        "Salary",
        "Family Income",
        "Refund",
        "Other Income",
        "Other",
    ]

    /// merchant, category, min amount, max amount, times per month
    private static let expenses: [(String, String, Double, Double, Double)] = [
        ("Silpo", "Groceries", 250, 1400, 9),
        ("ATB", "Groceries", 120, 650, 7),
        ("Novus", "Groceries", 300, 1100, 3),
        ("Aroma Kava", "Cafes & Restaurants", 70, 180, 8),
        ("Puzata Hata", "Cafes & Restaurants", 180, 420, 4),
        ("Glovo", "Cafes & Restaurants", 250, 650, 3),
        ("Uklon", "Transport", 90, 320, 6),
        ("Bolt", "Transport", 80, 260, 4),
        ("OKKO", "Fuel", 900, 1900, 3),
        ("WOG", "Fuel", 800, 1700, 2),
        ("Apteka ANC", "Health", 120, 900, 2),
        ("Sport Life", "Sports", 900, 900, 1),
        ("Multiplex", "Entertainment", 220, 480, 1),
        ("Rozetka", "Shopping & Home", 300, 3500, 2),
        ("Epicentr", "Shopping & Home", 400, 2500, 1),
    ]

    /// merchant, amount, day of month
    private static let subscriptions: [(String, Double, Int)] = [
        ("Netflix", 299, 5),
        ("Spotify", 169, 12),
        ("Google One", 89, 20),
        ("Kyivstar", 250, 3),
    ]

    private static let utilities: [(String, Double, Int)] = [
        ("Kyivteploenergo", 1850, 10),
        ("YASNO electricity", 980, 11),
        ("Kyivvodokanal", 420, 12),
    ]

    /// Always gives the same "random" numbers, so the demo looks the same every time
    private struct SeededRandom {
        var seed: UInt64 = 42

        mutating func next() -> Double {
            seed = (seed &* 1_664_525 &+ 1_013_904_223) % 4_294_967_296
            return Double(seed) / 4_294_967_296
        }

        mutating func between(_ min: Double, _ max: Double) -> Double {
            ((min + next() * (max - min)) * 100).rounded() / 100
        }
    }

    static func make() -> (accounts: [AccountSummary], transactions: [Transaction]) {
        let accounts = [
            AccountSummary(id: 1, name: "Monobank Black UAH", accountType: "black", currency: "UAH", balance: 48250.40, bankName: "Monobank"),
            AccountSummary(id: 2, name: "Monobank Black EUR", accountType: "black", currency: "EUR", balance: 1320.75, bankName: "Monobank"),
            AccountSummary(id: 3, name: "Monobank Black USD", accountType: "black", currency: "USD", balance: 860.00, bankName: "Monobank"),
        ]

        var random = SeededRandom()
        var transactions: [Transaction] = []
        var nextId = 1

        func add(_ amount: Double, _ merchant: String, _ category: String, currency: String = "UAH", daysAgo: Int, hour: Int) {
            let minute = Int(random.next() * 60)

            transactions.append(Transaction(
                id: nextId,
                amount: amount,
                currency: currency,
                description: merchant,
                merchant: merchant,
                type: amount >= 0 ? .income : .expense,
                date: .daysAgo(daysAgo, hour: hour, minute: minute),
                categoryName: category
            ))

            nextId += 1
        }

        for day in 0..<90 {
            for (merchant, category, min, max, perMonth) in expenses where random.next() < perMonth / 30 {
                let hour = 8 + Int(random.next() * 13)
                add(-random.between(min, max), merchant, category, daysAgo: day, hour: hour)
            }
        }

        for month in 0..<3 {
            for (merchant, amount, dayOfMonth) in subscriptions {
                add(-amount, merchant, "Subscriptions", daysAgo: month * 30 + (30 - dayOfMonth), hour: 9)
            }

            for (merchant, amount, dayOfMonth) in utilities {
                add(-random.between(amount * 0.85, amount * 1.15), merchant, "Utilities", daysAgo: month * 30 + (30 - dayOfMonth), hour: 11)
            }

            add(42000, "Demo Company LLC", "Salary", daysAgo: month * 30 + 25, hour: 10)
            add(5000, "Maria Demo", "Family Income", daysAgo: month * 30 + 12, hour: 18)
            add(-100, "Come Back Alive", "Charity & Donations", daysAgo: month * 30 + 8, hour: 20)
            add(-8000, "Transfer to EUR card", "Money Transfer", daysAgo: month * 30 + 20, hour: 12)
            add(180, "Transfer from UAH card", "Money Transfer", currency: "EUR", daysAgo: month * 30 + 20, hour: 12)
            add(-random.between(20, 90), "Booking.com", "Entertainment", currency: "EUR", daysAgo: month * 30 + 15, hour: 14)
        }

        add(349, "Rozetka refund", "Refund", daysAgo: 17, hour: 13)

        // Newest first, like the backend
        transactions.sort { $0.date > $1.date }

        return (accounts, transactions)
    }
}
