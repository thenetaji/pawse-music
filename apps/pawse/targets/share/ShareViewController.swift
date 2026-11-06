import UIKit
import UniformTypeIdentifiers

/// Saves what was shared where the app can read it, then brings the app forward.
final class ShareViewController: UIViewController {
  private let message = UILabel()
  private var started = false

  override func viewDidLoad() {
    super.viewDidLoad()
    view.backgroundColor = .systemBackground
    preferredContentSize = CGSize(width: 320, height: 120)
    message.text = "Opening in Pawse…"
    message.textAlignment = .center
    message.numberOfLines = 0
    message.translatesAutoresizingMaskIntoConstraints = false
    view.addSubview(message)
    NSLayoutConstraint.activate([
      message.centerXAnchor.constraint(equalTo: view.centerXAnchor),
      message.centerYAnchor.constraint(equalTo: view.centerYAnchor),
      message.leadingAnchor.constraint(greaterThanOrEqualTo: view.leadingAnchor, constant: 24),
    ])
  }

  // Not earlier, and not with a hidden view: finishing while the sheet is still presenting can freeze the app shared from.
  override func viewDidAppear(_ animated: Bool) {
    super.viewDidAppear(animated)
    guard !started else { return }
    started = true
    Task { @MainActor in await handOver() }
  }

  @MainActor
  private func handOver() async {
    guard let text = await sharedText(), PendingShare.save(text) else {
      return finish(saying: "Pawse couldn't read that.")
    }
    if await openApp() {
      extensionContext?.completeRequest(returningItems: nil)
    } else {
      finish(saying: "Saved. Open Pawse to play it.")
    }
  }

  @MainActor
  private func finish(saying text: String) {
    message.text = text
    Task { @MainActor in
      try? await Task.sleep(for: .seconds(2))
      extensionContext?.completeRequest(returningItems: nil)
    }
  }

  // Links first: a link's title and artist are in its own URL, while text from the same share may carry a shorter copy.
  private func sharedText() async -> String? {
    let items = extensionContext?.inputItems as? [NSExtensionItem] ?? []
    let providers = items.flatMap { $0.attachments ?? [] }
    var links: [String] = []
    var texts: [String] = []
    for provider in providers {
      if provider.hasItemConformingToTypeIdentifier(UTType.url.identifier),
        let url = try? await provider.loadItem(forTypeIdentifier: UTType.url.identifier) as? URL
      {
        links.append(url.absoluteString)
      } else if provider.hasItemConformingToTypeIdentifier(UTType.plainText.identifier),
        let text = try? await provider.loadItem(forTypeIdentifier: UTType.plainText.identifier) as? String
      {
        texts.append(text)
      }
    }
    let all = links + texts
    return all.isEmpty ? nil : all.joined(separator: " ")
  }

  // Apple offers extensions no way to open their app. UIApplication is still on the responder chain, so this may stop
  // working in a future iOS; the saved share then plays the next time Pawse is opened.
  @MainActor
  private func openApp() async -> Bool {
    guard let url = URL(string: "pawse://shared") else { return false }
    var responder: UIResponder? = self
    while let current = responder {
      if let application = current as? UIApplication {
        return await withCheckedContinuation { done in
          application.open(url, options: [:]) { done.resume(returning: $0) }
        }
      }
      responder = current.next
    }
    return false
  }
}
