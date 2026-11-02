import Foundation
import SwiftUI
import UIKit

// =========================
// LOGIN: sign in, sign up (if the server allows it) or try the demo
// =========================

struct LoginView: View {
    @Environment(AppModel.self) private var model

    private enum Field {
        case email
        case password
        case repeatPassword
    }

    @State private var email = ""
    @State private var password = ""
    @State private var passwordRepeat = ""
    @State private var showPassword = false
    @State private var isRegister = false
    @State private var registrationEnabled = false
    @State private var errorMessage: String?
    @State private var isLoading = false
    @State private var showServerSettings = false
    @State private var shake = 0
    @FocusState private var focus: Field?

    private let minPasswordLength = 12

    private var canSubmit: Bool {
        !email.isEmpty && !password.isEmpty && !isLoading
            && (!isRegister || !passwordRepeat.isEmpty)
    }

    private var serverLabel: String {
        URL(string: model.serverURLString).flatMap { url in
            url.host().map { host in url.port.map { "\(host):\($0)" } ?? host }
        } ?? model.serverURLString
    }

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 0) {
                HStack {
                    Spacer()

                    Button {
                        showServerSettings = true
                    } label: {
                        Chip(title: serverLabel, icon: "server.rack")
                    }
                    .buttonStyle(.pressable)
                    .accessibilityLabel("Server address: \(serverLabel)")
                }

                brand
                    .padding(.top, 48)
                    .appearAnimation(0)

                form
                    .padding(.top, 36)
                    .appearAnimation(2)

                demo
                    .padding(.top, 36)
                    .appearAnimation(4)
            }
            .padding(.horizontal, 24)
            .padding(.vertical, 16)
        }
        .scrollIndicators(.hidden)
        .scrollDismissesKeyboard(.interactively)
        .background(Color.appBackground)
        .sheet(isPresented: $showServerSettings) {
            ServerSettingsView()
        }
        .task(id: model.serverURLString) {
            registrationEnabled = await model.service.registrationEnabled()
        }
    }

    // MARK: - Parts

    private var brand: some View {
        VStack(alignment: .leading, spacing: 18) {
            Image(systemName: "creditcard.fill")
                .font(.system(size: 28, weight: .semibold))
                .foregroundStyle(.white)
                .frame(width: 64, height: 64)
                .background(CardStyle.brandGradient, in: RoundedRectangle(cornerRadius: 20, style: .continuous))
                .shine()
                .clipShape(RoundedRectangle(cornerRadius: 20, style: .continuous))

            Text(isRegister ? "Create your\naccount" : "Your money,\nall in one place")
                .font(.system(size: 34, weight: .heavy))
                .tracking(-1)
                .foregroundStyle(Color.textPrimary)
                .contentTransition(.opacity)

            Text("Cards, spending and insights from Monobank. Private and encrypted.")
                .font(.system(size: 16))
                .foregroundStyle(Color.textSecondary)
                .fixedSize(horizontal: false, vertical: true)
        }
        .animation(Motion.spring, value: isRegister)
    }

    private var form: some View {
        VStack(spacing: 12) {
            InputField(title: "Email", isFocused: focus == .email) {
                TextField("", text: $email, prompt: Text("you@example.com").foregroundStyle(Color.textFaint))
                    .textContentType(.username)
                    .keyboardType(.emailAddress)
                    .textInputAutocapitalization(.never)
                    .autocorrectionDisabled()
                    .focused($focus, equals: .email)
                    .submitLabel(.next)
                    .onSubmit { focus = .password }
            }

            InputField(title: "Password", isFocused: focus == .password) {
                HStack {
                    Group {
                        if showPassword {
                            TextField("", text: $password)
                        } else {
                            SecureField("", text: $password)
                        }
                    }
                    .textContentType(isRegister ? .newPassword : .password)
                    .textInputAutocapitalization(.never)
                    .autocorrectionDisabled()
                    .focused($focus, equals: .password)
                    .submitLabel(isRegister ? .next : .go)
                    .onSubmit {
                        if isRegister {
                            focus = .repeatPassword
                        } else {
                            Task { await submit() }
                        }
                    }

                    Button {
                        showPassword.toggle()
                    } label: {
                        Image(systemName: showPassword ? "eye.slash" : "eye")
                            .foregroundStyle(Color.textSecondary)
                            .contentTransition(.symbolEffect(.replace))
                            .frame(width: 32, height: 32)
                    }
                    .accessibilityLabel(showPassword ? "Hide password" : "Show password")
                }
            }

            if isRegister {
                InputField(title: "Repeat password", isFocused: focus == .repeatPassword) {
                    SecureField("", text: $passwordRepeat)
                        .textContentType(.newPassword)
                        .focused($focus, equals: .repeatPassword)
                        .submitLabel(.go)
                        .onSubmit { Task { await submit() } }
                }
                .transition(.move(edge: .top).combined(with: .opacity))

                Text("At least \(minPasswordLength) characters. A phrase of a few words is easy to remember and hard to guess.")
                    .font(.system(size: 13))
                    .foregroundStyle(Color.textSecondary)
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .transition(.opacity)
            }

            if let errorMessage {
                HStack(alignment: .top, spacing: 10) {
                    Image(systemName: "exclamationmark.triangle.fill")
                    Text(errorMessage)
                        .frame(maxWidth: .infinity, alignment: .leading)
                }
                .font(.system(size: 14))
                .foregroundStyle(Color(hex: 0xFFB3A8))
                .padding(.horizontal, 14)
                .padding(.vertical, 12)
                .background(Color.danger.opacity(0.12), in: RoundedRectangle(cornerRadius: 14, style: .continuous))
                .transition(.scale(scale: 0.95).combined(with: .opacity))
                .modifier(ShakeEffect(shakes: CGFloat(shake)))
            }

            Button {
                Task { await submit() }
            } label: {
                ZStack {
                    if isLoading {
                        ProgressView()
                            .tint(Color.appBackground)
                    } else {
                        Text(isRegister ? "Create account" : "Sign in")
                    }
                }
                .font(.system(size: 17, weight: .bold))
                .foregroundStyle(Color.appBackground)
                .frame(maxWidth: .infinity)
                .frame(height: 54)
                .background(Color.brand, in: Capsule())
                .opacity(canSubmit || isLoading ? 1 : 0.5)
            }
            .buttonStyle(.pressable)
            .disabled(!canSubmit)
            .padding(.top, 8)

            if registrationEnabled {
                Button(isRegister ? "Already have an account? Sign in" : "No account yet? Create one") {
                    withAnimation(Motion.spring) {
                        isRegister.toggle()
                        errorMessage = nil
                    }
                }
                .font(.system(size: 15, weight: .medium))
                .foregroundStyle(Color.brandSoft)
                .padding(.top, 4)
            }
        }
        .animation(Motion.spring, value: errorMessage)
        .sensoryFeedback(.error, trigger: shake)
    }

    private var demo: some View {
        VStack(spacing: 8) {
            Button {
                model.startDemo()
            } label: {
                Label("Try with demo data", systemImage: "sparkles")
                    .font(.system(size: 16, weight: .semibold))
                    .foregroundStyle(Color.brandSoft)
                    .symbolEffect(.pulse, options: .repeat(.continuous))
            }
            .buttonStyle(.pressable)

            Text("Demo works offline with invented data")
                .font(.system(size: 13))
                .foregroundStyle(Color.textSecondary)
        }
        .frame(maxWidth: .infinity)
    }

    // MARK: - Logic

    private func fail(_ message: String) {
        errorMessage = message
        withAnimation(.default) {
            shake += 1
        }
    }

    private func submit() async {
        guard canSubmit else {
            return
        }

        errorMessage = nil

        if isRegister {
            guard password.count >= minPasswordLength else {
                fail("Password must be at least \(minPasswordLength) characters")
                return
            }

            guard password == passwordRepeat else {
                fail("Passwords do not match")
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
            fail(error.localizedDescription)
        }
    }
}

/// Dark rounded input with a small title above it
private struct InputField<Content: View>: View {
    let title: String
    let isFocused: Bool
    let content: Content

    init(title: String, isFocused: Bool, @ViewBuilder content: () -> Content) {
        self.title = title
        self.isFocused = isFocused
        self.content = content()
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 6) {
            Text(title)
                .font(.system(size: 13, weight: .medium))
                .foregroundStyle(Color.textSecondary)

            content
                .font(.system(size: 16))
                .foregroundStyle(Color.textPrimary)
                .tint(Color.brand)
                .padding(.horizontal, 16)
                .frame(height: 52)
                .background(Color.cardBackground, in: RoundedRectangle(cornerRadius: 16, style: .continuous))
                .overlay {
                    RoundedRectangle(cornerRadius: 16, style: .continuous)
                        .strokeBorder(isFocused ? Color.brand : Color.line, lineWidth: isFocused ? 1.5 : 1)
                }
                .animation(Motion.snappy, value: isFocused)
        }
    }
}

/// Small left-right shake for a wrong password
struct ShakeEffect: GeometryEffect {
    var shakes: CGFloat

    var animatableData: CGFloat {
        get { shakes }
        set { shakes = newValue }
    }

    func effectValue(size: CGSize) -> ProjectionTransform {
        ProjectionTransform(CGAffineTransform(translationX: 8 * sin(shakes * .pi * 4), y: 0))
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
            .themedList()
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
