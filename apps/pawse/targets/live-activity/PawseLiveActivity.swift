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
  /// Pawse purple, the accent when the artwork has no colour yet.
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
      return DynamicIsland {
        DynamicIslandExpandedRegion(.leading) {
          // The art sits in a ring of the song's colour, glowing like the in-app player: 48 pt in all.
          ArtworkView(name: state.artwork, size: 42, radius: 12)
            .padding(3)
            .overlay(
              RoundedRectangle(cornerRadius: 15, style: .continuous)
                .strokeBorder(
                  LinearGradient(
                    colors: [accent(state), accent(state).opacity(0.25)],
                    startPoint: .topLeading, endPoint: .bottomTrailing),
                  lineWidth: 2)
            )
            .shadow(color: accent(state).opacity(0.5), radius: 8)
        }
        DynamicIslandExpandedRegion(.trailing) {
          TimeRing(state: state, size: 46, text: 12)
        }
        DynamicIslandExpandedRegion(.center) {
          // The top row is at most 52 pt, which keeps the whole island well under Apple's 160 pt.
          TitleView(state: state)
            .padding(.leading, 4)
            .frame(minHeight: 48, maxHeight: 52)
        }
        DynamicIslandExpandedRegion(.bottom) {
          PlayerBar(state: state)
            .padding(.top, 4)
        }
      } compactLeading: {
        // Fixed-width sides, art at the far left and the style at the far right, make the island long like Apple Music's.
        ArtworkView(name: state.artwork, size: 26, radius: 7)
          .frame(width: compactSide, alignment: .leading)
      } compactTrailing: {
        CompactTrailing(state: state)
          .frame(width: compactSide, alignment: .trailing)
      } minimal: {
        // iOS's own Now Playing island sits next to this bubble while music plays, so it never repeats the artwork.
        TimeRing(state: state, size: 26, text: 8)
      }
      .contentMargins(.horizontal, 20, for: .expanded)
      .contentMargins(.bottom, 6, for: .expanded)
      .keylineTint(accent(state))
    }
  }
}

/// Width of each side of the compact island; the content sits at its outer edge.
let compactSide: CGFloat = 60

/// Classic: sound bars and a ring that fills as the song plays. Time left: sound bars and the time left, ticking on its own.
/// Any other saved style, such as the retired "wire" or "lyrics", shows Classic.
struct CompactTrailing: View {
  let state: PawseState

  var body: some View {
    if state.style == "time" {
      HStack(spacing: 6) {
        WaveBars(state: state, height: 12)
          .frame(width: 14)
        TimeLeft(state: state, size: 13, width: 38)
      }
    } else {
      HStack(spacing: 8) {
        WaveBars(state: state, height: 13)
          .frame(width: 20)
        RingProgress(state: state)
          .frame(width: 24, height: 24)
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
    .minimumScaleFactor(0.7)
    .frame(width: width, alignment: align)
  }
}

extension ActivityViewContext where Attributes == PawseActivityAttributes {
  /// Out of date (Pawse was likely closed): shown paused instead of as a song that is still playing.
  var shown: PawseState {
    guard isStale else { return state }
    var s = state
    s.isPlaying = false
    return s
  }
}

/// iOS shows its own player above, so this card adds what it lacks: like/dislike and a song-coloured bar.
struct LockScreenView: View {
  let state: PawseState
  let stale: Bool

  var body: some View {
    VStack(spacing: 8) {
      HStack(spacing: 12) {
        ArtworkView(name: state.artwork, size: 44, radius: 10)
        VStack(alignment: .leading, spacing: 2) {
          Text(verbatim: state.title)
            .font(.system(size: 14, weight: .semibold))
            .foregroundStyle(.white)
            .lineLimit(1)
          Text(verbatim: stale ? "Open Pawse to keep listening" : state.artist)
            .font(.system(size: 13, weight: .medium))
            .foregroundStyle(accent(state))
            .lineLimit(1)
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

struct TitleView: View {
  let state: PawseState

  var body: some View {
    VStack(alignment: .leading, spacing: 2) {
      Text(state.title)
        .font(.system(size: 16, weight: .semibold))
        .foregroundStyle(.white)
        .lineLimit(1)
      Text(state.artist)
        .font(.system(size: 13))
        .foregroundStyle(PawseTheme.secondary)
        .lineLimit(1)
    }
    .frame(maxWidth: .infinity, alignment: .leading)
  }
}

struct PlayerBar: View {
  let state: PawseState

  var body: some View {
    VStack(spacing: 4) {
      HStack(spacing: 8) {
        TimeLabel(state: state, remaining: false)
        SlimProgress(state: state)
        TimeLabel(state: state, remaining: true)
      }
      if state.rate != false {
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

/// Like or dislike: outline when off, filled in the song's colour when on.
struct RateButton<I: LiveActivityIntent>: View {
  let intent: I
  let on: Bool
  let symbol: String
  let tint: Color

  var body: some View {
    Button(intent: intent) {
      Image(systemName: on ? "\(symbol).fill" : symbol)
        .font(.system(size: 17, weight: .semibold))
        .foregroundStyle(on ? tint : Color.white.opacity(0.75))
        .contentTransition(.symbolEffect(.replace))
        .frame(width: 44, height: 28)
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
    .font(.system(size: 12, weight: .medium).monospacedDigit())
    .foregroundStyle(PawseTheme.secondary)
    .lineLimit(1)
    .minimumScaleFactor(0.7)
    .multilineTextAlignment(remaining ? .trailing : .leading)
    .frame(width: 48, alignment: remaining ? .trailing : .leading)
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
    .frame(height: 6)
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
