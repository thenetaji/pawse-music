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

struct FlowLiveActivity: Widget {
  var body: some WidgetConfiguration {
    ActivityConfiguration(for: FlowActivityAttributes.self) { context in
      LockScreenView(state: context.state)
        .activityBackgroundTint(Color.black.opacity(0.8))
        .activitySystemActionForegroundColor(.white)
    } dynamicIsland: { context in
      DynamicIsland {
        DynamicIslandExpandedRegion(.leading) {
          ArtworkView(name: context.state.artwork, size: 52)
            .padding(.leading, 4)
        }
        DynamicIslandExpandedRegion(.trailing) {
          CatView(state: context.state, size: 56)
        }
        DynamicIslandExpandedRegion(.center) {
          TitleView(state: context.state)
        }
        DynamicIslandExpandedRegion(.bottom) {
          ControlsView(state: context.state)
        }
      } compactLeading: {
        ArtworkView(name: context.state.artwork, size: 24)
      } compactTrailing: {
        CatView(state: context.state, size: 26)
      } minimal: {
        CatView(state: context.state, size: 24)
      }
      .keylineTint(Color.orange)
    }
  }
}

struct LockScreenView: View {
  let state: FlowState

  var body: some View {
    VStack(spacing: 10) {
      HStack(spacing: 12) {
        ArtworkView(name: state.artwork, size: 56)
        TitleView(state: state)
        CatView(state: state, size: 64)
      }
      ControlsView(state: state)
    }
    .padding(14)
    .foregroundStyle(.white)
  }
}

struct TitleView: View {
  let state: FlowState

  var body: some View {
    VStack(alignment: .leading, spacing: 2) {
      Text(state.title)
        .font(.system(size: 15, weight: .semibold))
        .lineLimit(1)
      Text(state.artist)
        .font(.system(size: 13))
        .foregroundStyle(.white.opacity(0.65))
        .lineLimit(1)
    }
    .frame(maxWidth: .infinity, alignment: .leading)
  }
}

struct ControlsView: View {
  let state: FlowState

  var body: some View {
    HStack(spacing: 10) {
      ProgressBar(state: state)
      Button(intent: FlowToggleIntent()) {
        Image(systemName: state.isPlaying ? "pause.fill" : "play.fill")
          .font(.system(size: 20, weight: .semibold))
          .frame(width: 36, height: 36)
      }
      .buttonStyle(.plain)
      Button(intent: FlowNextIntent()) {
        Image(systemName: "forward.fill")
          .font(.system(size: 18, weight: .semibold))
          .frame(width: 36, height: 36)
      }
      .buttonStyle(.plain)
    }
    .foregroundStyle(.white)
  }
}

// timerInterval moves on its own, so a playing track needs no updates for the bar.
struct ProgressBar: View {
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

struct CatView: View {
  let state: FlowState
  let size: CGFloat

  var body: some View {
    Image(catFrame(state))
      .resizable()
      .interpolation(.high)
      .aspectRatio(contentMode: .fit)
      .frame(width: size, height: size)
  }
}

func catFrame(_ state: FlowState) -> String {
  let even = state.frame % 2 == 0
  switch state.mood {
  case "groove": return even ? "cat-groove-a" : "cat-groove-b"
  case "happy": return "cat-happy"
  case "curious": return "cat-curious"
  default: return even ? "cat-sleep-a" : "cat-sleep-b"
  }
}

struct ArtworkView: View {
  let name: String?
  let size: CGFloat

  var body: some View {
    if let image = FlowAppGroup.artwork(named: name) {
      Image(uiImage: image)
        .resizable()
        .aspectRatio(contentMode: .fill)
        .frame(width: size, height: size)
        .clipShape(RoundedRectangle(cornerRadius: size * 0.22, style: .continuous))
    } else {
      // No App Group or no art yet: the cat's headphone colours with a note.
      ZStack {
        Circle().fill(
          LinearGradient(
            colors: [Color(red: 0.545, green: 0.486, blue: 1), Color(red: 0.294, green: 0.231, blue: 0.839)],
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
