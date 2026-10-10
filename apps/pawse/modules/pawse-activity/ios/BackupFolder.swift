import Foundation

// A picked Files folder only lasts one session on iOS; a bookmark in UserDefaults brings it back after a relaunch.
enum BackupFolder {
  private static let key = "pawse.backupFolderBookmark"

  /// Call right after picking, while access is still live.
  static func save(_ uri: String) -> Bool {
    guard let url = folderURL(uri) else { return false }
    let scoped = url.startAccessingSecurityScopedResource()
    defer { if scoped { url.stopAccessingSecurityScopedResource() } }
    guard let data = try? url.bookmarkData(options: [], includingResourceValuesForKeys: nil, relativeTo: nil)
    else { return false }
    UserDefaults.standard.set(data, forKey: key)
    return true
  }

  static func clear() {
    UserDefaults.standard.removeObject(forKey: key)
  }

  static func write(_ name: String, _ text: String) async -> Bool {
    await background {
      withFolder(false) { dir -> Bool in
        guard let target = file(dir, name) else { return false }
        var ok = false
        var error: NSError?
        NSFileCoordinator().coordinate(writingItemAt: target, options: .forReplacing, error: &error) { url in
          ok = (try? Data(text.utf8).write(to: url, options: .atomic)) != nil
        }
        return ok && error == nil
      }
    }
  }

  static func list() async -> [String] {
    await background {
      withFolder([]) { dir -> [String] in
        var names: [String] = []
        var error: NSError?
        NSFileCoordinator().coordinate(readingItemAt: dir, options: .immediatelyAvailableMetadataOnly, error: &error) { url in
          let items = (try? FileManager.default.contentsOfDirectory(
            at: url, includingPropertiesForKeys: [.isDirectoryKey], options: [])) ?? []
          for item in items where (try? item.resourceValues(forKeys: [.isDirectoryKey]).isDirectory) != true {
            names.append(logicalName(item.lastPathComponent))
          }
        }
        return names
      }
    }
  }

  /// First `bytes` bytes as UTF-8; downloads an iCloud file that isn't local yet.
  static func head(_ name: String, _ bytes: Int) async -> String? {
    await background {
      withFolder(nil) { dir -> String? in
        guard let target = file(dir, name) else { return nil }
        var out: String?
        var error: NSError?
        NSFileCoordinator().coordinate(readingItemAt: target, options: [], error: &error) { url in
          guard let handle = try? FileHandle(forReadingFrom: url) else { return }
          defer { try? handle.close() }
          if let data = try? handle.read(upToCount: max(bytes, 0)) {
            out = String(decoding: data, as: UTF8.self)
          }
        }
        return out
      }
    }
  }

  static func delete(_ name: String) async -> Bool {
    await background {
      withFolder(false) { dir -> Bool in
        guard let target = file(dir, name) else { return false }
        var ok = false
        var error: NSError?
        NSFileCoordinator().coordinate(writingItemAt: target, options: .forDeleting, error: &error) { url in
          ok = (try? FileManager.default.removeItem(at: url)) != nil
          // Not-downloaded iCloud files can still sit as a ".name.icloud" placeholder.
          if !ok {
            ok = (try? FileManager.default.removeItem(at: dir.appendingPathComponent(".\(name).icloud"))) != nil
          }
        }
        return ok && error == nil
      }
    }
  }

  private static func withFolder<T>(_ fallback: T, _ body: (URL) -> T) -> T {
    guard let data = UserDefaults.standard.data(forKey: key) else { return fallback }
    var stale = false
    guard let url = try? URL(resolvingBookmarkData: data, options: [], relativeTo: nil, bookmarkDataIsStale: &stale)
    else { return fallback }
    let scoped = url.startAccessingSecurityScopedResource()
    defer { if scoped { url.stopAccessingSecurityScopedResource() } }
    if stale, let fresh = try? url.bookmarkData(options: [], includingResourceValuesForKeys: nil, relativeTo: nil) {
      UserDefaults.standard.set(fresh, forKey: key)
    }
    return body(url)
  }

  // File coordination blocks, so keep it off the JS and main threads.
  private static func background<T>(_ work: @escaping () -> T) async -> T {
    await withCheckedContinuation { done in
      DispatchQueue.global(qos: .utility).async { done.resume(returning: work()) }
    }
  }

  private static func file(_ dir: URL, _ name: String) -> URL? {
    guard !name.isEmpty, !name.contains("/") else { return nil }
    return dir.appendingPathComponent(name, isDirectory: false)
  }

  private static func folderURL(_ uri: String) -> URL? {
    if let url = URL(string: uri), url.isFileURL { return url }
    return uri.hasPrefix("/") ? URL(fileURLWithPath: uri, isDirectory: true) : nil
  }

  private static func logicalName(_ name: String) -> String {
    guard name.hasPrefix("."), name.hasSuffix(".icloud"), name.count > 8 else { return name }
    return String(name.dropFirst().dropLast(7))
  }
}
