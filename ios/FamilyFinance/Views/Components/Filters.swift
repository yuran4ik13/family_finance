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

/// Chip that shows the period and opens the calendar sheet
struct PeriodButton: View {
    @Binding var selection: PeriodSelection
    var allowsAllTime = false
    /// The "everything" choice doesn't count as an active filter
    var neutralKind: PeriodSelection.Kind = .allTime

    @State private var isPresented = false

    var body: some View {
        Button {
            isPresented = true
        } label: {
            Chip(
                title: selection.title,
                icon: "calendar",
                isOn: selection.kind != neutralKind,
                isFilter: true
            )
        }
        .buttonStyle(.pressable)
        .sheet(isPresented: $isPresented) {
            PeriodSheet(selection: $selection, allowsAllTime: allowsAllTime)
        }
    }
}

/// Bottom sheet: ready periods + a calendar for your own dates
struct PeriodSheet: View {
    @Environment(\.dismiss) private var dismiss
    @Binding var selection: PeriodSelection
    var allowsAllTime = false
    /// false = only the calendar (Home's "Dates")
    var presetsAllowed = true

    /// Which end of the range the calendar is editing now
    private enum Edge {
        case start
        case end
    }

    @State private var draft = PeriodSelection(.custom)
    @State private var edge: Edge = .start

    private var isTooLong: Bool {
        draft.kind == .custom && (draft.dayCount ?? 0) > PeriodSelection.maxDays
    }

    private var choices: [(title: String, kind: PeriodSelection.Kind)] {
        var items: [(String, PeriodSelection.Kind)] = []

        if allowsAllTime {
            items.append(("All time", .allTime))
        }

        items += AnalyticsPreset.allCases.map { ($0.title, .preset($0)) }
        items.append(("My dates", .custom))
        return items
    }

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(alignment: .leading, spacing: 20) {
                    if presetsAllowed {
                        FlowChips(choices: choices, selected: draft.kind) { kind in
                            withAnimation(Motion.spring) {
                                draft.kind = kind
                                edge = .start
                            }
                        }
                    }

                    if draft.kind == .custom || !presetsAllowed {
                        calendar
                            .transition(.opacity.combined(with: .move(edge: .top)))
                    }
                }
                .padding(20)
            }
            .background(Color.cardBackground)
            .navigationTitle("Period")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Cancel") {
                        dismiss()
                    }
                    .foregroundStyle(Color.textSecondary)
                }

                ToolbarItem(placement: .confirmationAction) {
                    Button("Apply") {
                        selection = draft
                        dismiss()
                    }
                    .fontWeight(.bold)
                    .foregroundStyle(Color.brandSoft)
                    .disabled(isTooLong)
                }
            }
            .onAppear {
                draft = selection

                if !presetsAllowed {
                    draft.kind = .custom
                }
            }
        }
        .presentationDetents([.large])
        .presentationCornerRadius(28)
        .presentationBackground(Color.cardBackground)
    }

    private var calendar: some View {
        VStack(alignment: .leading, spacing: 14) {
            HStack(spacing: 8) {
                dateTile("From", draft.customFrom, isActive: edge == .start) {
                    edge = .start
                }

                dateTile("To", draft.customTo, isActive: edge == .end) {
                    edge = .end
                }
            }

            DatePicker(
                edge == .start ? "Start date" : "End date",
                selection: edge == .start ? $draft.customFrom : $draft.customTo,
                in: ...Date.now,
                displayedComponents: .date
            )
            .datePickerStyle(.graphical)
            .tint(Color.brand)
            .onChange(of: draft.customFrom) {
                // After picking the start, move on to the end
                if edge == .start {
                    withAnimation(Motion.spring) {
                        edge = .end
                    }
                }
            }

            Text(isTooLong
                 ? "Choose at most \(PeriodSelection.maxDays) days"
                 : "\(draft.dayCount ?? 0) days · up to \(PeriodSelection.maxDays) days at once")
                .font(.system(size: 13))
                .foregroundStyle(isTooLong ? Color.danger : Color.textSecondary)
                .frame(maxWidth: .infinity)
                .contentTransition(.numericText())
                .animation(Motion.spring, value: draft.dayCount)
        }
    }

    private func dateTile(_ title: String, _ date: Date, isActive: Bool, action: @escaping () -> Void) -> some View {
        Button {
            withAnimation(Motion.spring) {
                action()
            }
        } label: {
            VStack(alignment: .leading, spacing: 2) {
                Text(title)
                    .font(.system(size: 12))
                    .foregroundStyle(isActive ? Color.brandSoft : Color.textSecondary)

                Text(date, format: .dateTime.day().month(.abbreviated).year())
                    .font(.system(size: 16, weight: .bold))
                    .foregroundStyle(Color.textPrimary)
                    .contentTransition(.numericText())
            }
            .frame(maxWidth: .infinity, alignment: .leading)
            .padding(.horizontal, 14)
            .padding(.vertical, 10)
            .background(
                isActive ? Color.brand.opacity(0.12) : Color.raised,
                in: RoundedRectangle(cornerRadius: 14, style: .continuous)
            )
            .overlay {
                RoundedRectangle(cornerRadius: 14, style: .continuous)
                    .strokeBorder(isActive ? Color.brand : Color.line, lineWidth: 1.5)
            }
        }
        .buttonStyle(.pressable)
    }
}

/// Chips that wrap onto the next line
private struct FlowChips: View {
    let choices: [(title: String, kind: PeriodSelection.Kind)]
    let selected: PeriodSelection.Kind
    let onSelect: (PeriodSelection.Kind) -> Void

    var body: some View {
        LazyVGrid(columns: [GridItem(.adaptive(minimum: 100), spacing: 8)], alignment: .leading, spacing: 8) {
            ForEach(choices, id: \.title) { choice in
                Button {
                    onSelect(choice.kind)
                } label: {
                    Chip(title: choice.title, isOn: choice.kind == selected)
                        .frame(maxWidth: .infinity)
                }
                .buttonStyle(.pressable)
            }
        }
        .sensoryFeedback(.selection, trigger: selected)
    }
}

// MARK: - Accounts

/// Chip with a menu to choose cards. Empty selection = all cards.
struct AccountFilterMenu: View {
    let accounts: [AccountSummary]
    @Binding var selection: Set<Int>

    var body: some View {
        Menu {
            Button {
                withAnimation(Motion.spring) {
                    selection = []
                }
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
                    withAnimation(Motion.spring) {
                        toggle(account.id)
                    }
                } label: {
                    if selection.contains(account.id) {
                        Label(account.name, systemImage: "checkmark")
                    } else {
                        Text(account.name)
                    }
                }
            }
        } label: {
            Chip(
                title: Self.title(for: selection, in: accounts),
                icon: "creditcard",
                isOn: !selection.isEmpty,
                isFilter: true
            )
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
            return account.shortName
        }

        return "\(selection.count) accounts"
    }
}

/// Row of filter chips under a screen title
struct FilterBar<Content: View>: View {
    let content: Content

    init(@ViewBuilder content: () -> Content) {
        self.content = content()
    }

    var body: some View {
        ScrollView(.horizontal) {
            HStack(spacing: 8) {
                content
            }
            .padding(.horizontal, 20)
        }
        .scrollIndicators(.hidden)
    }
}
