package expo.modules.pawseai

import android.os.Build
import com.google.mlkit.genai.common.DownloadStatus
import com.google.mlkit.genai.common.FeatureStatus
import com.google.mlkit.genai.prompt.Generation
import com.google.mlkit.genai.prompt.GenerativeModel
import expo.modules.kotlin.functions.Coroutine
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

class PawseAIModule : Module() {
  private var model: GenerativeModel? = null

  private fun client(): GenerativeModel =
    model ?: Generation.getClient().also { model = it }

  private suspend fun status(): String {
    if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return "unavailable"
    return try {
      when (client().checkStatus()) {
        FeatureStatus.AVAILABLE -> "ready"
        FeatureStatus.DOWNLOADABLE -> "downloadable"
        FeatureStatus.DOWNLOADING -> "downloading"
        else -> "unavailable"
      }
    } catch (_: Throwable) {
      "unavailable"
    }
  }

  private suspend fun generate(prompt: String): String? {
    if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return null
    return try {
      client().generateContent(prompt).candidates.firstOrNull()?.text
    } catch (_: Throwable) {
      null
    }
  }

  override fun definition() = ModuleDefinition {
    Name("PawseAI")

    // Gemini Nano through ML Kit's Prompt API answers in English and Korean.
    Function("supportsLanguage") { code: String -> code == "en" || code == "ko" }

    AsyncFunction("status") Coroutine { -> status() }

    AsyncFunction("download") Coroutine { ->
      var done = false
      try {
        client().download().collect { s -> if (s == DownloadStatus.DownloadCompleted) done = true }
      } catch (_: Throwable) {
      }
      done
    }

    AsyncFunction("summarize") Coroutine { text: String, language: String ->
      generate(
        "Summarize this video transcript in $language as 3 to 5 short bullet points, each starting with \"- \". " +
          "Use only what the text says.\n\n$text"
      )
    }

    AsyncFunction("respond") Coroutine { prompt: String, context: String ->
      generate("$context\n\n$prompt")
    }
  }
}
