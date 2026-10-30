import Foundation
import ExpoModulesCore

public class PawseAlarmModule: Module {
  public func definition() -> ModuleDefinition {
    Name("PawseAlarm")

    Events("onWake")

    OnCreate {
      CFNotificationCenterAddObserver(
        CFNotificationCenterGetDarwinNotifyCenter(), Unmanaged.passUnretained(self).toOpaque(),
        { _, observer, _, _, _ in
          guard let observer else { return }
          Unmanaged<PawseAlarmModule>.fromOpaque(observer).takeUnretainedValue().sendEvent("onWake", [:])
        },
        PawseAlarmSignal.name as CFString, nil, .deliverImmediately)
    }

    OnDestroy {
      CFNotificationCenterRemoveEveryObserver(
        CFNotificationCenterGetDarwinNotifyCenter(), Unmanaged.passUnretained(self).toOpaque())
    }

    Function("isSupported") { () -> Bool in
      if #available(iOS 26.0, *) { return true }
      return false
    }

    AsyncFunction("requestAuthorization") { () async -> Bool in
      guard #available(iOS 26.0, *) else { return false }
      return await PawseAlarmKit.authorize()
    }

    AsyncFunction("schedule") { (hour: Int, minute: Int, days: [Int], title: String) async -> Bool in
      guard #available(iOS 26.0, *) else { return false }
      return await PawseAlarmKit.schedule(hour: hour, minute: minute, days: days, title: title)
    }

    AsyncFunction("cancel") { () async in
      guard #available(iOS 26.0, *) else { return }
      PawseAlarmKit.cancelAll()
    }

    // True once when the Play music button opened the app.
    Function("takePending") { () -> Bool in
      PawseAlarmSignal.take()
    }
  }
}
