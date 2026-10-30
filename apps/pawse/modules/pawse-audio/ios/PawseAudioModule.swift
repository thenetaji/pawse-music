import ExpoModulesCore

public class PawseAudioModule: Module {
  public func definition() -> ModuleDefinition {
    Name("PawseAudio")

    OnCreate {
      PawseTapInstaller.start()
    }

    Function("setChain") { (preamp: Double, params: [Double]) in
      PawseDSP.shared.setChain(preamp: preamp, params: params)
    }

    Function("setCrossfeed") { (on: Bool) in
      PawseDSP.shared.setCrossfeed(on)
    }

    Function("setMeter") { (on: Bool) in
      PawseDSP.shared.setMeter(on)
    }

    Function("setSkipSilence") { (_: Bool) in }

    Function("levels") { () -> [Double] in
      PawseDSP.shared.levels()
    }
  }
}
