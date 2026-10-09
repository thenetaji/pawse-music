package expo.modules.flowisland

import android.content.Context
import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.graphics.BitmapShader
import android.graphics.Canvas
import android.graphics.Color
import android.graphics.Paint
import android.graphics.RectF
import android.graphics.Shader
import android.os.Handler
import android.os.Looper
import java.io.File
import java.io.FileOutputStream
import java.net.HttpURLConnection
import java.net.URL
import java.util.concurrent.Executors

/** Artwork for the pill and the widget: plain HttpURLConnection on one background thread. */
internal object Artwork {
  class Loaded(val bitmap: Bitmap, val accent: Int)

  private const val MAX_PX = 256
  private const val MAX_BYTES = 4 * 1024 * 1024
  private const val FILE = "flow_widget_art.png"

  private val io = Executors.newSingleThreadExecutor()
  private val main = Handler(Looper.getMainLooper())

  /** Calls back on the main thread with null when the download or decode fails. */
  fun load(context: Context, url: String, done: (Loaded?) -> Unit) {
    val app = context.applicationContext
    io.execute {
      val loaded = try {
        fetch(url)?.let { bmp -> Loaded(bmp, accentOf(bmp)) }
      } catch (_: Throwable) {
        null
      }
      loaded?.let { save(app, it.bitmap) }
      main.post { done(loaded) }
    }
  }

  /** The last artwork, for a widget redrawn after the process restarted. */
  fun cached(context: Context): Bitmap? = try {
    val f = File(context.filesDir, FILE)
    if (f.exists()) BitmapFactory.decodeFile(f.absolutePath) else null
  } catch (_: Throwable) {
    null
  }

  private fun fetch(url: String): Bitmap? {
    val conn = URL(url).openConnection() as HttpURLConnection
    try {
      conn.connectTimeout = 8000
      conn.readTimeout = 10000
      conn.instanceFollowRedirects = true
      conn.setRequestProperty("User-Agent", "Flow")
      if (conn.responseCode !in 200..299) return null
      val bytes = conn.inputStream.use { input ->
        val out = java.io.ByteArrayOutputStream()
        val buf = ByteArray(16 * 1024)
        while (true) {
          val n = input.read(buf)
          if (n < 0) break
          out.write(buf, 0, n)
          if (out.size() > MAX_BYTES) return null
        }
        out.toByteArray()
      }
      val bounds = BitmapFactory.Options().apply { inJustDecodeBounds = true }
      BitmapFactory.decodeByteArray(bytes, 0, bytes.size, bounds)
      var sample = 1
      while (bounds.outWidth / (sample * 2) >= MAX_PX && bounds.outHeight / (sample * 2) >= MAX_PX) {
        sample *= 2
      }
      val opts = BitmapFactory.Options().apply { inSampleSize = sample }
      val decoded = BitmapFactory.decodeByteArray(bytes, 0, bytes.size, opts) ?: return null
      return squareCrop(decoded)
    } finally {
      conn.disconnect()
    }
  }

  /** YouTube thumbnails are often 16:9 with bars; keep the centred square. */
  private fun squareCrop(src: Bitmap): Bitmap {
    val side = minOf(src.width, src.height)
    val cropped = if (src.width == src.height) src
    else Bitmap.createBitmap(src, (src.width - side) / 2, (src.height - side) / 2, side, side)
    return if (side > MAX_PX) Bitmap.createScaledBitmap(cropped, MAX_PX, MAX_PX, true) else cropped
  }

  private fun save(context: Context, bmp: Bitmap) {
    try {
      FileOutputStream(File(context.filesDir, FILE)).use { bmp.compress(Bitmap.CompressFormat.PNG, 100, it) }
    } catch (_: Throwable) {
    }
  }

  /** A vivid colour from the art, like the app's palette picker (saturation over brightness). */
  fun accentOf(bmp: Bitmap): Int {
    val small = Bitmap.createScaledBitmap(bmp, 16, 16, true)
    var best = Snapshot.DEFAULT_ACCENT
    var bestScore = -1f
    val hsv = FloatArray(3)
    for (y in 0 until 16) for (x in 0 until 16) {
      val c = small.getPixel(x, y)
      Color.colorToHSV(c, hsv)
      if (hsv[2] < 0.25f) continue
      val score = hsv[1] * 0.7f + hsv[2] * 0.3f
      if (score > bestScore) {
        bestScore = score
        best = c
      }
    }
    if (bestScore < 0.35f) return Snapshot.DEFAULT_ACCENT
    Color.colorToHSV(best, hsv)
    hsv[1] = maxOf(hsv[1], 0.45f)
    hsv[2] = maxOf(hsv[2], 0.75f)
    return Color.HSVToColor(hsv)
  }

  /** RemoteViews can't clip, so the widget gets pre-rounded art. */
  fun rounded(src: Bitmap, radiusFraction: Float): Bitmap {
    val out = Bitmap.createBitmap(src.width, src.height, Bitmap.Config.ARGB_8888)
    val paint = Paint(Paint.ANTI_ALIAS_FLAG).apply {
      shader = BitmapShader(src, Shader.TileMode.CLAMP, Shader.TileMode.CLAMP)
    }
    val r = src.width * radiusFraction
    Canvas(out).drawRoundRect(RectF(0f, 0f, src.width.toFloat(), src.height.toFloat()), r, r, paint)
    return out
  }
}
