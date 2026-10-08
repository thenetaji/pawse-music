import Foundation
import UIKit

// Album art for the Live Activity: ContentState is capped at 4 KB, so the widget reads a file from the App Group.
enum FlowArtwork {
  static let groupId = "group.com.thenetaji.flow"
  private static let side: CGFloat = 120
  private static let keep = 4

  /// SideStore renames App Groups per team (group.x.TEAMID); the embedded profile lists the real ids.
  static let group: (id: String, url: URL)? = {
    var ids = profileGroups()
    ids += Bundle.main.object(forInfoDictionaryKey: "ALTAppGroups") as? [String] ?? []
    ids.append(groupId)
    for id in ids where id.hasPrefix(groupId) {
      if let url = FileManager.default.containerURL(forSecurityApplicationGroupIdentifier: id) {
        return (id, url)
      }
    }
    return nil
  }()

  static var directory: URL? { group?.url.appendingPathComponent("artwork", isDirectory: true) }

  private static func profileGroups() -> [String] {
    guard let url = Bundle.main.url(forResource: "embedded", withExtension: "mobileprovision"),
      let data = try? Data(contentsOf: url),
      let text = String(data: data, encoding: .isoLatin1),
      let start = text.range(of: "<?xml"),
      let end = text.range(of: "</plist>", range: start.lowerBound..<text.endIndex),
      let xml = String(text[start.lowerBound..<end.upperBound]).data(using: .isoLatin1),
      let plist = try? PropertyListSerialization.propertyList(from: xml, format: nil) as? [String: Any],
      let entitlements = plist["Entitlements"] as? [String: Any]
    else { return [] }
    return entitlements["com.apple.security.application-groups"] as? [String] ?? []
  }

  /// Returns "<group id>/<file name>" so the widget opens the same container without guessing.
  static func store(_ urlString: String) async -> String? {
    guard let group = FlowArtwork.group, let dir = directory, let url = URL(string: urlString) else { return nil }
    let fileName = "art-\(fnv1a(urlString)).jpg"
    let name = "\(group.id)/\(fileName)"
    let file = dir.appendingPathComponent(fileName)
    if FileManager.default.fileExists(atPath: file.path) {
      try? FileManager.default.setAttributes([.modificationDate: Date()], ofItemAtPath: file.path)
      return name
    }
    do {
      let (data, _) = try await URLSession.shared.data(from: url)
      guard let image = UIImage(data: data),
        let jpeg = squared(image).jpegData(compressionQuality: 0.8)
      else { return nil }
      try FileManager.default.createDirectory(at: dir, withIntermediateDirectories: true)
      try jpeg.write(to: file, options: .atomic)
      prune(dir)
      return name
    } catch {
      return nil
    }
  }

  private static func squared(_ image: UIImage) -> UIImage {
    let format = UIGraphicsImageRendererFormat()
    format.scale = 1
    format.opaque = true
    let size = CGSize(width: side, height: side)
    return UIGraphicsImageRenderer(size: size, format: format).image { _ in
      let scale = max(side / image.size.width, side / image.size.height)
      let w = image.size.width * scale
      let h = image.size.height * scale
      image.draw(in: CGRect(x: (side - w) / 2, y: (side - h) / 2, width: w, height: h))
    }
  }

  private static func prune(_ dir: URL) {
    let fm = FileManager.default
    guard
      let files = try? fm.contentsOfDirectory(
        at: dir, includingPropertiesForKeys: [.contentModificationDateKey])
    else { return }
    let dated = files.map { url -> (URL, Date) in
      let date = (try? url.resourceValues(forKeys: [.contentModificationDateKey]))?.contentModificationDate
      return (url, date ?? .distantPast)
    }
    for (url, _) in dated.sorted(by: { $0.1 > $1.1 }).dropFirst(keep) {
      try? fm.removeItem(at: url)
    }
  }

  private static func fnv1a(_ s: String) -> String {
    var hash: UInt64 = 0xcbf2_9ce4_8422_2325
    for byte in s.utf8 {
      hash ^= UInt64(byte)
      hash = hash &* 0x100_0000_01b3
    }
    return String(hash, radix: 16)
  }
}
