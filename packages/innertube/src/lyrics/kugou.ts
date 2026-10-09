import { base64Decode, utf8Decode } from "../util/bytes";
import { type FetchLike, fetchWithTimeout, query } from "../util/http";
import {
  artistMatches,
  cleanTitle,
  sameSong,
  splitArtists,
  titleMatches,
} from "./match";

// Metrolist's KuGou flow (song search → lyrics by hash → keyword fallback → download), with every candidate validated.
const HEAD_CUT_LIMIT = 30;
const HEAD_TITLE_MAX_SEC = 1;
const MAX_HASH_LOOKUPS = 3;
const ACCEPTED = /^\[(\d\d):(\d\d)\.(\d{2,3})\].*/;
const ACCEPTED_PARTS = /^\[(\d\d):(\d\d)\.(\d{2,3})\](.*)$/;
const BANNED = /.+\].+[:：].+/;

const normalizeTitle = (t: string) =>
  t
    .replace(/\(.*\)/g, "")
    .replace(/（.*）/g, "")
    .replace(/「.*」/g, "")
    .replace(/『.*』/g, "")
    .replace(/<.*>/g, "")
    .replace(/《.*》/g, "")
    .replace(/〈.*〉/g, "")
    .replace(/＜.*＞/g, "")
    .trim();
const normalizeArtist = (a: string) =>
  a
    .replace(/, /g, "、")
    .replace(/ & /g, "、")
    .replace(/\./g, "")
    .replace(/和/g, "、")
    .replace(/\(.*\)/g, "")
    .replace(/（.*）/g, "")
    .trim();

/** Drops non-timed lines, the credit block at head and tail, and head lines that only name the song or its artists. */
export function cleanKugouLrc(
  lrc: string,
  title?: string,
  artists: string[] = [],
): string {
  const lines = lrc.split(/\r?\n/).filter((l) => ACCEPTED.test(l));
  let head = 0;
  for (let i = Math.min(HEAD_CUT_LIMIT, lines.length - 1); i >= 0; i--) {
    if (BANNED.test(lines[i])) {
      head = i + 1;
      break;
    }
  }
  let tail = 0;
  for (
    let i = Math.min(lines.length - HEAD_CUT_LIMIT, lines.length - 1);
    i >= 0;
    i--
  ) {
    if (BANNED.test(lines[lines.length - 1 - i])) {
      tail = i + 1;
      break;
    }
  }
  if (title)
    while (head < lines.length && isHeadLine(lines[head], title, artists))
      head++;
  return lines.slice(head, Math.max(head, lines.length - tail)).join("\n");
}

function isHeadLine(line: string, title: string, artists: string[]): boolean {
  const m = line.match(ACCEPTED_PARTS);
  if (!m) return false;
  const text = m[4].trim();
  if (!text) return true;
  const atStart = Number(m[1]) * 60 + Number(m[2]) <= HEAD_TITLE_MAX_SEC;
  const parts = text.split(/\s+[-–—]\s+/);
  const isTitle = (p: string) => titleMatches(p, title, artists);
  const isArtist = (p: string) =>
    splitArtists(p).length > 0 &&
    splitArtists(p).every((a) => artistMatches(a, artists));
  const credits = (p: string) =>
    splitArtists(p).length > 0 && artistMatches(p, artists);
  if (parts.length > 1) return parts.every((p) => isTitle(p) || credits(p));
  return (
    (atStart || cleanTitle(text, artists) !== text) &&
    (isTitle(text) || isArtist(text))
  );
}

export interface KugouMatch {
  lrc: string;
  durationSec?: number;
}

/** First validated KuGou lyric for the track, or undefined; never another song's lyric. */
export async function kugouLyrics(
  f: FetchLike,
  track: { title: string; artists: string[]; durationSec?: number },
  timeoutMs: number,
): Promise<KugouMatch | undefined> {
  const { artists, durationSec } = track;
  const title = cleanTitle(track.title, artists);
  const keyword = `${normalizeTitle(title)} - ${normalizeArtist(artists.join(", "))}`;
  const get = async (url: string) => {
    const res = await fetchWithTimeout(
      f,
      url,
      { credentials: "omit" },
      timeoutMs,
    );
    if (!res.ok) throw new Error(`KuGou HTTP ${res.status}`);
    return JSON.parse(await res.text());
  };
  const gap = (sec: number | undefined) =>
    durationSec && sec ? Math.abs(sec - durationSec) : 0;
  const fits = (c: any, requireTitle: boolean) =>
    c?.id &&
    c.accesskey &&
    (requireTitle || c.song ? titleMatches(c.song, title, artists) : true) &&
    artistMatches(c.singer, artists);
  const search = await get(
    `https://mobileservice.kugou.com/api/v3/search/song?${query({ version: 9108, plat: 0, pagesize: 8, showtype: 0, keyword })}`,
  );
  const songs = ((search?.data?.info ?? []) as any[])
    .filter((s) =>
      sameSong({ title: s.songname, artist: s.singername }, { title, artists }),
    )
    .sort((a, b) => gap(Number(a.duration)) - gap(Number(b.duration)))
    .slice(0, MAX_HASH_LOOKUPS);
  let candidate: any;
  let seconds: number | undefined;
  for (const song of songs) {
    const byHash = await get(
      `https://lyrics.kugou.com/search?${query({ ver: 1, man: "yes", client: "pc", hash: song.hash })}`,
    );
    candidate = (byHash?.candidates ?? []).find((c: any) => fits(c, false));
    if (candidate) {
      seconds = Number(song.duration) || undefined;
      break;
    }
  }
  if (!candidate) {
    const byKeyword = await get(
      `https://lyrics.kugou.com/search?${query({ ver: 1, man: "yes", client: "pc", keyword, duration: durationSec ? durationSec * 1000 : undefined })}`,
    );
    candidate = ((byKeyword?.candidates ?? []) as any[])
      .filter((c) => fits(c, true))
      .sort(
        (a, b) =>
          gap(Number(a.duration) / 1000) - gap(Number(b.duration) / 1000),
      )[0];
  }
  if (!candidate) return undefined;
  const ms = Number(candidate.duration);
  if (ms > 0) seconds = ms / 1000;
  const dl = await get(
    `https://lyrics.kugou.com/download?${query({ fmt: "lrc", charset: "utf8", client: "pc", ver: 1, id: candidate.id, accesskey: candidate.accesskey })}`,
  );
  if (typeof dl?.content !== "string") return undefined;
  const lrc = cleanKugouLrc(
    utf8Decode(base64Decode(dl.content)),
    title,
    artists,
  );
  return lrc.trim() ? { lrc, durationSec: seconds } : undefined;
}
