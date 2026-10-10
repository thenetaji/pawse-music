package expo.modules.pawseisland

import android.animation.ValueAnimator
import android.content.Context
import android.view.animation.AccelerateDecelerateInterpolator
import android.widget.FrameLayout
import android.widget.ImageView

/**
 * The pill's cat: a body layer and an accessory layer (note, zz, heart) from the same art as
 * cat.tsx, moved with real animators. Units below are the SVG's 120-unit viewBox.
 */
internal class CatView(context: Context) : FrameLayout(context) {
  private val body = ImageView(context).apply { scaleType = ImageView.ScaleType.FIT_CENTER }
  private val accessory = ImageView(context).apply { scaleType = ImageView.ScaleType.FIT_CENTER }
  private var animator: ValueAnimator? = null
  private var mood: Mood? = null

  init {
    clipChildren = false
    addView(body, FrameLayout.LayoutParams(FrameLayout.LayoutParams.MATCH_PARENT, FrameLayout.LayoutParams.MATCH_PARENT))
    addView(accessory, FrameLayout.LayoutParams(FrameLayout.LayoutParams.MATCH_PARENT, FrameLayout.LayoutParams.MATCH_PARENT))
  }

  fun setMood(next: Mood) {
    if (next == mood) return
    mood = next
    body.setImageResource(
      when (next) {
        Mood.GROOVE -> R.drawable.pawse_cat_body_open
        Mood.SLEEP -> R.drawable.pawse_cat_body_sleep
        Mood.HAPPY -> R.drawable.pawse_cat_body_happy
        Mood.CURIOUS -> R.drawable.pawse_cat_body_curious
      }
    )
    when (next) {
      Mood.GROOVE -> accessory.setImageResource(R.drawable.pawse_cat_acc_note)
      Mood.SLEEP -> accessory.setImageResource(R.drawable.pawse_cat_acc_zz)
      Mood.HAPPY -> accessory.setImageResource(R.drawable.pawse_cat_acc_heart)
      Mood.CURIOUS -> accessory.setImageDrawable(null)
    }
    if (isAttachedToWindow) start()
  }

  override fun onSizeChanged(w: Int, h: Int, oldw: Int, oldh: Int) {
    super.onSizeChanged(w, h, oldw, oldh)
    // cat.tsx rotates around (60, 100): the bottom of the head.
    body.pivotX = w * 0.5f
    body.pivotY = h * (100f / 120f)
    accessory.pivotX = w * (108f / 120f)
    accessory.pivotY = h * (14f / 120f)
  }

  override fun onAttachedToWindow() {
    super.onAttachedToWindow()
    start()
  }

  override fun onDetachedFromWindow() {
    stop()
    super.onDetachedFromWindow()
  }

  private fun stop() {
    animator?.cancel()
    animator = null
    for (v in arrayOf(body, accessory)) {
      v.rotation = 0f
      v.translationX = 0f
      v.translationY = 0f
      v.scaleX = 1f
      v.scaleY = 1f
      v.alpha = 1f
    }
  }

  private fun start() {
    stop()
    val m = mood ?: return
    val period = when (m) {
      Mood.GROOVE -> 520L
      Mood.HAPPY -> 180L
      Mood.SLEEP -> 1300L
      Mood.CURIOUS -> 900L
    }
    animator = ValueAnimator.ofFloat(0f, 1f).apply {
      duration = period
      repeatMode = ValueAnimator.REVERSE
      repeatCount = ValueAnimator.INFINITE
      interpolator = AccelerateDecelerateInterpolator()
      addUpdateListener { a -> frame(m, a.animatedValue as Float) }
      start()
    }
  }

  private fun frame(m: Mood, f: Float) {
    val u = width / 120f
    when (m) {
      Mood.GROOVE -> {
        // Sway between -7 and 7 degrees; the note bobs by (3, -4).
        body.rotation = -7f + 14f * f
        accessory.translationX = 3f * u * f
        accessory.translationY = -4f * u * f
      }
      Mood.HAPPY -> {
        body.translationY = -7f * u * f
        accessory.scaleX = 1f + 0.18f * f
        accessory.scaleY = 1f + 0.18f * f
      }
      Mood.SLEEP -> {
        body.scaleY = 1f + 0.035f * f
        body.scaleX = 1f - 0.01f * f
        accessory.translationX = 2f * u * f
        accessory.translationY = -3f * u * f
        accessory.alpha = 0.55f + 0.45f * f
      }
      Mood.CURIOUS -> {
        body.rotation = 6f + 5f * f
      }
    }
  }
}
