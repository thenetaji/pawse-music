import type { Chain } from "../../src/lib/audio-fx/eq";

export const LEVEL_BANDS = 10;

export interface Levels {
  silentMs: number;
  /** Overall level and each band, in dB (about -120 to 0). */
  db: number;
  bands: number[];
}

export interface PawseAudioApi {
  available: boolean;
  skipsSilence: boolean;
  setChain(chain: Chain): void;
  setCrossfeed(on: boolean): void;
  setMeter(on: boolean): void;
  setSkipSilence(on: boolean): void;
  levels(): Levels | null;
}

const KIND = { peak: 0, lowshelf: 1, highshelf: 2 } as const;

export const flattenChain = (chain: Chain): number[] =>
  chain.filters.flatMap((f) => [KIND[f.kind], f.freq, f.gain, f.q]);
