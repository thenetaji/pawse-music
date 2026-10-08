import AppIntents
import Foundation

// Compiled into the app and the widget. LiveActivityIntent runs in the app process; the Darwin
// notification reaches the FlowActivity module (and still crosses processes if iOS runs it in the widget).
@available(iOS 17.0, *)
struct FlowToggleIntent: LiveActivityIntent {
  static let title: LocalizedStringResource = "Play or Pause"

  func perform() async throws -> some IntentResult {
    await FlowIntentSignal.send("toggle")
    return .result()
  }
}

@available(iOS 17.0, *)
struct FlowNextIntent: LiveActivityIntent {
  static let title: LocalizedStringResource = "Next Track"

  func perform() async throws -> some IntentResult {
    await FlowIntentSignal.send("next")
    return .result()
  }
}

enum FlowIntentSignal {
  static func send(_ action: String) async {
    let name = CFNotificationName("com.thenetaji.flow.activity.\(action)" as CFString)
    CFNotificationCenterPostNotification(CFNotificationCenterGetDarwinNotifyCenter(), name, nil, nil, true)
    // A short grace period so JS can act before iOS suspends a woken app again.
    try? await Task.sleep(nanoseconds: 400_000_000)
  }
}
