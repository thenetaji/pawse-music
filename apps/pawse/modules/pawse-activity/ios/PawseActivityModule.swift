import ActivityKit
import ExpoModulesCore
import UIKit

struct PawseActivityStateRecord: Record {
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
  /// cat | music | time: what the compact island shows.
  @Field var style: String = "cat"

  var staleDate: Date? {
    staleAt > 0 ? Date(timeIntervalSince1970: staleAt / 1000) : nil
  }

  var contentState: PawseActivityAttributes.ContentState {
    PawseActivityAttributes.ContentState(
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
      tint: tint,
      style: style
    )
  }
}

public class PawseActivityModule: Module {
  private static let actions = ["toggle", "next", "previous"]
  private var terminateObserver: NSObjectProtocol?

  public func definition() -> ModuleDefinition {
    Name("PawseActivity")

    Events("onAction")

    OnCreate {
      self.observeIntents()
      self.terminateObserver = NotificationCenter.default.addObserver(
        forName: UIApplication.willTerminateNotification, object: nil, queue: nil
      ) { _ in
        PawseActivityModule.endAllBlocking()
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
    AsyncFunction("start") { (record: PawseActivityStateRecord) async -> Bool in
      guard #available(iOS 17.0, *) else { return false }
      let content = ActivityContent(state: record.contentState, staleDate: record.staleDate)
      let running = PawseActivityModule.running()
      if let current = running.first {
        for extra in running.dropFirst() {
          await extra.end(nil, dismissalPolicy: .immediate)
        }
        await current.update(content)
        return true
      }
      do {
        let started = try Activity.request(attributes: PawseActivityAttributes(), content: content, pushType: nil)
        // Never two of ours: one that slipped past the check above (a start racing an end) goes now.
        for extra in PawseActivityModule.running() where extra.id != started.id {
          await extra.end(nil, dismissalPolicy: .immediate)
        }
        return true
      } catch {
        return false
      }
    }

    // False when nothing was running, so JS knows to start a new activity.
    AsyncFunction("update") { (record: PawseActivityStateRecord) async -> Bool in
      guard #available(iOS 17.0, *) else { return false }
      let content = ActivityContent(state: record.contentState, staleDate: record.staleDate)
      let running = PawseActivityModule.running()
      for activity in running {
        await activity.update(content)
      }
      return !running.isEmpty
    }

    AsyncFunction("end") { () async in
      guard #available(iOS 17.0, *) else { return }
      for activity in Activity<PawseActivityAttributes>.activities {
        await activity.end(nil, dismissalPolicy: .immediate)
      }
    }

    // Read by the patched AVPlayerEngine when an audio interruption ends.
    Function("setResumeAfterInterruption") { (on: Bool) in
      UserDefaults.standard.set(on, forKey: "pawse.resumeAfterInterruption")
    }

    // Downloads a small square JPEG into the App Group and returns its file name, or nil.
    AsyncFunction("setArtwork") { (url: String) async -> String? in
      await PawseArtwork.store(url)
    }

    // Square, bar-free JPEG in Caches from the first usable url, for the Now Playing art; returns a file URL or nil.
    AsyncFunction("squareArtwork") { (urls: [String], px: Int) async -> String? in
      await PawseArtwork.square(urls, side: px)
    }

    // Auto-backup folder: bookmarked at pick time so writes still work after a relaunch.
    Function("saveBackupFolder") { (uri: String) -> Bool in
      BackupFolder.save(uri)
    }

    Function("clearBackupFolder") {
      BackupFolder.clear()
    }

    AsyncFunction("writeBackupFile") { (name: String, text: String) async -> Bool in
      await BackupFolder.write(name, text)
    }

    AsyncFunction("listBackupFiles") { () async -> [String] in
      await BackupFolder.list()
    }

    AsyncFunction("readBackupFileHead") { (name: String, bytes: Int) async -> String? in
      await BackupFolder.head(name, bytes)
    }

    AsyncFunction("deleteBackupFile") { (name: String) async -> Bool in
      await BackupFolder.delete(name)
    }
  }

  @available(iOS 17.0, *)
  private static func running() -> [Activity<PawseActivityAttributes>] {
    Activity<PawseActivityAttributes>.activities.filter {
      $0.activityState == .active || $0.activityState == .stale
    }
  }

  private func observeIntents() {
    let center = CFNotificationCenterGetDarwinNotifyCenter()
    let observer = Unmanaged.passUnretained(self).toOpaque()
    for action in PawseActivityModule.actions {
      CFNotificationCenterAddObserver(
        center, observer,
        { _, observer, name, _, _ in
          guard let observer, let name else { return }
          let module = Unmanaged<PawseActivityModule>.fromOpaque(observer).takeUnretainedValue()
          let action = (name.rawValue as String).components(separatedBy: ".").last ?? ""
          if action == "toggle", #available(iOS 17.0, *) { PawseActivityModule.flipPlaying() }
          module.sendEvent("onAction", ["action": action])
        },
        "com.thenetaji.pawse.activity.\(action)" as CFString, nil, .deliverImmediately)
    }
  }

  // The island's play/pause flips at once; JS sends the real state right after.
  // The new state is computed before anything awaits, so a JS update landing first can't be flipped back.
  @available(iOS 17.0, *)
  private static func flipPlaying() {
    let now = Date()
    let updates = running().map { activity in
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
      return (activity, ActivityContent(state: s, staleDate: activity.content.staleDate))
    }
    Task {
      for (activity, content) in updates {
        await activity.update(content)
      }
    }
  }

  // Swiping the app away gives a few seconds; end the activity so it doesn't linger for hours.
  private static func endAllBlocking() {
    guard #available(iOS 17.0, *) else { return }
    let done = DispatchSemaphore(value: 0)
    Task.detached {
      for activity in Activity<PawseActivityAttributes>.activities {
        await activity.end(nil, dismissalPolicy: .immediate)
      }
      done.signal()
    }
    _ = done.wait(timeout: .now() + 2)
  }
}
