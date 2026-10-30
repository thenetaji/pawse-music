import ExpoModulesCore
import FoundationModels

public class PawseAIModule: Module {
  public func definition() -> ModuleDefinition {
    Name("PawseAI")

    Function("supportsLanguage") { (code: String) -> Bool in
      guard #available(iOS 26.0, *) else { return false }
      return SystemLanguageModel.default.supportsLocale(Locale(identifier: code))
    }

    AsyncFunction("status") { () async -> String in
      PawseAIModule.status()
    }

    // Apple Intelligence downloads its own model; there is nothing to fetch here.
    AsyncFunction("download") { () async -> Bool in
      false
    }

    AsyncFunction("summarize") { (text: String, language: String) async -> String? in
      await PawseAIModule.generate(
        instructions: "Summarize the video transcript you are given in \(language) as 3 to 5 short bullet points, "
          + "each starting with \"- \". Use only what the text says.",
        prompt: text)
    }

    AsyncFunction("respond") { (prompt: String, context: String) async -> String? in
      await PawseAIModule.generate(instructions: context, prompt: prompt)
    }
  }

  private static func status() -> String {
    guard #available(iOS 26.0, *) else { return "unavailable" }
    let model = SystemLanguageModel.default
    if case .available = model.availability { return "ready" }
    if case .unavailable(let reason) = model.availability, reason == .modelNotReady {
      return "downloading"
    }
    return "unavailable"
  }

  private static func generate(instructions: String, prompt: String) async -> String? {
    guard #available(iOS 26.0, *) else { return nil }
    guard case .available = SystemLanguageModel.default.availability else { return nil }
    do {
      let session = LanguageModelSession(instructions: instructions)
      let response = try await session.respond(to: prompt)
      return response.content
    } catch {
      return nil
    }
  }
}
