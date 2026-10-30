import ActivityKit
import AppIntents
import SwiftUI
import UIKit
import WidgetKit

@main
struct PawseWidgets: WidgetBundle {
  var body: some Widget {
    PawseLiveActivity()
  }
}

typealias PawseState = PawseActivityAttributes.ContentState

enum PawseTheme {
  /// The cat's headphone purple, the accent when the artwork has no colour yet.
  static let accent = Color(red: 0.545, green: 0.486, blue: 1)
  static let secondary = Color.white.opacity(0.6)
}

private func rgb(_ hex: String?) -> (Double, Double, Double)? {
  guard let hex, hex.count == 7, hex.first == "#", let v = UInt32(hex.dropFirst(), radix: 16) else {
    return nil
  }
  return (Double((v >> 16) & 0xFF) / 255, Double((v >> 8) & 0xFF) / 255, Double(v & 0xFF) / 255)
}

/// The artwork's colour, so the ring, bar and text match the song like the in-app player.
func accent(_ state: PawseState) -> Color {
  guard let c = rgb(state.glow ?? state.tint) else { return PawseTheme.accent }
  return Color(red: c.0, green: c.1, blue: c.2)
}

/// A deep shade of the artwork colour for the lock screen card, dark enough for white text.
func deepAccent(_ state: PawseState) -> Color {
  guard let c = rgb(state.glow ?? state.tint) else { return Color.black.opacity(0.45) }
  return Color(red: c.0 * 0.32, green: c.1 * 0.32, blue: c.2 * 0.32).opacity(0.82)
}

// Sized for the HIG metrics: compact and minimal are 36.67 pt tall, expanded and lock screen stay under 160 pt.
struct PawseLiveActivity: Widget {
  var body: some WidgetConfiguration {
    ActivityConfiguration(for: PawseActivityAttributes.self) { context in
      LockScreenView(state: context.shown, stale: context.isStale)
        .activityBackgroundTint(deepAccent(context.shown))
        .activitySystemActionForegroundColor(.white)
    } dynamicIsland: { activity in
      let state = activity.shown
      let mode = expandedLayout(state)
      return DynamicIsland {
        DynamicIslandExpandedRegion(.leading) {
          // The art sits in a ring of the song's colour, glowing like the in-app player.
          ArtworkView(name: state.artwork, size: 58, radius: 15)
            .padding(3)
            .overlay(
              RoundedRectangle(cornerRadius: 18, style: .continuous)
                .strokeBorder(
                  LinearGradient(
                    colors: [accent(state), accent(state).opacity(0.25)],
                    startPoint: .topLeading, endPoint: .bottomTrailing),
                  lineWidth: 2)
            )
            .shadow(color: accent(state).opacity(0.55), radius: 12)
        }
        DynamicIslandExpandedRegion(.trailing) {
          if mode == .classic || mode == .time {
            TimeRing(state: state, size: 58, text: 13)
              .frame(height: 64)
          } else {
            CatStage(state: state, size: 62)
          }
        }
        DynamicIslandExpandedRegion(.center) {
          TitleView(state: state, hero: mode == .lyrics)
            .padding(.leading, 6)
            .frame(maxHeight: .infinity)
        }
        DynamicIslandExpandedRegion(.bottom) {
          PlayerBar(state: state, mode: mode)
            .padding(.top, 6)
        }
      } compactLeading: {
        // Fixed-width sides, art at the far left and the style at the far right, make the island long like Apple Music's.
        Group {
          // During an episode the mouse peeks out from behind the camera where the artwork sits.
          if let mouse = mouseImage(state), islandLayout(state) != .time {
            Image(mouse)
              .resizable()
              .interpolation(.high)
              .aspectRatio(contentMode: .fit)
              .frame(width: 26, height: 26)
              .transition(.move(edge: .trailing).combined(with: .opacity))
          } else {
            ArtworkView(name: state.artwork, size: 26, radius: 7)
          }
        }
        .frame(width: compactSide, alignment: .leading)
      } compactTrailing: {
        CompactTrailing(state: state)
          .frame(width: compactSide, alignment: .trailing)
      } minimal: {
        // iOS's own Now Playing island sits next to this bubble while music plays, so it never repeats the artwork.
        if islandLayout(state) == .time {
          TimeRing(state: state, size: 26, text: 8)
        } else {
          CatRing(state: state, size: 24)
        }
      }
      .contentMargins(.horizontal, 20, for: .expanded)
      .contentMargins(.bottom, 8, for: .expanded)
      .keylineTint(accent(state))
    }
  }
}

/// Width of each side of the compact island; the content sits at its outer edge.
let compactSide: CGFloat = 60

enum IslandLayout {
  case wire, classic, lyrics, paws, time
}

/// An older build saved "cat" for what is now the wire layout.
func islandLayout(_ state: PawseState) -> IslandLayout {
  switch state.style {
  case "classic": return .classic
  case "lyrics": return .lyrics
  case "paws": return .paws
  case "time": return .time
  default: return .wire
  }
}

/// The lyrics layout needs a synced line (even an empty one between lines); without it the classic one shows.
func expandedLayout(_ state: PawseState) -> IslandLayout {
  let l = islandLayout(state)
  return l == .lyrics && state.lyric == nil ? .classic : l
}

/// Time layout: the time left, ticking on its own. Every other layout: sound bars and the cat in its ring.
struct CompactTrailing: View {
  let state: PawseState

  var body: some View {
    switch islandLayout(state) {
    case .time:
      HStack(spacing: 6) {
        WaveBars(state: state, height: 12)
          .frame(width: 14)
        TimeLeft(state: state, size: 13, width: 38)
      }
    default:
      HStack(spacing: 8) {
        WaveBars(state: state, height: 13)
          .frame(width: 20)
        CatRing(state: state, size: 24)
      }
    }
  }
}

/// Apple Music style bars in the artwork colour; they dim when paused.
struct WaveBars: View {
  let state: PawseState
  let height: CGFloat

  var body: some View {
    Image(systemName: "waveform")
      .resizable()
      .aspectRatio(contentMode: .fit)
      .frame(height: height)
      .fontWeight(.bold)
      .foregroundStyle(accent(state))
      .opacity(state.isPlaying ? 1 : 0.45)
      .symbolEffect(.variableColor.iterative.dimInactiveLayers, isActive: state.isPlaying)
      .accessibilityHidden(true)
  }
}

/// Time left inside a ring of the song's colour that fills as it plays; both run on their own.
struct TimeRing: View {
  let state: PawseState
  let size: CGFloat
  let text: CGFloat

  var body: some View {
    ZStack {
      RingProgress(state: state)
      TimeLeft(state: state, size: text, width: size * 0.8, align: .center)
    }
    .frame(width: size, height: size)
  }
}

/// The time left in the song, counting down by itself while playing.
struct TimeLeft: View {
  let state: PawseState
  var size: CGFloat = 14
  var width: CGFloat = 44
  var align: Alignment = .trailing

  var body: some View {
    Group {
      if state.end > state.start {
        let length = state.end.timeIntervalSince(state.start)
        let pause: Date? = state.isPlaying ? nil : state.start.addingTimeInterval(length * state.progress)
        Text(timerInterval: state.start...state.end, pauseTime: pause, countsDown: true, showsHours: false)
      } else {
        Text(verbatim: "--:--")
      }
    }
    .font(.system(size: size, weight: .semibold).monospacedDigit())
    .foregroundStyle(accent(state))
    .multilineTextAlignment(align == .center ? .center : .trailing)
    .lineLimit(1)
    .frame(width: width, alignment: align)
  }
}

extension ActivityViewContext where Attributes == PawseActivityAttributes {
  /// Out of date (Pawse was likely closed): the cat naps instead of showing a frozen song.
  var shown: PawseState {
    guard isStale else { return state }
    var s = state
    s.isPlaying = false
    s.mood = "sleep"
    s.mouse = 0
    s.lyric = nil
    s.moodLine = false
    return s
  }
}

/// iOS shows its own player above, so this card adds what it lacks: the cat, like/dislike and a song-coloured bar.
struct LockScreenView: View {
  let state: PawseState
  let stale: Bool

  var body: some View {
    VStack(spacing: 8) {
      HStack(spacing: 12) {
        CatStage(state: state, size: 44)
        VStack(alignment: .leading, spacing: 2) {
          Text(verbatim: state.title)
            .font(.system(size: 14, weight: .semibold))
            .foregroundStyle(.white)
            .lineLimit(1)
          Text(verbatim: stale ? "Open Pawse to keep listening" : state.artist)
            .font(.system(size: 13, weight: .medium))
            .foregroundStyle(accent(state))
            .lineLimit(1)
          if let lyric = state.lyric, !lyric.isEmpty {
            Text(verbatim: lyric)
              .font(.system(size: 13, weight: .medium))
              .foregroundStyle(Color.white.opacity(0.85))
              .lineLimit(2)
              .minimumScaleFactor(0.85)
              .fixedSize(horizontal: false, vertical: true)
              .contentTransition(.opacity)
              .padding(.top, 2)
          } else if state.moodLine == true {
            MoodLine(state: state)
          }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        if !stale && state.rate != false {
          RateButton(
            intent: PawseLikeIntent(), on: state.liked == true, symbol: "heart", tint: accent(state))
          RateButton(
            intent: PawseDislikeIntent(), on: state.disliked == true, symbol: "hand.thumbsdown",
            tint: accent(state))
        }
      }
      if !stale {
        SlimProgress(state: state)
      }
    }
    .padding(.horizontal, 16)
    .padding(.vertical, 12)
    .environment(\.colorScheme, .dark)
  }
}

/// Title and artist, or the sung lyric line with the song in small print above it.
struct TitleView: View {
  let state: PawseState
  let hero: Bool

  var body: some View {
    if hero {
      VStack(alignment: .leading, spacing: 3) {
        Text(verbatim: "\(state.title) · \(state.artist)")
          .font(.system(size: 12, weight: .medium))
          .foregroundStyle(PawseTheme.secondary)
          .lineLimit(1)
        Text(verbatim: state.lyric ?? "")
          .font(.system(size: 16, weight: .semibold))
          .foregroundStyle(.white)
          .lineLimit(2)
          .minimumScaleFactor(0.8)
          .multilineTextAlignment(.leading)
          .fixedSize(horizontal: false, vertical: true)
          .frame(maxWidth: .infinity, minHeight: 40, alignment: .topLeading)
          .contentTransition(.opacity)
          .animation(.easeInOut(duration: 0.3), value: state.lyric)
      }
      .frame(maxWidth: .infinity, alignment: .leading)
    } else {
      VStack(alignment: .leading, spacing: 3) {
        Text(state.title)
          .font(.system(size: 17, weight: .semibold))
          .foregroundStyle(.white)
          .lineLimit(1)
        Text(state.artist)
          .font(.system(size: 15))
          .foregroundStyle(PawseTheme.secondary)
          .lineLimit(1)
        if state.moodLine == true {
          MoodLine(state: state)
        }
      }
      .frame(maxWidth: .infinity, alignment: .leading)
    }
  }
}

struct MoodLine: View {
  let state: PawseState

  var body: some View {
    Text(verbatim: catLine(state))
      .font(.system(size: 12, weight: .semibold))
      .foregroundStyle(accent(state))
      .lineLimit(1)
      .minimumScaleFactor(0.8)
  }
}

func catLine(_ state: PawseState) -> String {
  let name = state.name ?? "Mochi"
  if (state.mouse ?? 0) > 0 { return "\(name) spotted a mouse" }
  switch state.mood {
  case "groove": return "\(name) is dancing"
  case "hype": return "\(name) is going wild"
  case "vibe": return "\(name) is vibing"
  case "love": return "\(name) is in love with this one"
  case "sad": return "\(name) is feeling this one"
  case "happy": return "\(name) loves this one"
  case "curious": return "\(name) is listening"
  default: return "\(name) is napping"
  }
}

struct PlayerBar: View {
  let state: PawseState
  let mode: IslandLayout

  var body: some View {
    VStack(spacing: 6) {
      if mode == .wire {
        WireBar(state: state)
      } else {
        HStack(spacing: 10) {
          TimeLabel(state: state, remaining: false)
          SlimProgress(state: state)
          TimeLabel(state: state, remaining: true)
        }
      }
      if mode == .paws {
        HStack(spacing: 0) {
          PawButton(
            intent: PawseToggleIntent(), symbol: state.isPlaying ? "pause.fill" : "play.fill",
            tint: accent(state))
          PawButton(intent: PawseNextIntent(), symbol: "forward.fill", tint: accent(state))
          Spacer(minLength: 0)
          if state.rate != false {
            RateButton(
              intent: PawseLikeIntent(), on: state.liked == true, symbol: "heart", tint: accent(state))
            RateButton(
              intent: PawseDislikeIntent(), on: state.disliked == true, symbol: "hand.thumbsdown",
              tint: accent(state))
          }
        }
      } else if state.rate != false {
        HStack(spacing: 0) {
          RateButton(
            intent: PawseLikeIntent(), on: state.liked == true, symbol: "heart", tint: accent(state))
          Spacer(minLength: 0)
          RateButton(
            intent: PawseDislikeIntent(), on: state.disliked == true, symbol: "hand.thumbsdown",
            tint: accent(state))
        }
      }
    }
    .foregroundStyle(.white)
  }
}

/// The bar is the headphone cable: the cat's head rides it at the position of the last update.
struct WireBar: View {
  let state: PawseState
  private let cat: CGFloat = 20

  var body: some View {
    HStack(spacing: 10) {
      TimeLabel(state: state, remaining: false)
      SlimProgress(state: state)
        .overlay {
          GeometryReader { geo in
            Image(catImage(state, head: true))
              .resizable()
              .interpolation(.high)
              .aspectRatio(contentMode: .fit)
              .frame(width: cat, height: cat)
              .position(x: catX(geo.size.width), y: geo.size.height / 2 - cat / 2 + 1)
              .animation(.linear(duration: 4), value: state.progress)
          }
        }
      TimeLabel(state: state, remaining: true)
    }
    .padding(.top, 12)
  }

  private func catX(_ width: CGFloat) -> CGFloat {
    let p = CGFloat(min(max(state.progress, 0), 1))
    return cat / 2 + max(width - cat, 0) * p
  }
}

struct PawButton<I: LiveActivityIntent>: View {
  let intent: I
  let symbol: String
  let tint: Color

  var body: some View {
    Button(intent: intent) {
      ZStack {
        Image(systemName: "pawprint.fill")
          .font(.system(size: 34))
          .foregroundStyle(tint.opacity(0.35))
        Image(systemName: symbol)
          .font(.system(size: 13, weight: .bold))
          .foregroundStyle(.white)
          .contentTransition(.symbolEffect(.replace))
          .offset(y: 3)
      }
      .frame(width: 48, height: 36)
      .contentShape(Rectangle())
    }
    .buttonStyle(.plain)
  }
}

/// Like or dislike: outline when off, filled in the song's colour when on.
struct RateButton<I: LiveActivityIntent>: View {
  let intent: I
  let on: Bool
  let symbol: String
  let tint: Color

  var body: some View {
    Button(intent: intent) {
      Image(systemName: on ? "\(symbol).fill" : symbol)
        .font(.system(size: 18, weight: .semibold))
        .foregroundStyle(on ? tint : Color.white.opacity(0.75))
        .contentTransition(.symbolEffect(.replace))
        .frame(width: 44, height: 30)
        .contentShape(Rectangle())
    }
    .buttonStyle(.plain)
  }
}

struct ControlButton<I: LiveActivityIntent>: View {
  let intent: I
  let symbol: String
  let size: CGFloat

  var body: some View {
    Button(intent: intent) {
      Image(systemName: symbol)
        .font(.system(size: size, weight: .semibold))
        .contentTransition(.symbolEffect(.replace))
        .frame(width: 52, height: 34)
        .contentShape(Rectangle())
    }
    .buttonStyle(.plain)
  }
}

// Timer text runs on its own like the bar; pauseTime freezes it while paused.
struct TimeLabel: View {
  let state: PawseState
  let remaining: Bool

  var body: some View {
    Group {
      if state.end > state.start {
        timer
      } else {
        Text(verbatim: remaining ? "" : "0:00")
      }
    }
    .font(.system(size: 13, weight: .medium).monospacedDigit())
    .foregroundStyle(PawseTheme.secondary)
    .lineLimit(1)
    .multilineTextAlignment(remaining ? .trailing : .leading)
    .frame(width: 46, alignment: remaining ? .trailing : .leading)
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
  let state: PawseState

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
    .tint(accent(state))
  }
}

/// Compact and minimal: the cat's head inside a thin ring that tracks the song.
struct CatRing: View {
  let state: PawseState
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
  let state: PawseState

  var body: some View {
    if state.isPlaying && state.end > state.start {
      ProgressView(timerInterval: state.start...state.end, countsDown: false) {
        EmptyView()
      } currentValueLabel: {
        EmptyView()
      }
      .progressViewStyle(.circular)
      .tint(accent(state))
    } else {
      // A determinate circular ProgressView can render as a spinner, so draw the paused ring.
      ZStack {
        Circle()
          .stroke(accent(state).opacity(0.25), lineWidth: 2)
        Circle()
          .trim(from: 0, to: CGFloat(state.progress))
          .stroke(accent(state), style: StrokeStyle(lineWidth: 2, lineCap: .round))
          .rotationEffect(.degrees(-90))
      }
      .padding(1)
    }
  }
}

/// Expanded and lock screen: the full cat; during a cameo the mouse peeks in on its left and the cat looks at it.
struct CatStage: View {
  let state: PawseState
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
func catImage(_ state: PawseState, head: Bool) -> String {
  let color = state.color.flatMap { catColors.contains($0) ? $0 : nil } ?? "orange"
  let even = state.frame % 2 == 0
  let pose: String
  if (state.mouse ?? 0) > 0 {
    pose = head ? "curious" : "look"
  } else {
    switch state.mood {
    case "groove", "hype", "vibe", "love", "sad": pose = "\(state.mood)-\(even ? "a" : "b")"
    case "happy": pose = "happy"
    case "curious": pose = "curious"
    default: pose = even ? "sleep-a" : "sleep-b"
    }
  }
  return head ? "cat-\(color)-head-\(pose)" : "cat-\(color)-\(pose)"
}

func mouseImage(_ state: PawseState) -> String? {
  switch state.mouse ?? 0 {
  case 1: return "mouse-peek-a"
  case 2: return "mouse-peek-b"
  default: return nil
  }
}

func catLabel(_ state: PawseState) -> String {
  let name = state.name ?? "The cat"
  switch state.mood {
  case "groove", "hype": return "\(name) is dancing"
  case "vibe": return "\(name) is swaying"
  case "love": return "\(name) is in love"
  case "sad": return "\(name) is feeling the song"
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
    if let image = PawseAppGroup.artwork(named: name) {
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
              colors: [PawseTheme.accent, Color(red: 0.294, green: 0.231, blue: 0.839)],
              startPoint: .top, endPoint: .bottom))
        Image(systemName: "music.note")
          .font(.system(size: size * 0.48, weight: .bold))
          .foregroundStyle(.white)
      }
      .frame(width: size, height: size)
    }
  }
}

enum PawseAppGroup {
  /// `ref` is "<group id>/<file name>" from the app's PawseArtwork.
  static func artwork(named ref: String?) -> UIImage? {
    guard let ref, let slash = ref.firstIndex(of: "/") else { return nil }
    let group = String(ref[..<slash])
    let name = String(ref[ref.index(after: slash)...])
    guard let dir = FileManager.default.containerURL(forSecurityApplicationGroupIdentifier: group) else { return nil }
    let file = dir.appendingPathComponent("artwork", isDirectory: true).appendingPathComponent(name)
    return UIImage(contentsOfFile: file.path)
  }
}
