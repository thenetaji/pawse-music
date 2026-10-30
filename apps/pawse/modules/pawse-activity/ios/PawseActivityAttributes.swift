import ActivityKit
import Foundation

// Keep identical to targets/live-activity/PawseActivityAttributes.swift: ActivityKit matches the two by name and Codable shape.
struct PawseActivityAttributes: ActivityAttributes {
  struct ContentState: Codable, Hashable {
    var title: String
    var artist: String
    /// "<app group id>/<file name>" of a small JPEG, nil when there is no art yet.
    var artwork: String?
    var isPlaying: Bool
    var start: Date
    var end: Date
    /// 0...1, used for the static bar while paused.
    var progress: Double
    /// "#RRGGBB" from the artwork. Optional so an activity from an older build still decodes.
    var tint: String?
    /// classic | time; anything else reads as classic. Optional so an activity from an older build still decodes.
    var style: String?
    /// The song is liked / disliked in Pawse; the big island player's buttons show it.
    var liked: Bool?
    var disliked: Bool?
    /// Show the like and dislike buttons (Settings → Look and Mochi).
    var rate: Bool?
    /// "#RRGGBB": the song's colour nudged by its mood, for the keyline, ring and accents.
    var glow: String?
  }
}
