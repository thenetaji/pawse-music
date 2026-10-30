import type { AlbumSummary, Shelf, Track } from "@pawse/music-core";
import { useEffect, useMemo } from "react";
import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";

import { isLowData } from "../lib/quality";
import { yt } from "./clients";
import { useOfflineTracks } from "./downloads";
import { languageList, tagLanguage } from "./language";
import { lookupTags } from "./lastfm-tags";
import { useLibrary } from "./library";
import type { Play } from "./library-model";
import {
  CHARTS_LIST,
  decadeList,
  decadeOf,
  type Evidence,
  type Filters,
  type Item,
  isAllowed,
  type MoodId,
  pickMix,
  sessionNeighbours,
  type Vector,
  vectorOf,
} from "./moods";
import { lookupRecording } from "./musicbrainz";
import {
  artistKey,
  dislikes,
  scoreTracks,
  skipHeavy,
  trackKey,
  useClock,
} from "./recommend";
import { useSignals } from "./signals";
import { kv } from "./storage";
import { vaultGet } from "./vault";

type Label = {
  year?: number;
  mb?: string[];
  fm?: string[];
  mbAt?: number;
  fmAt?: number;
};
type Lists = {
  /** Which fetchLists shape this is; older ones lack the language lists. */
  rev?: number;
  at: number;
  finds: Track[];
  songs: Record<string, string[]>;
};

export const LABELS_MAX = 5000;
const FINDS_MAX = 1500;
const LISTS_TTL_MS = 7 * 86400_000;
const LISTS_REV = 2;
const RETRY_AFTER_MS = 10 * 60_000;
const EMPTY_LISTS: Lists = { at: 0, finds: [], songs: {} };

type State = {
  labels: Record<string, Label>;
  lists: Lists;
  patch(updates: Record<string, Label>): void;
  setLists(lists: Lists): void;
};

const touched = (l: Label) => Math.max(l.mbAt ?? 0, l.fmAt ?? 0);

export function pruneLabels(
  map: Record<string, Label>,
  max = LABELS_MAX,
): Record<string, Label> {
  const keys = Object.keys(map);
  if (keys.length <= max) return map;
  const keep = keys
    .sort((a, b) => touched(map[b]) - touched(map[a]))
    .slice(0, Math.floor(max * 0.9));
  return Object.fromEntries(keep.map((k) => [k, map[k]]));
}

export const useMoodLabels = create<State>()(
  persist(
    (set) => ({
      labels: {},
      lists: EMPTY_LISTS,
      patch: (updates) =>
        set((st) => {
          const labels = { ...st.labels };
          for (const [k, l] of Object.entries(updates))
            labels[k] = { ...labels[k], ...l };
          return { labels: pruneLabels(labels) };
        }),
      setLists: (lists) => set({ lists }),
    }),
    {
      name: "pawse.moods.v1",
      storage: createJSONStorage(() => kv),
      version: 1,
      partialize: (s) => ({ labels: s.labels, lists: s.lists }),
    },
  ),
);

let albumYears:
  | { albums: AlbumSummary[]; byId: Map<string, number> }
  | undefined;
function albumYear(t: Track): number | undefined {
  const albums = useLibrary.getState().savedAlbums;
  if (albumYears?.albums !== albums)
    albumYears = {
      albums,
      byId: new Map(
        albums.flatMap((a) => {
          const y = Number(a.year);
          return y > 1900 ? [[a.id, y] as const] : [];
        }),
      ),
    };
  return t.album ? albumYears.byId.get(t.album.id) : undefined;
}

let sessions:
  | {
      history: Play[];
      near: Map<string, string[]>;
      tracks: Map<string, Track>;
    }
  | undefined;
function sessionsOf() {
  const history = useLibrary.getState().history;
  if (sessions?.history !== history)
    sessions = {
      history,
      near: sessionNeighbours(history),
      tracks: new Map(history.map((p) => [trackKey(p.track), p.track])),
    };
  return sessions;
}

function baseVector(t: Track, key: string, now: number, near: Vector[] = []) {
  const st = useMoodLabels.getState();
  const label = st.labels[key];
  return vectorOf(
    t,
    {
      year: albumYear(t) ?? label?.year,
      tags: [...(label?.mb ?? []), ...(label?.fm ?? [])],
      lists: st.lists.songs[key],
    },
    now,
    near,
  );
}

/** What is known about a song, for sorting a list: the first release year wins over a saved album's, which can be a reissue. */
export function evidenceOf(
  t: Track,
  known: Pick<State, "labels" | "lists"> = useMoodLabels.getState(),
): Evidence {
  const key = trackKey(t);
  const label = known.labels[key];
  return {
    year: label?.year ?? albumYear(t),
    tags: [...(label?.mb ?? []), ...(label?.fm ?? [])],
    lists: known.lists.songs[key],
  };
}

export function trackVector(t: Track, now = Date.now()): Vector {
  const key = trackKey(t);
  const { near, tracks } = sessionsOf();
  const around = (near.get(key) ?? []).flatMap((k) => {
    const n = tracks.get(k);
    return n ? [baseVector(n, k, now)] : [];
  });
  return baseVector(t, key, now, around);
}

export function currentFilters(): Filters {
  const lib = useLibrary.getState();
  const { settings } = lib;
  return {
    dropped: new Set([
      ...dislikes(lib.disliked).ids,
      ...skipHeavy(useSignals.getState().tracks),
    ]),
    explicit: settings.explicitFilter,
    words: (settings.blockedWords ?? []).map((w) => w.toLowerCase()),
    blocked: new Set(
      (settings.blockedChannels ?? []).flatMap((c) => [
        c.id,
        artistKey({ name: c.name }),
      ]),
    ),
  };
}

export function useMoodPool(): Track[] {
  const liked = useLibrary((s) => s.liked);
  const history = useLibrary((s) => s.history);
  const playlists = useLibrary((s) => s.playlists);
  const disliked = useLibrary((s) => s.disliked);
  const signals = useSignals((s) => s.tracks);
  const offline = useOfflineTracks();
  const { now } = useClock();
  return useMemo(() => {
    const ranked = scoreTracks({
      history,
      liked,
      signals,
      disliked,
      now: Math.max(now, history[0]?.at ?? 0),
    }).map((s) => s.track);
    const seen = new Set<string>();
    return [
      ...ranked,
      ...liked,
      ...history.map((p) => p.track),
      ...playlists.flatMap((p) => p.tracks),
      ...offline,
    ].filter((t) => {
      const key = trackKey(t);
      return !seen.has(key) && !!seen.add(key);
    });
  }, [liked, history, playlists, disliked, signals, offline, now]);
}

// Per launch, so a big library fills in over days rather than all at once.
const LOOKUPS_PER_RUN = 150;
const FAILURES_MAX = 3;
const SAVE_EVERY = 10;
const PROGRESS_EVERY = 25;
let looked = 0;
let working = false;

const incognito = () => useLibrary.getState().settings.incognito;

type Need = { mb: boolean; fm: boolean };

const needOf = (t: Track, fmKey: string | undefined, fmDown = false): Need => {
  const have = useMoodLabels.getState().labels[trackKey(t)];
  return {
    mb: !have?.mbAt && !albumYear(t),
    fm: !!fmKey && !fmDown && !have?.fmAt,
  };
};

export const isLabelled = (t: Track): boolean => {
  if (!t.artists[0]) return true;
  const need = needOf(t, vaultGet("lastfm.key") ?? undefined);
  return !need.mb && !need.fm;
};

async function fetchLabel(
  t: Track,
  need: Need,
  fmKey: string | undefined,
  onFmDown: () => void,
): Promise<Label> {
  const next: Label = {};
  if (need.mb) {
    const r = await lookupRecording(t);
    next.mbAt = Date.now();
    next.year = r?.year;
    next.mb = r?.tags;
  }
  if (need.fm && fmKey) {
    next.fm = await lookupTags(fmKey, t).catch(() => {
      onFmDown();
      return undefined;
    });
    if (next.fm) next.fmAt = Date.now();
  }
  return next;
}

function labelSaver() {
  const pending: Record<string, Label> = {};
  const flush = () => {
    if (Object.keys(pending).length === 0) return;
    useMoodLabels.getState().patch({ ...pending });
    for (const k of Object.keys(pending)) delete pending[k];
  };
  const add = (key: string, label: Label) => {
    pending[key] = { ...pending[key], ...label };
    if (Object.keys(pending).length >= SAVE_EVERY) flush();
  };
  return { add, flush };
}

async function labelSongs(songs: Track[]): Promise<void> {
  if (working) return;
  working = true;
  const fmKey = vaultGet("lastfm.key") ?? undefined;
  const saver = labelSaver();
  let failures = 0;
  let fmDown = false;
  try {
    for (const t of songs) {
      if (looked >= LOOKUPS_PER_RUN || failures >= FAILURES_MAX) break;
      if (incognito() || isLowData()) break;
      if (!t.artists[0]) continue;
      const need = needOf(t, fmKey, fmDown);
      if (!need.mb && !need.fm) continue;
      looked++;
      try {
        saver.add(
          trackKey(t),
          await fetchLabel(t, need, fmKey, () => (fmDown = true)),
        );
        failures = 0;
      } catch {
        failures++;
      }
    }
  } finally {
    saver.flush();
    working = false;
  }
}

/**
 * Looks up every song of a list that still lacks a label, with no per-launch cap. Returns the
 * songs it is done with; it stops early when asked, in incognito, on data saver or after repeated failures.
 */
export async function labelFocused(
  songs: Track[],
  o: { onProgress?: (done: number) => void; stopped?: () => boolean } = {},
): Promise<Track[]> {
  const fmKey = vaultGet("lastfm.key") ?? undefined;
  const saver = labelSaver();
  const handled: Track[] = [];
  let failures = 0;
  let fmDown = false;
  try {
    for (const t of songs) {
      if (o.stopped?.() || failures >= FAILURES_MAX) break;
      if (incognito() || isLowData()) break;
      const need = t.artists[0]
        ? needOf(t, fmKey, fmDown)
        : { mb: false, fm: false };
      const lookup = need.mb || need.fm;
      if (lookup) {
        try {
          saver.add(
            trackKey(t),
            await fetchLabel(t, need, fmKey, () => (fmDown = true)),
          );
          failures = 0;
        } catch {
          failures++;
          continue;
        }
      }
      handled.push(t);
      if (lookup || handled.length % PROGRESS_EVERY === 0)
        o.onProgress?.(handled.length);
    }
  } finally {
    saver.flush();
  }
  return handled;
}

const MOOD_PAGES: { tile: string; list: string }[] = [
  { tile: "Chill", list: "chill" },
  { tile: "Sleep", list: "sleep" },
  { tile: "Focus", list: "focus" },
  { tile: "Romance", list: "romance" },
  { tile: "Sad", list: "sad" },
  { tile: "Workout", list: "workout" },
  { tile: "Energize", list: "energize" },
  { tile: "Party", list: "party" },
];
const LANGUAGE_TILES_MAX = 6;
const SHELVES_PER_PAGE = 3;
const PER_DECADE = 2;
const SONGS_PER_LIST = 40;

type Candidate = { id: string; lists: string[] };

const settle = <T>(job: Promise<T>) => job.catch(() => undefined);

const playlistsOf = (shelf: Shelf) =>
  shelf.items.flatMap((i) => (i.type === "playlist" ? [i] : []));

function pickLists(
  shelves: Shelf[],
  list: string,
  decades: Map<number, number>,
): Candidate[] {
  const out = new Map<string, string[]>();
  for (const shelf of shelves.slice(0, SHELVES_PER_PAGE)) {
    const first = playlistsOf(shelf)[0];
    if (first) out.set(first.id, [list]);
  }
  for (const p of shelves.flatMap(playlistsOf)) {
    const decade = decadeOf(p.title);
    if (decade === undefined || (decades.get(decade) ?? 0) >= PER_DECADE)
      continue;
    decades.set(decade, (decades.get(decade) ?? 0) + 1);
    out.set(p.id, [...(out.get(p.id) ?? [list]), decadeList(decade)]);
  }
  return [...out].map(([id, lists]) => ({ id, lists }));
}

async function fetchLists(region: string): Promise<Lists> {
  const tiles = await yt.moodsAndGenres();
  const tile = (title: string) =>
    tiles.find((t) => t.title.toLowerCase() === title.toLowerCase());
  const decades = new Map<number, number>();
  const picks = new Map<string, string[]>();
  const add = (p: Candidate) =>
    picks.set(p.id, [...new Set([...(picks.get(p.id) ?? []), ...p.lists])]);

  for (const page of MOOD_PAGES) {
    const t = tile(page.tile);
    const shelves = t && (await settle(yt.moodPage(t.params)));
    if (shelves) pickLists(shelves, page.list, decades).forEach(add);
  }
  // Genre tiles named after a language (Bollywood, Punjabi, K-Pop…) tell which language their songs are in.
  for (const t of tiles
    .filter((x) => tagLanguage(x.title))
    .slice(0, LANGUAGE_TILES_MAX)) {
    const shelves = await settle(yt.moodPage(t.params));
    const lang = languageList(tagLanguage(t.title)!);
    for (const shelf of shelves?.slice(0, 2) ?? []) {
      const first = playlistsOf(shelf)[0];
      if (first) add({ id: first.id, lists: [lang] });
    }
  }
  const decadeTile = tile("Decades");
  const decadeShelves =
    decadeTile && (await settle(yt.moodPage(decadeTile.params)));
  for (const shelf of decadeShelves ?? []) {
    const decade = decadeOf(shelf.title);
    if (decade !== undefined)
      for (const p of playlistsOf(shelf).slice(0, PER_DECADE))
        add({ id: p.id, lists: [decadeList(decade)] });
  }
  const charts = await settle(yt.charts(region || "ZZ"));
  const chart = charts?.flatMap(playlistsOf)[0];
  if (chart) add({ id: chart.id, lists: [CHARTS_LIST] });

  const songs: Record<string, string[]> = {};
  const finds = new Map<string, Track>();
  for (const [id, lists] of picks) {
    const detail = await settle(yt.playlist(id));
    if (!detail) continue;
    for (const t of detail.tracks.slice(0, SONGS_PER_LIST)) {
      const key = trackKey(t);
      songs[key] = [...new Set([...(songs[key] ?? []), ...lists])];
      if (lists.every((l) => l.startsWith("lang:"))) continue;
      if (!finds.has(key) && finds.size < FINDS_MAX)
        finds.set(key, {
          ...t,
          setVideoId: undefined,
          thumbnails: t.thumbnails.slice(0, 2),
        });
    }
  }
  if (!finds.size) throw new Error("No mood lists");
  return { rev: LISTS_REV, at: Date.now(), finds: [...finds.values()], songs };
}

let loadingLists: Promise<void> | undefined;
let listsFailedAt = 0;
export function ensureMoodLists(region: string): Promise<void> {
  const { at, rev = 1 } = useMoodLabels.getState().lists;
  const now = Date.now();
  const fresh = rev >= LISTS_REV && now - at < LISTS_TTL_MS;
  if (fresh || now - listsFailedAt < RETRY_AFTER_MS) return Promise.resolve();
  loadingLists ??= fetchLists(region)
    .then((lists) => useMoodLabels.getState().setLists(lists))
    .catch(() => {
      listsFailedAt = Date.now();
    })
    .finally(() => {
      loadingLists = undefined;
    });
  return loadingLists;
}

const WAIT_FOR_LISTS_MS = 8000;

export async function moodMix(
  mood: MoodId,
  share: number,
  pool: Track[],
  region: string,
): Promise<Track[]> {
  if (share > 0)
    await Promise.race([
      ensureMoodLists(region),
      new Promise((r) => setTimeout(r, WAIT_FOR_LISTS_MS)),
    ]);
  const now = Date.now();
  const filters = currentFilters();
  const vectored = (ts: Track[]): Item[] =>
    ts
      .filter((t) => isAllowed(t, filters))
      .map((track) => ({ track, vector: trackVector(track, now) }));
  const mine = new Set(pool.map(trackKey));
  const finds = useMoodLabels.getState().lists.finds;
  return pickMix({
    mood,
    share,
    own: vectored(pool),
    finds: vectored(finds.filter((t) => !mine.has(trackKey(t)))),
  });
}

const BACKGROUND_DELAY_MS = 5000;

export function useMoodLibrary(region: string): Track[] {
  const pool = useMoodPool();
  useEffect(() => {
    const timer = setTimeout(() => {
      void ensureMoodLists(region);
      void labelSongs(pool);
    }, BACKGROUND_DELAY_MS);
    return () => clearTimeout(timer);
  }, [pool, region]);
  return pool;
}
