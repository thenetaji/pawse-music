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
  /// When the listener last answered. iOS takes a suspended app's listening socket without telling it,
  /// so after a pause the port is knocked on before it's handed out again.
  private var checkedAt = DispatchTime(uptimeNanoseconds: 0)
  private var probing = false
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
    let fresh = DispatchTime.now().uptimeNanoseconds < checkedAt.uptimeNanoseconds + 1_000_000_000
    if listener != nil, port != 0, !probing, fresh { return done(port) }
    waiting.append(done)
    if probing { return }
    if let l = listener, port != 0 {
      probing = true
      return probe(port) { [weak self] alive in
        guard let self else { return }
        self.probing = false
        if alive {
          self.checkedAt = .now()
          return self.finish(self.port)
        }
        // The socket went while the app slept: listen again on a fresh port.
        l.stateUpdateHandler = nil
        l.cancel()
        self.listener = nil
        self.port = 0
        self.listen()
      }
    }
    if listener == nil { listen() }
  }

  private func listen() {
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
        self.checkedAt = .now()
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
      // Only the phone itself may connect: the playlists hold signed media urls.
      guard Self.isLoopback(connection.endpoint) else { return connection.cancel() }
      self?.serve(connection)
    }
    l.start(queue: queue)
  }

  /// Connects to our own port; refused, or no answer within a second, means the socket is gone.
  private func probe(_ port: UInt16, _ done: @escaping (Bool) -> Void) {
    guard let p = NWEndpoint.Port(rawValue: port) else { return done(false) }
    let c = NWConnection(host: "127.0.0.1", port: p, using: .tcp)
    var settled = false
    let settle = { (alive: Bool) in
      guard !settled else { return }
      settled = true
      c.stateUpdateHandler = nil
      c.cancel()
      done(alive)
    }
    c.stateUpdateHandler = { state in
      switch state {
      case .ready: settle(true)
      case .waiting, .failed, .cancelled: settle(false)
      default: break
      }
    }
    c.start(queue: queue)
    queue.asyncAfter(deadline: .now() + 1) { settle(false) }
  }

  private static func isLoopback(_ endpoint: NWEndpoint) -> Bool {
    guard case let .hostPort(host, _) = endpoint else { return false }
    switch host {
    case let .ipv4(a): return a.isLoopback
    case let .ipv6(a): return a.isLoopback || a.asIPv4?.isLoopback == true
    case let .name(n, _): return n == "localhost"
    @unknown default: return false
    }
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
