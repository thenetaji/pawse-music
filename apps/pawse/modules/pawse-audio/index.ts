// Equaliser, crossfeed and level meter on the audio path. A no-op where the native module isn't linked (web has index.web.ts).
import { requireOptionalNativeModule } from "expo";
import { Platform } from "react-native";

import type { Chain } from "../../src/lib/audio-fx/eq";
import {
  flattenChain,
  LEVEL_BANDS,
  type Levels,
  type PawseAudioApi,
} from "./types";

export { LEVEL_BANDS, type Levels };

interface Native {
  setChain(preamp: number, params: number[]): void;
  setCrossfeed(on: boolean): void;
  setMeter(on: boolean): void;
  setSkipSilence(on: boolean): void;
  levels(): number[];
}

const native = requireOptionalNativeModule<Native>("PawseAudio");

const quiet = (fn: () => void) => {
  try {
    fn();
  } catch {
    // An older native build without this call.
  }
};

export const PawseAudio: PawseAudioApi = {
  available: native != null,
  skipsSilence: native != null && Platform.OS === "android",
  setChain: (chain: Chain) =>
    quiet(() => native?.setChain(chain.preamp, flattenChain(chain))),
  setCrossfeed: (on) => quiet(() => native?.setCrossfeed(on)),
  setMeter: (on) => quiet(() => native?.setMeter(on)),
  setSkipSilence: (on) => quiet(() => native?.setSkipSilence(on)),
  levels() {
    try {
      const v = native?.levels();
      if (!v || v.length < 2 + LEVEL_BANDS) return null;
      return { silentMs: v[0], db: v[1], bands: v.slice(2, 2 + LEVEL_BANDS) };
    } catch {
      return null;
    }
  },
};
