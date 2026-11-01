import Foundation
import SwiftUI
import UIKit

// =========================
// LOGIN: sign in, sign up (if the server allows it) or try the demo
// =========================

struct LoginView: View {
    @Environment(AppModel.self) private var model

    @State private var email = ""
    @State private var password = ""
    @State private var passwordRepeat = ""
    @State private var isRegister = false
    @State private var registrationEnabled = false
    @State private var errorMessage: String?
    @State private var isLoading = false
    @State private var showServerSettings = false

    private let minPasswordLength = 12

    private var canSubmit: Bool {
        !email.isEmpty && !password.isEmpty && !isLoading
            && (!isRegister || !passwordRepeat.isEmpty)
    }

    var body: some View {
        NavigationStack {
            Form {
                Section {
                    VStack(spacing: 10) {
                        Image(systemName: "creditcard.fill")
                            .font(.system(size: 48))
                            .foregroundStyle(.tint)

                        Text("Family Finance")
                            .font(.largeTitle.bold())

                        Text("All your accounts in one place")
                            .foregroundStyle(.secondary)
                    }
                    .frame(maxWidth: .infinity)
                    .padding(.vertical, 8)
                    .listRowBackground(Color.clear)
                }

                Section {
                    TextField("Email", text: $email)
                        .textContentType(.username)
                        .keyboardType(.emailAddress)
                        .textInputAutocapitalization(.never)
                        .autocorrectionDisabled()

                    SecureField("Password", text: $password)
                        .textContentType(isRegister ? .newPassword : .password)

                    if isRegister {
                        SecureField("Repeat password", text: $passwordRepeat)
                            .textContentType(.newPassword)
                    }
                } header: {
                    Text(isRegister ? "Create account" : "Sign in")
                } footer: {
                    if isRegister {
                        Text("At least \(minPasswordLength) characters. A phrase of a few words is easy to remember and hard to guess.")
                    } else {
                        Text("Server: \(model.serverURLString)")
                    }
                }

                if let errorMessage {
                    Section {
                        Label(errorMessage, systemImage: "exclamationmark.triangle.fill")
                            .foregroundStyle(.red)
                    }
                }

                Section {
                    Button {
                        Task { await submit() }
                    } label: {
                        HStack {
                            Spacer()

                            if isLoading {
                                ProgressView()
                            } else {
                                Text(isRegister ? "Create account" : "Sign in")
                                    .bold()
                            }

                            Spacer()
                        }
                    }
                    .disabled(!canSubmit)

                    if registrationEnabled {
                        Button(isRegister ? "Already have an account? Sign in" : "No account yet? Create one") {
                            isRegister.toggle()
                            errorMessage = nil
                        }
                    }
                }

                Section {
                    Button {
                        model.startDemo()
                    } label: {
                        Label("Try with demo data", systemImage: "sparkles")
                    }
                } footer: {
                    Text("Demo mode works offline with invented data. Nothing is sent anywhere.")
                }
            }
            .navigationTitle("")
            .toolbar {
                ToolbarItem(placement: .topBarTrailing) {
                    Button {
                        showServerSettings = true
                    } label: {
                        Image(systemName: "server.rack")
                    }
                    .accessibilityLabel("Server address")
                }
            }
            .sheet(isPresented: $showServerSettings) {
                ServerSettingsView()
            }
            .task(id: model.serverURLString) {
                registrationEnabled = await model.service.registrationEnabled()
            }
        }
    }

    private func submit() async {
        errorMessage = nil

        if isRegister {
            guard password.count >= minPasswordLength else {
                errorMessage = "Password must be at least \(minPasswordLength) characters"
                return
            }

            guard password == passwordRepeat else {
                errorMessage = "Passwords do not match"
                return
            }
        }

        isLoading = true
        defer { isLoading = false }

        do {
            if isRegister {
                try await model.register(email: email, password: password)
            } else {
                try await model.signIn(email: email, password: password)
            }

            password = ""
            passwordRepeat = ""
        } catch {
            errorMessage = error.localizedDescription
        }
    }
}

/// Where the backend is. Simulator: localhost. Real iPhone: your Mac's IP.
struct ServerSettingsView: View {
    @Environment(AppModel.self) private var model
    @Environment(\.dismiss) private var dismiss

    @State private var address = ""
    @State private var errorMessage: String?

    var body: some View {
        NavigationStack {
            Form {
                Section {
                    TextField("http://localhost:3000", text: $address)
                        .keyboardType(.URL)
                        .textInputAutocapitalization(.never)
                        .autocorrectionDisabled()
                } header: {
                    Text("Backend address")
                } footer: {
                    VStack(alignment: .leading, spacing: 6) {
                        Text("Simulator on your Mac: http://localhost:3000")
                        Text("Real iPhone on the same Wi-Fi: http://YOUR-MAC-IP:3000 (System Settings → Wi-Fi → Details → IP address)")
                        Text("Online server: https://your-domain.com (must be https)")
                    }
                }

                if let errorMessage {
                    Section {
                        Text(errorMessage)
                            .foregroundStyle(.red)
                    }
                }

                Section {
                    Button("Reset to default") {
                        address = AppModel.defaultServer
                    }
                }
            }
            .navigationTitle("Server")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Cancel") {
                        dismiss()
                    }
                }

                ToolbarItem(placement: .confirmationAction) {
                    Button("Save") {
                        save()
                    }
                }
            }
            .onAppear {
                address = model.serverURLString
            }
        }
    }

    private func save() {
        do {
            try model.setServer(address)
            dismiss()
        } catch {
            errorMessage = error.localizedDescription
        }
    }
}

#Preview {
    LoginView()
        .environment(AppModel())
}
