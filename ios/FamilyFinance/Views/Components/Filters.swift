import Foundation
import SwiftUI

// =========================
// FILTERS shared by Home, Transactions and Analytics:
//   - which cards to show (one, several or all)
//   - which dates: a ready period or your own dates from a calendar
// =========================

// MARK: - Period

/// The period the user picked: all time, a ready one (7 days, this month…)
/// or own dates from the calendar
struct PeriodSelection: Hashable {
    enum Kind: Hashable {
        case allTime
        case preset(AnalyticsPreset)
        case custom
    }

    var kind: Kind
    var customFrom: Date
    var customTo: Date

    /// The server gives analytics for at most this many days at once
    static let maxDays = 366

    init(_ kind: Kind) {
        self.kind = kind

        let today = Date.now.startOfDay
        customTo = today
        customFrom = Calendar.current.date(byAdding: .day, value: -29, to: today) ?? today
    }

    /// First and last day (both included). nil = all time
    var range: (from: Date, to: Date)? {
        switch kind {
        case .allTime:
            return nil
        case .preset(let preset):
            return preset.range()
        case .custom:
            let from = min(customFrom, customTo).startOfDay
            let to = max(customFrom, customTo).startOfDay
            return (from, to)
        }
    }

    var dayCount: Int? {
        guard let range else {
            return nil
        }

        let days = Calendar.current.dateComponents([.day], from: range.from, to: range.to).day ?? 0
        return days + 1
    }

    var title: String {
        switch kind {
        case .allTime:
            return "All time"
        case .preset(let preset):
            return preset.title
        case .custom:
            guard let range else {
                return "Dates"
            }

            let from = range.from.formatted(.dateTime.day().month(.abbreviated))
            let to = range.to.formatted(.dateTime.day().month(.abbreviated))
            return from == to ? from : "\(from) – \(to)"
        }
    }

    /// Is the transaction inside the period?
    func contains(_ date: Date) -> Bool {
        guard let range else {
            return true
        }

        let end = Calendar.current.date(byAdding: .day, value: 1, to: range.to) ?? range.to
        return date >= range.from && date < end
    }
}

/// Button in the toolbar that opens the period sheet
struct PeriodButton: View {
    @Binding var selection: PeriodSelection
    var allowsAllTime = false

    @State private var isPresented = false

    var body: some View {
        Button {
            isPresented = true
        } label: {
            Label(selection.title, systemImage: "calendar")
                .labelStyle(.titleAndIcon)
        }
        .sheet(isPresented: $isPresented) {
            PeriodSheet(selection: $selection, allowsAllTime: allowsAllTime)
        }
    }
}

/// Ready periods + calendar for your own dates
struct PeriodSheet: View {
    @Environment(\.dismiss) private var dismiss
    @Binding var selection: PeriodSelection
    var allowsAllTime = false

    /// Which end of the range the calendar is editing now
    private enum Edge: String, CaseIterable, Identifiable {
        case start = "Start"
        case end = "End"

        var id: Self { self }
    }

    @State private var draft = PeriodSelection(.preset(.month))
    @State private var edge: Edge = .start

    private var isTooLong: Bool {
        draft.kind == .custom && (draft.dayCount ?? 0) > PeriodSelection.maxDays
    }

    var body: some View {
        NavigationStack {
            Form {
                Section("Quick") {
                    if allowsAllTime {
                        choiceRow("All time", kind: .allTime)
                    }

                    ForEach(AnalyticsPreset.allCases) { preset in
                        choiceRow(preset.title, kind: .preset(preset))
                    }
                }

                Section {
                    choiceRow("My dates", kind: .custom)

                    if draft.kind == .custom {
                        Picker("Editing", selection: $edge) {
                            ForEach(Edge.allCases) { item in
                                Text(item.rawValue).tag(item)
                            }
                        }
                        .pickerStyle(.segmented)

                        HStack {
                            dateLabel("From", draft.customFrom, isActive: edge == .start)
                            Spacer()
                            Image(systemName: "arrow.right")
                                .foregroundStyle(.secondary)
                            Spacer()
                            dateLabel("To", draft.customTo, isActive: edge == .end)
                        }

                        DatePicker(
                            edge == .start ? "Start date" : "End date",
                            selection: edge == .start ? $draft.customFrom : $draft.customTo,
                            in: ...Date.now,
                            displayedComponents: .date
                        )
                        .datePickerStyle(.graphical)
                        .onChange(of: draft.customFrom) {
                            // After picking the start, move on to the end
                            if edge == .start {
                                edge = .end
                            }
                        }
                    }
                } header: {
                    Text("Calendar")
                } footer: {
                    if isTooLong {
                        Text("Choose at most \(PeriodSelection.maxDays) days.")
                            .foregroundStyle(.red)
                    } else if draft.kind == .custom, let days = draft.dayCount {
                        Text("\(days) days")
                    }
                }
            }
            .navigationTitle("Period")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Cancel") {
                        dismiss()
                    }
                }

                ToolbarItem(placement: .confirmationAction) {
                    Button("Apply") {
                        selection = draft
                        dismiss()
                    }
                    .disabled(isTooLong)
                }
            }
            .onAppear {
                draft = selection
            }
        }
    }

    private func choiceRow(_ title: String, kind: PeriodSelection.Kind) -> some View {
        Button {
            draft.kind = kind

            if kind == .custom {
                edge = .start
            }
        } label: {
            HStack {
                Text(title)
                    .foregroundStyle(.primary)

                Spacer()

                if draft.kind == kind {
                    Image(systemName: "checkmark")
                        .foregroundStyle(.tint)
                }
            }
        }
    }

    private func dateLabel(_ title: String, _ date: Date, isActive: Bool) -> some View {
        VStack(alignment: .leading, spacing: 2) {
            Text(title)
                .font(.caption)
                .foregroundStyle(.secondary)

            Text(date, format: .dateTime.day().month(.abbreviated).year())
                .font(.subheadline.weight(isActive ? .bold : .regular))
                .foregroundStyle(isActive ? Color.accentColor : .primary)
        }
    }
}

// MARK: - Accounts

/// Menu to choose cards. Empty selection = all cards.
struct AccountFilterMenu: View {
    let accounts: [AccountSummary]
    @Binding var selection: Set<Int>

    var body: some View {
        Menu {
            Button {
                selection = []
            } label: {
                if selection.isEmpty {
                    Label("All accounts", systemImage: "checkmark")
                } else {
                    Text("All accounts")
                }
            }

            Divider()

            ForEach(accounts) { account in
                Button {
                    toggle(account.id)
                } label: {
                    if selection.contains(account.id) {
                        Label(account.name, systemImage: "checkmark")
                    } else {
                        Text(account.name)
                    }
                }
            }
        } label: {
            Label(Self.title(for: selection, in: accounts), systemImage: "creditcard")
                .labelStyle(.titleAndIcon)
        }
        .menuActionDismissBehavior(.disabled)
    }

    private func toggle(_ id: Int) {
        if selection.contains(id) {
            selection.remove(id)
        } else {
            selection.insert(id)
        }

        // All cards ticked one by one = the same as "All accounts"
        if selection.count == accounts.count {
            selection = []
        }
    }

    static func title(for selection: Set<Int>, in accounts: [AccountSummary]) -> String {
        if selection.isEmpty {
            return "All accounts"
        }

        if selection.count == 1, let account = accounts.first(where: { selection.contains($0.id) }) {
            return account.name
        }

        return "\(selection.count) accounts"
    }
}

/// Row with the card and date filters, shown under the title
struct FilterBar<Extra: View>: View {
    let extra: Extra

    init(@ViewBuilder extra: () -> Extra) {
        self.extra = extra()
    }

    var body: some View {
        ScrollView(.horizontal, showsIndicators: false) {
            HStack(spacing: 8) {
                extra
            }
            .buttonStyle(.bordered)
            .buttonBorderShape(.capsule)
            .controlSize(.small)
            .padding(.horizontal)
            .padding(.vertical, 6)
        }
    }
}
