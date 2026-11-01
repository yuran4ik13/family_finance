import SwiftUI
import UIKit

// =========================
// THEME: colors and category icons in one place,
// so every screen looks the same. Light and dark mode work automatically:
// the system colors below change by themselves.
// =========================

extension Color {
    /// Grey page background (like the Settings app)
    static let appBackground = Color(uiColor: .systemGroupedBackground)
    /// White cards on the grey background (dark grey in dark mode)
    static let cardBackground = Color(uiColor: .secondarySystemGroupedBackground)

    static let income = Color.green
    static let expense = Color.red
    static let transfer = Color.gray
}

enum CategoryStyle {
    /// SF Symbol for a category. All names: free "SF Symbols" app from Apple.
    static func icon(for name: String?) -> String {
        switch name {
        case "Groceries": "cart.fill"
        case "Cafes & Restaurants": "fork.knife"
        case "Transport": "car.fill"
        case "Fuel": "fuelpump.fill"
        case "Subscriptions": "play.rectangle.fill"
        case "Utilities": "bolt.fill"
        case "Health": "cross.case.fill"
        case "Sports": "figure.run"
        case "Entertainment": "film.fill"
        case "Shopping & Home": "bag.fill"
        case "Charity & Donations": "heart.fill"
        case "Money Transfer": "arrow.left.arrow.right"
        case "Salary": "banknote.fill"
        case "Family Income": "person.2.fill"
        case "Refund": "arrow.uturn.backward"
        case "Other Income": "plus.circle.fill"
        default: "questionmark.circle.fill"
        }
    }

    static func color(for name: String?) -> Color {
        switch name {
        case "Groceries": .green
        case "Cafes & Restaurants": .orange
        case "Transport": .blue
        case "Fuel": .indigo
        case "Subscriptions": .purple
        case "Utilities": .yellow
        case "Health": .red
        case "Sports": .teal
        case "Entertainment": .pink
        case "Shopping & Home": .brown
        case "Charity & Donations": .mint
        case "Money Transfer": .gray
        case "Salary": .green
        case "Family Income": .cyan
        case "Refund": .blue
        case "Other Income": .green
        default: .gray
        }
    }
}

/// Background gradient for a bank card, by currency
enum CardStyle {
    static func gradient(for currency: String) -> LinearGradient {
        let colors: [Color] = switch currency {
        case "EUR": [.blue, .teal]
        case "USD": [.green, .mint]
        default: [.indigo, .purple]
        }

        return LinearGradient(colors: colors, startPoint: .topLeading, endPoint: .bottomTrailing)
    }
}
