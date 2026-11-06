package expo.modules.pawseshare

import android.content.Intent
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

class PawseShareModule : Module() {
  override fun definition() = ModuleDefinition {
    Name("PawseShare")

    Events("onShare")

    Function<String?>("takeInitial") {
      appContext.currentActivity?.intent?.let { take(it) }
    }

    OnNewIntent { intent ->
      take(intent)?.let { sendEvent("onShare", mapOf("text" to it)) }
    }
  }

  // Emptied once read: Android hands the same intent back when the activity is recreated, which would replay the song.
  private fun take(intent: Intent): String? {
    if (intent.action != Intent.ACTION_SEND) return null
    val text = intent.getStringExtra(Intent.EXTRA_TEXT)
    intent.removeExtra(Intent.EXTRA_TEXT)
    intent.action = Intent.ACTION_MAIN
    return text
  }
}
