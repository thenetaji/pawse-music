import type { AlbumSummary, Shelf, Track } from "@pawse/music-core";
import { useEffect, useMemo } from "react";
import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";

import { isLowData } from "../lib/quality";
import { yt } from "./clients";
import { useOfflineTracks } from "./downloads";
import { lookupTags } from "./lastfm-tags";
import { useLibrary } from "./library";
import type { Play } from "./library-model";
import {
  CHARTS_LIST,
  decadeList,
  decadeOf,
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
  at: number;
  finds: Track[];
  songs: Record<string, string[]>;
};

export const LABELS_MAX = 5000;
const FINDS_MAX = 1500;
const LISTS_TTL_MS = 7 * 86400_000;
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
let looked = 0;
let working = false;

const incognito = () => useLibrary.getState().settings.incognito;

async function labelSongs(songs: Track[]): Promise<void> {
  if (working) return;
  working = true;
  const fmKey = vaultGet("lastfm.key");
  const pending: Record<string, Label> = {};
  const save = () => {
    if (Object.keys(pending).length === 0) return;
    useMoodLabels.getState().patch({ ...pending });
    for (const k of Object.keys(pending)) delete pending[k];
  };
  let failures = 0;
  let fmDown = false;
  try {
    for (const t of songs) {
      if (looked >= LOOKUPS_PER_RUN || failures >= FAILURES_MAX) break;
      if (incognito() || isLowData()) break;
      if (!t.artists[0]) continue;
      const key = trackKey(t);
      const have = useMoodLabels.getState().labels[key];
      const needMb = !have?.mbAt && !albumYear(t);
      const needFm = !!fmKey && !fmDown && !have?.fmAt;
      if (!needMb && !needFm) continue;
      looked++;
      const next: Label = { ...pending[key] };
      try {
        if (needMb) {
          const r = await lookupRecording(t);
          next.mbAt = Date.now();
          next.year = r?.year;
          next.mb = r?.tags;
        }
        if (needFm && fmKey) {
          next.fm = await lookupTags(fmKey, t).catch(() => {
            fmDown = true;
            return undefined;
          });
          if (next.fm) next.fmAt = Date.now();
        }
        failures = 0;
      } catch {
        failures++;
        continue;
      }
      pending[key] = next;
      if (Object.keys(pending).length >= SAVE_EVERY) save();
    }
  } finally {
    save();
    working = false;
  }
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
const SHELVES_PER_PAGE = 3;
const PER_DECADE = 2;
const SONGS_PER_LIST = 40;

type Pick = { id: string; lists: string[] };

const settle = <T>(job: Promise<T>) => job.catch(() => undefined);

const playlistsOf = (shelf: Shelf) =>
  shelf.items.flatMap((i) => (i.type === "playlist" ? [i] : []));

function pickLists(
  shelves: Shelf[],
  list: string,
  decades: Map<number, number>,
): Pick[] {
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
  const add = (p: Pick) =>
    picks.set(p.id, [...new Set([...(picks.get(p.id) ?? []), ...p.lists])]);

  for (const page of MOOD_PAGES) {
    const t = tile(page.tile);
    const shelves = t && (await settle(yt.moodPage(t.params)));
    if (shelves) pickLists(shelves, page.list, decades).forEach(add);
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
      if (!finds.has(key) && finds.size < FINDS_MAX)
        finds.set(key, {
          ...t,
          setVideoId: undefined,
          thumbnails: t.thumbnails.slice(0, 2),
        });
    }
  }
  if (!finds.size) throw new Error("No mood lists");
  return { at: Date.now(), finds: [...finds.values()], songs };
}

let loadingLists: Promise<void> | undefined;
let listsFailedAt = 0;
export function ensureMoodLists(region: string): Promise<void> {
  const { at } = useMoodLabels.getState().lists;
  const now = Date.now();
  if (now - at < LISTS_TTL_MS || now - listsFailedAt < RETRY_AFTER_MS)
    return Promise.resolve();
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
