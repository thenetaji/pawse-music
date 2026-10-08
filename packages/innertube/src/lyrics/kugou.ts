import { base64Decode, utf8Decode } from "../util/bytes";
import { type FetchLike, fetchWithTimeout, query } from "../util/http";

// Metrolist's KuGou flow: song search → lyrics by hash → keyword fallback → download → strip credits.
const DURATION_TOLERANCE_SEC = 8;
const HEAD_CUT_LIMIT = 30;
const ACCEPTED = /^\[(\d\d):(\d\d)\.(\d{2,3})\].*/;
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

/** Drops non-timed lines and the singer/composer credit block at the head and tail. */
export function cleanKugouLrc(lrc: string): string {
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
  return lines.slice(head, Math.max(head, lines.length - tail)).join("\n");
}

export async function kugouLyrics(
  f: FetchLike,
  title: string,
  artist: string,
  durationSec: number | undefined,
  timeoutMs: number,
): Promise<string | undefined> {
  const keyword = `${normalizeTitle(title)} - ${normalizeArtist(artist)}`;
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
  const search = await get(
    `https://mobileservice.kugou.com/api/v3/search/song?${query({ version: 9108, plat: 0, pagesize: 8, showtype: 0, keyword })}`,
  );
  let candidate: { id: string; accesskey: string } | undefined;
  for (const song of search?.data?.info ?? []) {
    if (
      durationSec &&
      Math.abs(Number(song.duration) - durationSec) > DURATION_TOLERANCE_SEC
    )
      continue;
    const byHash = await get(
      `https://lyrics.kugou.com/search?${query({ ver: 1, man: "yes", client: "pc", hash: song.hash })}`,
    );
    candidate = byHash?.candidates?.[0];
    if (candidate) break;
  }
  if (!candidate) {
    const byKeyword = await get(
      `https://lyrics.kugou.com/search?${query({ ver: 1, man: "yes", client: "pc", keyword, duration: durationSec ? durationSec * 1000 : undefined })}`,
    );
    candidate = byKeyword?.candidates?.[0];
  }
  if (!candidate) return undefined;
  const dl = await get(
    `https://lyrics.kugou.com/download?${query({ fmt: "lrc", charset: "utf8", client: "pc", ver: 1, id: candidate.id, accesskey: candidate.accesskey })}`,
  );
  if (typeof dl?.content !== "string") return undefined;
  const lrc = cleanKugouLrc(utf8Decode(base64Decode(dl.content)));
  return lrc.trim() ? lrc : undefined;
}
