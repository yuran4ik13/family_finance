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
                ProgressView()
            case .signedOut:
                LoginView()
            case .signedIn:
                MainTabView()
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
            Rectangle()
                .fill(.ultraThinMaterial)

            Image(systemName: "lock.shield.fill")
                .font(.system(size: 56))
                .foregroundStyle(.tint)
        }
        .ignoresSafeArea()
    }
}

/// Shown when Face ID lock is on and the app was in the background
private struct LockView: View {
    let onUnlock: () async -> Void

    var body: some View {
        ZStack {
            Rectangle()
                .fill(.regularMaterial)

            VStack(spacing: 16) {
                Image(systemName: "faceid")
                    .font(.system(size: 60))
                    .foregroundStyle(.tint)

                Text("Family Finance is locked")
                    .font(.title3.bold())

                Button("Unlock") {
                    Task { await onUnlock() }
                }
                .buttonStyle(.borderedProminent)
            }
        }
        .ignoresSafeArea()
    }
}

#Preview {
    RootView()
        .environment(AppModel.preview)
}
