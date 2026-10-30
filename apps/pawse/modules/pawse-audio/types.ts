import type { Chain } from "../../src/lib/audio-fx/eq";

export const LEVEL_BANDS = 16;

/** Band centres, 40 Hz to 16 kHz in equal log steps; the native meters compute the same. */
export const BAND_HZ = Array.from(
  { length: LEVEL_BANDS },
  (_, i) => 40 * 400 ** (i / (LEVEL_BANDS - 1)),
);

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
