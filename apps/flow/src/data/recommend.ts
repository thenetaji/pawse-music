import type {
  ArtistRef,
  ArtistSummary,
  CatalogItem,
  Shelf,
  Track,
} from "@studio/music-core";
import {
  useEffect,
  useEffectEvent,
  useMemo,
  useSyncExternalStore,
} from "react";
import { AppState } from "react-native";

import { useResource } from "../lib/use-resource";
import { dropExplicit, yt } from "./clients";
import { useLibrary } from "./library";
import { type LocalPlaylist, listeningStats, type Play } from "./library-model";
import { type SignalMap, useSignals } from "./signals";

const DAY = 86400_000;
export const RECENT_DAYS = 3;
export const SEEDS_MAX = 5;
export const QUICK_N = 20;
// Extra Quick picks kept in the pool so recent plays can drop out without a refetch.
const QUICK_SPARE = 15;
const PER_ARTIST = 2;
const UNFAMILIAR_SHARE = 0.2;

// ---- Pure ranking (unit tested) ----

export type Taste = {
  history: Play[];
  liked: Track[];
  signals: SignalMap;
  now: number;
};
export type Scored = { track: Track; score: number };
export type Seed = { track: Track; weight: number };
/** Tracks one seed produced, best first (radio order, then related). */
export type Source = {
  seed: string;
  /** Seed's primary artist (artistKey). */
  artist?: string;
  weight: number;
  tracks: Track[];
};
export type Candidate = { track: Track; score: number; seeds: number };

const norm = (s: string) =>
  s
    .toLowerCase()
    .replace(/[([].*?[)\]]/g, " ")
    .replace(/\s(feat|ft)\.?\s.*$/, "")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();
export const artistKey = (a?: ArtistRef) => (a ? norm(a.name) : "");
/** Same song across its audio and video uploads. */
export const trackKey = (t: Track) =>
  `${norm(t.title)}|${artistKey(t.artists[0])}`;

const playCounts = (history: Play[]) => {
  const n = new Map<string, number>();
  for (const p of history) n.set(p.track.id, (n.get(p.track.id) ?? 0) + 1);
  return n;
};

/** Affinity per track: plays, completes, likes and repeats, decayed by recency; skips subtract. */
export function scoreTracks({ history, liked, signals, now }: Taste): Scored[] {
  const tracks = new Map<string, Track>();
  const last = new Map<string, number>();
  const recent = new Map<string, number>();
  for (const p of history) {
    if (!tracks.has(p.track.id)) tracks.set(p.track.id, p.track);
    last.set(p.track.id, Math.max(last.get(p.track.id) ?? 0, p.at));
    if (now - p.at < 14 * DAY)
      recent.set(p.track.id, (recent.get(p.track.id) ?? 0) + 1);
  }
  const likedAt = new Map<string, number>();
  liked.forEach((t, i) => {
    if (!tracks.has(t.id)) tracks.set(t.id, t);
    // Likes without a timestamp age by their position in the list.
    likedAt.set(t.id, signals[t.id]?.likedAt ?? now - i * 7 * DAY);
  });
  const counts = playCounts(history);
  const out: Scored[] = [];
  for (const [id, track] of tracks) {
    const s = signals[id];
    const plays = Math.max(s?.plays ?? 0, counts.get(id) ?? 0);
    const repeats = Math.max(0, (recent.get(id) ?? 0) - 1);
    const isLiked = likedAt.has(id);
    const base =
      plays +
      1.5 * (s?.completes ?? 0) +
      (isLiked ? 4 : 0) +
      1.5 * repeats -
      2 * (s?.skips ?? 0);
    const at = Math.max(
      s?.lastPlayed ?? 0,
      last.get(id) ?? 0,
      likedAt.get(id) ?? 0,
    );
    const decay = 0.5 ** (Math.max(0, now - at) / (21 * DAY));
    const score = base * (0.3 + 0.7 * decay);
    if (score > 0) out.push({ track, score });
  }
  return out.sort((a, b) => b.score - a.score);
}

/** Best tracks with one seed per artist, weighted 0..1 against the best. */
export function pickSeeds(scored: Scored[], n = SEEDS_MAX): Seed[] {
  const seen = new Set<string>();
  const out: Seed[] = [];
  const top = scored[0]?.score || 1;
  for (const s of scored) {
    const a = artistKey(s.track.artists[0]);
    if (a && seen.has(a)) continue;
    seen.add(a);
    out.push({ track: s.track, weight: s.score / top });
    if (out.length >= n) break;
  }
  return out;
}

export type SeedPlan = {
  songs: Seed[];
  artists: ArtistSummary[];
  /** Nothing personal yet: lean on region charts and the picked languages. */
  charts: boolean;
};

/** Song seeds first; onboarding and followed artists fill the free slots, one per artist. */
export function planSeeds(
  songs: Seed[],
  artists: ArtistSummary[],
  n = SEEDS_MAX,
): SeedPlan {
  const picked = songs.slice(0, n);
  const have = new Set(picked.map((s) => artistKey(s.track.artists[0])));
  const extra: ArtistSummary[] = [];
  for (const a of artists) {
    if (picked.length + extra.length >= n) break;
    if (!a.id || have.has(artistKey(a))) continue;
    have.add(artistKey(a));
    extra.push(a);
  }
  return {
    songs: picked,
    artists: extra,
    charts: !picked.length && !extra.length,
  };
}

/** Ids and song keys played in the last `days`. */
export function recentlyPlayed(
  history: Play[],
  now: number,
  days = RECENT_DAYS,
): Set<string> {
  const out = new Set<string>();
  for (const p of history) {
    if (now - p.at >= days * DAY) break;
    out.add(p.track.id);
    out.add(trackKey(p.track));
  }
  return out;
}

/** Tracks skipped early more often than listened past 30 s (completes are a subset of plays). */
export function skipHeavy(signals: SignalMap): Set<string> {
  const out = new Set<string>();
  for (const [id, s] of Object.entries(signals))
    if (s.skips >= 2 && s.skips > s.plays) out.add(id);
  return out;
}

/** Merges seed results: more seeds agreeing and earlier positions rank higher; songs beat videos. */
export function rankCandidates(
  sources: Source[],
  drop: Set<string> = new Set(),
): Candidate[] {
  const by = new Map<
    string,
    { track: Track; score: number; seeds: Set<string> }
  >();
  for (const src of sources) {
    src.tracks.forEach((t, i) => {
      const key = trackKey(t);
      if (drop.has(t.id) || drop.has(key)) return;
      let e = by.get(key);
      if (!e) by.set(key, (e = { track: t, score: 0, seeds: new Set() }));
      else if (e.track.kind !== "song" && t.kind === "song") e.track = t;
      if (e.seeds.has(src.seed)) return;
      e.seeds.add(src.seed);
      e.score += src.weight / (1 + i / 10);
    });
  }
  return [...by.values()]
    .map((e) => ({
      track: e.track,
      seeds: e.seeds.size,
      score: e.seeds.size + e.score,
    }))
    .sort((a, b) => b.score - a.score);
}

/** Top `n` with at most `perArtist` per artist; `unfamiliar` of the slots go to artists outside `known`. */
export function pickTracks(
  ranked: (Candidate | Track)[],
  opts: {
    n: number;
    perArtist?: number;
    known?: Set<string>;
    unfamiliar?: number;
    skip?: Set<string>;
  },
): Track[] {
  const per = opts.perArtist ?? PER_ARTIST;
  const list = ranked.map((r) => ("track" in r ? r.track : r));
  const isKnown = (t: Track) =>
    !opts.known || t.artists.some((a) => opts.known!.has(artistKey(a)));
  const quotaU = opts.known
    ? Math.round(opts.n * (opts.unfamiliar ?? UNFAMILIAR_SHARE))
    : 0;
  const perCount = new Map<string, number>();
  const chosen = new Set<number>();
  const keys = new Set<string>();
  const take = (want: number, ok: (t: Track) => boolean) => {
    for (let i = 0; i < list.length && want > 0; i++) {
      const t = list[i];
      const a = artistKey(t.artists[0]);
      const k = trackKey(t);
      if (
        chosen.has(i) ||
        keys.has(k) ||
        opts.skip?.has(t.id) ||
        opts.skip?.has(k) ||
        !ok(t)
      )
        continue;
      if ((perCount.get(a) ?? 0) >= per) continue;
      perCount.set(a, (perCount.get(a) ?? 0) + 1);
      chosen.add(i);
      keys.add(k);
      want--;
    }
  };
  take(opts.n - quotaU, isKnown);
  take(quotaU, (t) => !isKnown(t));
  take(opts.n - chosen.size, () => true);
  return [...chosen].sort((a, b) => a - b).map((i) => list[i]);
}

export type SmartId =
  | "top50"
  | "onrepeat"
  | "forgotten"
  | "recent"
  | "recentliked";
export type SmartPlaylist = {
  id: SmartId;
  title: string;
  subtitle: string;
  tracks: Track[];
};

/** Top 50, On repeat, Forgotten favourites, Recently played and Recently liked from local data. */
export function buildSmartPlaylists(
  t: Taste & { playlists?: LocalPlaylist[] },
): SmartPlaylist[] {
  const { history, liked, signals, now } = t;
  const byId = new Map<string, Track>();
  for (const p of history)
    if (!byId.has(p.track.id)) byId.set(p.track.id, p.track);
  for (const x of liked) if (!byId.has(x.id)) byId.set(x.id, x);
  for (const p of t.playlists ?? [])
    for (const x of p.tracks) if (!byId.has(x.id)) byId.set(x.id, x);

  const counts = playCounts(history);
  const last = new Map<string, number>();
  for (const p of history)
    if (!last.has(p.track.id)) last.set(p.track.id, p.at);
  const all = new Map<string, { plays: number; last: number }>();
  for (const id of new Set([...counts.keys(), ...Object.keys(signals)])) {
    const s = signals[id];
    const plays = Math.max(s?.plays ?? 0, counts.get(id) ?? 0);
    if (plays > 0)
      all.set(id, {
        plays,
        last: Math.max(s?.lastPlayed ?? 0, last.get(id) ?? 0),
      });
  }
  const tracksOf = (ids: string[], n: number) =>
    ids.flatMap((id) => (byId.has(id) ? [byId.get(id)!] : [])).slice(0, n);
  const sorted = (filter: (s: { plays: number; last: number }) => boolean) =>
    [...all]
      .filter(([, s]) => filter(s))
      .sort(([, a], [, b]) => b.plays - a.plays || b.last - a.last)
      .map(([id]) => id);

  const month = listeningStats(history, now - 30 * DAY, Infinity, 200)
    .topSongs.filter((s) => s.plays >= 2)
    .map((s) => s.track);
  const seen = new Set<string>();
  const recent = history
    .filter((p) => !seen.has(p.track.id) && !!seen.add(p.track.id))
    .map((p) => p.track)
    .slice(0, 50);

  return [
    {
      id: "top50",
      title: "Top 50",
      subtitle: "Your most played songs",
      tracks: tracksOf(
        sorted(() => true),
        50,
      ),
    },
    {
      id: "onrepeat",
      title: "On repeat",
      subtitle: "Most played this month",
      tracks: month.slice(0, 30),
    },
    {
      id: "forgotten",
      title: "Forgotten favourites",
      subtitle: "Loved once, not played lately",
      tracks: tracksOf(
        sorted((s) => s.plays >= 3 && now - s.last > 60 * DAY),
        30,
      ),
    },
    {
      id: "recent",
      title: "Recently played",
      subtitle: "Your latest listens",
      tracks: recent,
    },
    {
      id: "recentliked",
      title: "Recently liked",
      subtitle: "Your newest likes",
      tracks: liked.slice(0, 50),
    },
  ];
}

export type ForYouData = {
  /** Inputs this copy was built from; a mismatch triggers a refresh. */
  sig: string;
  /** Ranked Quick picks pool, trimmed to QUICK_N at render. */
  quick: Track[];
  because: { artist: string; tracks: Track[] }[];
  fresh: CatalogItem[];
  popular: { title: string; tracks: Track[] }[];
};

const asItems = (tracks: Track[]): CatalogItem[] =>
  tracks.map((t) => ({ type: "track", ...t }));

/** Home shelves from a For You load plus the smart playlists; a song shows on one shelf at most. */
export function forYouShelves(
  data: ForYouData,
  smart: SmartPlaylist[],
  opts: { drop: Set<string>; known?: Set<string> },
): Shelf[] {
  const used = new Set(opts.drop);
  const claim = (tracks: Track[]) => {
    for (const t of tracks) used.add(t.id).add(trackKey(t));
    return tracks;
  };
  const unused = (tracks: Track[]) =>
    tracks.filter((t) => !used.has(t.id) && !used.has(trackKey(t)));
  const own = (id: SmartId) => {
    const tracks = smart.find((p) => p.id === id)?.tracks.slice(0, 20) ?? [];
    return tracks.length >= 4 ? claim(tracks) : [];
  };
  // The listener's own lists claim their songs first; recommendations fill around them.
  const repeat = own("onrepeat");
  const forgotten = own("forgotten");
  const out: Shelf[] = [];
  const quick = claim(
    pickTracks(unused(data.quick), { n: QUICK_N, known: opts.known }),
  );
  if (quick.length) out.push({ title: "Quick picks", items: asItems(quick) });
  for (const b of data.because) {
    const tracks = unused(b.tracks);
    if (tracks.length >= 6)
      out.push({
        title: `Because you like ${b.artist}`,
        items: asItems(claim(tracks)),
      });
  }
  if (repeat.length) out.push({ title: "On repeat", items: asItems(repeat) });
  if (forgotten.length)
    out.push({ title: "Forgotten favourites", items: asItems(forgotten) });
  if (data.fresh.length >= 2)
    out.push({ title: "New from artists you play", items: data.fresh });
  for (const p of data.popular) {
    const tracks = unused(p.tracks);
    if (tracks.length >= 5)
      out.push({ title: p.title, items: asItems(claim(tracks)) });
  }
  return out;
}

// ---- Day clock ----

const dayStamp = (ms: number) => {
  const d = new Date(ms);
  return `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`;
};
let clock = { day: dayStamp(Date.now()), now: Date.now() };
const readClock = () => {
  const now = Date.now();
  if (dayStamp(now) !== clock.day) clock = { day: dayStamp(now), now };
  return clock;
};
function subscribeClock(changed: () => void) {
  let timer: ReturnType<typeof setTimeout>;
  const arm = () => {
    const midnight = new Date();
    midnight.setHours(24, 0, 1, 0);
    timer = setTimeout(() => {
      changed();
      arm();
    }, midnight.getTime() - Date.now());
  };
  arm();
  // Timers stall in the background, so coming back re-reads the date.
  const sub = AppState.addEventListener("change", (s) => {
    if (s === "active") changed();
  });
  return () => {
    clearTimeout(timer);
    sub.remove();
  };
}
/** The local day and when it was first seen; changes at midnight, so render stays pure. */
const useClock = () =>
  useSyncExternalStore(subscribeClock, readClock, readClock);

// ---- Smart playlists ----

export function useSmartPlaylists(): SmartPlaylist[] {
  const history = useLibrary((s) => s.history);
  const liked = useLibrary((s) => s.liked);
  const playlists = useLibrary((s) => s.playlists);
  const signals = useSignals((s) => s.tracks);
  const { now } = useClock();
  return useMemo(
    () =>
      buildSmartPlaylists({
        history,
        liked,
        playlists,
        signals,
        now: Math.max(now, history[0]?.at ?? 0),
      }),
    [history, liked, playlists, signals, now],
  );
}

/** One smart playlist outside React, e.g. for a detail page loader. */
export function smartPlaylist(id: string): SmartPlaylist | undefined {
  const { history, liked, playlists } = useLibrary.getState();
  return buildSmartPlaylists({
    history,
    liked,
    playlists,
    signals: useSignals.getState().tracks,
    now: Date.now(),
  }).find((p) => p.id === id);
}

// ---- Fetching ----

// Every network call here shares two slots; waiters take over a freed slot directly.
const MAX_FETCHES = 2;
let active = 0;
const waiting: (() => void)[] = [];
async function gated<T>(fn: () => Promise<T>): Promise<T> {
  if (active < MAX_FETCHES) active++;
  else await new Promise<void>((r) => waiting.push(r));
  try {
    return await fn();
  } finally {
    const next = waiting.shift();
    if (next) next();
    else active--;
  }
}

const CACHE_TTL_MS = 12 * 3600_000;
const cache = new Map<string, { at: number; value: Promise<unknown> }>();
const filterExplicit = () => useLibrary.getState().settings.explicitFilter;

/** Shares in-flight and recent answers; failures are forgotten so the next load retries. */
function cached<T>(key: string, load: () => Promise<T>): Promise<T> {
  const k = `${filterExplicit() ? "x" : ""}:${key}`;
  const now = Date.now();
  const hit = cache.get(k);
  if (hit && now - hit.at < CACHE_TTL_MS) return hit.value as Promise<T>;
  for (const [old, e] of cache)
    if (now - e.at >= CACHE_TTL_MS) cache.delete(old);
  const value = load();
  cache.set(k, { at: now, value });
  value.catch(() => {
    if (cache.get(k)?.value === value) cache.delete(k);
  });
  return value;
}
const fetchOnce = <T>(key: string, fn: () => Promise<T>) =>
  cached(key, () => gated(fn));

const tracksIn = (items: CatalogItem[] | undefined): Track[] =>
  (items ?? []).flatMap((i) =>
    i.type === "track" ? [(({ type: _t, ...t }) => t)(i) as Track] : [],
  );

/** Song radio (RDAMVM) interleaved with the song's "You might also like" row. */
const songSource = (videoId: string) =>
  cached(`v:${videoId}`, async () => {
    const next = await gated(() => yt.upNext({ videoId }));
    const radio = next.tracks.filter((t) => t.id !== videoId);
    let related: Track[] = [];
    const browseId = next.relatedBrowseId;
    if (browseId) {
      try {
        let shelves = await gated(() => yt.related(browseId));
        // related() is outside the client's explicit filter.
        if (filterExplicit()) shelves = dropExplicit(shelves);
        // The first song row is "You might also like"; later ones are covers.
        related = tracksIn(
          shelves.find((s) => s.items.some((i) => i.type === "track"))?.items,
        );
      } catch {
        // Radio alone is enough.
      }
    }
    const out: Track[] = [];
    for (let i = 0; i < Math.max(radio.length, related.length); i++) {
      if (radio[i]) out.push(radio[i]);
      if (related[i]) out.push(related[i]);
    }
    return out;
  });

const artistPage = (id: string) =>
  fetchOnce(`artist:${id}`, () => yt.artist(id));

/** The artist's radio playlist. */
const artistSource = (artist: ArtistSummary) =>
  cached(`a:${artist.id}`, async () => {
    const playlistId = (await artistPage(artist.id)).radioPlaylistId;
    if (!playlistId) return [];
    return (await gated(() => yt.upNext({ playlistId }))).tracks;
  });

type Inputs = {
  plan: SeedPlan;
  topArtists: ArtistRef[];
  known: Set<string>;
  drop: Set<string>;
  languages: string[];
  region: string;
  isNew: boolean;
};

async function newFromArtists(
  top: ArtistRef[],
  now: number,
): Promise<CatalogItem[]> {
  if (!top.length) return [];
  const ids = new Set(top.flatMap((a) => (a.id ? [a.id] : [])));
  const names = new Set(top.map(artistKey));
  const mine = (i: CatalogItem) =>
    i.type === "album" &&
    i.artists.some((a) => (a.id && ids.has(a.id)) || names.has(artistKey(a)));
  const d = new Date(now);
  // Early in the year, last year's releases still count as new.
  const minYear = d.getFullYear() - (d.getMonth() < 2 ? 1 : 0);
  const [releases, ...pages] = await Promise.all([
    fetchOnce("new", () => yt.newReleases()).catch(() => [] as Shelf[]),
    ...top
      .filter((a) => a.id)
      .slice(0, 3)
      .map((a) => artistPage(a.id!).catch(() => undefined)),
  ]);
  const fromArtists = pages.flatMap((p) =>
    (p?.shelves ?? [])
      .flatMap((s) => s.items)
      .filter((i) => i.type === "album" && Number(i.year ?? 0) >= minYear),
  );
  const seen = new Set<string>();
  return [...releases.flatMap((s) => s.items).filter(mine), ...fromArtists]
    .filter((i) => !seen.has(i.id) && !!seen.add(i.id))
    .slice(0, 15);
}

/** One row per picked language (charts playlist, else a search); with none, the region's top chart. */
async function popularIn(
  languages: string[],
  region: string,
): Promise<ForYouData["popular"]> {
  const charts = await fetchOnce(`charts:${region}`, () =>
    yt.charts(region || "ZZ"),
  ).catch(() => [] as Shelf[]);
  const lists = charts
    .flatMap((s) => s.items)
    .flatMap((i) => (i.type === "playlist" ? [i] : []));
  const rows = languages.length
    ? languages.slice(0, 2).map((l) => ({
        title: `Popular in ${l}`,
        list: lists.find((p) =>
          p.title.toLowerCase().includes(l.toLowerCase()),
        ),
        query: `${l} hits`,
      }))
    : lists.slice(0, 1).map((list) => ({ title: list.title, list, query: "" }));
  const out = await Promise.all(
    rows.map(async ({ title, list, query }) => {
      let tracks = list
        ? ((
            await fetchOnce(`pl:${list.id}`, () => yt.playlist(list.id)).catch(
              () => undefined,
            )
          )?.tracks ?? [])
        : [];
      if (tracks.length < 8 && query)
        tracks = tracksIn(
          (
            await fetchOnce(`q:${query}`, () =>
              yt.search(query, "songs"),
            ).catch(() => undefined)
          )?.items,
        );
      return { title, tracks: pickTracks(tracks, { n: 20 }) };
    }),
  );
  return out.filter((r) => r.tracks.length >= 5);
}

async function loadForYou(
  x: Inputs,
  sig: string,
  now: number,
): Promise<ForYouData> {
  const { songs, artists } = x.plan;
  const jobs = [
    ...songs.map((s) => ({
      seed: s.track.id,
      artist: artistKey(s.track.artists[0]),
      name: s.track.artists[0]?.name,
      weight: s.weight,
      load: () => songSource(s.track.id),
    })),
    ...artists.map((a) => ({
      seed: a.id,
      artist: artistKey(a),
      name: a.name,
      weight: songs.length ? 0.5 : 0.8,
      load: () => artistSource(a),
    })),
  ];
  const [results, fresh, popular] = await Promise.all([
    Promise.all(jobs.map((j) => j.load().catch(() => [] as Track[]))),
    newFromArtists(x.topArtists, now).catch(() => [] as CatalogItem[]),
    x.isNew || x.plan.charts
      ? popularIn(x.languages, x.region).catch(() => [])
      : [],
  ]);
  const sources: Source[] = jobs.flatMap((j, i) =>
    results[i].length
      ? [
          {
            seed: j.seed,
            artist: j.artist,
            weight: j.weight,
            tracks: results[i],
          },
        ]
      : [],
  );
  const drop = new Set(x.drop);
  for (const s of songs) drop.add(trackKey(s.track));
  let quick = pickTracks(rankCandidates(sources, drop), {
    n: QUICK_N + QUICK_SPARE,
    known: x.known,
  });
  // Cold start: the first popular row stands in (and drops out of its own shelf at render).
  if (!quick.length && popular[0]) quick = popular[0].tracks;

  const taken = new Set(quick.map((t) => t.id));
  const because: ForYouData["because"] = [];
  for (const j of jobs) {
    if (because.length >= 2 || !j.name) continue;
    if (because.some((b) => artistKey({ name: b.artist }) === j.artist))
      continue;
    const own = sources.filter((s) => s.artist === j.artist);
    const tracks = pickTracks(
      rankCandidates(own, drop).filter(
        (c) => !c.track.artists.some((a) => artistKey(a) === j.artist),
      ),
      { n: 15, skip: taken },
    );
    if (tracks.length < 6) continue;
    for (const t of tracks) taken.add(t.id);
    because.push({ artist: j.name, tracks });
  }
  return { sig, quick, because, fresh, popular };
}

const NOTHING: ForYouData = {
  sig: "",
  quick: [],
  because: [],
  fresh: [],
  popular: [],
};

const hash = (s: string) => {
  let h = 5381;
  for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) | 0;
  return (h >>> 0).toString(36);
};

/** Home "For you": Quick picks, Because you like, On repeat, Forgotten favourites, new releases, Popular in. */
export function useForYou(): {
  shelves: Shelf[];
  loading: boolean;
  reload(): void;
} {
  const history = useLibrary((s) => s.history);
  const liked = useLibrary((s) => s.liked);
  const followed = useLibrary((s) => s.followedArtists);
  const seedArtists = useLibrary((s) => s.settings.seedArtists);
  const languages = useLibrary((s) => s.settings.seedLanguages);
  const region = useLibrary((s) => s.settings.region);
  const explicit = useLibrary((s) => s.settings.explicitFilter);
  const signals = useSignals((s) => s.tracks);
  const smart = useSmartPlaylists();
  const clock = useClock();

  const inputs = useMemo((): Inputs & { now: number } => {
    const now = Math.max(clock.now, history[0]?.at ?? 0);
    const plan = planSeeds(
      pickSeeds(scoreTracks({ history, liked, signals, now })),
      [...seedArtists, ...followed],
    );
    const stats = listeningStats(history, now - 90 * DAY, Infinity, 20);
    const topArtists: ArtistRef[] = [];
    const seenA = new Set<string>();
    for (const a of [
      ...stats.topArtists.map((s) => s.artist),
      ...liked.slice(0, 50).map((t) => t.artists[0]),
      ...seedArtists,
      ...followed,
    ]) {
      if (!a || seenA.has(artistKey(a))) continue;
      seenA.add(artistKey(a));
      topArtists.push({ id: a.id, name: a.name });
    }
    const known = new Set([
      ...seenA,
      ...history.flatMap((p) => p.track.artists.map(artistKey)),
    ]);
    const drop = recentlyPlayed(history, now);
    for (const id of skipHeavy(signals)) drop.add(id);
    return {
      now,
      plan,
      topArtists: topArtists.slice(0, 12),
      known,
      drop,
      languages,
      region,
      isNew: history.length < 30 && liked.length < 10,
    };
  }, [
    history,
    liked,
    followed,
    signals,
    seedArtists,
    languages,
    region,
    clock.now,
  ]);

  // Seed order and weights shift with every play; only a new seed set, setting or day refreshes.
  const sig = hash(
    [
      inputs.plan.songs.map((s) => s.track.id).sort(),
      inputs.plan.artists.map((a) => a.id).sort(),
      languages,
      region,
      inputs.isNew,
      explicit,
      clock.day,
    ].join("|"),
  );
  const res = useResource<ForYouData>(
    "foryou.v1",
    () => loadForYou(inputs, sig, inputs.now),
    { keep: true },
  );
  // A failed first load still shows the local shelves.
  const data = res.data ?? (res.loading ? undefined : NOTHING);
  const dataSig = res.data?.sig;
  const refresh = useEffectEvent(() => res.reload());
  useEffect(() => {
    if (dataSig !== undefined && dataSig !== sig) refresh();
  }, [dataSig, sig]);

  const shelves = useMemo(
    () =>
      data
        ? forYouShelves(data, smart, { drop: inputs.drop, known: inputs.known })
        : [],
    [data, smart, inputs],
  );

  return {
    shelves,
    loading: res.loading && !data,
    reload: () => {
      cache.clear();
      res.reload();
    },
  };
}

/** About 24 popular artists for the onboarding picker: region charts plus a search per language, two at a time. */
export async function onboardingArtists(
  region: string,
  languages: string[],
): Promise<ArtistSummary[]> {
  const artistsIn = (items: CatalogItem[] | undefined): ArtistSummary[] =>
    (items ?? []).flatMap((i) =>
      i.type === "artist"
        ? [
            {
              id: i.id,
              name: i.name,
              subtitle: i.subtitle,
              thumbnails: i.thumbnails,
            },
          ]
        : [],
    );
  const query = (l: string) =>
    l === "Hindi" ? "bollywood singers" : `${l} singers`;
  const lists = await Promise.all([
    ...languages.slice(0, 4).map((l) =>
      gated(() => yt.search(query(l), "artists"))
        .then((r) => artistsIn(r.items ?? r.shelves.flatMap((s) => s.items)))
        .catch(() => [] as ArtistSummary[]),
    ),
    fetchOnce(`charts:${region}`, () => yt.charts(region || "ZZ"))
      .then((shelves) =>
        artistsIn(
          shelves.find((s) => s.items.some((i) => i.type === "artist"))?.items,
        ),
      )
      .catch(() => [] as ArtistSummary[]),
  ]);
  // Round-robin so every language and the charts get a share.
  const out: ArtistSummary[] = [];
  const seen = new Set<string>();
  for (let i = 0; out.length < 24 && lists.some((l) => i < l.length); i++)
    for (const l of lists) {
      const a = l[i];
      if (a && !seen.has(a.id) && out.length < 24) {
        seen.add(a.id);
        out.push(a);
      }
    }
  return out;
}
