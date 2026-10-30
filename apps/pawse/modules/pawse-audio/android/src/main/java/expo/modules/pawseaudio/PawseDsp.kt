@file:Suppress("UnsafeOptInUsageError")

package expo.modules.pawseaudio

import android.os.Handler
import android.os.Looper
import androidx.media3.common.C
import androidx.media3.common.audio.AudioProcessor
import androidx.media3.common.audio.BaseAudioProcessor
import androidx.media3.common.audio.SonicAudioProcessor
import androidx.media3.exoplayer.ExoPlayer
import androidx.media3.exoplayer.audio.DefaultAudioSink
import androidx.media3.exoplayer.audio.SilenceSkippingAudioProcessor
import java.lang.ref.WeakReference
import java.nio.ByteBuffer
import kotlin.math.PI
import kotlin.math.cos
import kotlin.math.exp
import kotlin.math.log10
import kotlin.math.pow
import kotlin.math.sin
import kotlin.math.sqrt

private const val BANDS = 16
// A Q of 2.5 makes each band about one log step wide.
private const val BAND_Q = 2.5
private const val RING = 64
private const val SILENT_DB = -60.0
private const val FLOOR_DB = -120.0
private const val LATENCY_NS = 300_000_000L
private const val STALE_NS = 600_000_000L
// 40 Hz to 16 kHz in equal log steps, as BAND_HZ in types.ts.
private val BAND_HZ = DoubleArray(BANDS) { 40.0 * 400.0.pow(it / (BANDS - 1.0)) }

private class Biquad(
  val b0: Double, val b1: Double, val b2: Double, val a1: Double, val a2: Double,
) {
  private val z1 = DoubleArray(2)
  private val z2 = DoubleArray(2)

  fun run(x: Double, ch: Int): Double {
    val y = b0 * x + z1[ch]
    z1[ch] = b1 * x - a1 * y + z2[ch]
    z2[ch] = b2 * x - a2 * y
    return y
  }

  companion object {
    // RBJ cookbook; kind 0 peaking, 1 low shelf, 2 high shelf.
    fun design(kind: Int, freq: Double, gainDb: Double, q: Double, fs: Int): Biquad {
      val a = 10.0.pow(gainDb / 40)
      val w = 2 * PI * freq / fs
      val c = cos(w)
      val alpha = sin(w) / (2 * q)
      val k = 2 * sqrt(a) * alpha
      val b: DoubleArray
      val d: DoubleArray
      when (kind) {
        1 -> {
          b = doubleArrayOf(a * (a + 1 - (a - 1) * c + k), 2 * a * (a - 1 - (a + 1) * c), a * (a + 1 - (a - 1) * c - k))
          d = doubleArrayOf(a + 1 + (a - 1) * c + k, -2 * (a - 1 + (a + 1) * c), a + 1 + (a - 1) * c - k)
        }
        2 -> {
          b = doubleArrayOf(a * (a + 1 + (a - 1) * c + k), -2 * a * (a - 1 + (a + 1) * c), a * (a + 1 + (a - 1) * c - k))
          d = doubleArrayOf(a + 1 - (a - 1) * c + k, 2 * (a - 1 - (a + 1) * c), a + 1 - (a - 1) * c - k)
        }
        else -> {
          b = doubleArrayOf(1 + alpha * a, -2 * c, 1 - alpha * a)
          d = doubleArrayOf(1 + alpha / a, -2 * c, 1 - alpha / a)
        }
      }
      return Biquad(b[0] / d[0], b[1] / d[0], b[2] / d[0], d[1] / d[0], d[2] / d[0])
    }

    fun bandpass(freq: Double, q: Double, fs: Int): Biquad {
      val w = 2 * PI * freq / fs
      val alpha = sin(w) / (2 * q)
      val a0 = 1 + alpha
      return Biquad(alpha / a0, 0.0, -alpha / a0, -2 * cos(w) / a0, (1 - alpha) / a0)
    }
  }
}

private class Block(val at: Long, val silentMs: Double, val db: Double, val bands: DoubleArray)

private class Config(
  val preamp: Double,
  val params: DoubleArray,
  val crossfeed: Boolean,
  val meter: Boolean,
) {
  val active get() = params.isNotEmpty() || preamp != 0.0 || crossfeed || meter
}

object PawseDsp : BaseAudioProcessor() {
  @Volatile private var wanted = Config(0.0, DoubleArray(0), false, false)
  private var applied: Config? = null
  private var sampleRate = 0
  private var channels = 0

  private var gain = 1.0
  private var filters = emptyArray<Biquad>()
  private var bandFilters = emptyArray<Biquad>()

  // bs2b: 700 Hz cut, 4.5 dB feed.
  private var loA0 = 0.0
  private var loB1 = 0.0
  private var hiA0 = 0.0
  private var hiA1 = 0.0
  private var hiB1 = 0.0
  private var cfGain = 1.0
  private val lo = DoubleArray(2)
  private val hi = DoubleArray(2)
  private val prev = DoubleArray(2)

  private val ring = arrayOfNulls<Block>(RING)
  private var head = 0
  private var silentFrames = 0L

  private val silence = SilenceSkippingAudioProcessor(400_000L, 0.05f, 150_000L, 0, 64.toShort())
  private var player: WeakReference<ExoPlayer>? = null
  @Volatile private var skipWanted = false

  // The player service asks for this when it builds its audio sink.
  @JvmStatic
  fun chain() = DefaultAudioSink.DefaultAudioProcessorChain(arrayOf<AudioProcessor>(this), silence, SonicAudioProcessor())

  @JvmStatic
  fun attach(exo: ExoPlayer) {
    player = WeakReference(exo)
    setSkipSilence(skipWanted)
  }

  fun setSkipSilence(on: Boolean) {
    skipWanted = on
    Handler(Looper.getMainLooper()).post { player?.get()?.setSkipSilenceEnabled(on) }
  }

  @Synchronized
  fun setChain(preamp: Double, params: DoubleArray) {
    val c = wanted
    wanted = Config(preamp, params, c.crossfeed, c.meter)
  }

  @Synchronized
  fun setCrossfeed(on: Boolean) {
    val c = wanted
    wanted = Config(c.preamp, c.params, on, c.meter)
  }

  @Synchronized
  fun setMeter(on: Boolean) {
    val c = wanted
    wanted = Config(c.preamp, c.params, c.crossfeed, on)
  }

  // [silentMs, rms dB, band dB x BANDS], the audible moment rather than the one just queued.
  fun levels(): DoubleArray {
    val now = System.nanoTime()
    val blocks = synchronized(ring) { ring.copyOf() }.filterNotNull()
    val newest = blocks.maxByOrNull { it.at }
    if (newest == null || now - newest.at > STALE_NS) {
      return DoubleArray(2 + BANDS) { if (it == 0) 0.0 else FLOOR_DB }
    }
    val heard = blocks.filter { it.at <= now - LATENCY_NS }.maxByOrNull { it.at } ?: newest
    return doubleArrayOf(newest.silentMs, heard.db) + heard.bands
  }

  override fun onConfigure(format: AudioProcessor.AudioFormat): AudioProcessor.AudioFormat =
    if (format.encoding == C.ENCODING_PCM_16BIT && (format.channelCount == 1 || format.channelCount == 2)) {
      format
    } else {
      AudioProcessor.AudioFormat.NOT_SET
    }

  override fun onFlush(streamMetadata: AudioProcessor.StreamMetadata) {
    sampleRate = inputAudioFormat.sampleRate
    channels = inputAudioFormat.channelCount
    filters = emptyArray()
    applied = null
    lo.fill(0.0)
    hi.fill(0.0)
    prev.fill(0.0)
    silentFrames = 0
    synchronized(ring) { ring.fill(null) }
  }

  override fun queueInput(inputBuffer: ByteBuffer) {
    val cfg = wanted
    if (cfg !== applied) rebuild(cfg)
    val bytes = inputBuffer.remaining()
    val out = replaceOutputBuffer(bytes)
    if (!cfg.active) {
      out.put(inputBuffer)
      out.flip()
      return
    }
    val ch = channels
    val frames = bytes / (2 * ch)
    val stereo = ch == 2
    val bandSq = DoubleArray(BANDS)
    var sumSq = 0.0
    var pos = inputBuffer.position()
    for (n in 0 until frames) {
      var l = inputBuffer.getShort(pos) / 32768.0 * gain
      pos += 2
      var r = 0.0
      if (stereo) {
        r = inputBuffer.getShort(pos) / 32768.0 * gain
        pos += 2
      }
      for (f in filters) {
        l = f.run(l, 0)
        if (stereo) r = f.run(r, 1)
      }
      if (stereo && cfg.crossfeed) {
        lo[0] = loA0 * l + loB1 * lo[0]
        lo[1] = loA0 * r + loB1 * lo[1]
        hi[0] = hiA0 * l + hiA1 * prev[0] + hiB1 * hi[0]
        hi[1] = hiA0 * r + hiA1 * prev[1] + hiB1 * hi[1]
        prev[0] = l
        prev[1] = r
        l = (hi[0] + lo[1]) * cfGain
        r = (hi[1] + lo[0]) * cfGain
      }
      if (cfg.meter) {
        val m = if (stereo) (l + r) * 0.5 else l
        sumSq += m * m
        for (b in bandFilters.indices) {
          val y = bandFilters[b].run(m, 0)
          bandSq[b] += y * y
        }
      }
      out.putShort(toShort(l))
      if (stereo) out.putShort(toShort(r))
    }
    inputBuffer.position(inputBuffer.limit())
    out.flip()
    if (cfg.meter && frames > 0) record(frames, sumSq, bandSq)
  }

  private fun toShort(v: Double): Short = Math.round(v * 32768.0).coerceIn(-32768L, 32767L).toShort()

  private fun rebuild(cfg: Config) {
    applied = cfg
    if (sampleRate <= 0) return
    gain = 10.0.pow(cfg.preamp / 20)
    val nyquist = sampleRate / 2.0
    val next = ArrayList<Biquad>()
    var i = 0
    while (i + 3 < cfg.params.size) {
      val freq = cfg.params[i + 1]
      if (freq > 0 && freq < nyquist * 0.98) {
        next.add(Biquad.design(cfg.params[i].toInt(), freq, cfg.params[i + 2], cfg.params[i + 3], sampleRate))
      }
      i += 4
    }
    filters = next.toTypedArray()
    bandFilters = if (cfg.meter) {
      BAND_HZ.filter { it < nyquist * 0.9 }.map { Biquad.bandpass(it, BAND_Q, sampleRate) }.toTypedArray()
    } else {
      emptyArray()
    }
    if (cfg.crossfeed) designCrossfeed()
  }

  private fun designCrossfeed() {
    val feed = 4.5
    val cut = 700.0
    val gbLo = feed * -5.0 / 6.0 - 3.0
    val gbHi = feed / 6.0 - 3.0
    val gLo = 10.0.pow(gbLo / 20)
    val gHi = 1 - 10.0.pow(gbHi / 20)
    val cutHi = cut * 2.0.pow((gbLo - 20 * log10(gHi)) / 12)
    var x = exp(-2 * PI * cut / sampleRate)
    loB1 = x
    loA0 = gLo * (1 - x)
    x = exp(-2 * PI * cutHi / sampleRate)
    hiB1 = x
    hiA0 = 1 - gHi * (1 - x)
    hiA1 = -x
    cfGain = 1 / (1 - gHi + gLo)
  }

  private fun record(frames: Int, sumSq: Double, bandSq: DoubleArray) {
    val db = 10 * log10(sumSq / frames + 1e-12)
    silentFrames = if (db < SILENT_DB) silentFrames + frames else 0
    val bands = DoubleArray(BANDS) { if (it < bandFilters.size) 10 * log10(bandSq[it] / frames + 1e-12) else FLOOR_DB }
    val block = Block(System.nanoTime(), silentFrames * 1000.0 / sampleRate, db, bands)
    synchronized(ring) {
      ring[head] = block
      head = (head + 1) % RING
    }
  }
}
