import type {
  AlbumSummary,
  ArtistSummary,
  SourceId,
  Thumbnail,
  Track,
} from "@studio/music-core";

import {
  DEFAULT_SETTINGS,
  type LibraryData,
  type LocalPlaylist,
  type Play,
  type Settings,
} from "./library-model";

export const BACKUP_FORMAT = "flow.library";
export const BACKUP_VERSION = 1;
const HISTORY_MAX = 1000;
const SOURCES = new Set<SourceId>(["youtube", "saavn", "local"]);
const PRIVATE: (keyof Settings)[] = ["cookies", "accountName"];

export type Backup = {
  format: typeof BACKUP_FORMAT;
  version: number;
  exportedAt: number;
  liked: Track[];
  playlists: LocalPlaylist[];
  history: Play[];
  savedAlbums: AlbumSummary[];
  followedArtists: ArtistSummary[];
  settings: Partial<Settings>;
};

export class BackupError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "BackupError";
  }
}

const isObj = (v: unknown): v is Record<string, unknown> =>
  !!v && typeof v === "object" && !Array.isArray(v);
const str = (v: unknown, max = 500) =>
  typeof v === "string" && v.length <= max ? v : undefined;
const list = (v: unknown) => (Array.isArray(v) ? v : []);

function thumbs(v: unknown): Thumbnail[] {
  return list(v)
    .filter((t) => isObj(t) && str(t.url, 2000)?.startsWith("http"))
    .slice(0, 8)
    .map((t) => ({
      url: t.url as string,
      width: Number(t.width) || 0,
      height: Number(t.height) || 0,
    }));
}

/** A clean Track or undefined; unknown fields are dropped. */
export function toTrack(v: unknown): Track | undefined {
  if (!isObj(v)) return undefined;
  const id = str(v.id, 100);
  const title = str(v.title);
  const source = v.source as SourceId;
  if (!id || title === undefined || !SOURCES.has(source)) return undefined;
  const artists = list(v.artists)
    .filter((a) => isObj(a) && str(a.name) !== undefined)
    .slice(0, 20)
    .map((a) => ({
      name: a.name as string,
      ...(str(a.id, 100) ? { id: a.id as string } : {}),
    }));
  const album =
    isObj(v.album) && str(v.album.id, 100) && str(v.album.title) !== undefined
      ? { id: v.album.id as string, title: v.album.title as string }
      : undefined;
  const dur = Number(v.durationSec);
  return {
    id,
    source,
    title,
    artists,
    ...(album ? { album } : {}),
    ...(dur > 0 && dur < 86400 ? { durationSec: dur } : {}),
    thumbnails: thumbs(v.thumbnails),
    ...(v.explicit === true ? { explicit: true } : {}),
    ...(v.kind === "song" || v.kind === "video" ? { kind: v.kind } : {}),
    ...(typeof v.loudnessDb === "number" && Number.isFinite(v.loudnessDb)
      ? { loudnessDb: v.loudnessDb }
      : {}),
  };
}

const tracks = (v: unknown) =>
  list(v)
    .map(toTrack)
    .filter((t): t is Track => !!t);

function toSettings(v: unknown): Partial<Settings> {
  if (!isObj(v)) return {};
  const out: Record<string, unknown> = {};
  for (const [k, def] of Object.entries(DEFAULT_SETTINGS)) {
    if (PRIVATE.includes(k as keyof Settings) || !(k in v)) continue;
    const val = v[k];
    if (Array.isArray(def)) {
      if (Array.isArray(val)) out[k] = val.slice(0, 50);
    } else if (def === null || typeof val === typeof def) out[k] = val;
  }
  // Enum-like fields must hold a known value.
  const pick = <K extends keyof Settings>(
    k: K,
    allowed: readonly Settings[K][],
  ) => {
    if (k in out && !allowed.includes(out[k] as Settings[K])) delete out[k];
  };
  pick("quality", ["auto", "high", "normal", "saver"]);
  pick("qualityCellular", ["auto", "high", "normal", "saver"]);
  pick("downloadQuality", ["high", "normal", "saver"]);
  pick("lyricsSize", ["s", "m", "l"]);
  pick("accentMode", ["artwork", "fixed"]);
  pick("npBackground", ["field", "blur", "black"]);
  pick("catEpisodes", ["off", "rare", "often"]);
  pick("catColor", ["orange", "black", "white", "grey"]);
  if ("seedArtists" in out)
    out.seedArtists = list(out.seedArtists).filter(
      (a) => isObj(a) && str(a.id, 100) && str(a.name) !== undefined,
    );
  if ("seedLanguages" in out)
    out.seedLanguages = list(out.seedLanguages).filter((x) => str(x, 20));
  return out as Partial<Settings>;
}

/** Validates a parsed backup file; throws BackupError when it is not one. */
export function parseBackup(json: unknown): Backup {
  if (!isObj(json) || json.format !== BACKUP_FORMAT)
    throw new BackupError("Not a Flow library backup");
  if (typeof json.version !== "number" || json.version > BACKUP_VERSION)
    throw new BackupError("This backup is from a newer version of Flow");
  const now = Date.now();
  const playlists: LocalPlaylist[] = list(json.playlists)
    .filter((p) => isObj(p) && str(p.id, 100) && str(p.title) !== undefined)
    .map((p) => ({
      id: p.id as string,
      title: p.title as string,
      tracks: tracks(p.tracks),
      createdAt: Number(p.createdAt) || now,
      updatedAt: Number(p.updatedAt) || now,
      ...(str(p.sourceId, 100) ? { sourceId: p.sourceId as string } : {}),
    }));
  const history: Play[] = list(json.history)
    .filter((p) => isObj(p) && Number(p.at) > 0)
    .map((p) => ({ track: toTrack(p.track), at: Number(p.at) }))
    .filter((p): p is Play => !!p.track);
  const savedAlbums = list(json.savedAlbums)
    .filter((a) => isObj(a) && str(a.id, 100) && str(a.title) !== undefined)
    .map((a) => ({
      id: a.id as string,
      title: a.title as string,
      artists: list(a.artists).filter(
        (x) => isObj(x) && str(x.name) !== undefined,
      ),
      ...(str(a.year, 10) ? { year: a.year as string } : {}),
      ...(a.kind === "album" || a.kind === "single" || a.kind === "ep"
        ? { kind: a.kind }
        : {}),
      thumbnails: thumbs(a.thumbnails),
    })) as AlbumSummary[];
  const followedArtists = list(json.followedArtists)
    .filter((a) => isObj(a) && str(a.id, 100) && str(a.name) !== undefined)
    .map((a) => ({
      id: a.id as string,
      name: a.name as string,
      ...(str(a.subtitle) ? { subtitle: a.subtitle as string } : {}),
      thumbnails: thumbs(a.thumbnails),
    }));
  return {
    format: BACKUP_FORMAT,
    version: json.version,
    exportedAt: Number(json.exportedAt) || 0,
    liked: tracks(json.liked),
    playlists,
    history,
    savedAlbums,
    followedArtists,
    settings: toSettings(json.settings),
  };
}

/** The exported file body: no cookies or account name. */
export function makeBackup(s: LibraryData): Backup {
  const settings: Partial<Settings> = { ...s.settings };
  for (const k of PRIVATE) delete settings[k];
  return {
    format: BACKUP_FORMAT,
    version: BACKUP_VERSION,
    exportedAt: Date.now(),
    liked: s.liked,
    playlists: s.playlists,
    history: s.history,
    savedAlbums: s.savedAlbums,
    followedArtists: s.followedArtists,
    settings,
  };
}

const unionById = <T extends { id: string }>(mine: T[], theirs: T[]) => {
  const have = new Set(mine.map((x) => x.id));
  return [...mine, ...theirs.filter((x) => !have.has(x.id))];
};

export type MergeSummary = { liked: number; playlists: number; plays: number };

/** Adds what the backup has and the library lacks; the newer copy of a playlist wins; settings apply. */
export function mergeBackup(
  s: LibraryData,
  b: Backup,
): { data: Partial<LibraryData>; added: MergeSummary } {
  const liked = unionById(s.liked, b.liked);
  const byId = new Map(s.playlists.map((p) => [p.id, p]));
  let newPlaylists = 0;
  for (const p of b.playlists) {
    const mine = byId.get(p.id);
    if (!mine) newPlaylists++;
    if (!mine || p.updatedAt > mine.updatedAt) byId.set(p.id, p);
  }
  const playlists = [
    ...s.playlists.map((p) => byId.get(p.id)!),
    ...b.playlists.filter((p) => !s.playlists.some((m) => m.id === p.id)),
  ];
  const seen = new Set(s.history.map((p) => `${p.at}:${p.track.id}`));
  const extra = b.history.filter((p) => !seen.has(`${p.at}:${p.track.id}`));
  const history = [...s.history, ...extra]
    .sort((a, b) => b.at - a.at)
    .slice(0, HISTORY_MAX);
  return {
    data: {
      liked,
      playlists,
      history,
      savedAlbums: unionById(s.savedAlbums, b.savedAlbums),
      followedArtists: unionById(s.followedArtists, b.followedArtists),
      settings: { ...s.settings, ...b.settings },
    },
    added: {
      liked: liked.length - s.liked.length,
      playlists: newPlaylists,
      plays: extra.length,
    },
  };
}
