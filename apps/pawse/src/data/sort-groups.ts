import type { Track } from "@pawse/music-core";

import { classifyLanguages, LANGUAGE_NAMES } from "./language";
import type { GroupBy } from "./library-model";
import { axesOf, cuesOf, type Evidence, yearOf } from "./moods";

export const OTHER = "other";
export const UNKNOWN_YEAR = "unknown";
export const MIN_GROUP = 3;

const MOOD_LABELS: Record<string, string> = {
  chill: "Chill",
  party: "Party",
  romance: "Romantic",
  sad: "Sad",
  workout: "Workout",
  focus: "Focus",
  sleep: "Sleep",
  calm: "Calm",
  steady: "Steady",
  energetic: "Energetic",
};
const ERA_LABELS: Record<string, string> = {
  "2020s": "2020s",
  "2010s": "2010s",
  "2000s": "2000s",
  old: "90s & older",
};

// Section order when sizes tie.
const ORDER: Record<GroupBy, string[]> = {
  mood: Object.keys(MOOD_LABELS),
  era: Object.keys(ERA_LABELS),
  language: Object.keys(LANGUAGE_NAMES),
};

export function groupLabel(by: GroupBy, id: string): string {
  if (id === OTHER) return "Other";
  if (id === UNKNOWN_YEAR) return "Unknown year";
  return (
    (
      { mood: MOOD_LABELS, era: ERA_LABELS, language: LANGUAGE_NAMES }[
        by
      ] as Record<string, string>
    )[id] ?? id
  );
}

// Where songs with no confident label go.
const catchAll = (by: GroupBy) => (by === "era" ? UNKNOWN_YEAR : OTHER);

// YouTube Music's mood lists (see LIST_CUES in moods.ts) and what the user sees.
const MOOD_LISTS: Record<string, string> = {
  chill: "chill",
  sleep: "sleep",
  focus: "focus",
  sad: "sad",
  romance: "romance",
  party: "party",
  workout: "workout",
  energize: "workout",
};

// Last.fm and MusicBrainz tags that name a mood rather than a genre.
const TAG_MOODS: [RegExp, string][] = [
  [/\bsleep|lullab/, "sleep"],
  [/\bsad\b|melanchol|heartbreak|heartbroken|depress|breakup/, "sad"],
  [/romantic|romance|love song|\blove\b/, "romance"],
  [/party|\bclub|\bdance|dancefloor/, "party"],
  [/workout|\bgym\b|motivat|energi[sz]ing/, "workout"],
  [/\bfocus|study|concentrat|meditat|new age|ambient/, "focus"],
  [
    /chill|relax|mellow|lo.?fi|downtempo|easy listening|lounge|\bcalm|soothing/,
    "chill",
  ],
];

// When two moods tie, the more specific one wins.
const PRIORITY = [
  "sad",
  "romance",
  "party",
  "workout",
  "focus",
  "sleep",
  "chill",
];
const LIST_VOTE = 2;

export function namedMood(ev: Evidence): string | undefined {
  const votes = new Map<string, number>();
  const vote = (id: string, n: number) =>
    votes.set(id, (votes.get(id) ?? 0) + n);
  for (const id of ev.lists ?? [])
    if (MOOD_LISTS[id]) vote(MOOD_LISTS[id], LIST_VOTE);
  for (const tag of ev.tags ?? []) {
    const id = TAG_MOODS.find(([re]) => re.test(tag.toLowerCase()))?.[1];
    if (id) vote(id, 1);
  }
  let best: string | undefined;
  for (const id of PRIORITY)
    if (votes.has(id) && (!best || votes.get(id)! > votes.get(best)!))
      best = id;
  return best;
}

// Energy is only a label when something other than the title says so.
const ENERGY_SURE = 0.5;
const CALM_BELOW = 0.35;
const ENERGETIC_ABOVE = 0.65;

export function moodGroup(
  track: Track,
  ev: Evidence,
  now: number,
): string | undefined {
  const named = namedMood(ev);
  if (named) return named;
  const { energy } = axesOf(cuesOf(track, ev, now));
  if (energy.sure < ENERGY_SURE) return undefined;
  if (energy.value < CALM_BELOW) return "calm";
  return energy.value > ENERGETIC_ABOVE ? "energetic" : "steady";
}

export function eraGroup(
  track: Track,
  ev: Evidence,
  now: number,
): string | undefined {
  let year = ev.year;
  if (year === undefined) {
    // A weighted mean without the neutral prior, which would pull every decade towards the middle.
    const cues = cuesOf(track, ev, now).filter((c) => c.axis === "era");
    if (!cues.length) return undefined;
    const weight = cues.reduce((sum, c) => sum + c.weight, 0);
    year = yearOf(
      cues.reduce((sum, c) => sum + c.value * c.weight, 0) / weight,
    );
  }
  if (year < 2000) return "old";
  if (year < 2010) return "2000s";
  return year < 2020 ? "2010s" : "2020s";
}

export type Entry = { track: Track; key: string; ev: Evidence };

/** The group id of each song, by key; none when nothing confident says. `context` songs help tell artists' languages. */
export function assignGroups(
  by: GroupBy,
  entries: Entry[],
  context: Entry[] = [],
  now = Date.now(),
): Map<string, string | undefined> {
  if (by === "language") {
    const song = (e: Entry) => ({
      key: e.key,
      title: e.track.title,
      artists: e.track.artists.map((a) => a.name),
      lists: e.ev.lists,
      tags: e.ev.tags,
    });
    const langs = classifyLanguages(entries.map(song), context.map(song));
    return new Map(entries.map((e) => [e.key, langs.get(e.key)]));
  }
  const pick = by === "mood" ? moodGroup : eraGroup;
  return new Map(entries.map((e) => [e.key, pick(e.track, e.ev, now)]));
}

export type Section = {
  id: string;
  label: string;
  tracks: Track[];
  /** A real group, not the leftovers: worth keeping as a playlist that updates itself. */
  named: boolean;
};

/** Sections by size, the leftovers last; groups under `min` songs fold into Other. */
export function toSections(
  by: GroupBy,
  rows: { track: Track; group?: string }[],
  min = MIN_GROUP,
): Section[] {
  const buckets = new Map<string, Track[]>();
  for (const { track, group } of rows) {
    const id = group ?? catchAll(by);
    buckets.set(id, [...(buckets.get(id) ?? []), track]);
  }
  const unknown = buckets.get(catchAll(by)) ?? [];
  buckets.delete(catchAll(by));

  const rank = (id: string) => {
    const at = ORDER[by].indexOf(id);
    return at < 0 ? ORDER[by].length : at;
  };
  const kept = [...buckets].filter(([, tracks]) => tracks.length >= min);
  const folded = [...buckets]
    .filter(([, tracks]) => tracks.length < min)
    .flatMap(([, tracks]) => tracks);
  const section = (id: string, tracks: Track[], named: boolean): Section => ({
    id,
    label: groupLabel(by, id),
    tracks,
    named,
  });

  const out = kept
    .sort((a, b) => b[1].length - a[1].length || rank(a[0]) - rank(b[0]))
    .map(([id, tracks]) => section(id, tracks, true));
  const leftovers = by === "era" ? folded : [...unknown, ...folded];
  if (leftovers.length) out.push(section(OTHER, leftovers, false));
  if (by === "era" && unknown.length)
    out.push(section(UNKNOWN_YEAR, unknown, false));
  return out;
}

export type GroupRow = {
  group: Section;
  /** Absent on the section's header row. */
  track?: Track;
  /** Position within the section. */
  i: number;
  /** Position within the whole list. */
  at: number;
};

/** Header and song rows for a list: each section's header, then its songs. */
export function flattenSections(
  sections: Section[],
  tracks: Track[],
): GroupRow[] {
  const at = new Map<Track, number>();
  tracks.forEach((t, i) => {
    if (!at.has(t)) at.set(t, i);
  });
  return sections.flatMap((group) => [
    { group, i: -1, at: -1 },
    ...group.tracks.map((track, i) => ({
      group,
      track,
      i,
      at: at.get(track) ?? -1,
    })),
  ]);
}
