import { type Filter, peakBoostDb } from "./biquad";

export const BAND_FREQS = [
  31, 62, 125, 250, 500, 1000, 2000, 4000, 8000, 16000,
];
const BAND_Q = 1.41;
export const GAIN_LIMIT = 12;
export const PREAMP_LIMIT = 12;

export type PresetId =
  | "flat"
  | "bass"
  | "bassCut"
  | "treble"
  | "trebleCut"
  | "vocal"
  | "loudness"
  | "pop"
  | "rock"
  | "hiphop"
  | "electronic"
  | "jazz"
  | "classical"
  | "acoustic"
  | "speaker"
  | "spoken";

export const PRESETS: {
  id: PresetId;
  name: string;
  about: string;
  gains: number[];
}[] = [
  {
    id: "flat",
    name: "Flat",
    about: "The song as it was mixed.",
    gains: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
  },
  {
    id: "bass",
    name: "Bass boost",
    about: "More kick and low end.",
    gains: [6, 5, 4, 2, 0, 0, 0, 0, 0, 0],
  },
  {
    id: "bassCut",
    name: "Less bass",
    about: "Tames boomy headphones and car speakers.",
    gains: [-6, -5, -4, -2, 0, 0, 0, 0, 0, 0],
  },
  {
    id: "treble",
    name: "Treble",
    about: "Brighter cymbals and more air.",
    gains: [0, 0, 0, 0, 0, 1, 2, 4, 5, 6],
  },
  {
    id: "trebleCut",
    name: "Less treble",
    about: "Softens harsh or sibilant tracks.",
    gains: [0, 0, 0, 0, 0, -1, -2, -4, -5, -6],
  },
  {
    id: "vocal",
    name: "Vocal",
    about: "Pushes the voice forward.",
    gains: [-3, -2, -1, 1, 3, 4, 4, 2, 0, -1],
  },
  {
    id: "loudness",
    name: "Loudness",
    about: "Fuller lows and highs at low volume.",
    gains: [5, 4, 2, 0, -1, -1, 0, 2, 4, 5],
  },
  {
    id: "pop",
    name: "Pop",
    about: "Warm, forward mids for vocals and synths.",
    gains: [-1, 0, 2, 3, 4, 3, 1, 0, -1, -1],
  },
  {
    id: "rock",
    name: "Rock",
    about: "Punchy drums and crisp guitars.",
    gains: [5, 4, 2, -1, -2, -1, 1, 3, 4, 5],
  },
  {
    id: "hiphop",
    name: "Hip-hop",
    about: "Deep 808s with clear vocals on top.",
    gains: [6, 5, 2, 3, -1, -1, 1, 0, 2, 3],
  },
  {
    id: "electronic",
    name: "Electronic",
    about: "Sub-bass and sparkle, scooped mids.",
    gains: [5, 4, 1, 0, -2, 1, 0, 1, 4, 5],
  },
  {
    id: "jazz",
    name: "Jazz",
    about: "Rounded bass and natural horns.",
    gains: [3, 2, 1, 2, -1, -1, 0, 1, 2, 3],
  },
  {
    id: "classical",
    name: "Classical",
    about: "Wide and open, for orchestras.",
    gains: [4, 3, 2, 1, -1, -1, 0, 2, 3, 4],
  },
  {
    id: "acoustic",
    name: "Acoustic",
    about: "Body for guitars and pianos.",
    gains: [3, 3, 2, 1, 1, 1, 2, 3, 2, 1],
  },
  {
    id: "speaker",
    name: "Small speakers",
    about: "Drops lows a phone can't play, lifts what it can.",
    gains: [-6, -4, 0, 3, 3, 2, 1, 1, 0, -2],
  },
  {
    id: "spoken",
    name: "Podcasts",
    about: "Clear speech, less rumble.",
    gains: [-6, -5, -3, 0, 2, 4, 4, 3, 1, -2],
  },
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
