import ActivityKit
import ExpoModulesCore
import UIKit

struct FlowActivityStateRecord: Record {
  @Field var title: String = ""
  @Field var artist: String = ""
  @Field var artwork: String? = nil
  @Field var isPlaying: Bool = false
  @Field var mood: String = "sleep"
  @Field var frame: Int = 0
  /// Milliseconds since 1970, like JS Date.now().
  @Field var start: Double = 0
  @Field var end: Double = 0
  @Field var progress: Double = 0
  @Field var color: String = "orange"
  @Field var mouse: Int = 0
  @Field var name: String? = nil
  @Field var tint: String? = nil
  /// Milliseconds since 1970; 0 means never stale.
  @Field var staleAt: Double = 0

  var staleDate: Date? {
    staleAt > 0 ? Date(timeIntervalSince1970: staleAt / 1000) : nil
  }

  var contentState: FlowActivityAttributes.ContentState {
    FlowActivityAttributes.ContentState(
      title: title,
      artist: artist,
      artwork: artwork,
      isPlaying: isPlaying,
      mood: mood,
      frame: frame,
      start: Date(timeIntervalSince1970: start / 1000),
      end: Date(timeIntervalSince1970: max(start, end) / 1000),
      progress: min(max(progress, 0), 1),
      color: color,
      mouse: min(max(mouse, 0), 2),
      name: name,
      tint: tint
    )
  }
}

public class FlowActivityModule: Module {
  private static let actions = ["toggle", "next", "previous"]
  private var terminateObserver: NSObjectProtocol?

  public func definition() -> ModuleDefinition {
    Name("FlowActivity")

    Events("onAction")

    OnCreate {
      self.observeIntents()
      self.terminateObserver = NotificationCenter.default.addObserver(
        forName: UIApplication.willTerminateNotification, object: nil, queue: nil
      ) { _ in
        FlowActivityModule.endAllBlocking()
      }
    }

    OnDestroy {
      CFNotificationCenterRemoveEveryObserver(
        CFNotificationCenterGetDarwinNotifyCenter(), Unmanaged.passUnretained(self).toOpaque())
      if let observer = self.terminateObserver {
        NotificationCenter.default.removeObserver(observer)
      }
    }

    Function("isSupported") { () -> Bool in
      guard #available(iOS 17.0, *) else { return false }
      return ActivityAuthorizationInfo().areActivitiesEnabled
    }

    // Reuses a running activity; returns false when iOS refuses (app in background, activities off).
    AsyncFunction("start") { (record: FlowActivityStateRecord) async -> Bool in
      guard #available(iOS 17.0, *) else { return false }
      let content = ActivityContent(state: record.contentState, staleDate: record.staleDate)
      let running = FlowActivityModule.running()
      if let current = running.first {
        for extra in running.dropFirst() {
          await extra.end(nil, dismissalPolicy: .immediate)
        }
        await current.update(content)
        return true
      }
      do {
        _ = try Activity.request(attributes: FlowActivityAttributes(), content: content, pushType: nil)
        return true
      } catch {
        return false
      }
    }

    // False when nothing was running, so JS knows to start a new activity.
    AsyncFunction("update") { (record: FlowActivityStateRecord) async -> Bool in
      guard #available(iOS 17.0, *) else { return false }
      let content = ActivityContent(state: record.contentState, staleDate: record.staleDate)
      let running = FlowActivityModule.running()
      for activity in running {
        await activity.update(content)
      }
      return !running.isEmpty
    }

    AsyncFunction("end") { () async in
      guard #available(iOS 17.0, *) else { return }
      for activity in Activity<FlowActivityAttributes>.activities {
        await activity.end(nil, dismissalPolicy: .immediate)
      }
    }

    // Downloads a small square JPEG into the App Group and returns its file name, or nil.
    AsyncFunction("setArtwork") { (url: String) async -> String? in
      await FlowArtwork.store(url)
    }

    // Square, bar-free JPEG in Caches from the first usable url, for the Now Playing art; returns a file URL or nil.
    AsyncFunction("squareArtwork") { (urls: [String], px: Int) async -> String? in
      await FlowArtwork.square(urls, side: px)
    }
  }

  @available(iOS 17.0, *)
  private static func running() -> [Activity<FlowActivityAttributes>] {
    Activity<FlowActivityAttributes>.activities.filter {
      $0.activityState == .active || $0.activityState == .stale
    }
  }

  private func observeIntents() {
    let center = CFNotificationCenterGetDarwinNotifyCenter()
    let observer = Unmanaged.passUnretained(self).toOpaque()
    for action in FlowActivityModule.actions {
      CFNotificationCenterAddObserver(
        center, observer,
        { _, observer, name, _, _ in
          guard let observer, let name else { return }
          let module = Unmanaged<FlowActivityModule>.fromOpaque(observer).takeUnretainedValue()
          let action = (name.rawValue as String).components(separatedBy: ".").last ?? ""
          if action == "toggle", #available(iOS 17.0, *) { FlowActivityModule.flipPlaying() }
          module.sendEvent("onAction", ["action": action])
        },
        "com.thenetaji.flow.activity.\(action)" as CFString, nil, .deliverImmediately)
    }
  }

  // The island's play/pause flips at once; JS sends the real state right after.
  @available(iOS 17.0, *)
  private static func flipPlaying() {
    Task {
      let now = Date()
      for activity in running() {
        var s = activity.content.state
        let length = s.end.timeIntervalSince(s.start)
        if s.isPlaying {
          if length > 0 { s.progress = min(max(now.timeIntervalSince(s.start) / length, 0), 1) }
          s.isPlaying = false
          s.mood = "sleep"
        } else {
          s.start = now.addingTimeInterval(-length * s.progress)
          s.end = s.start.addingTimeInterval(length)
          s.isPlaying = true
          s.mood = "groove"
        }
        await activity.update(ActivityContent(state: s, staleDate: activity.content.staleDate))
      }
    }
  }

  // Swiping the app away gives a few seconds; end the activity so it doesn't linger for hours.
  private static func endAllBlocking() {
    guard #available(iOS 17.0, *) else { return }
    let done = DispatchSemaphore(value: 0)
    Task.detached {
      for activity in Activity<FlowActivityAttributes>.activities {
        await activity.end(nil, dismissalPolicy: .immediate)
      }
      done.signal()
    }
    _ = done.wait(timeout: .now() + 2)
  }
}
