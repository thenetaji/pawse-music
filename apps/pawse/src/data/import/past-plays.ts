// Past listening from other apps (Google Takeout, Apple privacy export) as journal plays.
// Pure: no React, no storage; the caller hands batches to the journal.

import type { JournalPlay } from "../journal-types";
import { ImportError } from "./formats";

export type PastKind = "youtube" | "apple";
export type PastPlays = { plays: JournalPlay[]; skipped: number };

const CHUNK = 5000;
const SKIP_MS = 30_000;
const yieldNow = () => new Promise<void>((r) => setTimeout(r, 0));

// Google Takeout: watch-history.json

type TakeoutEntry = {
  header?: string;
  title?: string;
  titleUrl?: string;
  subtitles?: { name?: string }[];
  details?: { name?: string }[];
  time?: string;
};

const VIDEO_IN_URL = /[?&]v=([\w-]{11})(?![\w-])/;
const stripTopic = (s: string) => s.replace(/\s+-\s+Topic$/i, "").trim();
const stripWatched = (s: string) => s.replace(/^Watched\s+/i, "").trim();

function ytPlay(
  url: string,
  rawTitle: string,
  channel: string | undefined,
  startedAt: number,
): JournalPlay | null {
  const id = VIDEO_IN_URL.exec(url)?.[1];
  const title = stripWatched(rawTitle);
  if (
    !id ||
    !title ||
    /^https?:\/\//.test(title) ||
    !Number.isFinite(startedAt)
  )
    return null;
  const artist = channel ? stripTopic(channel) : "";
  return {
    trackId: id,
    source: "youtube",
    title,
    artists: artist ? [artist] : [],
    startedAt,
    listenedMs: 0,
    ended: "stopped",
    origin: "ytm-takeout",
  };
}

/** One watch-history.json entry; null for YouTube (not Music), ads and removed videos. */
export function takeoutJsonPlay(e: TakeoutEntry): JournalPlay | null {
  if (e?.header !== "YouTube Music") return null;
  if (e.details?.some((d) => /google ads/i.test(d.name ?? ""))) return null;
  return ytPlay(
    e.titleUrl ?? "",
    e.title ?? "",
    e.subtitles?.[0]?.name,
    Date.parse(e.time ?? ""),
  );
}

// Google Takeout: watch-history.html (the default format)

const ENTITIES: Record<string, string> = {
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
  nbsp: " ",
};
const decodeHtml = (s: string) =>
  s.replace(/&(#x?[\da-f]+|\w+);/gi, (m, e: string) => {
    if (e[0] !== "#") return ENTITIES[e.toLowerCase()] ?? m;
    const n =
      e[1] === "x" || e[1] === "X"
        ? Number.parseInt(e.slice(2), 16)
        : Number.parseInt(e.slice(1), 10);
    return Number.isFinite(n) ? String.fromCodePoint(n) : m;
  });

const MONTHS = "janfebmaraprmayjunjulaugsepoctnovdec";
const month = (s: string) => {
  const i = MONTHS.indexOf(s.slice(0, 3).toLowerCase());
  return i >= 0 && i % 3 === 0 ? i / 3 : -1;
};

/** Takeout HTML dates ("Oct 9, 2026, 9:41:12 PM IST", "9 Oct 2026, 21:41:12 CET"), as local time. */
export function parseTakeoutDate(raw: string): number {
  const s = decodeHtml(raw).replace(/[  ]/g, " ").trim();
  const time =
    /(\d{1,2}):(\d{2})(?::(\d{2}))?\s*([AaPp])\.?\s?[Mm]\.?(?![A-Za-z])/.exec(
      s,
    );
  const time24 = time ?? /(\d{1,2}):(\d{2})(?::(\d{2}))?/.exec(s);
  const md = /([A-Za-z]{3,})\.?\s+(\d{1,2}),?\s+(\d{4})/.exec(s);
  const dm = /(\d{1,2})\.?\s+([A-Za-z]{3,})\.?,?\s+(\d{4})/.exec(s);
  let y = -1;
  let m = -1;
  let d = -1;
  if (md && month(md[1]) >= 0) {
    m = month(md[1]);
    d = +md[2];
    y = +md[3];
  } else if (dm && month(dm[2]) >= 0) {
    m = month(dm[2]);
    d = +dm[1];
    y = +dm[3];
  }
  if (y < 0) {
    // Unknown layout: drop a trailing zone abbreviation and let the engine try.
    const t = Date.parse(
      s.replace(/\s+[A-Z]{2,5}([+-]\d{1,2}(:?\d{2})?)?$/, ""),
    );
    return Number.isFinite(t) ? t : Number.NaN;
  }
  let h = time24 ? +time24[1] : 12;
  const min = time24 ? +time24[2] : 0;
  const sec = time24?.[3] ? +time24[3] : 0;
  const ap = time?.[4]?.toLowerCase();
  if (ap === "p" && h < 12) h += 12;
  if (ap === "a" && h === 12) h = 0;
  return new Date(y, m, d, h, min, sec).getTime();
}

const HTML_ENTRY =
  /Watched(?:&nbsp;|\s| )+<a href="([^"]+)">([^<]*)<\/a>\s*<br\s*\/?>\s*(?:<a href="[^"]*">([^<]*)<\/a>\s*<br\s*\/?>)?\s*([^<]+?)\s*<br/;
const HTML_HEADER = /mdl-typography--title">\s*([^<]*?)\s*</;

/** One Takeout HTML entry (the text of one outer-cell div). */
export function takeoutHtmlPlay(cell: string): JournalPlay | null {
  if (decodeHtml(HTML_HEADER.exec(cell)?.[1] ?? "") !== "YouTube Music")
    return null;
  if (/From Google Ads/i.test(cell)) return null;
  const m = HTML_ENTRY.exec(cell);
  if (!m) return null;
  return ytPlay(
    decodeHtml(m[1]),
    decodeHtml(m[2]),
    m[3] ? decodeHtml(m[3]) : undefined,
    parseTakeoutDate(m[4]),
  );
}

// CSV, row by row so big files can yield between chunks

/** RFC 4180 rows (quoted fields, doubled quotes, newlines in quotes, BOM); blank lines skipped. */
export function* csvRows(text: string): Generator<string[]> {
  let i = text.charCodeAt(0) === 0xfeff ? 1 : 0;
  const n = text.length;
  let row: string[] = [];
  let cell = "";
  let quoted = false;
  for (; i < n; i++) {
    const c = text[i];
    if (quoted) {
      if (c === '"' && text[i + 1] === '"') {
        cell += '"';
        i++;
      } else if (c === '"') quoted = false;
      else cell += c;
    } else if (c === '"' && cell === "") quoted = true;
    else if (c === ",") {
      row.push(cell);
      cell = "";
    } else if (c === "\n" || c === "\r") {
      if (c === "\r" && text[i + 1] === "\n") i++;
      row.push(cell);
      if (row.length > 1 || row[0] !== "") yield row;
      row = [];
      cell = "";
    } else cell += c;
  }
  if (cell !== "" || row.length) {
    row.push(cell);
    yield row;
  }
}

type Cols = (row: string[], name: string) => string;
function columns(header: string[]): Cols {
  const at = new Map(header.map((h, i) => [h.trim().toLowerCase(), i]));
  return (row, name) => {
    const i = at.get(name.toLowerCase());
    return i === undefined ? "" : (row[i] ?? "").trim();
  };
}

// Apple Music Play Activity.csv

/** One Play Activity row; null without a song, a start time or any play time. */
export function appleActivityPlay(
  col: Cols,
  row: string[],
): JournalPlay | null {
  const title = col(row, "Song Name");
  const startedAt = Date.parse(col(row, "Event Start Timestamp"));
  const listenedMs = Math.round(Number(col(row, "Play Duration Milliseconds")));
  if (!title || !Number.isFinite(startedAt) || !(listenedMs > 0)) return null;
  const artist = col(row, "Artist Name") || col(row, "Container Artist Name");
  const album = col(row, "Album Name") || col(row, "Container Album Name");
  const media = Number(col(row, "Media Duration In Milliseconds"));
  const reason = col(row, "End Reason Type").toUpperCase();
  const ended: JournalPlay["ended"] =
    reason === "NATURAL_END_OF_TRACK"
      ? "finished"
      : listenedMs < SKIP_MS || reason.includes("SKIP")
        ? "skipped"
        : "stopped";
  return {
    trackId: "",
    source: "import",
    title,
    artists: artist ? [artist] : [],
    ...(album ? { album } : {}),
    ...(media > 0 ? { durationSec: Math.round(media / 1000) } : {}),
    startedAt,
    listenedMs,
    ended,
    origin: "apple-music",
  };
}

// Apple Music - Play History Daily Tracks.csv

/** One Daily Tracks row ("Artist - Song", YYYYMMDD) as a single play at local noon. */
export function appleDailyPlay(col: Cols, row: string[]): JournalPlay | null {
  const desc = col(row, "Track Description");
  const date = /^(\d{4})(\d{2})(\d{2})$/.exec(col(row, "Date Played"));
  if (!desc || !date) return null;
  const cut = desc.indexOf(" - ");
  const artist = cut > 0 ? desc.slice(0, cut).trim() : "";
  const title = (cut > 0 ? desc.slice(cut + 3) : desc).trim();
  if (!title) return null;
  const ms = Math.round(Number(col(row, "Play Duration Milliseconds")));
  return {
    trackId: "",
    source: "import",
    title,
    artists: artist ? [artist] : [],
    startedAt: new Date(+date[1], +date[2] - 1, +date[3], 12).getTime(),
    listenedMs: ms > 0 ? ms : 0,
    ended: "stopped",
    origin: "apple-music",
  };
}

// Drivers

async function fromTakeoutJson(text: string): Promise<PastPlays> {
  let data: unknown;
  try {
    data = JSON.parse(text.charCodeAt(0) === 0xfeff ? text.slice(1) : text);
  } catch {
    throw new ImportError("That JSON file looks broken. Try exporting again.");
  }
  if (!Array.isArray(data))
    throw new ImportError("That isn't watch-history.json from Takeout.");
  const plays: JournalPlay[] = [];
  let skipped = 0;
  for (let i = 0; i < data.length; i++) {
    if (i && i % CHUNK === 0) await yieldNow();
    const p = takeoutJsonPlay(data[i] as TakeoutEntry);
    if (p) plays.push(p);
    else skipped++;
  }
  return { plays, skipped };
}

async function fromTakeoutHtml(text: string): Promise<PastPlays> {
  const plays: JournalPlay[] = [];
  let skipped = 0;
  const mark = 'class="outer-cell';
  let at = text.indexOf(mark);
  for (let n = 1; at >= 0; n++) {
    const next = text.indexOf(mark, at + mark.length);
    const p = takeoutHtmlPlay(text.slice(at, next < 0 ? undefined : next));
    if (p) plays.push(p);
    else skipped++;
    at = next;
    if (n % CHUNK === 0) await yieldNow();
  }
  return { plays, skipped };
}

async function fromCsv(text: string): Promise<PastPlays> {
  const rows = csvRows(text);
  const head = rows.next();
  if (head.done) throw new ImportError("That CSV file is empty.");
  const names = head.value.map((h) => h.trim().toLowerCase());
  const col = columns(head.value);
  const read = names.includes("song name")
    ? appleActivityPlay
    : names.includes("track description")
      ? appleDailyPlay
      : null;
  if (!read)
    throw new ImportError(
      "That isn't Apple Music Play Activity or Play History Daily Tracks.",
    );
  const daily = read === appleDailyPlay;
  const seen = new Map<string, number>();
  const plays: JournalPlay[] = [];
  let skipped = 0;
  let n = 0;
  for (const row of rows) {
    if (++n % CHUNK === 0) await yieldNow();
    const p = read(col, row);
    if (!p) {
      skipped++;
      continue;
    }
    if (daily) {
      // Same song twice on one day: nudge a second so the journal keeps both.
      const k = `${p.startedAt}|${p.title.toLowerCase()}`;
      const dup = seen.get(k) ?? 0;
      seen.set(k, dup + 1);
      p.startedAt += dup * 1000;
    }
    plays.push(p);
  }
  return { plays, skipped };
}

/** Parses one export file for the chosen app; throws ImportError with a short reason. */
export async function parsePastPlays(
  kind: PastKind,
  fileName: string,
  text: string,
): Promise<PastPlays> {
  const name = fileName.toLowerCase();
  if (name.endsWith(".zip"))
    throw new ImportError(
      "Unzip it first and pick watch-history.json/html or the Play Activity CSV.",
    );
  const lead = text.slice(0, 2000).replace(/^﻿/, "").trimStart();
  if (kind === "youtube") {
    if (name.endsWith(".json") || lead.startsWith("["))
      return fromTakeoutJson(text);
    if (
      name.endsWith(".html") ||
      name.endsWith(".htm") ||
      /<html|<!doctype/i.test(lead)
    )
      return fromTakeoutHtml(text);
    throw new ImportError("Pick watch-history.json or watch-history.html.");
  }
  if (lead.startsWith("[") || lead.startsWith("{") || lead.startsWith("<"))
    throw new ImportError(
      "Pick “Apple Music Play Activity.csv” from the Apple Media Services folder.",
    );
  return fromCsv(text);
}

/** Sends plays to the journal in batches; returns how many were new. */
export async function savePastPlays(
  plays: JournalPlay[],
  add: (batch: JournalPlay[]) => Promise<number>,
  onProgress?: (done: number) => void,
  size = 2000,
): Promise<number> {
  let added = 0;
  for (let i = 0; i < plays.length; i += size) {
    added += await add(plays.slice(i, i + size));
    onProgress?.(Math.min(plays.length, i + size));
    await yieldNow();
  }
  return added;
}

/** "2019–2025" (or "2021") from the plays' first and last start. */
export function playYears(plays: JournalPlay[]): string {
  let lo = Number.POSITIVE_INFINITY;
  let hi = Number.NEGATIVE_INFINITY;
  for (const p of plays) {
    if (p.startedAt < lo) lo = p.startedAt;
    if (p.startedAt > hi) hi = p.startedAt;
  }
  if (!Number.isFinite(lo)) return "";
  const a = new Date(lo).getFullYear();
  const b = new Date(hi).getFullYear();
  return a === b ? `${a}` : `${a}–${b}`;
}
