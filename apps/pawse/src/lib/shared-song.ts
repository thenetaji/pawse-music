export type SharedSong = {
  title: string;
  artist?: string;
  lengthMs?: number;
  /** What to search YouTube Music for. */
  query: string;
};

type Candidate = {
  title: string;
  artists: { name: string }[];
  durationSec?: number;
};

const SHAZAM_LINK =
  /https?:\/\/(?:www\.)?shazam\.com\/(?:[a-z]{2}(?:-[a-z]{2})?\/)?(?:track|song)\/\d+(?:\/[^\s?#]*)?(?:\?[^\s#]*)?(?:#\S*)?/i;

const plain = (s: string) =>
  s
    .toLowerCase()
    .replace(/[([].*?[)\]]/g, " ")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();

/** The app adds `{"title","artist"}` after the # of its share link; it isn't a documented format, so it may go. */
function namesInFragment(fragment: string) {
  try {
    const json: unknown = JSON.parse(decodeURIComponent(fragment));
    if (!json || typeof json !== "object") return {};
    const { title, artist } = json as Record<string, unknown>;
    return {
      title:
        typeof title === "string" && title.trim() ? title.trim() : undefined,
      artist:
        typeof artist === "string" && artist.trim() ? artist.trim() : undefined,
    };
  } catch {
    return {};
  }
}

/** The song in a Shazam share, from the link's own title and artist, else the title in its path. */
export function parseSharedSong(text: string): SharedSong | undefined {
  const link = text.match(SHAZAM_LINK)?.[0];
  if (!link) return undefined;
  const url = new URL(link);
  const names = namesInFragment(url.hash.slice(1));
  const slug = url.pathname.split("/").filter(Boolean).at(-1) ?? "";
  const title =
    names.title ?? (/^\d+$/.test(slug) ? "" : slug.replace(/-+/g, " ").trim());
  if (!title) return undefined;
  const length = Number(url.searchParams.get("trackLength"));
  return {
    title,
    artist: names.artist,
    lengthMs: length > 0 ? length : undefined,
    query: names.artist ? `${title} ${names.artist}` : title,
  };
}

/** The best result that is provably this song: a title match backed by the artist or the length. */
export function pickMatch<T extends Candidate>(
  candidates: T[],
  song: SharedSong,
): T | undefined {
  const title = plain(song.title);
  const artists = (song.artist ?? "")
    .split(/\s*(?:&|,|\bfeat\.?|\bft\.?|\bx\b|\band\b)\s*/i)
    .map(plain)
    .filter((a) => a.length >= 3);
  const unproved = !artists.length && !song.lengthMs;
  let best: T | undefined;
  let bestScore = 0;
  for (const c of candidates) {
    const name = plain(c.title);
    const exact = name === title;
    if (!exact && (name.length < 3 || !name.includes(title))) continue;
    const by = c.artists.map((a) => plain(a.name));
    // A video's channel is often the label, so the singer may only be in its title.
    const artistHit = artists.some(
      (a) =>
        name.includes(a) ||
        by.some((b) => b.length >= 3 && (b.includes(a) || a.includes(b))),
    );
    const off =
      song.lengthMs && c.durationSec
        ? Math.abs(c.durationSec - song.lengthMs / 1000)
        : undefined;
    const fit =
      off === undefined ? 0 : off <= 3 ? 2 : off <= 10 ? 1 : off > 30 ? -2 : 0;
    if (!artistHit && fit < 1 && !(unproved && exact)) continue;
    const score = (exact ? 3 : 2) + (artistHit ? 2 : 0) + fit;
    if (score > bestScore) {
      best = c;
      bestScore = score;
    }
  }
  return best;
}
