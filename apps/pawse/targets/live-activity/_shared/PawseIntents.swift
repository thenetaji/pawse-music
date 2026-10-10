import AppIntents
import Foundation

// Compiled into the app and the widget. LiveActivityIntent runs in the app process; the Darwin
// notification reaches the PawseActivity module (and still crosses processes if iOS runs it in the widget).
@available(iOS 17.0, *)
struct PawseToggleIntent: LiveActivityIntent {
  static let title: LocalizedStringResource = "Play or Pause"

  func perform() async throws -> some IntentResult {
    await PawseIntentSignal.send("toggle")
    return .result()
  }
}

@available(iOS 17.0, *)
struct PawseNextIntent: LiveActivityIntent {
  static let title: LocalizedStringResource = "Next Track"

  func perform() async throws -> some IntentResult {
    await PawseIntentSignal.send("next")
    return .result()
  }
}

@available(iOS 17.0, *)
struct PawsePreviousIntent: LiveActivityIntent {
  static let title: LocalizedStringResource = "Previous Track"

  func perform() async throws -> some IntentResult {
    await PawseIntentSignal.send("previous")
    return .result()
  }
}

enum PawseIntentSignal {
  static func send(_ action: String) async {
    let name = CFNotificationName("com.thenetaji.pawse.activity.\(action)" as CFString)
    CFNotificationCenterPostNotification(CFNotificationCenterGetDarwinNotifyCenter(), name, nil, nil, true)
    // A short grace period so JS can act before iOS suspends a woken app again.
    try? await Task.sleep(nanoseconds: 400_000_000)
  }
}
