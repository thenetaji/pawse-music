import ActivityKit
import Foundation

// Keep identical to targets/live-activity/FlowActivityAttributes.swift: ActivityKit matches the two by name and Codable shape.
struct FlowActivityAttributes: ActivityAttributes {
  struct ContentState: Codable, Hashable {
    var title: String
    var artist: String
    /// "<app group id>/<file name>" of a small JPEG, nil when there is no art yet.
    var artwork: String?
    var isPlaying: Bool
    /// groove | sleep | happy | curious
    var mood: String
    var frame: Int
    var start: Date
    var end: Date
    /// 0...1, used for the static bar while paused.
    var progress: Double
  }
}
