// Title cleanup and candidate validation shared by every lyrics provider.
export const SYNC_TOLERANCE_SEC = 3;

const NOISE_WORDS =
  "official|music|video|audio|lyric|lyrics|lyrical|full|song|songs|visuali[sz]er|hd|hq|uhd|4k|8k|1080p|720p|explicit|clean|remaster|remastered|new|latest|\\d{4}";
const NOISE = new RegExp(`^(?:(?:${NOISE_WORDS})\\s*)+$`, "i");
const LEAD_NOISE = /^(?:from\s|feat\.?\s|ft\.?\s|featuring\s)/i;
const BRACKETS =
  /\s*(?:\(([^()]*)\)|\[([^[\]]*)\]|\{([^{}]*)\}|【([^【】]*)】|（([^（）]*)）)/g;
const UNCLOSED = /\s*[([（](?:from|feat\.?|ft\.?|featuring)\s[^)\]）]*$/i;
const FEAT = /\s+(?:feat\.?|ft\.?|featuring)\s.*$/i;
const QUALITY = /\s+(?:hd|hq|uhd|4k|8k|1080p|720p)$/i;
const DASH = /\s+[-–—]\s+/;
const VERSION =
  /^(?:remix|mix|version|live|acoustic|unplugged|lofi|lo|fi|slowed|reverb|reverbed|sped|up|edit|radio|extended|original|ost|soundtrack|and)$/;
const NOT_SUNG = /\b(?:instrumental|karaoke)\b/i;

const isNoise = (s: string) => {
  const t = s
    .trim()
    .replace(/[.,:;'"!-]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return !t || NOISE.test(t) || LEAD_NOISE.test(t);
};

/** Lowercase, no diacritics or punctuation, single spaces. */
export const normalize = (s: string): string =>
  s
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^\p{L}\p{M}\p{N}]+/gu, " ")
    .trim();

/** "A, B & C/D、E feat. F" → individual names, bracketed aliases dropped. */
export const splitArtists = (names: string | string[]): string[] =>
  (Array.isArray(names) ? names : [names])
    .flatMap((n) =>
      n
        .replace(/\([^()]*\)|（[^（）]*）/g, " ")
        .split(/\s*(?:[,&/、;，]|\bfeat\.?\s|\bft\.?\s|\bfeaturing\s)\s*/i),
    )
    .map((n) => n.trim())
    .filter((n) => normalize(n));

function similarity(a: string, b: string): number {
  if (a === b) return 1;
  if (!a || !b) return 0;
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const cur = [i];
    for (let j = 1; j <= b.length; j++)
      cur[j] = Math.min(
        prev[j] + 1,
        cur[j - 1] + 1,
        prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1),
      );
    prev = cur;
  }
  return 1 - prev[b.length] / Math.max(a.length, b.length);
}

/** Same name after normalising, allowing small spelling drift and spacing. */
function close(a: string, b: string): boolean {
  const x = normalize(a);
  const y = normalize(b);
  if (!x || !y) return false;
  const cx = x.replace(/ /g, "");
  const cy = y.replace(/ /g, "");
  return (
    cx === cy ||
    (Math.min(cx.length, cy.length) >= 4 && similarity(cx, cy) >= 0.85)
  );
}

export function artistMatches(
  candidate: string | undefined,
  artists: string[],
): boolean {
  const ours = splitArtists(artists);
  const theirs = candidate ? splitArtists(candidate) : [];
  if (!theirs.length || !ours.length) return true;
  return theirs.some((t) =>
    ours.some((o) => {
      if (close(t, o)) return true;
      const [a, b] = [normalize(t).split(" "), normalize(o).split(" ")];
      const [short, long] = a.length <= b.length ? [a, b] : [b, a];
      return short.join("").length >= 3 && short.every((w) => long.includes(w));
    }),
  );
}

/** Strips video/upload noise from a title: (Official Video), [4K], | Lyrical, ft. X, "Artist - " prefix. */
export function cleanTitle(title: string, artists: string[] = []): string {
  let t = title.replace(/\s+/g, " ").trim();
  const pipe = t.split(/\s*[|｜]\s*/);
  if (pipe[0]) t = pipe[0];
  const prefix = t.match(/^(.+?)(?:\s+[-–—]\s+|:\s+)(.+)$/);
  const left = prefix && artists.length ? splitArtists(prefix[1]) : [];
  if (prefix && left.length && left.every((l) => artistMatches(l, artists)))
    t = prefix[2];
  t = t
    .replace(BRACKETS, (m, ...g) =>
      isNoise(g.slice(0, 5).find((x) => x !== undefined) ?? "") ? "" : m,
    )
    .replace(UNCLOSED, "")
    .replace(FEAT, "")
    .replace(QUALITY, "");
  const parts = t.split(DASH);
  while (parts.length > 1 && isNoise(parts[parts.length - 1])) parts.pop();
  t = parts
    .join(" - ")
    .replace(/\s+/g, " ")
    .replace(/[\s\-–—:,]+$/, "")
    .trim();
  return t || title.trim();
}

/** Equal titles once cleaned, or one is the other plus version words (Live, Remix). */
export function titleMatches(
  candidate: string | undefined,
  title: string,
  artists: string[] = [],
): boolean {
  if (!candidate) return false;
  if (NOT_SUNG.test(candidate) && !NOT_SUNG.test(title)) return false;
  const c = cleanTitle(candidate, artists);
  return [cleanTitle(title, artists), title].some((t) => {
    if (close(c, t)) return true;
    const [a, b] = [normalize(c).split(" "), normalize(t).split(" ")];
    const [short, long] = a.length <= b.length ? [a, b] : [b, a];
    if (!short.join("")) return false;
    const rest = [...long];
    for (const w of short) {
      const i = rest.indexOf(w);
      if (i < 0) return false;
      rest.splice(i, 1);
    }
    return rest.every((w) => VERSION.test(w));
  });
}

export interface Candidate {
  title?: string;
  artist?: string;
  durationSec?: number;
}

/** Same song: title matches and, when given, the artist overlaps. */
export const sameSong = (
  c: Candidate,
  track: { title: string; artists: string[] },
): boolean =>
  titleMatches(c.title, track.title, track.artists) &&
  artistMatches(c.artist, track.artists);

/** Same recording length, so synced timings line up with playback. */
export const durationFits = (
  candidateSec: number | undefined,
  trackSec: number | undefined,
): boolean =>
  !trackSec ||
  (!!candidateSec && Math.abs(candidateSec - trackSec) <= SYNC_TOLERANCE_SEC);
