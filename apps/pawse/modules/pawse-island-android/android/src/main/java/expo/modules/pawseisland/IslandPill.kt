package expo.modules.pawseisland

import android.annotation.SuppressLint
import android.content.ComponentCallbacks
import android.content.Context
import android.content.Intent
import android.content.res.Configuration
import android.graphics.Bitmap
import android.graphics.Outline
import android.graphics.PixelFormat
import android.graphics.Point
import android.graphics.Rect
import android.graphics.drawable.GradientDrawable
import android.hardware.display.DisplayManager
import android.os.Build
import android.provider.Settings
import android.view.Display
import android.view.Gravity
import android.view.HapticFeedbackConstants
import android.view.View
import android.view.ViewOutlineProvider
import android.view.WindowManager
import android.widget.FrameLayout
import android.widget.ImageView
import kotlin.math.max
import kotlin.math.roundToInt

/**
 * The cat pill: a TYPE_APPLICATION_OVERLAY window wrapped around the camera cutout, art on the
 * left and the animated cat on the right. Main thread only. Lives as long as the process, which
 * the player's media foreground service keeps alive while music plays.
 */
internal class IslandPill(context: Context) {
  private val app = context.applicationContext
  private val ctx: Context = windowContext(app)
  private val wm = ctx.getSystemService(Context.WINDOW_SERVICE) as WindowManager
  private val density = ctx.resources.displayMetrics.density

  private val bg = GradientDrawable().apply { setColor(0xFF000000.toInt()) }
  private val root = FrameLayout(ctx).apply {
    background = bg
    clipChildren = false
    isHapticFeedbackEnabled = true
  }
  private val art = ImageView(ctx).apply {
    scaleType = ImageView.ScaleType.CENTER_CROP
    clipToOutline = true
    outlineProvider = object : ViewOutlineProvider() {
      override fun getOutline(view: View, outline: Outline) {
        outline.setRoundRect(0, 0, view.width, view.height, view.width * 0.28f)
      }
    }
  }
  private val artPlaceholder = GradientDrawable()
  private val cat = CatView(ctx)

  private var attached = false
  private var snapshot: Snapshot? = null
  /** Long-press hides the pill until this track changes. */
  private var snoozedFor: String? = null

  init {
    root.addView(art)
    root.addView(cat)
    root.setOnClickListener { openApp() }
    root.setOnLongClickListener {
      it.performHapticFeedback(HapticFeedbackConstants.LONG_PRESS)
      snoozedFor = snapshot?.trackKey
      detach()
      true
    }
    app.registerComponentCallbacks(object : ComponentCallbacks {
      override fun onConfigurationChanged(newConfig: Configuration) {
        if (attached) root.post { layout() }
      }

      @Suppress("OVERRIDE_DEPRECATION")
      override fun onLowMemory() {}
    })
  }

  /** Shows or refreshes the pill. Returns false without the overlay permission. */
  fun render(s: Snapshot, artwork: Bitmap?, accent: Int): Boolean {
    if (!canDraw(app)) {
      detach()
      return false
    }
    if (snoozedFor != null && snoozedFor != s.trackKey) snoozedFor = null
    snapshot = s
    bg.setStroke(dp(1f), (accent and 0x00FFFFFF) or 0x66000000)
    artPlaceholder.setColor(accent)
    if (artwork != null) art.setImageBitmap(artwork) else art.setImageDrawable(artPlaceholder)
    cat.setMood(s.shownMood)
    if (snoozedFor != null) {
      detach()
      return true
    }
    if (!attached) attach() else layout()
    return true
  }

  fun detach() {
    if (!attached) return
    attached = false
    try {
      wm.removeViewImmediate(root)
    } catch (_: Throwable) {
    }
  }

  private fun attach() {
    val lp = params(geometry())
    try {
      wm.addView(root, lp)
      attached = true
      root.alpha = 0f
      root.scaleX = 0.7f
      root.scaleY = 0.7f
      root.animate().alpha(1f).scaleX(1f).scaleY(1f).setDuration(260).start()
    } catch (_: Throwable) {
      // Permission revoked between the check and addView, or a bad token on an odd ROM.
      attached = false
    }
  }

  private fun layout() {
    if (!attached) return
    try {
      wm.updateViewLayout(root, params(geometry()))
    } catch (_: Throwable) {
    }
  }

  private class Geo(val x: Int, val y: Int, val w: Int, val h: Int, val art: Int, val cat: Int, val pad: Int)

  private fun geometry(): Geo {
    val (screenW, hole) = cutout()
    val s = snapshot
    val pad = dp(4f)
    val h: Int
    val cx: Int
    val cy: Int
    val holeW: Int
    if (hole != null) {
      h = (hole.height() + dp(8f)).coerceIn(dp(28f), dp(44f))
      cx = hole.centerX()
      cy = hole.centerY()
      holeW = hole.width() + dp(10f)
    } else {
      val bar = statusBarHeight()
      h = (bar - dp(4f)).coerceIn(dp(26f), dp(32f))
      cx = screenW / 2
      cy = max(bar / 2, h / 2 + dp(2f))
      holeW = dp(18f)
    }
    val artSize = h - pad * 2
    val catSize = h
    val wing = max(artSize, catSize) + pad * 2
    val w = holeW + wing * 2
    val offX = dp(s?.offsetXdp ?: 0f)
    val offY = dp(s?.offsetYdp ?: 0f)
    val x = (cx - w / 2 + offX).coerceIn(0, max(0, screenW - w))
    val y = max(0, cy - h / 2 + offY)
    return Geo(x, y, w, h, artSize, catSize, pad)
  }

  private fun params(g: Geo): WindowManager.LayoutParams {
    bg.cornerRadius = g.h / 2f
    (art.layoutParams as? FrameLayout.LayoutParams ?: FrameLayout.LayoutParams(g.art, g.art)).let {
      it.width = g.art
      it.height = g.art
      it.gravity = Gravity.START or Gravity.CENTER_VERTICAL
      it.marginStart = g.pad + dp(2f)
      art.layoutParams = it
    }
    (cat.layoutParams as? FrameLayout.LayoutParams ?: FrameLayout.LayoutParams(g.cat, g.cat)).let {
      it.width = g.cat
      it.height = g.cat
      it.gravity = Gravity.END or Gravity.CENTER_VERTICAL
      it.marginEnd = g.pad
      cat.layoutParams = it
    }
    art.invalidateOutline()

    @Suppress("DEPRECATION")
    val type = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
      WindowManager.LayoutParams.TYPE_APPLICATION_OVERLAY
    } else {
      WindowManager.LayoutParams.TYPE_PHONE
    }
    val lp = WindowManager.LayoutParams(
      g.w,
      g.h,
      type,
      WindowManager.LayoutParams.FLAG_NOT_FOCUSABLE or
        WindowManager.LayoutParams.FLAG_LAYOUT_IN_SCREEN or
        WindowManager.LayoutParams.FLAG_LAYOUT_NO_LIMITS,
      PixelFormat.TRANSLUCENT
    )
    lp.gravity = Gravity.TOP or Gravity.START
    lp.x = g.x
    lp.y = g.y
    lp.title = "PawseIsland"
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.P) {
      lp.layoutInDisplayCutoutMode = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
        WindowManager.LayoutParams.LAYOUT_IN_DISPLAY_CUTOUT_MODE_ALWAYS
      } else {
        WindowManager.LayoutParams.LAYOUT_IN_DISPLAY_CUTOUT_MODE_SHORT_EDGES
      }
    }
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
      // Otherwise the window is pushed below the status bar.
      lp.fitInsetsTypes = 0
    }
    return lp
  }

  /** Screen width and the top cutout's bounding rect, in screen pixels. */
  @SuppressLint("NewApi")
  private fun cutout(): Pair<Int, Rect?> {
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
      val metrics = wm.currentWindowMetrics
      val bounds = metrics.bounds
      val rects = metrics.windowInsets.displayCutout?.boundingRects
      return bounds.width() to topRect(rects, bounds.width(), bounds.height())
    }
    val size = Point()
    @Suppress("DEPRECATION")
    val display = wm.defaultDisplay
    @Suppress("DEPRECATION")
    display.getRealSize(size)
    val rects = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) display.cutout?.boundingRects else null
    return size.x to topRect(rects, size.x, size.y)
  }

  /** The cutout at the top edge; side cutouts (landscape) fall back to top centre. */
  private fun topRect(rects: List<Rect>?, screenW: Int, screenH: Int): Rect? =
    rects.orEmpty()
      .filter { !it.isEmpty && it.top < screenH / 10 && it.width() < screenW * 2 / 3 }
      .minByOrNull { it.top }

  private fun statusBarHeight(): Int {
    @SuppressLint("DiscouragedApi", "InternalInsetResource")
    val id = ctx.resources.getIdentifier("status_bar_height", "dimen", "android")
    return if (id > 0) ctx.resources.getDimensionPixelSize(id) else dp(24f)
  }

  private fun openApp() {
    val intent = app.packageManager.getLaunchIntentForPackage(app.packageName) ?: return
    intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_RESET_TASK_IF_NEEDED)
    try {
      app.startActivity(intent)
    } catch (_: Throwable) {
    }
  }

  private fun dp(v: Float): Int = (v * density).roundToInt()

  companion object {
    fun canDraw(context: Context): Boolean =
      Build.VERSION.SDK_INT >= Build.VERSION_CODES.O && Settings.canDrawOverlays(context)

    /** API 30+ wants a window context for overlay windows from a non-activity context. */
    private fun windowContext(app: Context): Context {
      if (Build.VERSION.SDK_INT < Build.VERSION_CODES.R) return app
      return try {
        val dm = app.getSystemService(Context.DISPLAY_SERVICE) as DisplayManager
        val display = dm.getDisplay(Display.DEFAULT_DISPLAY) ?: return app
        app.createDisplayContext(display)
          .createWindowContext(WindowManager.LayoutParams.TYPE_APPLICATION_OVERLAY, null)
      } catch (_: Throwable) {
        app
      }
    }
  }
}
