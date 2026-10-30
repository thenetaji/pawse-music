import Foundation

let pawseBands = 16
// 40 Hz to 16 kHz in equal log steps, as BAND_HZ in types.ts; a Q of 2.5 makes each band about one step wide.
private let bandHz: [Double] = (0..<pawseBands).map { 40 * pow(400.0, Double($0) / Double(pawseBands - 1)) }
private let bandQ = 2.5
private let silentDb = -60.0
private let floorDb = -120.0

final class Biquad {
  let b0: Double, b1: Double, b2: Double, a1: Double, a2: Double
  private var z1 = [0.0, 0.0]
  private var z2 = [0.0, 0.0]

  init(b0: Double, b1: Double, b2: Double, a1: Double, a2: Double) {
    self.b0 = b0; self.b1 = b1; self.b2 = b2; self.a1 = a1; self.a2 = a2
  }

  @inline(__always)
  func run(_ x: Double, _ ch: Int) -> Double {
    let y = b0 * x + z1[ch]
    z1[ch] = b1 * x - a1 * y + z2[ch]
    z2[ch] = b2 * x - a2 * y
    return y
  }

  // RBJ cookbook; kind 0 peaking, 1 low shelf, 2 high shelf.
  static func design(kind: Int, freq: Double, gainDb: Double, q: Double, fs: Double) -> Biquad {
    let a = pow(10.0, gainDb / 40)
    let w = 2 * Double.pi * freq / fs
    let c = cos(w)
    let alpha = sin(w) / (2 * q)
    let k = 2 * a.squareRoot() * alpha
    let b: [Double]
    let d: [Double]
    switch kind {
    case 1:
      b = [a * (a + 1 - (a - 1) * c + k), 2 * a * (a - 1 - (a + 1) * c), a * (a + 1 - (a - 1) * c - k)]
      d = [a + 1 + (a - 1) * c + k, -2 * (a - 1 + (a + 1) * c), a + 1 + (a - 1) * c - k]
    case 2:
      b = [a * (a + 1 + (a - 1) * c + k), -2 * a * (a - 1 + (a + 1) * c), a * (a + 1 + (a - 1) * c - k)]
      d = [a + 1 - (a - 1) * c + k, 2 * (a - 1 - (a + 1) * c), a + 1 - (a - 1) * c - k]
    default:
      b = [1 + alpha * a, -2 * c, 1 - alpha * a]
      d = [1 + alpha / a, -2 * c, 1 - alpha / a]
    }
    return Biquad(b0: b[0] / d[0], b1: b[1] / d[0], b2: b[2] / d[0], a1: d[1] / d[0], a2: d[2] / d[0])
  }

  static func bandpass(freq: Double, q: Double, fs: Double) -> Biquad {
    let w = 2 * Double.pi * freq / fs
    let alpha = sin(w) / (2 * q)
    let a0 = 1 + alpha
    return Biquad(b0: alpha / a0, b1: 0, b2: -alpha / a0, a1: -2 * cos(w) / a0, a2: (1 - alpha) / a0)
  }
}

struct DSPConfig {
  var preamp = 0.0
  var params: [Double] = []
  var crossfeed = false
  var meter = false
  var active: Bool { !params.isEmpty || preamp != 0 || crossfeed || meter }
}

private struct Block {
  let silentMs: Double
  let db: Double
  let bands: [Double]
}

// Settings shared by every tap, and the latest level block they report.
final class PawseDSP {
  static let shared = PawseDSP()
  private let lock = NSLock()
  private var config = DSPConfig()
  private var version = 0
  private var latest: Block?
  private var latestAt = Date.distantPast

  func snapshot() -> (DSPConfig, Int) {
    lock.lock(); defer { lock.unlock() }
    return (config, version)
  }

  private func update(_ change: (inout DSPConfig) -> Void) {
    lock.lock(); defer { lock.unlock() }
    change(&config)
    version += 1
  }

  func setChain(preamp: Double, params: [Double]) { update { $0.preamp = preamp; $0.params = params } }
  func setCrossfeed(_ on: Bool) { update { $0.crossfeed = on } }
  func setMeter(_ on: Bool) { update { $0.meter = on } }

  fileprivate func report(_ block: Block) {
    lock.lock(); defer { lock.unlock() }
    latest = block
    latestAt = Date()
  }

  // [silentMs, rms dB, band dB x pawseBands]
  func levels() -> [Double] {
    lock.lock(); defer { lock.unlock() }
    guard let b = latest, Date().timeIntervalSince(latestAt) < 0.6 else {
      return [0, floorDb] + [Double](repeating: floorDb, count: pawseBands)
    }
    return [b.silentMs, b.db] + b.bands
  }
}

// One per AVPlayerItem tap; runs on the audio thread.
final class TapState {
  private var sampleRate = 44100.0
  private var floatPCM = false
  private var applied = -1
  private var gain = 1.0
  private var filters: [Biquad] = []
  private var bandFilters: [Biquad] = []
  private var loA0 = 0.0, loB1 = 0.0, hiA0 = 0.0, hiA1 = 0.0, hiB1 = 0.0, cfGain = 1.0
  private var lo = [0.0, 0.0], hi = [0.0, 0.0], prev = [0.0, 0.0]
  private var silentFrames = 0

  func prepare(sampleRate: Double, floatPCM: Bool) {
    self.sampleRate = sampleRate
    self.floatPCM = floatPCM
    reset()
  }

  func reset() {
    applied = -1
    filters = []
    lo = [0, 0]; hi = [0, 0]; prev = [0, 0]
    silentFrames = 0
  }

  private func rebuild(_ cfg: DSPConfig) {
    gain = pow(10.0, cfg.preamp / 20)
    let nyquist = sampleRate / 2
    var next: [Biquad] = []
    var i = 0
    while i + 3 < cfg.params.count {
      let freq = cfg.params[i + 1]
      if freq > 0 && freq < nyquist * 0.98 {
        next.append(Biquad.design(kind: Int(cfg.params[i]), freq: freq, gainDb: cfg.params[i + 2], q: cfg.params[i + 3], fs: sampleRate))
      }
      i += 4
    }
    filters = next
    bandFilters = cfg.meter ? bandHz.filter { $0 < nyquist * 0.9 }.map { Biquad.bandpass(freq: $0, q: bandQ, fs: sampleRate) } : []
    if cfg.crossfeed { designCrossfeed() }
  }

  // bs2b: 700 Hz cut, 4.5 dB feed.
  private func designCrossfeed() {
    let feed = 4.5, cut = 700.0
    let gbLo = feed * -5.0 / 6.0 - 3.0
    let gbHi = feed / 6.0 - 3.0
    let gLo = pow(10.0, gbLo / 20)
    let gHi = 1 - pow(10.0, gbHi / 20)
    let cutHi = cut * pow(2.0, (gbLo - 20 * log10(gHi)) / 12)
    var x = exp(-2 * Double.pi * cut / sampleRate)
    loB1 = x
    loA0 = gLo * (1 - x)
    x = exp(-2 * Double.pi * cutHi / sampleRate)
    hiB1 = x
    hiA0 = 1 - gHi * (1 - x)
    hiA1 = -x
    cfGain = 1 / (1 - gHi + gLo)
  }

  // `left` and `right` step by `stride` floats; right is nil for mono.
  func process(left: UnsafeMutablePointer<Float>, right: UnsafeMutablePointer<Float>?, stride: Int, frames: Int) {
    guard floatPCM, frames > 0 else { return }
    let (cfg, version) = PawseDSP.shared.snapshot()
    if version != applied {
      rebuild(cfg)
      applied = version
    }
    guard cfg.active else { return }
    let stereo = right != nil
    var bandSq = [Double](repeating: 0, count: pawseBands)
    var sumSq = 0.0
    for n in 0..<frames {
      var l = Double(left[n * stride]) * gain
      var r = stereo ? Double(right![n * stride]) * gain : 0
      for f in filters {
        l = f.run(l, 0)
        if stereo { r = f.run(r, 1) }
      }
      if stereo && cfg.crossfeed {
        lo[0] = loA0 * l + loB1 * lo[0]
        lo[1] = loA0 * r + loB1 * lo[1]
        hi[0] = hiA0 * l + hiA1 * prev[0] + hiB1 * hi[0]
        hi[1] = hiA0 * r + hiA1 * prev[1] + hiB1 * hi[1]
        prev[0] = l
        prev[1] = r
        l = (hi[0] + lo[1]) * cfGain
        r = (hi[1] + lo[0]) * cfGain
      }
      if cfg.meter {
        let m = stereo ? (l + r) * 0.5 : l
        sumSq += m * m
        for (b, f) in bandFilters.enumerated() {
          let y = f.run(m, 0)
          bandSq[b] += y * y
        }
      }
      left[n * stride] = Float(max(-1, min(1, l)))
      if stereo { right![n * stride] = Float(max(-1, min(1, r))) }
    }
    if cfg.meter {
      let count = Double(frames)
      let db = 10 * log10(sumSq / count + 1e-12)
      silentFrames = db < silentDb ? silentFrames + frames : 0
      let bands = (0..<pawseBands).map { $0 < bandFilters.count ? 10 * log10(bandSq[$0] / count + 1e-12) : floorDb }
      PawseDSP.shared.report(Block(silentMs: Double(silentFrames) * 1000 / sampleRate, db: db, bands: bands))
    }
  }
}
