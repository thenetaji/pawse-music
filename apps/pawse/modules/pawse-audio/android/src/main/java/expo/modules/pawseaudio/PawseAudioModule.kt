package expo.modules.pawseaudio

import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

class PawseAudioModule : Module() {
  override fun definition() = ModuleDefinition {
    Name("PawseAudio")

    Function("setChain") { preamp: Double, params: DoubleArray -> PawseDsp.setChain(preamp, params) }

    Function("setCrossfeed") { on: Boolean -> PawseDsp.setCrossfeed(on) }

    Function("setMeter") { on: Boolean -> PawseDsp.setMeter(on) }

    Function("setSkipSilence") { on: Boolean -> PawseDsp.setSkipSilence(on) }

    Function<DoubleArray>("levels") { PawseDsp.levels() }
  }
}
