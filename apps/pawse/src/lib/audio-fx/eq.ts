import { type Filter, peakBoostDb } from "./biquad";

export const BAND_FREQS = [
  31, 62, 125, 250, 500, 1000, 2000, 4000, 8000, 16000,
];
const BAND_Q = 1.41;
export const GAIN_LIMIT = 12;
export const PREAMP_LIMIT = 12;

export type PresetId = "flat" | "bass" | "vocal" | "treble" | "loudness";

export const PRESETS: { id: PresetId; name: string; gains: number[] }[] = [
  { id: "flat", name: "Flat", gains: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0] },
  { id: "bass", name: "Bass boost", gains: [6, 5, 4, 2, 0, 0, 0, 0, 0, 0] },
  { id: "vocal", name: "Vocal", gains: [-3, -2, -1, 1, 3, 4, 4, 2, 0, -1] },
  { id: "treble", name: "Treble", gains: [0, 0, 0, 0, 0, 1, 2, 4, 5, 6] },
  { id: "loudness", name: "Loudness", gains: [5, 4, 2, 0, -1, -1, 0, 2, 4, 5] },
];

export interface HeadphoneProfile {
  name: string;
  source: string;
  preamp: number;
  filters: Filter[];
}

export type EqSetting = {
  on: boolean;
  preset: PresetId | "custom" | "headphones";
  gains: number[];
  preamp: number;
  headphone: HeadphoneProfile | null;
};

export const DEFAULT_EQ: EqSetting = {
  on: false,
  preset: "flat",
  gains: PRESETS[0].gains,
  preamp: 0,
  headphone: null,
};

export interface Chain {
  preamp: number;
  filters: Filter[];
}

export const NO_CHAIN: Chain = { preamp: 0, filters: [] };

export const clamp = (v: number, lo: number, hi: number) =>
  Math.min(hi, Math.max(lo, v));

export function presetGains(id: EqSetting["preset"], eq: EqSetting): number[] {
  if (id === "custom") return eq.gains;
  return PRESETS.find((p) => p.id === id)?.gains ?? PRESETS[0].gains;
}

export function bandFilters(gains: number[]): Filter[] {
  return BAND_FREQS.map((freq, i) => ({
    kind: "peak" as const,
    freq,
    gain: clamp(gains[i] ?? 0, -GAIN_LIMIT, GAIN_LIMIT),
    q: BAND_Q,
  })).filter((f) => f.gain !== 0);
}

// Bands and presets are cut by their own peak boost so they can't clip; AutoEq profiles carry theirs.
export function chainFor(eq: EqSetting): Chain {
  if (!eq.on) return NO_CHAIN;
  const user = clamp(eq.preamp, -PREAMP_LIMIT, PREAMP_LIMIT);
  if (eq.preset === "headphones") {
    if (!eq.headphone) return NO_CHAIN;
    return {
      preamp: eq.headphone.preamp + user,
      filters: eq.headphone.filters,
    };
  }
  const filters = bandFilters(presetGains(eq.preset, eq));
  return { preamp: user - peakBoostDb(filters), filters };
}
