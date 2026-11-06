import ExpoModulesCore
import Foundation

public class PawseShareModule: Module {
  private static let groupId = "group.com.thenetaji.pawse"
  private static let fileName = "pending-share.txt"
  // A share Pawse couldn't open right away may wait a little, not start playing hours later.
  private static let freshFor: TimeInterval = 600

  public func definition() -> ModuleDefinition {
    Name("PawseShare")

    Events("onShare")

    Function("takeInitial") { () -> String? in
      Self.takePending()
    }
  }

  private static func takePending() -> String? {
    guard let dir = container() else { return nil }
    let file = dir.appendingPathComponent(fileName)
    guard let text = try? String(contentsOf: file, encoding: .utf8) else { return nil }
    let savedAt = (try? file.resourceValues(forKeys: [.contentModificationDateKey]))?.contentModificationDate
    try? FileManager.default.removeItem(at: file)
    guard let savedAt, Date().timeIntervalSince(savedAt) < freshFor else { return nil }
    return text
  }

  // SideStore renames App Groups per team (group.x.TEAMID); the embedded profile lists the real ids.
  private static func container() -> URL? {
    var ids = profileGroups()
    ids += Bundle.main.object(forInfoDictionaryKey: "ALTAppGroups") as? [String] ?? []
    ids.append(groupId)
    for id in ids where id.hasPrefix(groupId) {
      if let url = FileManager.default.containerURL(forSecurityApplicationGroupIdentifier: id) { return url }
    }
    return nil
  }

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
}
