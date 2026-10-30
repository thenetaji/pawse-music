import AVFoundation
import MediaToolbox

private let tapInit: MTAudioProcessingTapInitCallback = { _, clientInfo, storageOut in
  storageOut.pointee = clientInfo
}

private let tapFinalize: MTAudioProcessingTapFinalizeCallback = { tap in
  Unmanaged<TapState>.fromOpaque(MTAudioProcessingTapGetStorage(tap)).release()
}

private let tapPrepare: MTAudioProcessingTapPrepareCallback = { tap, _, format in
  let state = Unmanaged<TapState>.fromOpaque(MTAudioProcessingTapGetStorage(tap)).takeUnretainedValue()
  let asbd = format.pointee
  let isFloat = asbd.mFormatID == kAudioFormatLinearPCM
    && (asbd.mFormatFlags & kAudioFormatFlagIsFloat) != 0
    && asbd.mBitsPerChannel == 32
  state.prepare(sampleRate: asbd.mSampleRate, floatPCM: isFloat)
}

private let tapUnprepare: MTAudioProcessingTapUnprepareCallback = { tap in
  Unmanaged<TapState>.fromOpaque(MTAudioProcessingTapGetStorage(tap)).takeUnretainedValue().reset()
}

private let tapProcess: MTAudioProcessingTapProcessCallback = { tap, frames, _, bufferList, framesOut, flagsOut in
  guard MTAudioProcessingTapGetSourceAudio(tap, frames, bufferList, flagsOut, nil, framesOut) == noErr else { return }
  let state = Unmanaged<TapState>.fromOpaque(MTAudioProcessingTapGetStorage(tap)).takeUnretainedValue()
  let buffers = UnsafeMutableAudioBufferListPointer(bufferList)
  let count = framesOut.pointee
  if buffers.count >= 2 {
    guard let l = buffers[0].mData, let r = buffers[1].mData else { return }
    state.process(
      left: l.assumingMemoryBound(to: Float.self),
      right: r.assumingMemoryBound(to: Float.self),
      stride: 1,
      frames: count
    )
  } else if buffers.count == 1, let data = buffers[0].mData {
    let base = data.assumingMemoryBound(to: Float.self)
    switch buffers[0].mNumberChannels {
    case 1: state.process(left: base, right: nil, stride: 1, frames: count)
    case 2: state.process(left: base, right: base + 1, stride: 2, frames: count)
    default: break
    }
  }
}

// The patched @rntp/player posts each AVPlayerItem it installs; this puts the DSP tap on it.
enum PawseTapInstaller {
  private static var started = false

  static func start() {
    guard !started else { return }
    started = true
    NotificationCenter.default.addObserver(
      forName: Notification.Name("PawseAudioItem"), object: nil, queue: .main
    ) { note in
      if let item = note.object as? AVPlayerItem { attach(item) }
    }
  }

  private static func attach(_ item: AVPlayerItem) {
    item.asset.loadTracks(withMediaType: .audio) { tracks, _ in
      guard let track = tracks?.first else { return }
      DispatchQueue.main.async {
        guard let tap = makeTap() else { return }
        let params = AVMutableAudioMixInputParameters(track: track)
        params.audioTapProcessor = tap
        let mix = AVMutableAudioMix()
        mix.inputParameters = [params]
        item.audioMix = mix
      }
    }
  }

  private static func makeTap() -> MTAudioProcessingTap? {
    let state = Unmanaged.passRetained(TapState())
    var callbacks = MTAudioProcessingTapCallbacks(
      version: Int32(kMTAudioProcessingTapCallbacksVersion_0),
      clientInfo: state.toOpaque(),
      init: tapInit,
      finalize: tapFinalize,
      prepare: tapPrepare,
      unprepare: tapUnprepare,
      process: tapProcess
    )
    var tap: MTAudioProcessingTap?
    let status = MTAudioProcessingTapCreate(
      kCFAllocatorDefault, &callbacks, kMTAudioProcessingTapCreationFlag_PreEffects, &tap
    )
    guard status == noErr, let tap else {
      state.release()
      return nil
    }
    return tap
  }
}
