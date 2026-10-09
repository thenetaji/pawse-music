// Pure parsers for library exports from other apps; no network, no React Native.

export type ImportItem = {
  title: string;
  artist?: string;
  album?: string;
  durationSec?: number;
  videoId?: string;
};

export type ImportList = {
  title: string;
  items: ImportItem[];
  /** The source's liked/favourites list (Takeout "Liked music" / "Liked videos"). */
  liked?: boolean;
};

export type ImportSource = { kind: string; lists: ImportList[] };

export class ImportError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ImportError";
  }
}

// Bytes

function utf16(bytes: Uint8Array, start: number, le: boolean): string {
  let out = "";
  const chunk: number[] = [];
  for (let i = start; i + 1 < bytes.length; i += 2) {
    chunk.push(
      le ? bytes[i] | (bytes[i + 1] << 8) : (bytes[i] << 8) | bytes[i + 1],
    );
    if (chunk.length === 4096) {
      out += String.fromCharCode(...chunk);
      chunk.length = 0;
    }
  }
  return out + String.fromCharCode(...chunk);
}

function utf8(bytes: Uint8Array, start: number): string {
  const cps: number[] = [];
  let out = "";
  for (let i = start; i < bytes.length; ) {
    const b = bytes[i];
    let cp = 0xfffd;
    let n = 1;
    if (b < 0x80) cp = b;
    else if (b >= 0xc2 && b < 0xe0 && i + 1 < bytes.length) {
      cp = ((b & 0x1f) << 6) | (bytes[i + 1] & 0x3f);
      n = 2;
    } else if (b >= 0xe0 && b < 0xf0 && i + 2 < bytes.length) {
      cp =
        ((b & 0x0f) << 12) |
        ((bytes[i + 1] & 0x3f) << 6) |
        (bytes[i + 2] & 0x3f);
      n = 3;
    } else if (b >= 0xf0 && b < 0xf5 && i + 3 < bytes.length) {
      cp =
        ((b & 0x07) << 18) |
        ((bytes[i + 1] & 0x3f) << 12) |
        ((bytes[i + 2] & 0x3f) << 6) |
        (bytes[i + 3] & 0x3f);
      n = 4;
    }
    cps.push(cp);
    i += n;
    if (cps.length === 4096) {
      out += String.fromCodePoint(...cps);
      cps.length = 0;
    }
  }
  return out + String.fromCodePoint(...cps);
}

/** Text from file bytes: UTF-16 LE/BE (BOM or zero-byte pattern, as iTunes writes) or UTF-8. */
export function decodeImportBytes(bytes: Uint8Array): string {
  if (bytes[0] === 0xff && bytes[1] === 0xfe) return utf16(bytes, 2, true);
  if (bytes[0] === 0xfe && bytes[1] === 0xff) return utf16(bytes, 2, false);
  if (bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf)
    return utf8(bytes, 3);
  let even = 0;
  let odd = 0;
  const n = Math.min(bytes.length, 400);
  for (let i = 0; i < n; i++) {
    if (bytes[i] !== 0) continue;
    if (i % 2) odd++;
    else even++;
  }
  if (n >= 4 && odd > n / 4 && even === 0) return utf16(bytes, 0, true);
  if (n >= 4 && even > n / 4 && odd === 0) return utf16(bytes, 0, false);
  return utf8(bytes, 0);
}

// Delimited text

function detectDelimiter(text: string): string {
  const line = text.slice(0, 2000).split(/\r\n|\r|\n/)[0] ?? "";
  const counts = [",", "\t", ";"].map(
    (d) => [d, line.split(d).length] as const,
  );
  return counts.sort((a, b) => b[1] - a[1])[0][0];
}

/** RFC 4180 rows (quotes, doubled quotes, CRLF, LF or old-Mac CR line ends); blank lines kept as []. */
export function parseDelimited(text: string, delimiter = ","): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quoted) {
      if (c === '"' && text[i + 1] === '"') {
        cell += '"';
        i++;
      } else if (c === '"') quoted = false;
      else cell += c;
    } else if (c === '"' && cell === "") quoted = true;
    else if (c === delimiter) {
      row.push(cell);
      cell = "";
    } else if (c === "\n" || c === "\r") {
      if (c === "\r" && text[i + 1] === "\n") i++;
      row.push(cell);
      rows.push(row.length === 1 && row[0] === "" ? [] : row);
      row = [];
      cell = "";
    } else cell += c;
  }
  if (cell !== "" || row.length) {
    row.push(cell);
    rows.push(row);
  }
  return rows;
}

const key = (h: string) => h.trim().toLowerCase().replace(/\s+/g, " ");

// Header aliases, lower-cased (English plus common iTunes/Music localisations).
const TITLE = [
  "title",
  "name",
  "song",
  "song title",
  "song name",
  "track",
  "track name",
  "track title",
  "trackname",
  "titre",
  "titel",
  "título",
  "titolo",
  "nom",
  "nombre",
  "nome",
];
const ARTIST = [
  "artist",
  "artists",
  "artist name",
  "artist name(s)",
  "artist names",
  "artist name 1",
  "artistname",
  "performer",
  "artiste",
  "künstler",
  "kunstler",
  "interpret",
  "artista",
  "interprète",
];
const ALBUM = ["album", "album name", "album title", "albumname", "álbum"];
const DURATION = [
  "duration",
  "duration (ms)",
  "track duration (ms)",
  "duration_ms",
  "duration (s)",
  "track duration",
  "length",
  "time",
  "dauer",
  "durée",
  "duración",
  "durata",
  "duração",
  "zeit",
];
const VIDEO_ID = [
  "video id",
  "videoid",
  "video_id",
  "youtube id",
  "youtube video id",
];
const URL_COLS = ["url", "link", "youtube url", "youtube link"];

const VIDEO = /^[\w-]{11}$/;
const VIDEO_IN_URL =
  /(?:youtu\.be\/|[?&]v=|\/shorts\/|\/embed\/)([\w-]{11})(?![\w-])/;

/** Seconds from "3:45", "1:02:03", seconds, or milliseconds (when the header says ms or the value is huge). */
export function parseDuration(
  raw: string | number | undefined,
  ms = false,
): number | undefined {
  if (raw === undefined || raw === "") return undefined;
  const s = String(raw).trim();
  if (/^\d+(:\d{1,2}){1,2}$/.test(s))
    return s.split(":").reduce((acc, p) => acc * 60 + Number(p), 0);
  const n = Number(s.replace(",", "."));
  if (!Number.isFinite(n) || n <= 0) return undefined;
  return Math.round(ms || n > 10_800 ? n / 1000 : n);
}

const baseName = (fileName: string) =>
  fileName.split(/[\\/]/).pop() ?? fileName;
const stem = (fileName: string) => baseName(fileName).replace(/\.[^.]+$/, "");

const LIKED_LIST = /^liked (music|videos)$/i;

function listTitle(fileName: string): string {
  const s = stem(fileName)
    .replace(/[-_ ]videos$/i, "")
    .trim();
  if (/^music library songs$/i.test(s)) return "YouTube Music library";
  return s || "Imported";
}

function parseTable(fileName: string, text: string): ImportSource {
  const delimiter = detectDelimiter(text);
  const rows = parseDelimited(text, delimiter);
  // Old Takeout playlist files start with a playlist-metadata block, so look for the real header.
  const head = rows.slice(0, 12);
  const has = (names: string[]) => (r: string[]) =>
    r.some((h) => names.includes(key(h)));
  const byVideo = head.findIndex(has(VIDEO_ID));
  const at = byVideo >= 0 ? byVideo : head.findIndex(has(TITLE));
  if (at < 0) {
    if (rows[0]?.some((h) => /playlist (id|title)/i.test(h)))
      throw new ImportError(
        "This file only lists playlist names. Pick the playlist files from the playlists folder instead.",
      );
    throw new ImportError("No song columns found in this file.");
  }
  const header = rows[at].map(key);
  const col = (names: string[]) => {
    for (const n of names) {
      const i = header.indexOf(n);
      if (i >= 0) return i;
    }
    return -1;
  };
  const iTitle = col(TITLE);
  const iArtist = col(ARTIST);
  const extraArtists = header.flatMap((h, i) =>
    /^artist name [2-9]\d*$/.test(h) ? [i] : [],
  );
  const iAlbum = col(ALBUM);
  const iDuration = col(DURATION);
  const durationMs = iDuration >= 0 && /\bms\b|_ms$/.test(header[iDuration]);
  const iVideo = col(VIDEO_ID);
  const iUrl = col(URL_COLS);

  const items: ImportItem[] = [];
  for (const r of rows.slice(at + 1)) {
    if (!r.length) continue;
    const cell = (i: number) => (i >= 0 ? (r[i] ?? "").trim() : "");
    let videoId = cell(iVideo);
    if (!VIDEO.test(videoId))
      videoId = cell(iUrl).match(VIDEO_IN_URL)?.[1] ?? "";
    const title = cell(iTitle);
    if (!title && !videoId) continue;
    const artist = [cell(iArtist), ...extraArtists.map(cell)]
      .filter(Boolean)
      .join(", ");
    items.push({
      title,
      ...(artist ? { artist } : {}),
      ...(cell(iAlbum) ? { album: cell(iAlbum) } : {}),
      ...(iDuration >= 0 && parseDuration(cell(iDuration), durationMs)
        ? { durationSec: parseDuration(cell(iDuration), durationMs) }
        : {}),
      ...(videoId ? { videoId } : {}),
    });
  }
  const title = listTitle(fileName);
  const kind =
    iVideo >= 0
      ? "youtube-takeout"
      : delimiter === "\t" && header.includes("name")
        ? "apple-music-txt"
        : "csv";
  return {
    kind,
    lists: [
      {
        title,
        items,
        ...(LIKED_LIST.test(title) ? { liked: true } : {}),
      },
    ],
  };
}

// JSON

type Obj = Record<string, unknown>;
const isObj = (v: unknown): v is Obj =>
  !!v && typeof v === "object" && !Array.isArray(v);
const str = (v: unknown) =>
  typeof v === "string" ? v.trim() : typeof v === "number" ? String(v) : "";

/** First non-empty string among keys, matched case-insensitively. */
function pick(o: Obj, keys: string[]): string {
  const lower = new Map(Object.keys(o).map((k) => [key(k), k]));
  for (const k of keys) {
    const real = lower.get(k);
    const v = real === undefined ? "" : str(o[real]);
    if (v) return v;
  }
  return "";
}

// Apple privacy export (Apple Media Services > Apple Music Activity) keys.
const APPLE_TRACK_IDS = [
  "Track Identifier",
  "Apple Music Track Identifier",
  "Purchased Track Identifier",
  "Audio Matched Track Identifier",
  "Tag Matched Track Identifier",
];

function itemFrom(o: Obj, durationKeys: string[], ms: boolean): ImportItem {
  const title = pick(o, [...TITLE, "trackname", "track name", "song name"]);
  const artist = pick(o, [...ARTIST, "artistname", "album artist"]);
  const album = pick(o, ALBUM);
  const durationSec = parseDuration(pick(o, durationKeys), ms);
  return {
    title,
    ...(artist ? { artist } : {}),
    ...(album ? { album } : {}),
    ...(durationSec ? { durationSec } : {}),
  };
}

const appleTrack = (o: Obj) =>
  itemFrom(o, ["track duration", "duration", "total time"], true);

const appleTrackIds = (o: Obj) =>
  APPLE_TRACK_IDS.map((k) => str(o[k])).filter(Boolean);

function appleLibrary(tracks: Obj[]): ImportList {
  return {
    title: "Apple Music library",
    items: tracks.map(appleTrack).filter((t) => t.title),
  };
}

function applePlaylists(playlists: Obj[], tracks: Obj[]): ImportList[] {
  const byId = new Map<string, ImportItem>();
  for (const t of tracks) {
    const item = appleTrack(t);
    if (item.title) for (const id of appleTrackIds(t)) byId.set(id, item);
  }
  return playlists.flatMap((p) => {
    const ids = p["Playlist Item Identifiers"];
    if (!Array.isArray(ids) || !ids.length) return [];
    const items = ids.flatMap((id) => {
      const hit = byId.get(str(id));
      return hit ? [hit] : [];
    });
    return items.length
      ? [
          {
            title: str(p.Title) || str(p.Name) || "Apple Music playlist",
            items,
          },
        ]
      : [];
  });
}

function genericList(title: string, rows: unknown[]): ImportList {
  return {
    title,
    items: rows
      .flatMap((r) => {
        if (!isObj(r)) return [];
        // Spotify account data nests the song under "track".
        const o = isObj(r.track) ? r.track : r;
        return [
          itemFrom(
            o,
            ["duration", "duration_ms", "durationms", "length", "time"],
            "duration_ms" in o || "durationMs" in o,
          ),
        ];
      })
      .filter((t) => t.title),
  };
}

const isApplePlaylists = (a: unknown[]) =>
  a.some((x) => isObj(x) && "Playlist Item Identifiers" in x);
const isAppleTracks = (a: unknown[]) =>
  a.some((x) => isObj(x) && "Track Identifier" in x);

function parseJson(fileName: string, json: unknown): ImportSource {
  if (Array.isArray(json)) {
    if (isApplePlaylists(json))
      throw new ImportError(
        "Apple playlists need their songs: pick this file together with Apple Music Library Tracks.json.",
      );
    if (isAppleTracks(json))
      return {
        kind: "apple-privacy",
        lists: [appleLibrary(json.filter(isObj))],
      };
    return { kind: "json", lists: [genericList(listTitle(fileName), json)] };
  }
  if (isObj(json)) {
    // Spotify YourLibrary.json / Playlist1.json shapes.
    if (Array.isArray(json.playlists))
      return {
        kind: "spotify",
        lists: json.playlists
          .filter(isObj)
          .map((p) =>
            genericList(
              str(p.name) || "Playlist",
              Array.isArray(p.items) ? p.items : [],
            ),
          )
          .filter((l) => l.items.length),
      };
    if (Array.isArray(json.tracks))
      return {
        kind: "json",
        lists: [genericList(listTitle(fileName), json.tracks)],
      };
  }
  throw new ImportError("This JSON file has no songs Flow can read.");
}

function parseOne(fileName: string, text: string): unknown {
  const body = text.replace(/^﻿/, "");
  const head = body.trimStart()[0];
  if (/\.json$/i.test(fileName) || head === "[" || head === "{") {
    try {
      return JSON.parse(body);
    } catch {
      if (/\.json$/i.test(fileName))
        throw new ImportError("The file is not valid JSON.");
    }
  }
  return body;
}

/** One export file: Takeout CSV, Apple privacy JSON/CSV, Apple Music .txt, generic CSV/TSV or JSON. */
export function parseImportFile(fileName: string, text: string): ImportSource {
  const parsed = parseOne(fileName, text);
  const source =
    typeof parsed === "string"
      ? parseTable(fileName, parsed)
      : parseJson(fileName, parsed);
  const lists = source.lists.filter((l) => l.items.length);
  if (!lists.length) throw new ImportError("No songs found in this file.");
  return { ...source, lists };
}

/** Several files at once, so Apple's playlists file can be read with its tracks file. */
export function parseImportFiles(
  files: { name: string; text: string }[],
): ImportSource {
  const parsed = files.map((f) => ({ ...f, value: parseOne(f.name, f.text) }));
  const appleTracks = parsed.flatMap((f) =>
    Array.isArray(f.value) && isAppleTracks(f.value)
      ? f.value.filter(isObj)
      : [],
  );
  const lists: ImportList[] = [];
  const kinds = new Set<string>();
  for (const f of parsed) {
    if (Array.isArray(f.value) && isApplePlaylists(f.value)) {
      if (!appleTracks.length) return parseImportFile(f.name, f.text);
      kinds.add("apple-privacy");
      lists.push(...applePlaylists(f.value.filter(isObj), appleTracks));
      continue;
    }
    const s = parseImportFile(f.name, f.text);
    kinds.add(s.kind);
    lists.push(...s.lists);
  }
  if (!lists.length) throw new ImportError("No songs found in these files.");
  return {
    kind: kinds.size === 1 ? [...kinds][0] : "mixed",
    lists,
  };
}
