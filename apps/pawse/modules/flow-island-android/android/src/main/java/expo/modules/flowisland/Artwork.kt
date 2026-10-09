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
import android.net.Uri
import android.os.Handler
import android.os.Looper
import java.io.File
import java.io.FileOutputStream
import java.net.HttpURLConnection
import java.net.URL
import java.util.UUID
import java.util.concurrent.Executors

/** Artwork for the pill, the widget and the Now Playing art: plain HttpURLConnection on background threads. */
internal object Artwork {
  class Loaded(val bitmap: Bitmap, val accent: Int)

  private const val MAX_PX = 256
  private const val MAX_BYTES = 4 * 1024 * 1024
  private const val FILE = "flow_widget_art.png"
  private const val SQUARE_DIR = "flow-artwork"
  private const val KEEP_SQUARES = 80
  private const val PLACEHOLDER_PX = 120
  private const val DARK_MAX = 28

  private val io = Executors.newSingleThreadExecutor()
  private val squares = Executors.newSingleThreadExecutor()
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

  /** Square, bar-free JPEG of the first usable url in the cache dir; calls back off the main thread with its file URI or null. */
  fun square(context: Context, urls: List<String>, px: Int, done: (String?) -> Unit) {
    val app = context.applicationContext
    squares.execute {
      val uri = try {
        squareFile(app, urls, px)
      } catch (_: Throwable) {
        null
      }
      done(uri)
    }
  }

  private fun squareFile(context: Context, urls: List<String>, px: Int): String? {
    if (urls.isEmpty() || px <= 0) return null
    val dir = File(context.cacheDir, SQUARE_DIR)
    val key = UUID.nameUUIDFromBytes(urls.joinToString("\n").toByteArray()).toString()
    val file = File(dir, "sq-$px-$key.jpg")
    if (file.exists()) {
      file.setLastModified(System.currentTimeMillis())
      return Uri.fromFile(file).toString()
    }
    for ((i, url) in urls.withIndex()) {
      val data = (try { bytes(url) } catch (_: Exception) { null }) ?: continue
      // YouTube answers a missing still with a 120 px placeholder, so only the last url may be that small.
      val minWidth = if (i < urls.lastIndex) PLACEHOLDER_PX else 0
      val decoded = decode(data, px, minWidth) ?: continue
      val out = trimmedSquare(decoded, px)
      dir.mkdirs()
      val tmp = File(dir, "${file.name}.tmp")
      FileOutputStream(tmp).use { out.compress(Bitmap.CompressFormat.JPEG, 85, it) }
      if (!tmp.renameTo(file)) return null
      prune(dir)
      return Uri.fromFile(file).toString()
    }
    return null
  }

  private fun prune(dir: File) {
    val files = dir.listFiles()?.filter { it.name.endsWith(".jpg") } ?: return
    files.sortedByDescending { it.lastModified() }.drop(KEEP_SQUARES).forEach { it.delete() }
  }

  private fun fetch(url: String): Bitmap? {
    val data = bytes(url) ?: return null
    val decoded = decode(data, MAX_PX, 0) ?: return null
    return trimmedSquare(decoded, MAX_PX)
  }

  /** Raw image bytes from an http(s) or file:// url, null over MAX_BYTES. */
  private fun bytes(url: String): ByteArray? {
    if (url.startsWith("file://")) {
      val file = File(Uri.parse(url).path ?: return null)
      return if (file.length() in 1L..MAX_BYTES.toLong()) file.readBytes() else null
    }
    val conn = URL(url).openConnection() as HttpURLConnection
    try {
      conn.connectTimeout = 8000
      conn.readTimeout = 10000
      conn.instanceFollowRedirects = true
      conn.setRequestProperty("User-Agent", "Flow")
      if (conn.responseCode !in 200..299) return null
      return conn.inputStream.use { input ->
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
    } finally {
      conn.disconnect()
    }
  }

  /** Decodes at the largest power-of-two sample that keeps both sides at least [px]; null when not wider than [minWidth]. */
  private fun decode(bytes: ByteArray, px: Int, minWidth: Int): Bitmap? {
    val bounds = BitmapFactory.Options().apply { inJustDecodeBounds = true }
    BitmapFactory.decodeByteArray(bytes, 0, bytes.size, bounds)
    if (bounds.outWidth <= minWidth || bounds.outWidth <= 0 || bounds.outHeight <= 0) return null
    var sample = 1
    while (bounds.outWidth / (sample * 2) >= px && bounds.outHeight / (sample * 2) >= px) {
      sample *= 2
    }
    val opts = BitmapFactory.Options().apply { inSampleSize = sample }
    return BitmapFactory.decodeByteArray(bytes, 0, bytes.size, opts)
  }

  /** Drops near-black letterbox or pillarbox bars, keeps the centred square and scales it down to at most [px]. */
  private fun trimmedSquare(src: Bitmap, px: Int): Bitmap {
    val w = src.width
    val h = src.height
    var rows = 0
    var cols = 0
    if (w != h) {
      val pixels = IntArray(w * h)
      src.getPixels(pixels, 0, w, 0, 0, w, h)
      fun dark(c: Int) = maxOf(Color.red(c), Color.green(c), Color.blue(c)) <= DARK_MAX
      rows = bars(h) { y -> (0 until w).all { x -> dark(pixels[y * w + x]) } }
      cols = bars(w) { x -> (0 until h).all { y -> dark(pixels[y * w + x]) } }
    }
    val cw = w - 2 * cols
    val ch = h - 2 * rows
    val side = minOf(cw, ch)
    val cropped = if (side == w && side == h) src
    else Bitmap.createBitmap(src, cols + (cw - side) / 2, rows + (ch - side) / 2, side, side)
    return if (side > px) Bitmap.createScaledBitmap(cropped, px, px, true) else cropped
  }

  /** Bars are equal at both ends, so the shorter run counts; ignored under 2% and capped at 40% of the length. */
  private inline fun bars(length: Int, isBar: (Int) -> Boolean): Int {
    val cap = length * 2 / 5
    var start = 0
    while (start < cap && isBar(start)) start++
    var end = 0
    while (end < cap && isBar(length - 1 - end)) end++
    val bar = minOf(start, end)
    return if (bar >= maxOf(2, length / 50)) bar else 0
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
