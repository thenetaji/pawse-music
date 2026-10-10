package expo.modules.pawseisland

import android.content.Context
import android.media.AudioAttributes
import android.media.AudioManager
import android.media.AudioPlaybackConfiguration
import android.os.Build
import android.os.Handler
import android.os.Looper

/** Counts active media-like playback on the device, Pawse's own included (apps can't see whose it is). */
internal class OtherAudioWatch(context: Context, private val onChange: (Int) -> Unit) {
  private val audio = context.getSystemService(Context.AUDIO_SERVICE) as AudioManager
  private val main = Handler(Looper.getMainLooper())
  // Typed loosely so older Android versions never resolve these API 26/31 classes.
  private var callback: Any? = null
  private var modeListener: Any? = null
  private var last = -1

  fun start() {
    main.post { startNow() }
  }

  fun stop() {
    main.post { stopNow() }
  }

  /** The current count; 0 below Android 8. */
  fun count(): Int {
    if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return 0
    return try {
      count(audio.activePlaybackConfigurations)
    } catch (_: Throwable) {
      0
    }
  }

  private fun startNow() {
    if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O || callback != null) return
    val cb = object : AudioManager.AudioPlaybackCallback() {
      override fun onPlaybackConfigChanged(configs: MutableList<AudioPlaybackConfiguration>) {
        report(count(configs))
      }
    }
    audio.registerAudioPlaybackCallback(cb, main)
    callback = cb
    // A call changes the audio mode without always showing up as playback.
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
      val listener = AudioManager.OnModeChangedListener { report(count()) }
      audio.addOnModeChangedListener({ main.post(it) }, listener)
      modeListener = listener
    }
    report(count())
  }

  private fun stopNow() {
    if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return
    (callback as? AudioManager.AudioPlaybackCallback)?.let { audio.unregisterAudioPlaybackCallback(it) }
    callback = null
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
      (modeListener as? AudioManager.OnModeChangedListener)?.let { audio.removeOnModeChangedListener(it) }
    }
    modeListener = null
    last = -1
  }

  private fun report(n: Int) {
    if (n == last) return
    last = n
    onChange(n)
  }

  private fun count(configs: List<AudioPlaybackConfiguration>): Int {
    if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return 0
    val players = configs.count { it.audioAttributes.usage in USAGES }
    return players + if (audio.mode > AudioManager.MODE_NORMAL) 1 else 0
  }

  companion object {
    private val USAGES = setOf(
      AudioAttributes.USAGE_MEDIA,
      AudioAttributes.USAGE_GAME,
      AudioAttributes.USAGE_VOICE_COMMUNICATION,
      AudioAttributes.USAGE_NOTIFICATION_RINGTONE,
      AudioAttributes.USAGE_ASSISTANT,
    )
  }
}
