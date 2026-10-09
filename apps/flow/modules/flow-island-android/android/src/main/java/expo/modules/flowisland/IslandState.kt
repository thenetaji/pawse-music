package expo.modules.flowisland

import android.content.Context
import android.graphics.Color
import expo.modules.kotlin.records.Field
import expo.modules.kotlin.records.Record

/** What JS sends to show() and update(). */
class PillState : Record {
  @Field var trackId: String? = null
  @Field var title: String = ""
  @Field var artist: String = ""
  @Field var artworkUrl: String? = null
  @Field var mood: String = "groove"
  @Field var isPlaying: Boolean = false
  @Field var accent: String? = null
  @Field var offsetX: Double = 0.0
  @Field var offsetY: Double = 0.0

  fun toSnapshot() = Snapshot(
    trackKey = trackId?.takeIf { it.isNotEmpty() } ?: "$title\u0000$artist",
    title = title,
    artist = artist,
    artworkUrl = artworkUrl?.takeIf { it.isNotEmpty() },
    mood = Mood.from(mood),
    isPlaying = isPlaying,
    accent = parseColor(accent),
    offsetXdp = offsetX.toFloat(),
    offsetYdp = offsetY.toFloat()
  )
}

enum class Mood { GROOVE, SLEEP, HAPPY, CURIOUS;
  companion object {
    fun from(s: String?): Mood = when (s) {
      "sleep", "idle" -> SLEEP
      "happy" -> HAPPY
      "curious" -> CURIOUS
      else -> GROOVE
    }
  }
}

data class Snapshot(
  val trackKey: String,
  val title: String,
  val artist: String,
  val artworkUrl: String?,
  val mood: Mood,
  val isPlaying: Boolean,
  /** Null: derive one from the artwork. */
  val accent: Int?,
  val offsetXdp: Float,
  val offsetYdp: Float
) {
  /** A paused cat sleeps whatever JS asked for, except a short happy/curious flash. */
  val shownMood: Mood
    get() = if (!isPlaying && mood == Mood.GROOVE) Mood.SLEEP else mood

  fun save(context: Context) {
    prefs(context).edit()
      .putString("trackKey", trackKey)
      .putString("title", title)
      .putString("artist", artist)
      .putString("artworkUrl", artworkUrl)
      .putString("mood", mood.name)
      .putBoolean("isPlaying", isPlaying)
      .putInt("accent", accent ?: 0)
      .putBoolean("hasAccent", accent != null)
      .apply()
  }

  companion object {
    const val DEFAULT_ACCENT = 0xFF8B7CFF.toInt()

    private fun prefs(context: Context) =
      context.getSharedPreferences("flow_island", Context.MODE_PRIVATE)

    fun load(context: Context): Snapshot? {
      val p = prefs(context)
      val title = p.getString("title", null) ?: return null
      return Snapshot(
        trackKey = p.getString("trackKey", "") ?: "",
        title = title,
        artist = p.getString("artist", "") ?: "",
        artworkUrl = p.getString("artworkUrl", null),
        mood = runCatching { Mood.valueOf(p.getString("mood", "SLEEP") ?: "SLEEP") }
          .getOrDefault(Mood.SLEEP),
        // A restored widget never claims to be playing; the app sends the truth when it runs.
        isPlaying = false,
        accent = if (p.getBoolean("hasAccent", false)) p.getInt("accent", DEFAULT_ACCENT) else null,
        offsetXdp = 0f,
        offsetYdp = 0f
      )
    }
  }
}

internal fun parseColor(s: String?): Int? {
  if (s.isNullOrBlank()) return null
  return try {
    Color.parseColor(s.trim())
  } catch (_: IllegalArgumentException) {
    null
  }
}
