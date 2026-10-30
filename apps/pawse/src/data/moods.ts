import type { Track } from "@pawse/music-core";

import { songVibe } from "../lib/vibe";
import type { Play } from "./library-model";
import { artistKey, pickTracks, trackKey } from "./recommend";

export type MoodId = "retro" | "chill" | "loud" | "modern";
export const MOODS: { id: MoodId; label: string }[] = [
  { id: "retro", label: "90s & retro" },
  { id: "chill", label: "Chill" },
  { id: "loud", label: "Loud" },
  { id: "modern", label: "Modern" },
];

export type Vector = { era: number; energy: number; confidence: number };

export type Cue = { axis: "era" | "energy"; value: number; weight: number };

export type Evidence = {
  year?: number;
  tags?: string[];
  lists?: string[];
};

const ERA_FROM = 1960;
const ERA_TO = 2025;
export const eraOf = (year: number): number =>
  Math.min(1, Math.max(0, (year - ERA_FROM) / (ERA_TO - ERA_FROM)));
export const yearOf = (era: number): number =>
  Math.round(ERA_FROM + era * (ERA_TO - ERA_FROM));

// Without evidence a song sits between "retro" and "modern", and mid-energy.
const NEUTRAL = { era: eraOf(2008), energy: 0.5 };
const PRIOR = 0.5;

const YEAR_W = 3;
const DECADE_W = 1.2;
const LIST_W = 1.5;
// All of a song's tags share this much weight, so a long tag list does not drown a release year.
const TAGS_W = 2.4;
const TITLE_W = 0.4;
const SESSION_W = 0.25;

export const MIN_CONFIDENCE = 0.25;
export const MIN_FIT = 0.5;

const ramp = (x: number, from: number, to: number) =>
  Math.min(1, Math.max(0, (x - from) / (to - from)));

const FIT: Record<MoodId, (v: Vector) => number> = {
  retro: (v) => 1 - ramp(v.era, eraOf(2000), eraOf(2008)),
  modern: (v) => ramp(v.era, eraOf(2008), eraOf(2016)),
  chill: (v) => 1 - ramp(v.energy, 0.3, 0.5),
  loud: (v) => ramp(v.energy, 0.6, 0.8),
};

export const moodFit = (mood: MoodId, v: Vector): number => FIT[mood](v);

export const inMood = (mood: MoodId, v: Vector): boolean =>
  v.confidence >= MIN_CONFIDENCE && moodFit(mood, v) >= MIN_FIT;

export const distance = (a: Vector, b: Vector): number =>
  Math.hypot(a.era - b.era, a.energy - b.energy);

export function decadeOf(text: string): number | undefined {
  const m = /(?:^|\D)(?:(19|20)(\d)|(\d))0['’]?s(?![a-z])/i.exec(text);
  if (!m) return undefined;
  const digit = Number(m[2] ?? m[3]);
  // Two-digit decades: 50s to 90s are the 1900s, 00s to 20s the 2000s.
  const century = m[1] ? Number(m[1]) * 100 : digit >= 3 ? 1900 : 2000;
  const year = century + digit * 10;
  return year >= 1950 && year <= 2020 ? year : undefined;
}

// Specific before general: the first match wins.
const TAG_ENERGY: [RegExp, number][] = [
  [/metal|grindcore|gabber|hardstyle/, 0.95],
  [
    /hardcore|punk|drum and bass|drum n bass|dubstep|hard rock|industrial|techno|trance|aggressive|heavy|energetic|workout/,
    0.88,
  ],
  [/party|\bdance|edm|electro|house|trap|drill|phonk|upbeat|club/, 0.8],
  [/hip.?hop|\brap\b|reggaeton|funk|disco|grunge/, 0.68],
  [/\brock|latin|bollywood|k-?pop|j-?pop/, 0.65],
  [/\bpop\b|alternative|indie|new wave|synth/, 0.52],
  [/\br&b|rnb|reggae|country|soul|blues|\bsad|melancholy|romantic/, 0.4],
  [/singer.?songwriter|folk|acoustic|jazz|soundtrack|score|piano|ballad/, 0.28],
  [
    /chill|downtempo|trip.?hop|lounge|easy listening|mellow|lo.?fi|classical/,
    0.18,
  ],
  [/ambient|new age|sleep|relax|calm|meditation/, 0.08],
];

export function tagEnergy(tag: string): number | undefined {
  const t = tag.toLowerCase();
  return TAG_ENERGY.find(([re]) => re.test(t))?.[1];
}

export const LIST_CUES: Record<string, { energy: number }> = {
  sleep: { energy: 0.05 },
  chill: { energy: 0.2 },
  focus: { energy: 0.25 },
  sad: { energy: 0.28 },
  romance: { energy: 0.35 },
  party: { energy: 0.8 },
  energize: { energy: 0.8 },
  workout: { energy: 0.85 },
};
export const decadeList = (year: number) => `decade:${year}`;
export const CHARTS_LIST = "charts";

const VIBE_ENERGY = { hype: 0.8, vibe: 0.25, sad: 0.28, love: 0.4 } as const;

export function cuesOf(track: Track, ev: Evidence, now: number): Cue[] {
  const out: Cue[] = [];
  if (ev.year) out.push({ axis: "era", value: eraOf(ev.year), weight: YEAR_W });

  const fromTags: Omit<Cue, "weight">[] = [];
  for (const tag of ev.tags ?? []) {
    const energy = tagEnergy(tag);
    if (energy !== undefined) fromTags.push({ axis: "energy", value: energy });
    const decade = decadeOf(tag);
    if (decade !== undefined)
      fromTags.push({ axis: "era", value: eraOf(decade + 5) });
  }
  const tagWeight = TAGS_W / Math.max(3, fromTags.length);
  for (const c of fromTags) out.push({ ...c, weight: tagWeight });

  for (const id of ev.lists ?? []) {
    if (id === CHARTS_LIST)
      out.push({
        axis: "era",
        value: eraOf(new Date(now).getFullYear() - 1),
        weight: DECADE_W,
      });
    else if (id.startsWith("decade:"))
      out.push({
        axis: "era",
        value: eraOf(Number(id.slice(7)) + 5),
        weight: DECADE_W,
      });
    else if (LIST_CUES[id])
      out.push({ axis: "energy", value: LIST_CUES[id].energy, weight: LIST_W });
  }

  const vibe = songVibe(track);
  if (vibe !== "groove")
    out.push({ axis: "energy", value: VIBE_ENERGY[vibe], weight: TITLE_W });
  return out;
}

export const sessionCues = (near: Vector[]): Cue[] =>
  near.flatMap((n) => [
    { axis: "era" as const, value: n.era, weight: SESSION_W * n.confidence },
    {
      axis: "energy" as const,
      value: n.energy,
      weight: SESSION_W * n.confidence,
    },
  ]);

export type Axes = Record<"era" | "energy", { value: number; sure: number }>;

export function axesOf(cues: Cue[]): Axes {
  const sum = { era: 0, energy: 0 };
  const weight = { era: 0, energy: 0 };
  for (const c of cues) {
    sum[c.axis] += c.value * c.weight;
    weight[c.axis] += c.weight;
  }
  const axis = (a: "era" | "energy") => ({
    value: (sum[a] + NEUTRAL[a] * PRIOR) / (weight[a] + PRIOR),
    sure: weight[a] / (weight[a] + PRIOR),
  });
  return { era: axis("era"), energy: axis("energy") };
}

export function combine(cues: Cue[]): Vector {
  const { era, energy } = axesOf(cues);
  return {
    era: era.value,
    energy: energy.value,
    confidence: (era.sure + energy.sure) / 2,
  };
}

export const vectorOf = (
  track: Track,
  ev: Evidence,
  now: number,
  near: Vector[] = [],
): Vector => combine([...cuesOf(track, ev, now), ...sessionCues(near)]);

// History records a play after 30 s, so songs played one after another land about a song apart.
const SESSION_GAP_MS = 12 * 60_000;
const NEIGHBOURS_MAX = 6;

export function sessionNeighbours(
  history: Play[],
  reach = 2,
): Map<string, string[]> {
  const out = new Map<string, Set<string>>();
  history.forEach((play, i) => {
    const key = trackKey(play.track);
    const near = out.get(key) ?? new Set<string>();
    out.set(key, near);
    for (const dir of [-1, 1]) {
      let from = i;
      for (let k = 0; k < reach; k++) {
        const next = history[from + dir];
        if (!next || Math.abs(history[from].at - next.at) > SESSION_GAP_MS)
          break;
        const other = trackKey(next.track);
        if (other !== key && near.size < NEIGHBOURS_MAX) near.add(other);
        from += dir;
      }
    }
  });
  return new Map([...out].map(([k, v]) => [k, [...v]]));
}

export type Filters = {
  dropped: Set<string>;
  explicit: boolean;
  words: string[];
  blocked: Set<string>;
};

const MUSIC_SEC = { min: 45, max: 12 * 60 };

export function isMusic(t: Track): boolean {
  const d = t.durationSec;
  return !d || (d >= MUSIC_SEC.min && d <= MUSIC_SEC.max);
}

export function isAllowed(t: Track, f: Filters): boolean {
  if (!isMusic(t)) return false;
  if (f.dropped.has(t.id) || f.dropped.has(trackKey(t))) return false;
  if (f.explicit && t.explicit) return false;
  const title = t.title.toLowerCase();
  if (f.words.some((w) => title.includes(w))) return false;
  return !t.artists.some(
    (a) => (a.id && f.blocked.has(a.id)) || f.blocked.has(artistKey(a)),
  );
}

export type Item = { track: Track; vector: Vector };
export const MIX_N = 40;
const JITTER = 0.35;

function shuffled<T>(xs: T[], random: () => number): T[] {
  const out = [...xs];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

export function pickMix(o: {
  mood: MoodId;
  own: Item[];
  finds: Item[];
  share: number;
  n?: number;
  random?: () => number;
}): Track[] {
  const n = o.n ?? MIX_N;
  const random = o.random ?? Math.random;
  const rank = (items: Item[]) =>
    items
      .filter((i) => inMood(o.mood, i.vector))
      .map((i) => ({
        track: i.track,
        seeds: 0,
        score:
          moodFit(o.mood, i.vector) * (0.5 + 0.5 * i.vector.confidence) +
          random() * JITTER,
      }))
      .sort((a, b) => b.score - a.score);
  const own = rank(o.own);
  const finds = rank(o.finds);
  const taken = (ts: Track[]) =>
    new Set(ts.flatMap((t) => [t.id, trackKey(t)]));

  let mine = pickTracks(own, { n: Math.round(n * (1 - o.share)) });
  const found = pickTracks(finds, { n: n - mine.length, skip: taken(mine) });
  if (found.length < n - mine.length)
    mine = pickTracks(own, { n: n - found.length, skip: taken(found) });
  return shuffled([...mine, ...found], random);
}
