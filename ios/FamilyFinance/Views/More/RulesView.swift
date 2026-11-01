import Foundation
import SwiftUI

// =========================
// MERCHANT RULES: "Silpo" -> Groceries
// New payments to the merchant get this category automatically.
// =========================

struct RulesView: View {
    @Environment(AppModel.self) private var model

    @State private var editing: MerchantRule?
    @State private var isAdding = false
    @State private var isApplying = false

    var body: some View {
        List {
            Section {
                if model.rules.isEmpty {
                    Text("No rules yet. Change the category of an expense, or add a rule here.")
                        .foregroundStyle(.secondary)
                }

                ForEach(model.rules) { rule in
                    Button {
                        editing = rule
                    } label: {
                        HStack(spacing: 12) {
                            CategoryIcon(name: rule.categoryName, size: 30)

                            VStack(alignment: .leading) {
                                Text(rule.merchant)
                                    .foregroundStyle(.primary)

                                Text(rule.categoryName)
                                    .font(.caption)
                                    .foregroundStyle(.secondary)
                            }
                        }
                    }
                    .disabled(model.isReadOnly)
                }
                .onDelete { offsets in
                    let ids = offsets.map { model.rules[$0].id }

                    Task {
                        for id in ids {
                            await model.deleteRule(id: id)
                        }
                    }
                }
                .deleteDisabled(model.isReadOnly)
            } footer: {
                Text("The merchant name is compared ignoring upper/lower case. Swipe left to delete.")
            }

            Section {
                Button {
                    Task {
                        isApplying = true
                        await model.recategorize()
                        isApplying = false
                    }
                } label: {
                    HStack {
                        Label("Apply rules to all transactions", systemImage: "arrow.triangle.2.circlepath")

                        if isApplying {
                            Spacer()
                            ProgressView()
                        }
                    }
                }
                .disabled(model.isReadOnly || isApplying)
            } footer: {
                Text("Categories you chose by hand are not changed.")
            }
        }
        .navigationTitle("Merchant rules")
        .toolbar {
            ToolbarItem(placement: .topBarTrailing) {
                Button {
                    isAdding = true
                } label: {
                    Image(systemName: "plus")
                }
                .accessibilityLabel("Add rule")
                .disabled(model.isReadOnly)
            }
        }
        .sheet(isPresented: $isAdding) {
            RuleEditorView(rule: nil)
        }
        .sheet(item: $editing) { rule in
            RuleEditorView(rule: rule)
        }
    }
}

/// Add a new rule (rule == nil) or edit an existing one
struct RuleEditorView: View {
    @Environment(AppModel.self) private var model
    @Environment(\.dismiss) private var dismiss

    let rule: MerchantRule?

    @State private var merchant = ""
    @State private var categoryId: Int?
    @State private var isSaving = false

    private var canSave: Bool {
        merchant.nilIfBlank != nil && categoryId != nil && !isSaving
    }

    var body: some View {
        NavigationStack {
            Form {
                Section {
                    TextField("For example: Silpo", text: $merchant)
                        .autocorrectionDisabled()
                } header: {
                    Text("Merchant")
                } footer: {
                    Text("Exactly as it appears in the transaction list.")
                }

                Section("Category") {
                    Picker("Category", selection: $categoryId) {
                        Text("Choose…").tag(Int?.none)

                        ForEach(model.categories) { category in
                            Label(category.name, systemImage: CategoryStyle.icon(for: category.name))
                                .tag(Int?.some(category.id))
                        }
                    }
                    .pickerStyle(.navigationLink)
                }
            }
            .navigationTitle(rule == nil ? "New rule" : "Edit rule")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Cancel") {
                        dismiss()
                    }
                }

                ToolbarItem(placement: .confirmationAction) {
                    Button("Save") {
                        Task { await save() }
                    }
                    .disabled(!canSave)
                }
            }
            .onAppear {
                if let rule {
                    merchant = rule.merchant
                    categoryId = rule.categoryId
                }
            }
        }
    }

    private func save() async {
        guard let categoryId, let name = merchant.nilIfBlank else {
            return
        }

        isSaving = true
        defer { isSaving = false }

        let saved: Bool

        if let rule {
            saved = await model.updateRule(id: rule.id, merchant: name, categoryId: categoryId)
        } else {
            saved = await model.addRule(merchant: name, categoryId: categoryId)
        }

        if saved {
            dismiss()
        }
    }
}

#Preview {
    NavigationStack {
        RulesView()
    }
    .environment(AppModel.preview)
}
