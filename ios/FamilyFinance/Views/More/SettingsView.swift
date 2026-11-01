import Foundation
import SwiftUI

// =========================
// SETTINGS: same as the Settings page on the website
// Monobank token, personal markers, Face ID, password, security log,
// download my data, delete account.
// =========================

struct SettingsView: View {
    @Environment(AppModel.self) private var model
    @AppStorage("faceIDEnabled") private var faceIDEnabled = false

    @State private var settings: UserSettings?
    @State private var token = ""
    @State private var transferMarkers = ""
    @State private var familyMarkers = ""
    @State private var isSaving = false
    @State private var confirmDisconnect = false
    @State private var confirmLogoutAll = false
    @State private var exportURL: URL?
    @State private var isExporting = false

    private var canEdit: Bool {
        !model.isReadOnly
    }

    var body: some View {
        Form {
            accountSection
            monobankSection
            markersSection
            securitySection
            dataSection
        }
        .navigationTitle("Settings")
        .task(id: model.dataVersion) {
            await load()
        }
        .confirmationDialog("Disconnect Monobank?", isPresented: $confirmDisconnect, titleVisibility: .visible) {
            Button("Disconnect", role: .destructive) {
                Task { await model.disconnectMonobank() }
            }
        } message: {
            Text("The token is deleted from the server. Your transactions stay.")
        }
        .confirmationDialog("Sign out on all devices?", isPresented: $confirmLogoutAll, titleVisibility: .visible) {
            Button("Sign out everywhere", role: .destructive) {
                Task { await model.logoutEverywhere() }
            }
        } message: {
            Text("Every phone and browser where you are signed in will need the password again.")
        }
    }

    // MARK: - Sections

    private var accountSection: some View {
        Section("Account") {
            LabeledContent("Email", value: settings?.email ?? model.user?.email ?? "")
            LabeledContent("Role", value: settings?.role ?? model.user?.role ?? "")

            if model.isDemo {
                LabeledContent("Mode", value: "Demo, offline")
            } else {
                LabeledContent("Server", value: model.serverURLString)
            }
        }
    }

    private var monobankSection: some View {
        Section {
            LabeledContent("Status") {
                Label(
                    model.bankConnected ? "Connected" : "Not connected",
                    systemImage: model.bankConnected ? "checkmark.circle.fill" : "xmark.circle"
                )
                .foregroundStyle(model.bankConnected ? Color.income : .secondary)
            }

            SecureField(model.bankConnected ? "New token (to replace)" : "Token from api.monobank.ua", text: $token)
                .textInputAutocapitalization(.never)
                .autocorrectionDisabled()
                .disabled(!canEdit)

            Button(model.bankConnected ? "Replace token" : "Connect") {
                Task {
                    isSaving = true
                    if await model.connectMonobank(token: token.trimmingCharacters(in: .whitespacesAndNewlines)) {
                        token = ""
                        model.notify("Monobank", "Token saved. Now tap Sync.")
                    }
                    isSaving = false
                }
            }
            .disabled(!canEdit || token.nilIfBlank == nil || isSaving)

            if model.bankConnected {
                Button {
                    Task { await model.sync() }
                } label: {
                    HStack {
                        Text("Sync now")

                        if model.isSyncing {
                            Spacer()
                            ProgressView()
                        }
                    }
                }
                .disabled(!canEdit || model.isSyncing)

                Button("Disconnect", role: .destructive) {
                    confirmDisconnect = true
                }
                .disabled(!canEdit)
            }
        } header: {
            Text("Monobank")
        } footer: {
            Text("The token is stored on the server encrypted and is never shown again. Get it at api.monobank.ua. The first sync loads a long history and can take several minutes.")
        }
    }

    private var markersSection: some View {
        Section {
            TextField("Transfers between my cards", text: $transferMarkers, axis: .vertical)
                .disabled(!canEdit)

            TextField("Money from family", text: $familyMarkers, axis: .vertical)
                .disabled(!canEdit)

            Button("Save markers") {
                Task {
                    isSaving = true
                    if await model.saveMarkers(transfer: transferMarkers, familyIncome: familyMarkers) {
                        model.notify("Saved", "Markers updated. Use \"Apply rules\" to update old transactions.")
                    }
                    isSaving = false
                }
            }
            .disabled(!canEdit || isSaving)
        } header: {
            Text("Personal markers")
        } footer: {
            Text("Words separated by commas, for example your name as it appears in transfers. Matching transactions become \"Money Transfer\" or \"Family Income\".")
        }
    }

    private var securitySection: some View {
        Section("Security") {
            Toggle(isOn: faceIDBinding) {
                Label("Lock with Face ID", systemImage: "faceid")
            }

            if !model.isDemo {
                NavigationLink {
                    ChangePasswordView()
                } label: {
                    Label("Change password", systemImage: "key.fill")
                }
                .disabled(!canEdit)

                NavigationLink {
                    SecurityLogView()
                } label: {
                    Label("Security log", systemImage: "list.bullet.clipboard")
                }

                Button {
                    confirmLogoutAll = true
                } label: {
                    Label("Sign out on all devices", systemImage: "rectangle.portrait.and.arrow.right")
                }
            }
        }
    }

    private var dataSection: some View {
        Section {
            if let exportURL {
                ShareLink(item: exportURL) {
                    Label("Share the file", systemImage: "square.and.arrow.up")
                }
            } else {
                Button {
                    Task { await export() }
                } label: {
                    HStack {
                        Label("Download my data (JSON)", systemImage: "arrow.down.doc")

                        if isExporting {
                            Spacer()
                            ProgressView()
                        }
                    }
                }
                .disabled(isExporting)
            }

            if !model.isDemo {
                NavigationLink {
                    DeleteAccountView()
                } label: {
                    Label("Delete account", systemImage: "trash")
                        .foregroundStyle(.red)
                }
                .disabled(!canEdit)
            }
        } header: {
            Text("My data")
        } footer: {
            Text("The file contains all your transactions. Keep it private and delete it when you no longer need it.")
        }
    }

    // MARK: - Logic

    /// Face ID is asked once when turning the lock on, so you can't lock yourself out
    private var faceIDBinding: Binding<Bool> {
        Binding(
            get: { faceIDEnabled },
            set: { isOn in
                if !isOn {
                    faceIDEnabled = false
                    return
                }

                Task {
                    if await BiometricAuth.authenticate(reason: "Turn on the Face ID lock") {
                        faceIDEnabled = true
                    }
                }
            }
        )
    }

    private func load() async {
        do {
            let loaded = try await model.service.settings()
            settings = loaded
            transferMarkers = loaded.transferMarkers
            familyMarkers = loaded.familyIncomeMarkers
        } catch {
            model.handle(error)
        }
    }

    /// Saves the export to a temporary file protected by iOS encryption
    private func export() async {
        isExporting = true
        defer { isExporting = false }

        do {
            let data = try await model.service.exportData()
            let name = "family-finance-\(Date.now.dayKey).json"
            let url = FileManager.default.temporaryDirectory.appendingPathComponent(name)

            try data.write(to: url, options: [.atomic, .completeFileProtection])
            exportURL = url
        } catch {
            model.handle(error)
        }
    }
}

// MARK: - Change password

struct ChangePasswordView: View {
    @Environment(AppModel.self) private var model
    @Environment(\.dismiss) private var dismiss

    @State private var current = ""
    @State private var new = ""
    @State private var repeatNew = ""
    @State private var errorMessage: String?
    @State private var isSaving = false

    var body: some View {
        Form {
            Section {
                SecureField("Current password", text: $current)
                    .textContentType(.password)
            }

            Section {
                SecureField("New password", text: $new)
                    .textContentType(.newPassword)

                SecureField("Repeat new password", text: $repeatNew)
                    .textContentType(.newPassword)
            } footer: {
                Text("At least 12 characters. All other devices will be signed out.")
            }

            if let errorMessage {
                Section {
                    Text(errorMessage)
                        .foregroundStyle(.red)
                }
            }

            Section {
                Button("Change password") {
                    Task { await save() }
                }
                .disabled(current.isEmpty || new.isEmpty || repeatNew.isEmpty || isSaving)
            }
        }
        .navigationTitle("Password")
    }

    private func save() async {
        errorMessage = nil

        guard new.count >= 12 else {
            errorMessage = "New password must be at least 12 characters"
            return
        }

        guard new == repeatNew else {
            errorMessage = "Passwords do not match"
            return
        }

        isSaving = true
        defer { isSaving = false }

        do {
            try await model.changePassword(current: current, new: new)
            model.notify("Done", "Password changed")
            dismiss()
        } catch {
            errorMessage = error.localizedDescription
        }
    }
}

// MARK: - Security log

struct SecurityLogView: View {
    @Environment(AppModel.self) private var model
    @State private var events: [SecurityEvent] = []
    @State private var isLoaded = false

    var body: some View {
        List {
            ForEach(events) { event in
                HStack(spacing: 12) {
                    Image(systemName: event.isWarning ? "exclamationmark.triangle.fill" : "checkmark.shield.fill")
                        .foregroundStyle(event.isWarning ? Color.orange : Color.income)

                    VStack(alignment: .leading, spacing: 2) {
                        Text(event.title)

                        Text(event.createdAt, format: .dateTime.day().month().year().hour().minute())
                            .font(.caption)
                            .foregroundStyle(.secondary)

                        if let ip = event.ip {
                            Text("IP \(ip)")
                                .font(.caption)
                                .foregroundStyle(.secondary)
                        }
                    }
                }
            }
        }
        .overlay {
            if isLoaded && events.isEmpty {
                ContentUnavailableView("No events yet", systemImage: "list.bullet.clipboard")
            }
        }
        .navigationTitle("Security log")
        .task {
            do {
                events = try await model.service.securityLog()
            } catch {
                model.handle(error)
            }

            isLoaded = true
        }
    }
}

// MARK: - Delete account

struct DeleteAccountView: View {
    @Environment(AppModel.self) private var model

    @State private var password = ""
    @State private var confirmText = ""
    @State private var errorMessage: String?
    @State private var isDeleting = false

    private var canDelete: Bool {
        !password.isEmpty && confirmText == "DELETE" && !isDeleting
    }

    var body: some View {
        Form {
            Section {
                Label("This deletes your account, all transactions, rules and the Monobank token. It can't be undone.", systemImage: "exclamationmark.triangle.fill")
                    .foregroundStyle(.red)
            }

            Section {
                SecureField("Password", text: $password)
                    .textContentType(.password)

                TextField("Type DELETE", text: $confirmText)
                    .textInputAutocapitalization(.characters)
                    .autocorrectionDisabled()
            } footer: {
                Text("Tip: download your data first in Settings.")
            }

            if let errorMessage {
                Section {
                    Text(errorMessage)
                        .foregroundStyle(.red)
                }
            }

            Section {
                Button("Delete my account forever", role: .destructive) {
                    Task { await delete() }
                }
                .disabled(!canDelete)
            }
        }
        .navigationTitle("Delete account")
    }

    private func delete() async {
        errorMessage = nil
        isDeleting = true
        defer { isDeleting = false }

        do {
            try await model.deleteAccount(password: password)
        } catch {
            errorMessage = error.localizedDescription
        }
    }
}

#Preview {
    NavigationStack {
        SettingsView()
    }
    .environment(AppModel.preview)
}
