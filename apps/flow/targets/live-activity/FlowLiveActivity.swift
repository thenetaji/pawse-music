import ActivityKit
import AppIntents
import SwiftUI
import UIKit
import WidgetKit

@main
struct FlowWidgets: WidgetBundle {
  var body: some Widget {
    FlowLiveActivity()
  }
}

typealias FlowState = FlowActivityAttributes.ContentState

enum FlowTheme {
  /// The cat's headphone purple, Flow's default accent.
  static let accent = Color(red: 0.545, green: 0.486, blue: 1)
  static let secondary = Color.white.opacity(0.6)
}

// Sized for the HIG metrics: compact and minimal are 36.67 pt tall, expanded and lock screen stay under 160 pt.
struct FlowLiveActivity: Widget {
  var body: some WidgetConfiguration {
    ActivityConfiguration(for: FlowActivityAttributes.self) { context in
      LockScreenView(state: context.state)
        .activityBackgroundTint(Color.black.opacity(0.45))
        .activitySystemActionForegroundColor(.white)
    } dynamicIsland: { context in
      DynamicIsland {
        DynamicIslandExpandedRegion(.leading) {
          ArtworkView(name: context.state.artwork, size: 52, radius: 12)
        }
        DynamicIslandExpandedRegion(.trailing) {
          CatStage(state: context.state, size: 44)
        }
        DynamicIslandExpandedRegion(.center) {
          TitleView(state: context.state)
        }
        DynamicIslandExpandedRegion(.bottom) {
          PlayerBar(state: context.state)
            .padding(.top, 6)
        }
      } compactLeading: {
        // During an episode the mouse peeks out from behind the camera where the artwork sits.
        if let mouse = mouseImage(context.state) {
          Image(mouse)
            .resizable()
            .interpolation(.high)
            .aspectRatio(contentMode: .fit)
            .frame(width: 22, height: 22)
            .transition(.move(edge: .trailing).combined(with: .opacity))
        } else {
          ArtworkView(name: context.state.artwork, size: 22, radius: 6)
        }
      } compactTrailing: {
        CatRing(state: context.state, size: 22)
      } minimal: {
        CatRing(state: context.state, size: 24)
      }
      .contentMargins(.horizontal, 8, for: .compactLeading)
      .contentMargins(.horizontal, 8, for: .compactTrailing)
      .contentMargins(.horizontal, 18, for: .expanded)
      .contentMargins(.bottom, 14, for: .expanded)
      .keylineTint(FlowTheme.accent)
    }
  }
}

struct LockScreenView: View {
  let state: FlowState

  var body: some View {
    VStack(spacing: 12) {
      HStack(spacing: 12) {
        ArtworkView(name: state.artwork, size: 52, radius: 12)
        TitleView(state: state)
        CatStage(state: state, size: 44)
      }
      PlayerBar(state: state)
    }
    .padding(.horizontal, 16)
    .padding(.vertical, 14)
    .foregroundStyle(.white)
    .environment(\.colorScheme, .dark)
  }
}

struct TitleView: View {
  let state: FlowState

  var body: some View {
    VStack(alignment: .leading, spacing: 2) {
      Text(state.title)
        .font(.system(size: 15, weight: .semibold))
        .foregroundStyle(.white)
        .lineLimit(1)
      Text(state.artist)
        .font(.system(size: 13))
        .foregroundStyle(FlowTheme.secondary)
        .lineLimit(1)
    }
    .frame(maxWidth: .infinity, alignment: .leading)
  }
}

/// Elapsed time, a slim bar, remaining time, then play/pause and next.
struct PlayerBar: View {
  let state: FlowState

  var body: some View {
    HStack(spacing: 8) {
      TimeLabel(state: state, remaining: false)
      SlimProgress(state: state)
      TimeLabel(state: state, remaining: true)
      Button(intent: FlowToggleIntent()) {
        Image(systemName: state.isPlaying ? "pause.fill" : "play.fill")
          .font(.system(size: 20, weight: .semibold))
          .frame(width: 34, height: 34)
          .contentShape(Rectangle())
      }
      .buttonStyle(.plain)
      Button(intent: FlowNextIntent()) {
        Image(systemName: "forward.fill")
          .font(.system(size: 17, weight: .semibold))
          .frame(width: 34, height: 34)
          .contentShape(Rectangle())
      }
      .buttonStyle(.plain)
    }
    .foregroundStyle(.white)
  }
}

// Timer text runs on its own like the bar; pauseTime freezes it while paused.
struct TimeLabel: View {
  let state: FlowState
  let remaining: Bool

  var body: some View {
    Group {
      if state.end > state.start {
        timer
      } else {
        Text(verbatim: remaining ? "" : "0:00")
      }
    }
    .font(.system(size: 11, weight: .medium).monospacedDigit())
    .foregroundStyle(FlowTheme.secondary)
    .lineLimit(1)
    .multilineTextAlignment(remaining ? .trailing : .leading)
    .frame(width: 38, alignment: remaining ? .trailing : .leading)
  }

  private var timer: Text {
    let range = state.start...state.end
    let length = state.end.timeIntervalSince(state.start)
    let pause: Date? = state.isPlaying ? nil : state.start.addingTimeInterval(length * state.progress)
    if remaining {
      let left = Text(timerInterval: range, pauseTime: pause, countsDown: true, showsHours: false)
      return Text(verbatim: "-") + left
    }
    return Text(timerInterval: range, pauseTime: pause, countsDown: false, showsHours: false)
  }
}

// timerInterval moves on its own, so a playing track needs no updates for the bar.
struct SlimProgress: View {
  let state: FlowState

  var body: some View {
    Group {
      if state.isPlaying && state.end > state.start {
        ProgressView(timerInterval: state.start...state.end, countsDown: false) {
          EmptyView()
        } currentValueLabel: {
          EmptyView()
        }
      } else {
        ProgressView(value: state.progress)
      }
    }
    .progressViewStyle(.linear)
    .tint(.white)
  }
}

/// Compact and minimal: the cat's head inside a thin ring that tracks the song.
struct CatRing: View {
  let state: FlowState
  let size: CGFloat

  var body: some View {
    ZStack {
      RingProgress(state: state)
      Image(catImage(state, head: true))
        .resizable()
        .interpolation(.high)
        .aspectRatio(contentMode: .fit)
        .frame(width: size * 0.74, height: size * 0.74)
    }
    .frame(width: size, height: size)
    .accessibilityElement(children: .ignore)
    .accessibilityLabel(catLabel(state))
  }
}

struct RingProgress: View {
  let state: FlowState

  var body: some View {
    if state.isPlaying && state.end > state.start {
      ProgressView(timerInterval: state.start...state.end, countsDown: false) {
        EmptyView()
      } currentValueLabel: {
        EmptyView()
      }
      .progressViewStyle(.circular)
      .tint(FlowTheme.accent)
    } else {
      // A determinate circular ProgressView can render as a spinner, so draw the paused ring.
      ZStack {
        Circle()
          .stroke(FlowTheme.accent.opacity(0.25), lineWidth: 2)
        Circle()
          .trim(from: 0, to: CGFloat(state.progress))
          .stroke(FlowTheme.accent, style: StrokeStyle(lineWidth: 2, lineCap: .round))
          .rotationEffect(.degrees(-90))
      }
      .padding(1)
    }
  }
}

/// Expanded and lock screen: the full cat; during a cameo the mouse peeks in on its left and the cat looks at it.
struct CatStage: View {
  let state: FlowState
  let size: CGFloat

  var body: some View {
    ZStack(alignment: .bottomLeading) {
      if let mouse = mouseImage(state) {
        Image(mouse)
          .resizable()
          .interpolation(.high)
          .aspectRatio(contentMode: .fit)
          .frame(width: size * 0.55, height: size * 0.55)
          .offset(x: -size * 0.36)
      }
      Image(catImage(state, head: false))
        .resizable()
        .interpolation(.high)
        .aspectRatio(contentMode: .fit)
        .frame(width: size, height: size)
    }
    .frame(width: size, height: size)
    .accessibilityElement(children: .ignore)
    .accessibilityLabel(catLabel(state))
  }
}

private let catColors: Set<String> = ["orange", "black", "white", "grey"]

/// Asset names come from scripts/render-cat-frames.mjs: cat-<color>-<pose> and cat-<color>-head-<pose>.
func catImage(_ state: FlowState, head: Bool) -> String {
  let color = state.color.flatMap { catColors.contains($0) ? $0 : nil } ?? "orange"
  let even = state.frame % 2 == 0
  let pose: String
  if (state.mouse ?? 0) > 0 {
    pose = head ? "curious" : "look"
  } else {
    switch state.mood {
    case "groove": pose = even ? "groove-a" : "groove-b"
    case "happy": pose = "happy"
    case "curious": pose = "curious"
    default: pose = even ? "sleep-a" : "sleep-b"
    }
  }
  return head ? "cat-\(color)-head-\(pose)" : "cat-\(color)-\(pose)"
}

func mouseImage(_ state: FlowState) -> String? {
  switch state.mouse ?? 0 {
  case 1: return "mouse-peek-a"
  case 2: return "mouse-peek-b"
  default: return nil
  }
}

func catLabel(_ state: FlowState) -> String {
  let name = state.name ?? "The cat"
  switch state.mood {
  case "groove": return "\(name) is dancing"
  case "happy": return "\(name) is happy"
  case "curious": return "\(name) is curious"
  default: return "\(name) is asleep"
  }
}

struct ArtworkView: View {
  let name: String?
  let size: CGFloat
  let radius: CGFloat

  var body: some View {
    if let image = FlowAppGroup.artwork(named: name) {
      Image(uiImage: image)
        .resizable()
        .aspectRatio(contentMode: .fill)
        .frame(width: size, height: size)
        .clipShape(RoundedRectangle(cornerRadius: radius, style: .continuous))
    } else {
      // No App Group or no art yet: the headphone colours with a note, same shape as real art.
      ZStack {
        RoundedRectangle(cornerRadius: radius, style: .continuous)
          .fill(
            LinearGradient(
              colors: [FlowTheme.accent, Color(red: 0.294, green: 0.231, blue: 0.839)],
              startPoint: .top, endPoint: .bottom))
        Image(systemName: "music.note")
          .font(.system(size: size * 0.48, weight: .bold))
          .foregroundStyle(.white)
      }
      .frame(width: size, height: size)
    }
  }
}

enum FlowAppGroup {
  /// `ref` is "<group id>/<file name>" from the app's FlowArtwork.
  static func artwork(named ref: String?) -> UIImage? {
    guard let ref, let slash = ref.firstIndex(of: "/") else { return nil }
    let group = String(ref[..<slash])
    let name = String(ref[ref.index(after: slash)...])
    guard let dir = FileManager.default.containerURL(forSecurityApplicationGroupIdentifier: group) else { return nil }
    let file = dir.appendingPathComponent("artwork", isDirectory: true).appendingPathComponent(name)
    return UIImage(contentsOfFile: file.path)
  }
}
