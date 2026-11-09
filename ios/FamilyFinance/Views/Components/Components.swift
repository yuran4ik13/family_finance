import Foundation
import SwiftUI

// =========================
// SMALL REUSABLE PIECES (like components in React)
// They follow the design canvas: dark surfaces, rounded corners,
// big tabular numbers.
// =========================

/// Coloured category icon on a soft tint (circle or rounded square)
struct CategoryIcon: View {
    let name: String?
    var size: CGFloat = 40
    var circle = true

    var body: some View {
        let color = CategoryStyle.color(for: name)

        Image(systemName: CategoryStyle.icon(for: name))
            .font(.system(size: size * 0.42, weight: .semibold))
            .foregroundStyle(color)
            .frame(width: size, height: size)
            .background(
                color.opacity(0.14),
                in: RoundedRectangle(cornerRadius: circle ? size / 2 : size * 0.3, style: .continuous)
            )
            .accessibilityHidden(true)
    }
}

/// Money that hides when "Hide balances" is on, and rolls to new values
struct MoneyText: View {
    let amount: Double
    let currency: String
    var sign = false
    var decimals = true

    @AppStorage("hideBalances") private var isHidden = false

    var body: some View {
        Text(isHidden ? "••••" : Money.format(amount, currency: currency, sign: sign, decimals: decimals))
            .monospacedDigit()
            .rollingNumber(amount)
            .accessibilityLabel(isHidden ? "Hidden amount" : Money.format(amount, currency: currency, sign: sign))
    }
}

/// Amount of a transaction: income green with "+", expenses in normal
/// text colour, transfers between own cards grey
struct AmountText: View {
    let amount: Double
    let currency: String
    var isTransfer = false

    private var color: Color {
        if isTransfer {
            return .transfer
        }

        return amount > 0 ? .income : .textPrimary
    }

    var body: some View {
        MoneyText(amount: amount, currency: currency, sign: true)
            .foregroundStyle(color)
    }
}

/// One line in a list of transactions
struct TransactionRow: View {
    let transaction: Transaction

    var body: some View {
        HStack(spacing: 12) {
            CategoryIcon(name: transaction.categoryName, size: 44)

            VStack(alignment: .leading, spacing: 3) {
                Text(transaction.title)
                    .font(.system(size: 15, weight: .semibold))
                    .foregroundStyle(Color.textPrimary)
                    .lineLimit(1)

                HStack(spacing: 4) {
                    Text(transaction.isTransfer ? "Between my cards" : (transaction.categoryName ?? "Other"))

                    if transaction.categorySource == .manual {
                        Image(systemName: "hand.point.up.left.fill")
                            .font(.system(size: 10))
                            .accessibilityLabel("Chosen by you")
                    }
                }
                .font(.system(size: 13))
                .foregroundStyle(Color.textSecondary)
                .lineLimit(1)
            }

            Spacer(minLength: 8)

            VStack(alignment: .trailing, spacing: 3) {
                AmountText(
                    amount: transaction.amount,
                    currency: transaction.currency,
                    isTransfer: transaction.isTransfer
                )
                .font(.system(size: 15, weight: .semibold))

                Text(transaction.date, format: .dateTime.hour().minute())
                    .font(.system(size: 12))
                    .foregroundStyle(Color.textSecondary)
            }
        }
        .padding(.vertical, 10)
        .contentShape(Rectangle())
    }
}

/// Dark rounded panel with an optional title and action
struct Card<Content: View>: View {
    let title: String?
    var actionTitle: String?
    var action: (() -> Void)?
    let content: Content

    init(
        _ title: String? = nil,
        actionTitle: String? = nil,
        action: (() -> Void)? = nil,
        @ViewBuilder content: () -> Content
    ) {
        self.title = title
        self.actionTitle = actionTitle
        self.action = action
        self.content = content()
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 14) {
            if let title {
                HStack {
                    Text(title)
                        .font(.system(size: 17, weight: .bold))
                        .foregroundStyle(Color.textPrimary)

                    Spacer()

                    if let actionTitle, let action {
                        Button(actionTitle, action: action)
                            .font(.system(size: 14, weight: .medium))
                            .foregroundStyle(Color.brandSoft)
                    }
                }
            }

            content
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(16)
        .background(Color.cardBackground, in: RoundedRectangle(cornerRadius: 20, style: .continuous))
    }
}

/// Small block with a title, a big number and a note
struct StatCard: View {
    let title: String
    let value: Text
    var tint: Color = .textPrimary
    var subtitle: String?
    var subtitleColor: Color = .textSecondary
    var icon: String?
    var iconColor: Color = .brand

    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            HStack(spacing: 8) {
                if let icon {
                    Image(systemName: icon)
                        .font(.system(size: 12, weight: .bold))
                        .foregroundStyle(iconColor)
                        .frame(width: 28, height: 28)
                        .background(iconColor.opacity(0.14), in: Circle())
                }

                Text(title)
                    .font(.system(size: 14))
                    .foregroundStyle(Color.textSecondary)
            }

            value
                .font(.system(size: 22, weight: .bold))
                .monospacedDigit()
                .foregroundStyle(tint)
                .lineLimit(1)
                .minimumScaleFactor(0.5)

            if let subtitle {
                Text(subtitle)
                    .font(.system(size: 12))
                    .foregroundStyle(subtitleColor)
                    .lineLimit(2)
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(16)
        .background(Color.cardBackground, in: RoundedRectangle(cornerRadius: 20, style: .continuous))
    }
}

/// Strip that says the data is invented
struct DemoBanner: View {
    var body: some View {
        Label("Demo mode · invented data, works offline", systemImage: "sparkles")
            .font(.system(size: 13, weight: .medium))
            .foregroundStyle(Color.warning)
            .frame(maxWidth: .infinity)
            .padding(10)
            .background(Color.warning.opacity(0.12), in: RoundedRectangle(cornerRadius: 12, style: .continuous))
    }
}

/// Bank card with balance, like on the design canvas
struct AccountCard: View {
    let account: AccountSummary
    var isSelected = false
    var isDimmed = false

    var body: some View {
        let foreground = CardStyle.foreground(for: account)

        VStack(alignment: .leading) {
            HStack {
                Text(account.bankName.lowercased())
                    .font(.system(size: 15, weight: .bold))

                Spacer()

                Text("\((account.accountType ?? "card").capitalized) · \(account.currency)")
                    .font(.system(size: 12, weight: .semibold))
                    .padding(.horizontal, 8)
                    .padding(.vertical, 4)
                    .background(foreground.opacity(0.16), in: RoundedRectangle(cornerRadius: 8, style: .continuous))
            }

            Spacer()

            MoneyText(amount: account.balance, currency: account.currency)
                .font(.system(size: 26, weight: .heavy))
                .lineLimit(1)
                .minimumScaleFactor(0.5)

            Text(account.name)
                .font(.system(size: 13))
                .opacity(0.8)
                .lineLimit(1)
        }
        .foregroundStyle(foreground)
        .padding(.horizontal, 20)
        .padding(.vertical, 18)
        .frame(width: 280, height: 168)
        .background(CardStyle.gradient(for: account))
        .shine()
        .clipShape(RoundedRectangle(cornerRadius: 24, style: .continuous))
        .overlay {
            RoundedRectangle(cornerRadius: 24, style: .continuous)
                .strokeBorder(.white.opacity(isSelected ? 0.9 : 0), lineWidth: 2.5)
        }
        .scaleEffect(isDimmed ? 0.95 : 1)
        .opacity(isDimmed ? 0.45 : 1)
        .animation(Motion.spring, value: isSelected)
        .animation(Motion.spring, value: isDimmed)
    }
}

/// Round pill: "All accounts", "Black ₴", "30 days"…
struct Chip: View {
    let title: String
    var icon: String?
    var isOn = false
    /// Filter chips that are active look violet instead of white
    var isFilter = false

    var body: some View {
        HStack(spacing: 6) {
            if let icon {
                Image(systemName: icon)
                    .font(.system(size: 12, weight: .semibold))
            }

            Text(title)
                .lineLimit(1)
        }
        .font(.system(size: 14, weight: isOn ? .semibold : .medium))
        .foregroundStyle(foreground)
        .padding(.horizontal, 14)
        .frame(height: 36)
        .background(background, in: Capsule())
        .overlay {
            Capsule().strokeBorder(Color.line, lineWidth: isOn ? 0 : 1)
        }
        .animation(Motion.snappy, value: isOn)
    }

    private var foreground: Color {
        if !isOn {
            return .textPrimary
        }

        return isFilter ? .brandSoft : .appBackground
    }

    private var background: Color {
        if !isOn {
            return .cardBackground
        }

        return isFilter ? Color.brand.opacity(0.18) : .textPrimary
    }
}

/// Segmented control whose highlight slides to the chosen item
struct PillPicker<Item: Hashable>: View {
    let items: [Item]
    @Binding var selection: Item
    let title: (Item) -> String

    @Namespace private var namespace

    var body: some View {
        HStack(spacing: 4) {
            ForEach(items, id: \.self) { item in
                let isSelected = item == selection

                Button {
                    withAnimation(Motion.spring) {
                        selection = item
                    }
                } label: {
                    Text(title(item))
                        .font(.system(size: 14, weight: isSelected ? .semibold : .medium))
                        .foregroundStyle(isSelected ? Color.textPrimary : Color.textSecondary)
                        .frame(maxWidth: .infinity)
                        .frame(height: 34)
                        .background {
                            if isSelected {
                                RoundedRectangle(cornerRadius: 10, style: .continuous)
                                    .fill(Color.line)
                                    .matchedGeometryEffect(id: "pill", in: namespace)
                            }
                        }
                        .contentShape(Rectangle())
                }
                .buttonStyle(.plain)
                .accessibilityAddTraits(isSelected ? .isSelected : [])
            }
        }
        .padding(4)
        .background(Color.cardBackground, in: RoundedRectangle(cornerRadius: 14, style: .continuous))
        .sensoryFeedback(.selection, trigger: selection)
    }
}

/// Bar that grows from the left when it appears
struct GrowingBar: View {
    let fraction: Double
    var color: Color = .brand
    var height: CGFloat = 8
    var delay: Double = 0.2

    @State private var isShown = false
    @Environment(\.accessibilityReduceMotion) private var reduceMotion

    var body: some View {
        GeometryReader { proxy in
            ZStack(alignment: .leading) {
                Capsule().fill(Color.line)

                Capsule()
                    .fill(color)
                    .frame(width: proxy.size.width * min(max(fraction, 0), 1) * (isShown ? 1 : 0))
            }
        }
        .frame(height: height)
        .animation(Motion.grow, value: fraction)
        .onAppear {
            if reduceMotion {
                isShown = true
            } else {
                withAnimation(Motion.grow.delay(delay)) {
                    isShown = true
                }
            }
        }
    }
}

/// "▲ 4% vs previous" text and its colour
enum ChangeLabel {
    static func make(_ change: Double?, increaseIsGood: Bool) -> (text: String, color: Color) {
        guard let change else {
            return ("Nothing to compare with", .textSecondary)
        }

        if change == 0 {
            return ("Same as before", .textSecondary)
        }

        let arrow = change > 0 ? "▲" : "▼"
        let isGood = (change > 0) == increaseIsGood
        let percent = abs(change).formatted(.number.precision(.fractionLength(0)))

        return ("\(arrow) \(percent)% vs previous", isGood ? .income : .danger)
    }
}

extension View {
    /// Dark background for Form / List screens
    func themedList() -> some View {
        scrollContentBackground(.hidden)
            .background(Color.appBackground)
    }
}
