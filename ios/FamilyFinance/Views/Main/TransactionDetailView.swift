import Foundation
import SwiftUI

// =========================
// ONE TRANSACTION: details and changing the category
// We keep only the id and look the transaction up in the model, so the
// screen updates by itself after the category changes.
// =========================

struct TransactionDetailView: View {
    @Environment(AppModel.self) private var model
    let transactionId: Int

    @State private var isSaving = false

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
        .navigationTitle("Transaction")
        .navigationBarTitleDisplayMode(.inline)
    }

    private func content(_ transaction: Transaction) -> some View {
        List {
            Section {
                VStack(spacing: 10) {
                    CategoryIcon(name: transaction.categoryName, size: 56)

                    Text(transaction.title)
                        .font(.title3.bold())
                        .multilineTextAlignment(.center)

                    AmountText(
                        amount: transaction.amount,
                        currency: transaction.currency,
                        isTransfer: transaction.isTransfer
                    )
                    .font(.largeTitle.bold())

                    Text(transaction.date, format: .dateTime.day().month(.wide).year().hour().minute())
                        .foregroundStyle(.secondary)
                }
                .frame(maxWidth: .infinity)
                .padding(.vertical, 8)
                .listRowBackground(Color.clear)
            }

            Section {
                Picker("Category", selection: categoryBinding(for: transaction)) {
                    if categoryId(of: transaction) == nil {
                        Text("Other").tag(Int?.none)
                    }

                    ForEach(model.categories) { category in
                        Label(category.name, systemImage: CategoryStyle.icon(for: category.name))
                            .tag(Int?.some(category.id))
                    }
                }
                .disabled(model.isReadOnly || isSaving)

                LabeledContent("Chosen by") {
                    Text(transaction.categorySource == .manual ? "You" : "Automatically")
                }
            } header: {
                Text("Category")
            } footer: {
                if transaction.amount < 0 && !transaction.isTransfer {
                    Text("When you change the category of an expense, a rule is saved: the next payments to this merchant get the same category.")
                }
            }

            Section("Details") {
                LabeledContent("Type", value: typeTitle(transaction))

                if let merchant = transaction.merchant?.nilIfBlank {
                    LabeledContent("Merchant", value: merchant)
                }

                if let description = transaction.description?.nilIfBlank {
                    LabeledContent("Description", value: description)
                }

                LabeledContent("Currency", value: transaction.currency)
            }
        }
    }

    private func categoryId(of transaction: Transaction) -> Int? {
        model.categories.first { $0.name == transaction.categoryName }?.id
    }

    /// The Picker works with the category id. When it changes, we save it.
    private func categoryBinding(for transaction: Transaction) -> Binding<Int?> {
        Binding(
            get: { categoryId(of: transaction) },
            set: { newValue in
                guard let newValue, newValue != categoryId(of: transaction) else {
                    return
                }

                Task {
                    isSaving = true
                    await model.setCategory(of: transaction, to: newValue)
                    isSaving = false
                }
            }
        )
    }

    private func typeTitle(_ transaction: Transaction) -> String {
        if transaction.isTransfer {
            return "Transfer"
        }

        return transaction.amount < 0 ? "Expense" : "Income"
    }
}

#Preview {
    NavigationStack {
        TransactionDetailView(transactionId: 1)
    }
    .environment(AppModel.preview)
}
