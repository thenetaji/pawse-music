import AlarmKit
import AppIntents
import Foundation
import SwiftUI

enum PawseAlarmSignal {
  static let name = "com.thenetaji.pawse.alarm.wake"
  private static let key = "pawse.alarm.wakeAt"

  static func mark() {
    UserDefaults.standard.set(Date().timeIntervalSince1970, forKey: key)
    CFNotificationCenterPostNotification(
      CFNotificationCenterGetDarwinNotifyCenter(), CFNotificationName(name as CFString), nil, nil, true)
  }

  // Ten minutes: a tap that old belongs to an alarm the user has since forgotten.
  static func take() -> Bool {
    let at = UserDefaults.standard.double(forKey: key)
    UserDefaults.standard.removeObject(forKey: key)
    return at > 0 && Date().timeIntervalSince1970 - at < 600
  }
}

@available(iOS 17.4, *)
public struct PawseAlarmPackage: AppIntentsPackage {
  public static var includedPackages: [any AppIntentsPackage.Type] { [] }
}

@available(iOS 26.0, *)
public struct PawseWakeIntent: LiveActivityIntent {
  public static let title: LocalizedStringResource = "Play music"
  public static let openAppWhenRun = true

  public init() {}

  public func perform() async throws -> some IntentResult {
    PawseAlarmSignal.mark()
    for alarm in (try? AlarmManager.shared.alarms) ?? [] where alarm.state == .alerting {
      try? AlarmManager.shared.stop(id: alarm.id)
    }
    return .result()
  }
}

@available(iOS 26.0, *)
struct PawseAlarmMetadata: AlarmMetadata {}

@available(iOS 26.0, *)
enum PawseAlarmKit {
  static func authorize() async -> Bool {
    switch AlarmManager.shared.authorizationState {
    case .authorized:
      return true
    case .denied:
      return false
    default:
      return (try? await AlarmManager.shared.requestAuthorization()) == .authorized
    }
  }

  // days: 0 = Sunday ... 6 = Saturday; empty rings once at the next hour:minute.
  static func schedule(hour: Int, minute: Int, days: [Int], title: String) async -> Bool {
    guard await authorize() else { return false }
    cancelAll()
    let weekdays: [Locale.Weekday] = [.sunday, .monday, .tuesday, .wednesday, .thursday, .friday, .saturday]
    let chosen = days.compactMap { weekdays.indices.contains($0) ? weekdays[$0] : nil }
    let repeats: Alarm.Schedule.Relative.Recurrence = chosen.isEmpty ? .never : .weekly(chosen)
    let time = Alarm.Schedule.Relative.Time(hour: hour, minute: minute)
    let schedule = Alarm.Schedule.relative(Alarm.Schedule.Relative(time: time, repeats: repeats))
    let stop = AlarmButton(text: "Stop", textColor: .white, systemImageName: "stop.circle")
    let play = AlarmButton(text: "Play music", textColor: .white, systemImageName: "play.circle")
    let alert = AlarmPresentation.Alert(
      title: LocalizedStringResource(stringLiteral: title),
      stopButton: stop,
      secondaryButton: play,
      secondaryButtonBehavior: .custom)
    let attributes = AlarmAttributes<PawseAlarmMetadata>(
      presentation: AlarmPresentation(alert: alert),
      metadata: PawseAlarmMetadata(),
      tintColor: .orange)
    let configuration = AlarmManager.AlarmConfiguration(
      countdownDuration: nil,
      schedule: schedule,
      attributes: attributes,
      stopIntent: nil,
      secondaryIntent: PawseWakeIntent(),
      sound: .named("pawse_chime.wav"))
    do {
      _ = try await AlarmManager.shared.schedule(id: UUID(), configuration: configuration)
      return true
    } catch {
      return false
    }
  }

  static func cancelAll() {
    for alarm in (try? AlarmManager.shared.alarms) ?? [] {
      try? AlarmManager.shared.cancel(id: alarm.id)
    }
  }
}
