import ActivityKit
import Foundation

// Keep identical to modules/pawse-activity/ios/PawseActivityAttributes.swift: ActivityKit matches the two by name and Codable shape.
struct PawseActivityAttributes: ActivityAttributes {
  struct ContentState: Codable, Hashable {
    var title: String
    var artist: String
    /// "<app group id>/<file name>" of a small JPEG, nil when there is no art yet.
    var artwork: String?
    var isPlaying: Bool
    /// groove | sleep | happy | curious, or a song mood: hype | vibe | love | sad
    var mood: String
    var frame: Int
    var start: Date
    var end: Date
    /// 0...1, used for the static bar while paused.
    var progress: Double
    /// orange | black | white | grey. Optional so an activity from an older build still decodes.
    var color: String?
    /// Mouse cameo frame: 0 none, 1 peeking, 2 head out.
    var mouse: Int?
    /// The cat's name, read out by VoiceOver.
    var name: String?
    /// "#RRGGBB" from the artwork. Optional so an activity from an older build still decodes.
    var tint: String?
    /// cat | music | time: what the compact island shows. Optional so an activity from an older build still decodes.
    var style: String?
    /// The song is liked / disliked in Pawse; the big island player's buttons show it.
    var liked: Bool?
    var disliked: Bool?
    /// Show the like and dislike buttons (Settings → Cat).
    var rate: Bool?
  }
}
