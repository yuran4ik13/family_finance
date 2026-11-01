import Foundation
import SwiftUI

// =========================
// SMALL REUSABLE PIECES (like components in React)
// =========================

/// Round coloured icon of a category
struct CategoryIcon: View {
    let name: String?
    var size: CGFloat = 36

    var body: some View {
        let color = CategoryStyle.color(for: name)

        Image(systemName: CategoryStyle.icon(for: name))
            .font(.system(size: size * 0.42, weight: .semibold))
            .foregroundStyle(color)
            .frame(width: size, height: size)
            .background(color.opacity(0.15), in: Circle())
    }
}

/// Money with a colour: expenses red, income green, transfers grey
struct AmountText: View {
    let amount: Double
    let currency: String
    var isTransfer = false

    private var color: Color {
        if isTransfer {
            return .transfer
        }

        return amount < 0 ? .expense : .income
    }

    var body: some View {
        Text(amount, format: .currency(code: currency))
            .monospacedDigit()
            .foregroundStyle(color)
    }
}

/// One line in a list of transactions
struct TransactionRow: View {
    let transaction: Transaction

    var body: some View {
        HStack(spacing: 12) {
            CategoryIcon(name: transaction.categoryName)

            VStack(alignment: .leading, spacing: 2) {
                Text(transaction.title)
                    .font(.body.weight(.medium))
                    .lineLimit(1)

                HStack(spacing: 4) {
                    Text(transaction.categoryName ?? "Other")

                    if transaction.categorySource == .manual {
                        Image(systemName: "hand.point.up.left.fill")
                            .accessibilityLabel("Chosen by you")
                    }
                }
                .font(.caption)
                .foregroundStyle(.secondary)
            }

            Spacer(minLength: 8)

            VStack(alignment: .trailing, spacing: 2) {
                AmountText(
                    amount: transaction.amount,
                    currency: transaction.currency,
                    isTransfer: transaction.isTransfer
                )
                .font(.body.weight(.semibold))

                Text(transaction.date, format: .dateTime.hour().minute())
                    .font(.caption)
                    .foregroundStyle(.secondary)
            }
        }
        .contentShape(Rectangle())
    }
}

/// White rounded block with an optional title
struct Card<Content: View>: View {
    let title: String?
    let content: Content

    init(_ title: String? = nil, @ViewBuilder content: () -> Content) {
        self.title = title
        self.content = content()
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            if let title {
                Text(title)
                    .font(.headline)
            }

            content
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding()
        .background(Color.cardBackground, in: RoundedRectangle(cornerRadius: 16))
    }
}

/// Small block with a title and a big number
struct StatCard: View {
    let title: String
    let value: Text
    var tint: Color = .primary
    var subtitle: String?
    var subtitleColor: Color = .secondary

    var body: some View {
        VStack(alignment: .leading, spacing: 6) {
            Text(title)
                .font(.subheadline)
                .foregroundStyle(.secondary)

            value
                .font(.title3.bold())
                .monospacedDigit()
                .foregroundStyle(tint)
                .lineLimit(1)
                .minimumScaleFactor(0.5)

            if let subtitle {
                Text(subtitle)
                    .font(.caption)
                    .foregroundStyle(subtitleColor)
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding()
        .background(Color.cardBackground, in: RoundedRectangle(cornerRadius: 16))
    }
}

/// Yellow strip that says the data is invented
struct DemoBanner: View {
    var body: some View {
        Label("Demo mode: invented data, works offline", systemImage: "sparkles")
            .font(.footnote.weight(.medium))
            .frame(maxWidth: .infinity)
            .padding(10)
            .background(Color.yellow.opacity(0.2), in: RoundedRectangle(cornerRadius: 12))
    }
}

/// Bank card with balance
struct AccountCard: View {
    let account: AccountSummary

    var body: some View {
        VStack(alignment: .leading, spacing: 6) {
            HStack {
                Text(account.bankName)
                    .font(.caption.weight(.semibold))
                    .foregroundStyle(.white.opacity(0.85))

                Spacer()

                Text(account.currency)
                    .font(.caption2.bold())
                    .foregroundStyle(.white)
                    .padding(.horizontal, 8)
                    .padding(.vertical, 3)
                    .background(.white.opacity(0.2), in: Capsule())
            }

            Spacer()

            Text(account.balance, format: .currency(code: account.currency))
                .font(.title2.bold())
                .monospacedDigit()
                .foregroundStyle(.white)
                .lineLimit(1)
                .minimumScaleFactor(0.5)

            Text(account.name)
                .font(.caption)
                .foregroundStyle(.white.opacity(0.85))
                .lineLimit(1)
        }
        .padding()
        .frame(width: 230, height: 130)
        .background(CardStyle.gradient(for: account.currency), in: RoundedRectangle(cornerRadius: 20))
    }
}

/// "+4.2% vs previous" text and its colour
enum ChangeLabel {
    static func make(_ change: Double?, increaseIsGood: Bool) -> (text: String, color: Color) {
        guard let change else {
            return ("Nothing to compare with", .secondary)
        }

        if change == 0 {
            return ("Same as before", .secondary)
        }

        let arrow = change > 0 ? "▲" : "▼"
        let isGood = (change > 0) == increaseIsGood
        let percent = abs(change).formatted(.number.precision(.fractionLength(0...1)))

        return ("\(arrow) \(percent)% vs previous", isGood ? .income : .expense)
    }
}
