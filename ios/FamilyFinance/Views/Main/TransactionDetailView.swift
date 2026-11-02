import Foundation
import SwiftUI

// =========================
// ONE TRANSACTION: big amount, quick category tiles, details
// We keep only the id and look the transaction up in the model, so the
// screen updates by itself after the category changes.
// =========================

struct TransactionDetailView: View {
    @Environment(AppModel.self) private var model
    let transactionId: Int

    @State private var isSaving = false
    @State private var showAllCategories = false
    @State private var heroShown = false
    @Environment(\.accessibilityReduceMotion) private var reduceMotion

    private var transaction: Transaction? {
        model.transactions.first { $0.id == transactionId }
    }

    var body: some View {
        Group {
            if let transaction {
                content(transaction)
            } else {
                ContentUnavailableView("Transaction not found", systemImage: "questionmark.circle")
            }
        }
        .background(Color.appBackground)
        .navigationTitle("Transaction")
        .navigationBarTitleDisplayMode(.inline)
    }

    private func content(_ transaction: Transaction) -> some View {
        ScrollView {
            VStack(spacing: 12) {
                hero(transaction)
                    .padding(.bottom, 14)

                categoryCard(transaction)
                    .appearAnimation(2)

                detailsCard(transaction)
                    .appearAnimation(3)
            }
            .padding(.horizontal, 20)
            .padding(.vertical, 12)
        }
        .scrollIndicators(.hidden)
        .sheet(isPresented: $showAllCategories) {
            AllCategoriesSheet(
                selectedName: transaction.categoryName,
                onSelect: { choose($0, for: transaction) }
            )
        }
    }

    // MARK: - Parts

    private func hero(_ transaction: Transaction) -> some View {
        VStack(spacing: 10) {
            CategoryIcon(name: transaction.categoryName, size: 68)
                .scaleEffect(heroShown || reduceMotion ? 1 : 0.6)
                .opacity(heroShown || reduceMotion ? 1 : 0)
                .animation(.spring(response: 0.45, dampingFraction: 0.6), value: transaction.categoryName)

            Text(transaction.title)
                .font(.system(size: 18, weight: .semibold))
                .foregroundStyle(Color.textPrimary)
                .multilineTextAlignment(.center)
                .appearAnimation(1)

            AmountText(
                amount: transaction.amount,
                currency: transaction.currency,
                isTransfer: transaction.isTransfer
            )
            .font(.system(size: 42, weight: .heavy))
            .tracking(-1.2)
            .lineLimit(1)
            .minimumScaleFactor(0.5)
            .appearAnimation(1)

            Text(subtitle(transaction))
                .font(.system(size: 14))
                .foregroundStyle(Color.textSecondary)
                .multilineTextAlignment(.center)
                .appearAnimation(2)
        }
        .frame(maxWidth: .infinity)
        .padding(.top, 8)
        .onAppear {
            withAnimation(.spring(response: 0.5, dampingFraction: 0.65).delay(0.1)) {
                heroShown = true
            }
        }
    }

    private func subtitle(_ transaction: Transaction) -> String {
        var parts = [transaction.date.formatted(.dateTime.day().month(.wide).hour().minute())]

        if let account = model.accounts.first(where: { $0.id == transaction.accountId }) {
            parts.append(account.shortName)
        }

        return parts.joined(separator: " · ")
    }

    /// Six quick tiles: the current category first, then the most used ones
    private func quickCategories(for transaction: Transaction) -> [Category] {
        let usage = Dictionary(grouping: model.transactions.compactMap(\.categoryName), by: { $0 })
            .mapValues(\.count)

        let wantsIncome = transaction.amount > 0
        let incomeNames: Set<String> = ["Salary", "Family Income", "Refund", "Other Income"]

        let candidates = model.categories
            .filter { wantsIncome == incomeNames.contains($0.name) || $0.name == "Money Transfer" }
            .sorted { (usage[$0.name] ?? 0) > (usage[$1.name] ?? 0) }

        var result = candidates.filter { $0.name == transaction.categoryName }
        result += candidates.filter { $0.name != transaction.categoryName }
        return Array(result.prefix(6))
    }

    private func categoryCard(_ transaction: Transaction) -> some View {
        VStack(alignment: .leading, spacing: 14) {
            HStack {
                Text("Category")
                    .font(.system(size: 15, weight: .bold))
                    .foregroundStyle(Color.textPrimary)

                Spacer()

                Text(transaction.categorySource == .manual ? "Chosen by you" : "Chosen automatically")
                    .font(.system(size: 12))
                    .foregroundStyle(Color.textSecondary)
                    .padding(.horizontal, 8)
                    .padding(.vertical, 4)
                    .background(Color.divider, in: RoundedRectangle(cornerRadius: 8, style: .continuous))
                    .contentTransition(.opacity)
            }

            LazyVGrid(columns: Array(repeating: GridItem(.flexible(), spacing: 8), count: 3), spacing: 8) {
                ForEach(quickCategories(for: transaction)) { category in
                    let isSelected = category.name == transaction.categoryName
                    let color = CategoryStyle.color(for: category.name)

                    Button {
                        choose(category.id, for: transaction)
                    } label: {
                        VStack(spacing: 6) {
                            Image(systemName: CategoryStyle.icon(for: category.name))
                                .font(.system(size: 18, weight: .semibold))
                                .foregroundStyle(color)
                                .symbolEffect(.bounce, value: isSelected)

                            Text(category.name)
                                .font(.system(size: 12, weight: .medium))
                                .foregroundStyle(Color.textPrimary)
                                .lineLimit(1)
                                .minimumScaleFactor(0.8)
                        }
                        .frame(maxWidth: .infinity)
                        .frame(height: 64)
                        .padding(.horizontal, 4)
                        .background(
                            isSelected ? color.opacity(0.14) : Color.raised,
                            in: RoundedRectangle(cornerRadius: 14, style: .continuous)
                        )
                        .overlay {
                            RoundedRectangle(cornerRadius: 14, style: .continuous)
                                .strokeBorder(isSelected ? color : .clear, lineWidth: 1.5)
                        }
                    }
                    .buttonStyle(.pressable)
                    .accessibilityAddTraits(isSelected ? .isSelected : [])
                }
            }
            .disabled(model.isReadOnly || isSaving)
            .animation(Motion.spring, value: transaction.categoryName)

            Button("All \(model.categories.count) categories") {
                showAllCategories = true
            }
            .font(.system(size: 14, weight: .semibold))
            .foregroundStyle(Color.brandSoft)
            .frame(maxWidth: .infinity)
            .disabled(model.isReadOnly)

            if transaction.amount < 0 && !transaction.isTransfer {
                HStack(spacing: 10) {
                    Image(systemName: "wand.and.stars")
                        .foregroundStyle(Color.income)

                    Text("When you choose a category, future payments to \(transaction.title) get it too.")
                        .font(.system(size: 12))
                        .foregroundStyle(Color.textSecondary)
                }
                .padding(.top, 10)
                .overlay(alignment: .top) {
                    Rectangle().fill(Color.divider).frame(height: 1)
                }
            }
        }
        .padding(16)
        .background(Color.cardBackground, in: RoundedRectangle(cornerRadius: 20, style: .continuous))
        .sensoryFeedback(.success, trigger: transaction.categoryName)
    }

    private func detailsCard(_ transaction: Transaction) -> some View {
        VStack(spacing: 0) {
            detailRow("Type", typeTitle(transaction))

            if let description = transaction.description?.nilIfBlank, description != transaction.title {
                detailRow("Description", description)
            }

            if let merchant = transaction.merchant?.nilIfBlank {
                detailRow("Merchant", merchant)
            }

            detailRow("Currency", transaction.currency, isLast: true)
        }
        .padding(.horizontal, 16)
        .padding(.vertical, 4)
        .background(Color.cardBackground, in: RoundedRectangle(cornerRadius: 20, style: .continuous))
    }

    private func detailRow(_ title: String, _ value: String, isLast: Bool = false) -> some View {
        HStack(alignment: .top) {
            Text(title)
                .foregroundStyle(Color.textSecondary)

            Spacer(minLength: 16)

            Text(value)
                .foregroundStyle(Color.textPrimary)
                .multilineTextAlignment(.trailing)
        }
        .font(.system(size: 15))
        .padding(.vertical, 13)
        .overlay(alignment: .bottom) {
            if !isLast {
                Rectangle().fill(Color.divider).frame(height: 1)
            }
        }
    }

    // MARK: - Logic

    private func choose(_ categoryId: Int, for transaction: Transaction) {
        guard let category = model.categories.first(where: { $0.id == categoryId }),
              category.name != transaction.categoryName else {
            return
        }

        Task {
            isSaving = true
            await model.setCategory(of: transaction, to: categoryId)
            isSaving = false
        }
    }

    private func typeTitle(_ transaction: Transaction) -> String {
        if transaction.isTransfer {
            return "Between my cards"
        }

        return transaction.amount < 0 ? "Expense" : "Income"
    }
}

/// Full list of categories
private struct AllCategoriesSheet: View {
    @Environment(AppModel.self) private var model
    @Environment(\.dismiss) private var dismiss

    let selectedName: String?
    let onSelect: (Int) -> Void

    var body: some View {
        NavigationStack {
            List(model.categories) { category in
                Button {
                    onSelect(category.id)
                    dismiss()
                } label: {
                    HStack(spacing: 12) {
                        CategoryIcon(name: category.name, size: 32, circle: false)

                        Text(category.name)
                            .foregroundStyle(Color.textPrimary)

                        Spacer()

                        if category.name == selectedName {
                            Image(systemName: "checkmark")
                                .fontWeight(.semibold)
                                .foregroundStyle(Color.brand)
                        }
                    }
                }
                .listRowBackground(Color.raised)
            }
            .themedList()
            .navigationTitle("Category")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Close") {
                        dismiss()
                    }
                }
            }
        }
        .presentationDetents([.medium, .large])
        .presentationBackground(Color.cardBackground)
    }
}

#Preview {
    NavigationStack {
        TransactionDetailView(transactionId: 1)
    }
    .environment(AppModel.preview)
}
