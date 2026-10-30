import {
  type ResolvedStream,
  type ResolveOptions,
  StreamError,
  type Track,
} from "@pawse/music-core";

import { base64Decode, utf8Decode, utf8Encode } from "./util/bytes";
import { desEcb, unpadPkcs5 } from "./util/des";
import {
  defaultFetch,
  type FetchLike,
  fetchWithTimeout,
  query,
} from "./util/http";

export interface SaavnSong {
  id: string;
  title: string;
  /** Primary artists first, then featured artists and singers. */
  artists: string[];
  primaryArtists: string[];
  album?: string;
  year?: string;
  durationSec?: number;
  image?: string;
  /** Decrypted CDN URL at the best available bitrate. */
  mediaUrl?: string;
  is320: boolean;
  /** JioSaavn's explicit flag; undefined when the listing has none. */
  explicit?: boolean;
}

const API = "https://www.jiosaavn.com/api.php";
const KEY = utf8Encode("38346591");
const TIMEOUT_MS = 6000;
const TOLERANCE_SEC = 3;
const STRICT_TOLERANCE_SEC = 2;
// A source tried ahead of YouTube must not hold up a song when it is slow or down.
const STRICT_TIMEOUT_MS = 3500;
const DOWN_MS = 60_000;
const TTL_MS = 6 * 3600_000;

const ENTITIES: Record<string, string> = {
  amp: "&",
  quot: '"',
  apos: "'",
  lt: "<",
  gt: ">",
  nbsp: " ",
  "#039": "'",
};
export const decodeEntities = (s: string): string =>
  s.replace(/&(#x[0-9a-f]+|#\d+|\w+);/gi, (m, e: string) => {
    if (ENTITIES[e]) return ENTITIES[e];
    if (e[0] === "#")
      return String.fromCodePoint(
        e[1] === "x" || e[1] === "X"
          ? parseInt(e.slice(2), 16)
          : Number(e.slice(1)),
      );
    return m;
  });

const stripDiacritics = (s: string): string => {
  try {
    return s.normalize("NFD").replace(/[̀-ͯ]/g, "");
  } catch {
    return s;
  }
};

const PUNCT = /[!"#$%&'()*+,\-./:;<=>?@[\\\]^_`{|}~‘’“”–—…]/g;

/** Lower-cased title without "(From …)", feat. credits, remaster tags, diacritics or punctuation. */
export function normalizeTitle(raw: string): string {
  return stripDiacritics(decodeEntities(raw))
    .toLowerCase()
    .replace(/[([](?:from|feat\.?|ft\.?|featuring|with)\b[^)\]]*[)\]]/g, " ")
    .replace(/[([][^)\]]*\bremaster(?:ed)?\b[^)\]]*[)\]]/g, " ")
    .replace(/\s[-–—]\s.*\bremaster(?:ed)?\b.*$/, " ")
    .replace(/\s(?:feat\.?|ft\.?|featuring)\s.*$/, " ")
    .replace(PUNCT, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export const normalizeArtist = (raw: string): string =>
  normalizeTitle(raw).replace(/^the /, "");

/** Decrypts `more_info.encrypted_media_url` (base64 of DES-ECB, PKCS5) to a CDN URL. */
export function decryptMediaUrl(encrypted: string): string {
  return utf8Decode(
    unpadPkcs5(desEcb(base64Decode(encrypted), KEY, true)),
  ).trim();
}

const names = (list: unknown): string[] =>
  Array.isArray(list)
    ? list
        .map((a) => decodeEntities(String(a?.name ?? "")).trim())
        .filter(Boolean)
    : [];

export function toSaavnSong(raw: any): SaavnSong | undefined {
  if (!raw?.id || (raw.type && raw.type !== "song")) return undefined;
  const info = raw.more_info ?? {};
  const map = info.artistMap ?? {};
  const singers = (Array.isArray(map.artists) ? map.artists : []).filter(
    (a: any) => a?.role === "singer",
  );
  const primaryArtists = names(map.primary_artists);
  const artists = [
    ...new Set([
      ...primaryArtists,
      ...names(map.featured_artists),
      ...names(singers),
    ]),
  ];
  const is320 = String(info["320kbps"]) === "true";
  let mediaUrl: string | undefined;
  if (
    typeof info.encrypted_media_url === "string" &&
    info.encrypted_media_url
  ) {
    try {
      mediaUrl = decryptMediaUrl(info.encrypted_media_url)
        .replace(/^http:/, "https:")
        .replace(/_96\./, is320 ? "_320." : "_160.");
      if (!/^https:\/\//.test(mediaUrl)) mediaUrl = undefined;
    } catch {
      mediaUrl = undefined;
    }
  }
  const duration = Number(info.duration);
  const flag = raw.explicit_content ?? info.explicit_content;
  return {
    id: String(raw.id),
    title: decodeEntities(String(raw.title ?? raw.song ?? "")),
    artists,
    primaryArtists,
    album: info.album ? decodeEntities(String(info.album)) : undefined,
    year: raw.year ? String(raw.year) : undefined,
    durationSec: duration > 0 ? duration : undefined,
    image:
      typeof raw.image === "string"
        ? raw.image.replace(/150x150/, "500x500")
        : undefined,
    mediaUrl,
    is320,
    explicit: flag == null ? undefined : /^(?:1|true)$/i.test(String(flag)),
  };
}

/** The first result whose title, primary artist and duration (±3 s) all match. */
export function matchSong(
  track: Pick<Track, "title" | "artists" | "durationSec">,
  songs: SaavnSong[],
): SaavnSong | undefined {
  const title = normalizeTitle(track.title);
  const primary = (track.artists[0]?.name ?? "")
    .split(/\s*(?:,|&| x | and )\s*/i)
    .map(normalizeArtist)
    .filter(Boolean);
  if (!title || !primary.length) return undefined;
  return songs.find((s) => {
    if (!s.mediaUrl || normalizeTitle(s.title) !== title) return false;
    if (
      track.durationSec &&
      s.durationSec &&
      Math.abs(track.durationSec - s.durationSec) > TOLERANCE_SEC
    )
      return false;
    const theirs = new Set(s.artists.map(normalizeArtist));
    return primary.some((a) => theirs.has(a));
  });
}

// Versions that sound different from the studio recording, told apart from title and album text.
const VARIANTS: [string, RegExp][] = [
  ["live", /\blive\b/],
  ["remix", /\b(?:remix(?:ed)?|rmx|mashup|bootleg|rework|flip)\b/],
  ["cover", /\bcover(?:ed)?\b/],
  ["sped", /\b(?:sped|speed(?:ed)?)[ -]?up\b|\bnightcore\b/],
  ["slowed", /\b(?:slowed|reverb)\b/],
  ["lofi", /\blo[ -]?fi\b/],
  ["8d", /\b8d\b/],
  ["acoustic", /\b(?:acoustic|unplugged)\b/],
  ["instrumental", /\b(?:instrumental|karaoke)\b/],
  ["other", /\b(?:reprise|version|mix)\b/],
];

function variantsOf(...parts: (string | undefined)[]): string {
  const text = decodeEntities(parts.filter(Boolean).join(" "))
    .toLowerCase()
    .replace(/[([]\s*from\b[^)\]]*[)\]]/g, " ");
  return VARIANTS.filter(([, re]) => re.test(text))
    .map(([name]) => name)
    .join();
}

/** The artist as listed and each name in a joined credit, normalised. */
function artistKeys(name: string): string[] {
  const clean = name.replace(/\s+-\s+topic$/i, "");
  return [
    ...new Set(
      [clean, ...clean.split(/\s*(?:,|;|&|\/|\+| x | and )\s*/i)]
        .map(normalizeArtist)
        .filter(Boolean),
    ),
  ];
}

/**
 * The 320 kbps listing of the same recording, or nothing. Title, primary artist, duration (±2 s) and version
 * (live, remix, cover, sped up, lofi...) must all agree, so a doubt means YouTube plays instead.
 */
export function matchSongStrict(
  track: Pick<
    Track,
    "title" | "artists" | "durationSec" | "album" | "explicit"
  >,
  songs: SaavnSong[],
): SaavnSong | undefined {
  const title = normalizeTitle(track.title);
  const artist = track.artists[0]?.name;
  const length = track.durationSec;
  if (!title || !artist || !length) return undefined;
  const wanted = new Set(artistKeys(artist));
  const version = variantsOf(track.title, track.album?.title);
  let best: SaavnSong | undefined;
  let bestGap = Infinity;
  for (const s of songs) {
    if (!s.mediaUrl || !s.is320 || !s.durationSec) continue;
    const gap = Math.abs(s.durationSec - length);
    if (gap > STRICT_TOLERANCE_SEC || gap >= bestGap) continue;
    if (normalizeTitle(s.title) !== title) continue;
    if (variantsOf(s.title, s.album) !== version) continue;
    if (s.explicit !== undefined && s.explicit !== !!track.explicit) continue;
    const primary = s.primaryArtists.length ? s.primaryArtists : s.artists;
    if (!primary.flatMap(artistKeys).some((a) => wanted.has(a))) continue;
    best = s;
    bestGap = gap;
  }
  return best;
}

export interface JioSaavnOptions {
  fetch?: FetchLike;
}

/** JioSaavn search plus 320 kbps AAC resolution for tracks found elsewhere. */
export class JioSaavn {
  private readonly f: FetchLike;
  private downUntil = 0;

  constructor(options: JioSaavnOptions = {}) {
    this.f = options.fetch ?? defaultFetch;
  }

  private async api(
    params: Record<string, string | number>,
    timeoutMs = TIMEOUT_MS,
  ): Promise<any> {
    const url = `${API}?${query({ ...params, _format: "json", _marker: 0, api_version: 4, ctx: "web6dot0" })}`;
    let res: Response;
    try {
      res = await fetchWithTimeout(
        this.f,
        url,
        { headers: { Accept: "application/json" }, credentials: "omit" },
        timeoutMs,
      );
    } catch (e) {
      this.downUntil = Date.now() + DOWN_MS;
      throw new StreamError(
        "network",
        `JioSaavn request failed: ${(e as Error)?.message ?? e}`,
      );
    }
    if (!res.ok) {
      if (res.status >= 500) this.downUntil = Date.now() + DOWN_MS;
      throw new StreamError("network", `JioSaavn HTTP ${res.status}`);
    }
    this.downUntil = 0;
    return res.json();
  }

  async search(
    q: string,
    n = 10,
    timeoutMs = TIMEOUT_MS,
  ): Promise<SaavnSong[]> {
    const json = await this.api(
      { __call: "search.getResults", n, p: 1, q },
      timeoutMs,
    );
    return (Array.isArray(json?.results) ? json.results : [])
      .map(toSaavnSong)
      .filter((s: SaavnSong | undefined): s is SaavnSong => !!s);
  }

  async song(id: string): Promise<SaavnSong | undefined> {
    const json = await this.api({ __call: "song.getDetails", pids: id });
    const raw = Array.isArray(json?.songs) ? json.songs[0] : json?.[id];
    return toSaavnSong(raw);
  }

  async resolve(
    track: Pick<Track, "id" | "source" | "title" | "artists" | "durationSec"> &
      Partial<Pick<Track, "album" | "explicit">>,
    options: ResolveOptions = {},
  ): Promise<ResolvedStream> {
    let song: SaavnSong | undefined;
    if (track.source === "saavn") {
      song = await this.song(track.id);
    } else {
      const q =
        `${normalizeTitle(track.title)} ${track.artists[0]?.name ?? ""}`.trim();
      if (options.strict) {
        if (Date.now() < this.downUntil)
          throw new StreamError("network", "JioSaavn is not answering");
        song = matchSongStrict(
          track,
          await this.search(q, 10, STRICT_TIMEOUT_MS),
        );
      } else song = matchSong(track, await this.search(q));
    }
    if (!song?.mediaUrl)
      throw new StreamError(
        "no_audio",
        `No confident JioSaavn match for "${track.title}"`,
      );
    const q = options.quality ?? "high";
    const kbps = q === "saver" ? 96 : q === "normal" || !song.is320 ? 160 : 320;
    return {
      url: song.mediaUrl.replace(/_(320|160)\./, `_${kbps}.`),
      mimeType: "audio/mp4",
      bitrate: kbps * 1000,
      expiresAt: Date.now() + TTL_MS,
      durationSec: song.durationSec,
      via: "saavn",
    };
  }
}
