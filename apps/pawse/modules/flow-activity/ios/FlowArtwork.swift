import Foundation
import UIKit

// Album art for the Live Activity: ContentState is capped at 4 KB, so the widget reads a file from the App Group.
enum FlowArtwork {
  static let groupId = "group.com.thenetaji.flow"
  private static let side = 120
  private static let keep = 4
  private static let keepSquares = 80
  private static let placeholderWidth = 120
  private static let darkMax: UInt8 = 28

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
    guard let group = FlowArtwork.group, let dir = directory else { return nil }
    let fileName = "art-\(fnv1a(urlString)).jpg"
    let name = "\(group.id)/\(fileName)"
    let file = dir.appendingPathComponent(fileName)
    if touch(file) { return name }
    guard let jpeg = await render([urlString], side: side) else { return nil }
    return write(jpeg, to: file, keep: keep) ? name : nil
  }

  /// Square, bar-free JPEG of the first usable source in Caches, for the system Now Playing art; returns a file URL.
  static func square(_ urls: [String], side: Int) async -> String? {
    guard !urls.isEmpty, side > 0,
      let caches = FileManager.default.urls(for: .cachesDirectory, in: .userDomainMask).first
    else { return nil }
    let dir = caches.appendingPathComponent("flow-artwork", isDirectory: true)
    let file = dir.appendingPathComponent("sq-\(side)-\(fnv1a(urls.joined(separator: "\n"))).jpg")
    if touch(file) { return file.absoluteString }
    guard let jpeg = await render(urls, side: side) else { return nil }
    return write(jpeg, to: file, keep: keepSquares) ? file.absoluteString : nil
  }

  private static func touch(_ file: URL) -> Bool {
    guard FileManager.default.fileExists(atPath: file.path) else { return false }
    try? FileManager.default.setAttributes([.modificationDate: Date()], ofItemAtPath: file.path)
    return true
  }

  private static func write(_ jpeg: Data, to file: URL, keep: Int) -> Bool {
    let dir = file.deletingLastPathComponent()
    do {
      try FileManager.default.createDirectory(at: dir, withIntermediateDirectories: true)
      try jpeg.write(to: file, options: .atomic)
    } catch {
      return false
    }
    prune(dir, keep: keep)
    return true
  }

  /// First candidate that loads; YouTube answers a missing still with a 120 px placeholder, so only the last may be that small.
  private static func render(_ urls: [String], side: Int) async -> Data? {
    for (i, raw) in urls.enumerated() {
      guard let url = URL(string: raw), let image = await fetch(url) else { continue }
      if i < urls.count - 1 && image.width <= placeholderWidth { continue }
      return squared(image, side: side)?.jpegData(compressionQuality: 0.85)
    }
    return nil
  }

  private static func fetch(_ url: URL) async -> CGImage? {
    let data: Data
    if url.isFileURL {
      guard let local = try? Data(contentsOf: url) else { return nil }
      data = local
    } else {
      guard let result = try? await URLSession.shared.data(from: url) else { return nil }
      if let http = result.1 as? HTTPURLResponse, !(200..<300).contains(http.statusCode) { return nil }
      data = result.0
    }
    return UIImage(data: data)?.cgImage
  }

  /// Centre square of the picture without its bars, scaled down to `side` (never up).
  private static func squared(_ image: CGImage, side: Int) -> UIImage? {
    let box = content(image)
    let edge = min(box.w, box.h)
    guard edge > 0 else { return nil }
    let crop = CGRect(x: box.x + (box.w - edge) / 2, y: box.y + (box.h - edge) / 2, width: edge, height: edge)
    guard let cropped = image.cropping(to: crop) else { return nil }
    let out = CGFloat(min(side, edge))
    let format = UIGraphicsImageRendererFormat()
    format.scale = 1
    format.opaque = true
    return UIGraphicsImageRenderer(size: CGSize(width: out, height: out), format: format).image { _ in
      UIImage(cgImage: cropped).draw(in: CGRect(x: 0, y: 0, width: out, height: out))
    }
  }

  /// The picture inside near-black letterbox or pillarbox bars; square images come back whole.
  private static func content(_ image: CGImage) -> (x: Int, y: Int, w: Int, h: Int) {
    let w = image.width
    let h = image.height
    guard w > 0, h > 0, w != h else { return (0, 0, w, h) }
    var px = [UInt8](repeating: 0, count: w * h * 4)
    let drawn = px.withUnsafeMutableBytes { buf -> Bool in
      guard
        let ctx = CGContext(
          data: buf.baseAddress, width: w, height: h, bitsPerComponent: 8, bytesPerRow: w * 4,
          space: CGColorSpaceCreateDeviceRGB(), bitmapInfo: CGImageAlphaInfo.noneSkipLast.rawValue)
      else { return false }
      ctx.draw(image, in: CGRect(x: 0, y: 0, width: w, height: h))
      return true
    }
    guard drawn else { return (0, 0, w, h) }
    func dark(_ x: Int, _ y: Int) -> Bool {
      let i = (y * w + x) * 4
      return max(px[i], px[i + 1], px[i + 2]) <= darkMax
    }
    let rows = bars(h) { y in (0..<w).allSatisfy { dark($0, y) } }
    let cols = bars(w) { x in (0..<h).allSatisfy { dark(x, $0) } }
    return (cols, rows, w - 2 * cols, h - 2 * rows)
  }

  /// Bars are equal at both ends, so the shorter run counts; ignored under 2% and capped at 40% of the length.
  private static func bars(_ length: Int, isBar: (Int) -> Bool) -> Int {
    let cap = length * 2 / 5
    var start = 0
    while start < cap && isBar(start) { start += 1 }
    var end = 0
    while end < cap && isBar(length - 1 - end) { end += 1 }
    let bar = min(start, end)
    return bar >= max(2, length / 50) ? bar : 0
  }

  private static func prune(_ dir: URL, keep: Int) {
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
