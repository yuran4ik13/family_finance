import Foundation
import SwiftUI

// =========================
// ROOT VIEW: decides what to show
//   launching -> spinner
//   signedOut -> login screen
//   signedIn  -> the app (tabs)
// It also hides the screen in the app switcher and handles the Face ID lock.
// =========================

struct RootView: View {
    @Environment(AppModel.self) private var model
    @Environment(\.scenePhase) private var scenePhase
    @AppStorage("faceIDEnabled") private var faceIDEnabled = false
    @State private var isLocked = false

    var body: some View {
        ZStack {
            switch model.phase {
            case .launching:
                ZStack {
                    Color.appBackground.ignoresSafeArea()
                    ProgressView().tint(Color.brand)
                }
            case .signedOut:
                LoginView()
                    .transition(.opacity)
            case .signedIn:
                MainTabView()
                    .transition(.opacity.combined(with: .scale(scale: 0.98)))
            }

            // When the app goes to the background, iOS takes a screenshot for
            // the app switcher. Cover balances so nobody sees them there.
            if scenePhase != .active && model.phase == .signedIn {
                PrivacyCover()
            }

            if isLocked && model.phase == .signedIn {
                LockView {
                    await unlock()
                }
            }
        }
        .animation(Motion.spring, value: model.phase)
        .task {
            await model.start()

            if faceIDEnabled && model.phase == .signedIn {
                isLocked = true
                await unlock()
            }
        }
        .onChange(of: scenePhase) { _, newPhase in
            if newPhase == .background && faceIDEnabled && model.phase == .signedIn {
                isLocked = true
            }

            if newPhase == .active && isLocked {
                Task { await unlock() }
            }
        }
        .alert(
            model.alert?.title ?? "",
            isPresented: alertBinding,
            presenting: model.alert
        ) { _ in
            Button("OK", role: .cancel) {}
        } message: { alert in
            Text(alert.message)
        }
    }

    private var alertBinding: Binding<Bool> {
        Binding(
            get: { model.alert != nil },
            set: { isShown in
                if !isShown {
                    model.alert = nil
                }
            }
        )
    }

    private func unlock() async {
        if await BiometricAuth.authenticate(reason: "Unlock Family Finance") {
            isLocked = false
        }
    }
}

/// Covers the screen while the app is in the background
private struct PrivacyCover: View {
    var body: some View {
        ZStack {
            Color.appBackground

            Image(systemName: "lock.shield.fill")
                .font(.system(size: 56))
                .foregroundStyle(Color.brand)
        }
        .ignoresSafeArea()
    }
}

/// Shown when Face ID lock is on and the app was in the background
private struct LockView: View {
    let onUnlock: () async -> Void

    var body: some View {
        ZStack {
            Color.appBackground

            VStack(spacing: 18) {
                Image(systemName: "faceid")
                    .font(.system(size: 60))
                    .foregroundStyle(Color.brand)
                    .symbolEffect(.pulse, options: .repeat(.continuous))

                Text("Family Finance is locked")
                    .font(.system(size: 20, weight: .bold))
                    .foregroundStyle(Color.textPrimary)

                Button {
                    Task { await onUnlock() }
                } label: {
                    Text("Unlock")
                        .font(.system(size: 17, weight: .bold))
                        .foregroundStyle(Color.appBackground)
                        .frame(width: 180, height: 50)
                        .background(Color.brand, in: Capsule())
                }
                .buttonStyle(.pressable)
            }
        }
        .ignoresSafeArea()
    }
}

#Preview {
    RootView()
        .environment(AppModel.preview)
}
