import Foundation
import Network

/// Serves HLS playlists on localhost, because AVPlayer won't play an HLS playlist from a file URL.
/// The media itself still comes straight from its own https host; only the small playlists live here.
final class PlaylistServer {
  static let shared = PlaylistServer()

  private static let maxPlaylists = 48
  private let queue = DispatchQueue(label: "pawse.playlist-server")
  private var listener: NWListener?
  private var port: UInt16 = 0
  private var waiting: [(UInt16) -> Void] = []
  private var playlists: [String: Data] = [:]
  private var order: [String] = []

  /// Stores a playlist and returns its http URL, or nil when the server can't listen.
  func put(_ name: String, _ text: String) async -> String? {
    let port: UInt16 = await withCheckedContinuation { done in
      queue.async {
        self.store(name, Data(text.utf8))
        self.whenReady { done.resume(returning: $0) }
      }
    }
    guard port != 0 else { return nil }
    let path = name.addingPercentEncoding(withAllowedCharacters: .urlPathAllowed) ?? name
    return "http://localhost:\(port)/\(path)"
  }

  // MARK: - Listener (all on `queue`)

  private func store(_ name: String, _ data: Data) {
    if playlists[name] == nil { order.append(name) }
    playlists[name] = data
    while order.count > Self.maxPlaylists {
      playlists.removeValue(forKey: order.removeFirst())
    }
  }

  private func whenReady(_ done: @escaping (UInt16) -> Void) {
    if listener != nil, port != 0 { return done(port) }
    waiting.append(done)
    if listener != nil { return }
    let l: NWListener
    do {
      l = try NWListener(using: .tcp, on: .any)
    } catch {
      return finish(0)
    }
    listener = l
    l.stateUpdateHandler = { [weak self] state in
      guard let self else { return }
      switch state {
      case .ready:
        self.port = l.port?.rawValue ?? 0
        self.finish(self.port)
      case .failed, .cancelled:
        // A suspended app can lose its socket; the next put() starts a fresh listener.
        if self.listener === l {
          self.listener = nil
          self.port = 0
        }
        self.finish(0)
      default:
        break
      }
    }
    l.newConnectionHandler = { [weak self] connection in
      self?.serve(connection)
    }
    l.start(queue: queue)
  }

  private func finish(_ port: UInt16) {
    let all = waiting
    waiting.removeAll()
    all.forEach { $0(port) }
  }

  // MARK: - Requests

  private func serve(_ connection: NWConnection) {
    connection.start(queue: queue)
    receive(connection, Data())
  }

  private func receive(_ connection: NWConnection, _ buffer: Data) {
    connection.receive(minimumIncompleteLength: 1, maximumLength: 16384) {
      [weak self] data, _, complete, error in
      guard let self else { return connection.cancel() }
      var head = buffer
      if let data { head.append(data) }
      if let end = head.range(of: Data("\r\n\r\n".utf8)) {
        self.respond(connection, String(decoding: head[..<end.lowerBound], as: UTF8.self))
      } else if complete || error != nil || head.count > 65536 {
        connection.cancel()
      } else {
        self.receive(connection, head)
      }
    }
  }

  private func respond(_ connection: NWConnection, _ head: String) {
    let parts = head.split(separator: "\r\n").first?.split(separator: " ") ?? []
    let method = parts.first.map { String($0) } ?? ""
    var path = parts.count > 1 ? String(parts[1]) : "/"
    if let q = path.firstIndex(of: "?") { path = String(path[..<q]) }
    let name = String(path.dropFirst()).removingPercentEncoding ?? ""
    guard method == "GET" || method == "HEAD", let body = playlists[name] else {
      return send(connection, "HTTP/1.1 404 Not Found\r\nContent-Length: 0\r\nConnection: close\r\n\r\n", nil)
    }
    let header =
      "HTTP/1.1 200 OK\r\n"
      + "Content-Type: application/vnd.apple.mpegurl\r\n"
      + "Content-Length: \(body.count)\r\n"
      + "Cache-Control: no-store\r\n"
      + "Connection: close\r\n\r\n"
    send(connection, header, method == "GET" ? body : nil)
  }

  private func send(_ connection: NWConnection, _ header: String, _ body: Data?) {
    var out = Data(header.utf8)
    if let body { out.append(body) }
    connection.send(content: out, contentContext: .finalMessage, isComplete: true, completion: .contentProcessed { _ in
      connection.cancel()
    })
  }
}
