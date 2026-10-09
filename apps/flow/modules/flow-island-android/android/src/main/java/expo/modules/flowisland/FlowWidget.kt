package expo.modules.flowisland

import android.app.PendingIntent
import android.appwidget.AppWidgetManager
import android.appwidget.AppWidgetProvider
import android.content.BroadcastReceiver
import android.content.ComponentName
import android.content.Context
import android.content.Intent
import android.graphics.Bitmap
import android.media.AudioManager
import android.os.Build
import android.os.Bundle
import android.os.SystemClock
import android.view.KeyEvent
import android.widget.RemoteViews

/** The home-screen widget: art, title, artist, the cat for the mood, play/pause and next. */
class FlowWidgetProvider : AppWidgetProvider() {
  override fun onUpdate(context: Context, manager: AppWidgetManager, ids: IntArray) {
    FlowWidget.redraw(context, ids)
  }

  override fun onAppWidgetOptionsChanged(
    context: Context,
    manager: AppWidgetManager,
    id: Int,
    options: Bundle
  ) {
    FlowWidget.redraw(context, intArrayOf(id))
  }
}

/** Widget buttons. JS handles them when the app is running; otherwise they go to the media session. */
class FlowActionReceiver : BroadcastReceiver() {
  override fun onReceive(context: Context, intent: Intent) {
    val action = when (intent.action) {
      FlowWidget.ACTION_TOGGLE -> "toggle"
      FlowWidget.ACTION_NEXT -> "next"
      else -> return
    }
    if (!FlowIslandModule.emitAction(action)) FlowWidget.mediaKey(context, action)
  }
}

internal object FlowWidget {
  const val ACTION_TOGGLE = "expo.modules.flowisland.TOGGLE"
  const val ACTION_NEXT = "expo.modules.flowisland.NEXT"

  private fun ids(context: Context): IntArray = try {
    AppWidgetManager.getInstance(context)
      .getAppWidgetIds(ComponentName(context, FlowWidgetProvider::class.java))
  } catch (_: Throwable) {
    IntArray(0)
  }

  /** Called on every update(); cheap when no widget is placed. */
  fun refresh(context: Context, s: Snapshot, art: Bitmap?, accent: Int) {
    val ids = ids(context)
    if (ids.isEmpty()) return
    push(context, ids, views(context, s, art, accent))
  }

  /** The launcher asked: use the live state, or what the last run saved. */
  fun redraw(context: Context, ids: IntArray) {
    if (ids.isEmpty()) return
    val s = Island.current() ?: Snapshot.load(context)
    val art = Island.currentArt() ?: if (s?.artworkUrl != null) Artwork.cached(context) else null
    val accent = s?.let { Island.accentFor(it) } ?: Snapshot.DEFAULT_ACCENT
    push(context, ids, views(context, s, art, accent))
  }

  private fun push(context: Context, ids: IntArray, views: RemoteViews) {
    try {
      AppWidgetManager.getInstance(context).updateAppWidget(ids, views)
    } catch (_: Throwable) {
      // A launcher can reject an oversized bitmap; the next update tries again.
    }
  }

  private fun views(context: Context, s: Snapshot?, art: Bitmap?, accent: Int): RemoteViews {
    val v = RemoteViews(context.packageName, R.layout.flow_widget)
    if (s == null) {
      v.setTextViewText(R.id.flow_widget_title, context.getString(R.string.flow_widget_idle_title))
      v.setTextViewText(R.id.flow_widget_artist, context.getString(R.string.flow_widget_idle_artist))
    } else {
      v.setTextViewText(R.id.flow_widget_title, s.title)
      v.setTextViewText(R.id.flow_widget_artist, s.artist)
    }
    if (art != null) {
      v.setImageViewBitmap(R.id.flow_widget_art, Artwork.rounded(art, 0.18f))
    } else {
      v.setImageViewResource(R.id.flow_widget_art, R.drawable.flow_widget_art_placeholder)
    }
    v.setImageViewResource(R.id.flow_widget_cat, catFrame(s?.shownMood ?: Mood.SLEEP))
    val playing = s?.isPlaying == true
    v.setImageViewResource(
      R.id.flow_widget_toggle_icon,
      if (playing) R.drawable.flow_ic_pause else R.drawable.flow_ic_play
    )
    v.setInt(R.id.flow_widget_toggle_bg, "setColorFilter", accent)
    v.setOnClickPendingIntent(R.id.flow_widget_toggle, action(context, ACTION_TOGGLE, 1))
    v.setOnClickPendingIntent(R.id.flow_widget_next, action(context, ACTION_NEXT, 2))
    openApp(context)?.let { v.setOnClickPendingIntent(R.id.flow_widget_root, it) }
    return v
  }

  fun catFrame(mood: Mood): Int = when (mood) {
    Mood.GROOVE -> R.drawable.flow_cat_groove
    Mood.SLEEP -> R.drawable.flow_cat_sleep
    Mood.HAPPY -> R.drawable.flow_cat_happy
    Mood.CURIOUS -> R.drawable.flow_cat_curious
  }

  private fun immutable(): Int =
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) PendingIntent.FLAG_IMMUTABLE else 0

  private fun action(context: Context, action: String, code: Int): PendingIntent {
    val intent = Intent(context, FlowActionReceiver::class.java).setAction(action)
    return PendingIntent.getBroadcast(
      context,
      code,
      intent,
      PendingIntent.FLAG_UPDATE_CURRENT or immutable()
    )
  }

  private fun openApp(context: Context): PendingIntent? {
    val intent = context.packageManager.getLaunchIntentForPackage(context.packageName) ?: return null
    intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_RESET_TASK_IF_NEEDED)
    return PendingIntent.getActivity(context, 3, intent, PendingIntent.FLAG_UPDATE_CURRENT or immutable())
  }

  /** Falls back to the active media session (the player's) through a media key. */
  fun mediaKey(context: Context, action: String) {
    val code = if (action == "next") KeyEvent.KEYCODE_MEDIA_NEXT else KeyEvent.KEYCODE_MEDIA_PLAY_PAUSE
    val audio = context.getSystemService(Context.AUDIO_SERVICE) as? AudioManager ?: return
    val now = SystemClock.uptimeMillis()
    try {
      audio.dispatchMediaKeyEvent(KeyEvent(now, now, KeyEvent.ACTION_DOWN, code, 0))
      audio.dispatchMediaKeyEvent(KeyEvent(now, now, KeyEvent.ACTION_UP, code, 0))
    } catch (_: Throwable) {
    }
  }
}
