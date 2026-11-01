import Foundation
import SwiftUI

// =========================
// ENTRY POINT of the app (like index.js / main.tsx on the web)
// Creates the AppModel once and gives it to every screen.
// =========================

@main
struct MyApp: App {
    @State private var model = AppModel()

    var body: some Scene {
        WindowGroup {
            RootView()
                .environment(model)
        }
    }
}
