import SwiftUI

// =========================
// MOTION: all animations in one place, so they feel the same everywhere.
// Soft springs, short delays, nothing bouncy or slow. If the user turned on
// "Reduce Motion" in iOS settings, things just appear without moving.
// =========================

enum Motion {
    /// Default spring for most changes (selection, numbers, cards)
    static let spring = Animation.spring(response: 0.45, dampingFraction: 0.85)
    /// Quick spring for taps
    static let snappy = Animation.spring(response: 0.28, dampingFraction: 0.8)
    /// Charts and progress bars growing in
    static let grow = Animation.spring(response: 0.8, dampingFraction: 0.9)

    /// Delay for the n-th block on a screen, so they come in one after another
    static func stagger(_ index: Int) -> Double {
        min(Double(index) * 0.05, 0.4)
    }
}

/// A block slides up a little and fades in when the screen appears
private struct AppearModifier: ViewModifier {
    let delay: Double
    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    @State private var isVisible = false

    func body(content: Content) -> some View {
        content
            .opacity(isVisible ? 1 : 0)
            .offset(y: isVisible || reduceMotion ? 0 : 16)
            .onAppear {
                guard !isVisible else {
                    return
                }

                if reduceMotion {
                    isVisible = true
                } else {
                    withAnimation(Motion.spring.delay(delay)) {
                        isVisible = true
                    }
                }
            }
    }
}

extension View {
    /// Slide-up + fade-in on first appearance. Pass the block's position on
    /// the screen (0, 1, 2…) to make them arrive one after another.
    func appearAnimation(_ index: Int = 0) -> some View {
        modifier(AppearModifier(delay: Motion.stagger(index)))
    }

    /// Numbers roll to the new value instead of jumping
    func rollingNumber(_ value: Double) -> some View {
        contentTransition(.numericText(value: value))
            .animation(Motion.spring, value: value)
    }
}

/// Buttons shrink a little while pressed, like real keys
struct PressableStyle: ButtonStyle {
    func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .scaleEffect(configuration.isPressed ? 0.96 : 1)
            .opacity(configuration.isPressed ? 0.9 : 1)
            .animation(Motion.snappy, value: configuration.isPressed)
    }
}

extension ButtonStyle where Self == PressableStyle {
    static var pressable: PressableStyle { PressableStyle() }
}

/// Light glare that slides over bank cards every few seconds
struct ShineEffect: ViewModifier {
    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    @State private var phase: CGFloat = -1

    func body(content: Content) -> some View {
        content
            .overlay {
                if !reduceMotion {
                    GeometryReader { proxy in
                        LinearGradient(
                            colors: [.clear, .white.opacity(0.22), .clear],
                            startPoint: .leading,
                            endPoint: .trailing
                        )
                        .frame(width: proxy.size.width * 0.35)
                        .rotationEffect(.degrees(18))
                        .offset(x: phase * proxy.size.width * 1.6)
                        .blendMode(.plusLighter)
                    }
                    .allowsHitTesting(false)
                }
            }
            .clipped()
            .onAppear {
                guard !reduceMotion else {
                    return
                }

                // One slow pass that goes far off the card, so there is a
                // calm pause before the glare comes back
                withAnimation(.easeInOut(duration: 4.5).repeatForever(autoreverses: false).delay(1)) {
                    phase = 3
                }
            }
    }
}

extension View {
    func shine() -> some View {
        modifier(ShineEffect())
    }
}
