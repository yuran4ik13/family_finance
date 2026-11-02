import SwiftUI
import UIKit

// =========================
// THEME: "dark fintech" design system
// Near-black ground, layered surfaces, one violet accent.
// Green only for money coming in, coral only for errors and danger.
// Same values as the "Design system" board of the design canvas.
// =========================

extension Color {
    /// Color from a hex number: Color(hex: 0x8C7BFF)
    init(hex: UInt32, opacity: Double = 1) {
        self.init(
            .sRGB,
            red: Double((hex >> 16) & 0xFF) / 255,
            green: Double((hex >> 8) & 0xFF) / 255,
            blue: Double(hex & 0xFF) / 255,
            opacity: opacity
        )
    }

    /// Screen background
    static let appBackground = Color(hex: 0x0A0A0F)
    /// Cards and panels
    static let cardBackground = Color(hex: 0x15151D)
    /// Inputs, chips, things on top of a card
    static let raised = Color(hex: 0x1E1E29)
    /// Borders and thin dividers
    static let line = Color(hex: 0x2A2A38)
    static let divider = Color(hex: 0x22222E)

    static let textPrimary = Color(hex: 0xF4F4F8)
    static let textSecondary = Color(hex: 0xA1A1B5)
    static let textFaint = Color(hex: 0x6B6B80)

    static let brand = Color(hex: 0x8C7BFF)
    static let brandSoft = Color(hex: 0xC9C0FF)

    static let income = Color(hex: 0x34D399)
    /// Expenses are shown in the normal text color, so the screen
    /// doesn't look alarming. This is for errors and dangerous actions.
    static let danger = Color(hex: 0xFF8A7A)
    static let expense = Color(hex: 0xFF8A7A)
    static let transfer = Color(hex: 0x9CA3AF)
    static let warning = Color(hex: 0xFBBF24)
}

enum CategoryStyle {
    /// SF Symbol for a category. All names: free "SF Symbols" app from Apple.
    static func icon(for name: String?) -> String {
        switch name {
        case "Groceries": "cart.fill"
        case "Cafes & Restaurants": "cup.and.saucer.fill"
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
        case "Groceries": Color(hex: 0x34D399)
        case "Cafes & Restaurants": Color(hex: 0xFB923C)
        case "Transport": Color(hex: 0x60A5FA)
        case "Fuel": Color(hex: 0x818CF8)
        case "Subscriptions": Color(hex: 0xA78BFA)
        case "Utilities": Color(hex: 0xFBBF24)
        case "Health": Color(hex: 0xF87171)
        case "Sports": Color(hex: 0x2DD4BF)
        case "Entertainment": Color(hex: 0xF472B6)
        case "Shopping & Home": Color(hex: 0xD6A26B)
        case "Charity & Donations": Color(hex: 0x5EEAD4)
        case "Money Transfer": Color(hex: 0x9CA3AF)
        case "Salary": Color(hex: 0x34D399)
        case "Family Income": Color(hex: 0x22D3EE)
        case "Refund": Color(hex: 0x60A5FA)
        case "Other Income": Color(hex: 0x34D399)
        default: Color(hex: 0x9CA3AF)
        }
    }
}

/// Look of a bank card, by currency and card type
enum CardStyle {
    static func gradient(for account: AccountSummary) -> LinearGradient {
        let colors: [Color]

        if account.accountType == "white" {
            colors = [Color(hex: 0xF1F1F6), Color(hex: 0xC9CCE0)]
        } else {
            switch account.currency {
            case "EUR": colors = [Color(hex: 0x2563EB), Color(hex: 0x06B6D4)]
            case "USD": colors = [Color(hex: 0x047857), Color(hex: 0x10B981)]
            default: colors = [Color(hex: 0x6E5BFF), Color(hex: 0xA24BFF)]
            }
        }

        return LinearGradient(colors: colors, startPoint: .topLeading, endPoint: .bottomTrailing)
    }

    /// Light cards need dark text
    static func foreground(for account: AccountSummary) -> Color {
        account.accountType == "white" ? Color(hex: 0x14141B) : .white
    }

    static var brandGradient: LinearGradient {
        LinearGradient(
            colors: [Color(hex: 0x6E5BFF), Color(hex: 0xA24BFF)],
            startPoint: .topLeading,
            endPoint: .bottomTrailing
        )
    }
}

/// Short card name for chips: "Black ₴", "White ₴", "Black €"
extension AccountSummary {
    var shortName: String {
        let type = (accountType ?? "").capitalized
        let symbol = switch currency {
        case "UAH": "₴"
        case "EUR": "€"
        case "USD": "$"
        default: currency
        }

        return type.isEmpty ? name : "\(type) \(symbol)"
    }
}

/// Money formatting the same way everywhere: "₴1,286.40"
enum Money {
    static func symbol(_ currency: String) -> String {
        switch currency {
        case "UAH": "₴"
        case "EUR": "€"
        case "USD": "$"
        default: currency + " "
        }
    }

    static func format(_ amount: Double, currency: String, sign: Bool = false, decimals: Bool = true) -> String {
        let number = abs(amount).formatted(
            .number
                .precision(.fractionLength(decimals ? 2 : 0))
                .grouping(.automatic)
                .locale(Locale(identifier: "en_US"))
        )

        let prefix: String
        if amount < 0 {
            prefix = "−"
        } else if sign && amount > 0 {
            prefix = "+"
        } else {
            prefix = ""
        }

        return prefix + symbol(currency) + number
    }
}
