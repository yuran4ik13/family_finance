import Foundation
import SwiftUI

// =========================
// TABS at the bottom of the screen
// =========================

struct MainTabView: View {
    var body: some View {
        TabView {
            Tab("Home", systemImage: "house.fill") {
                DashboardView()
            }

            Tab("Transactions", systemImage: "list.bullet.rectangle.fill") {
                TransactionsView()
            }

            Tab("Analytics", systemImage: "chart.pie.fill") {
                AnalyticsView()
            }

            Tab("More", systemImage: "ellipsis.circle.fill") {
                MoreView()
            }
        }
    }
}

#Preview {
    MainTabView()
        .environment(AppModel.preview)
}
