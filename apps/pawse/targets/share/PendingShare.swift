import Foundation

/// The share waiting for the app, in the App Group. The app's side is modules/pawse-share/ios/PawseShareModule.swift.
enum PendingShare {
  private static let groupId = "group.com.thenetaji.pawse"
  private static let fileName = "pending-share.txt"

  static func save(_ text: String) -> Bool {
    guard let dir = container() else { return false }
    return (try? text.write(to: dir.appendingPathComponent(fileName), atomically: true, encoding: .utf8)) != nil
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
