import type {
  AlbumSummary,
  ArtistRef,
  ArtistSummary,
  AudioQuality,
  PlaylistSummary,
  Track,
} from "@pawse/music-core";

// Library types, defaults and pure helpers; the store lives in library.ts.
export type LocalPlaylist = {
  id: string;
  title: string;
  tracks: Track[];
  createdAt: number;
  updatedAt: number;
  /** YouTube playlist this was imported from. */
  sourceId?: string;
};
export type Play = { track: Track; at: number };
export type CatColor = "orange" | "black" | "white" | "grey";

export type Settings = {
  preferSaavn: boolean;
  normalize: boolean;
  reportPlays: boolean;
  /** Mirror likes to YouTube Music when signed in. */
  syncLikes: boolean;
  /** Signed-in Google cookies for music.youtube.com; null when signed out. */
  cookies: string | null;
  accountName: string | null;
  // Playback
  /** Streaming quality on Wi-Fi (and when the network type is unknown); "auto" follows the connection. */
  quality: AudioQuality | "auto";
  /** Streaming quality on mobile data; Low there also turns on data saving. */
  qualityCellular: AudioQuality | "auto";
  /** Set once older quality settings have been moved to Automatic. */
  qualityV2: boolean;
  /** Set once the old India/English defaults have moved to Automatic. */
  localeV2: boolean;
  radioContinue: boolean;
  /** Also add similar songs after a playlist or album ends. */
  listsContinue: boolean;
  resume: boolean;
  /** Read when the player starts; a change applies on the next launch. */
  pauseOnDisconnect: boolean;
  /** Sleep timer fade-out, seconds. */
  sleepFade: number;
  // Downloads
  downloadQuality: AudioQuality;
  wifiOnly: boolean;
  autoDownloadLiked: boolean;
  autoDownloadPlaylists: boolean;
  cacheLimitMb: number;
  /** Keep songs you finish on the phone (up to cacheLimitMb) so they play offline. */
  autoCache: boolean;
  // Lyrics
  lyricsLine: boolean;
  lyricsSize: "s" | "m" | "l";
  // Appearance
  accentMode: "artwork" | "fixed";
  accentColor: string;
  amoled: boolean;
  npBackground: "field" | "blur" | "black";
  reduceMotion: boolean;
  // Cat
  catName: string;
  catWire: boolean;
  catIsland: boolean;
  catEpisodes: "off" | "rare" | "often";
  catColor: CatColor;
  // Content
  /** YouTube `gl`. */
  region: string;
  /** YouTube `hl`. */
  language: string;
  explicitFilter: boolean;
  /** Track ids hidden from Home, newest first. */
  hiddenFromHome: string[];
  // Privacy
  pauseHistory: boolean;
  // Android
  androidPill: boolean;
  /** Pill offset from its default spot, dp. */
  androidPillOffset: number;
  // Onboarding
  onboarded: boolean;
  seedArtists: ArtistSummary[];
  seedLanguages: string[];
};

export const DEFAULT_SETTINGS: Settings = {
  preferSaavn: false,
  normalize: true,
  reportPlays: true,
  syncLikes: true,
  cookies: null,
  accountName: null,
  quality: "auto",
  qualityCellular: "auto",
  qualityV2: true,
  localeV2: true,
  radioContinue: true,
  listsContinue: false,
  resume: true,
  pauseOnDisconnect: true,
  sleepFade: 10,
  downloadQuality: "high",
  wifiOnly: false,
  autoDownloadLiked: false,
  autoDownloadPlaylists: false,
  cacheLimitMb: 500,
  autoCache: true,
  lyricsLine: true,
  lyricsSize: "m",
  accentMode: "artwork",
  accentColor: "#FF7A45",
  amoled: false,
  npBackground: "field",
  reduceMotion: false,
  catName: "Mochi",
  catWire: true,
  catIsland: true,
  catEpisodes: "rare",
  catColor: "orange",
  region: "auto",
  language: "auto",
  explicitFilter: false,
  hiddenFromHome: [],
  pauseHistory: false,
  androidPill: false,
  androidPillOffset: 0,
  onboarded: false,
  seedArtists: [],
  seedLanguages: [],
};

export type LibraryData = {
  liked: Track[];
  playlists: LocalPlaylist[];
  history: Play[];
  settings: Settings;
  recentSearches: string[];
  savedAlbums: AlbumSummary[];
  followedArtists: ArtistSummary[];
  /** The account's YouTube Music playlists, from the last sync. */
  ytPlaylists: PlaylistSummary[];
  /** Liked ids YouTube reported at the last sync, so remote unlikes can be told from local-only likes. */
  likedRemoteIds: string[];
  syncedAt: number;
};

export const HISTORY_MAX = 1000;
export const strip = (t: Track): Track => ({ ...t, setVideoId: undefined });

export function moveItem<T>(list: T[], from: number, to: number): T[] {
  if (from === to || from < 0 || from >= list.length) return list;
  const next = [...list];
  const [x] = next.splice(from, 1);
  next.splice(Math.max(0, Math.min(to, next.length)), 0, x);
  return next;
}

/** Local-only likes first, then YouTube's order; drops likes YouTube had last sync but no longer has. */
export function mergeLikes(
  local: Track[],
  remote: Track[],
  previousRemoteIds: string[],
): Track[] {
  const remoteIds = new Set(remote.map((t) => t.id));
  const wasRemote = new Set(previousRemoteIds);
  const byId = new Map(local.map((t) => [t.id, t]));
  const localOnly = local.filter(
    (t) => !remoteIds.has(t.id) && !wasRemote.has(t.id),
  );
  return [...localOnly, ...remote.map((t) => byId.get(t.id) ?? strip(t))];
}

const DAY = 86400_000;

/** Most played tracks in the last `days`, for the library summary. */
export function topTracks(history: Play[], days: number, n = 20) {
  return listeningStats(history, Date.now() - days * DAY, Date.now(), n)
    .topSongs;
}

const startOfDay = (ms: number) => {
  const d = new Date(ms);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
};

export type HistoryDay = {
  /** Local midnight, epoch ms; also a stable key. */
  date: number;
  plays: Play[];
};

/** History grouped by local day, newest first; a Play's `at` is its id for removeFromHistory. */
export function historyByDay(history: Play[]): HistoryDay[] {
  const out: HistoryDay[] = [];
  for (const p of history) {
    const date = startOfDay(p.at);
    const last = out[out.length - 1];
    if (last?.date === date) last.plays.push(p);
    else out.push({ date, plays: [p] });
  }
  return out;
}

export type TrackStat = {
  track: Track;
  plays: number;
  minutes: number;
  last: number;
};
export type ArtistStat = {
  artist: ArtistRef;
  plays: number;
  minutes: number;
  /** The artist's most played track, for art. */
  track: Track;
};
export type ListeningStats = {
  topSongs: TrackStat[];
  topArtists: ArtistStat[];
  minutes: number;
  plays: number;
};

// A play counts its full duration (3.5 min when unknown); history only records plays past 30 s.
const playMinutes = (t: Track) => (t.durationSec ?? 210) / 60;
const artistKey = (a: ArtistRef) => a.id ?? a.name.toLowerCase();

/** Top songs, top artists, minutes and play count for plays in [since, until). History is newest first. */
export function listeningStats(
  history: Play[],
  since: number,
  until = Date.now(),
  n = 10,
): ListeningStats {
  const songs = new Map<string, TrackStat>();
  const artists = new Map<string, ArtistStat>();
  let minutes = 0;
  let plays = 0;
  for (const p of history) {
    if (p.at >= until) continue;
    if (p.at < since) break;
    const m = playMinutes(p.track);
    minutes += m;
    plays++;
    const s = songs.get(p.track.id);
    if (s) {
      s.plays++;
      s.minutes += m;
    } else
      songs.set(p.track.id, {
        track: p.track,
        plays: 1,
        minutes: m,
        last: p.at,
      });
    const a = p.track.artists[0];
    if (!a) continue;
    const st = artists.get(artistKey(a));
    if (st) {
      st.plays++;
      st.minutes += m;
      if (!st.artist.id && a.id) st.artist = a;
    } else
      artists.set(artistKey(a), {
        artist: a,
        plays: 1,
        minutes: m,
        track: p.track,
      });
  }
  const best = new Map<string, number>();
  for (const s of songs.values()) {
    const a = s.track.artists[0];
    const st = a && artists.get(artistKey(a));
    if (st && s.plays > (best.get(artistKey(a)) ?? 0)) {
      best.set(artistKey(a), s.plays);
      st.track = s.track;
    }
  }
  return {
    topSongs: [...songs.values()]
      .sort((a, b) => b.plays - a.plays || b.last - a.last)
      .slice(0, n),
    topArtists: [...artists.values()]
      .sort((a, b) => b.plays - a.plays || b.minutes - a.minutes)
      .slice(0, n),
    minutes: Math.round(minutes),
    plays,
  };
}

/** Stats for the last `days` days (7 = "Your week"). */
export const statsForDays = (history: Play[], days: number, n = 10) =>
  listeningStats(history, Date.now() - days * DAY, Date.now(), n);

const PLAYLIST_ID = /^(VL)?((PL|OLAK5uy_|RDCLAK|UU|FL|LL|LM)[\w-]*)$/;

/** Playlist id from a music.youtube.com / youtube.com link, `list=`, a browse VL id or a bare id. */
export function parsePlaylistId(input: string): string | undefined {
  const s = input.trim();
  const list = s.match(/[?&#]list=([\w-]+)/)?.[1];
  if (list) return list;
  const browse = s.match(/\/browse\/(VL[\w-]+)/)?.[1];
  if (browse) return browse.slice(2);
  const bare = s.replace(/^list=/, "");
  const m = bare.match(PLAYLIST_ID);
  if (m) return m[2];
  return /^[\w-]{12,}$/.test(bare) ? bare.replace(/^VL/, "") : undefined;
}

// Older builds had High/Normal/Low per network plus a data saver switch: move to Automatic once,
// keeping an explicit Low (or the old switch) on mobile data.
export function migrateQuality(
  s: Settings,
  saved?: Partial<Settings>,
): Settings {
  if (!saved || saved.qualityV2) return s;
  const old = saved as Partial<Settings> & { dataSaver?: boolean };
  const { dataSaver: _, ...rest } = s as Settings & { dataSaver?: boolean };
  return {
    ...rest,
    quality: old.quality === "saver" ? "saver" : "auto",
    downloadQuality: s.downloadQuality === "saver" ? "saver" : "high",
    qualityCellular: old.dataSaver ? "saver" : "auto",
    qualityV2: true,
  };
}

// Region and language used to default to India and English; follow the phone instead, once.
export function migrateLocale(
  s: Settings,
  saved?: Partial<Settings>,
): Settings {
  if (!saved || saved.localeV2) return s;
  return {
    ...s,
    region: !saved.region || saved.region === "IN" ? "auto" : saved.region,
    language:
      !saved.language || saved.language === "en" ? "auto" : saved.language,
    localeV2: true,
  };
}
