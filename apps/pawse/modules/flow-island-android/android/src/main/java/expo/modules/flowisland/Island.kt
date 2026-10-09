package expo.modules.flowisland

import android.content.Context
import android.graphics.Bitmap
import android.os.Handler
import android.os.Looper

/** Process-wide state shared by the pill and the widget. Every entry point hops to the main thread. */
internal object Island {
  private val main = Handler(Looper.getMainLooper())
  private var pill: IslandPill? = null
  private var pillWanted = false
  private var state: Snapshot? = null
  private var art: Bitmap? = null
  private var artUrl: String? = null
  private var artAccent: Int? = null

  fun show(context: Context, s: Snapshot) = onMain {
    pillWanted = true
    apply(context.applicationContext, s, force = true)
  }

  fun update(context: Context, s: Snapshot) = onMain { apply(context.applicationContext, s) }

  fun hide() = onMain {
    pillWanted = false
    pill?.detach()
  }

  /** The widget asks for the latest state; null before the app has sent any. */
  fun current(): Snapshot? = state

  fun currentArt(): Bitmap? = art

  fun accentFor(s: Snapshot): Int = s.accent ?: artAccent ?: Snapshot.DEFAULT_ACCENT

  private fun apply(app: Context, s: Snapshot, force: Boolean = false) {
    val prev = state
    state = s
    s.save(app)
    if (s.artworkUrl != artUrl) {
      artUrl = s.artworkUrl
      art = null
      artAccent = null
      s.artworkUrl?.let { url ->
        Artwork.load(app, url) { loaded ->
          if (artUrl != url || loaded == null) return@load
          art = loaded.bitmap
          artAccent = loaded.accent
          state?.let { render(app, it) }
        }
      }
    }
    if (force || prev != s) render(app, s)
  }

  private fun render(app: Context, s: Snapshot) {
    val accent = accentFor(s)
    if (pillWanted) {
      val p = pill ?: IslandPill(app).also { pill = it }
      p.render(s, art, accent)
    }
    FlowWidget.refresh(app, s, art, accent)
  }

  private fun onMain(block: () -> Unit) {
    if (Looper.myLooper() == Looper.getMainLooper()) block() else main.post(block)
  }
}
