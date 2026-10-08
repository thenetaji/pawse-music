import {
  type ResolvedStream,
  StreamError,
  type Track,
} from "@studio/music-core";

import { base64Decode, utf8Decode, utf8Encode } from "./util/bytes";
import { desEcb, unpadPkcs5 } from "./util/des";
import {
  type FetchLike,
  defaultFetch,
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
}

const API = "https://www.jiosaavn.com/api.php";
const KEY = utf8Encode("38346591");
const TIMEOUT_MS = 6000;
const TOLERANCE_SEC = 3;
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

export interface JioSaavnOptions {
  fetch?: FetchLike;
}

/** JioSaavn search plus 320 kbps AAC resolution for tracks found elsewhere. */
export class JioSaavn {
  private readonly f: FetchLike;

  constructor(options: JioSaavnOptions = {}) {
    this.f = options.fetch ?? defaultFetch;
  }

  private async api(params: Record<string, string | number>): Promise<any> {
    const url = `${API}?${query({ ...params, _format: "json", _marker: 0, api_version: 4, ctx: "web6dot0" })}`;
    let res: Response;
    try {
      res = await fetchWithTimeout(
        this.f,
        url,
        { headers: { Accept: "application/json" }, credentials: "omit" },
        TIMEOUT_MS,
      );
    } catch (e) {
      throw new StreamError(
        "network",
        `JioSaavn request failed: ${(e as Error)?.message ?? e}`,
      );
    }
    if (!res.ok)
      throw new StreamError("network", `JioSaavn HTTP ${res.status}`);
    return res.json();
  }

  async search(q: string, n = 10): Promise<SaavnSong[]> {
    const json = await this.api({ __call: "search.getResults", n, p: 1, q });
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
    track: Pick<Track, "id" | "source" | "title" | "artists" | "durationSec">,
  ): Promise<ResolvedStream> {
    let song: SaavnSong | undefined;
    if (track.source === "saavn") {
      song = await this.song(track.id);
    } else {
      const q =
        `${normalizeTitle(track.title)} ${track.artists[0]?.name ?? ""}`.trim();
      song = matchSong(track, await this.search(q));
    }
    if (!song?.mediaUrl)
      throw new StreamError(
        "no_audio",
        `No confident JioSaavn match for "${track.title}"`,
      );
    return {
      url: song.mediaUrl,
      mimeType: "audio/mp4",
      bitrate: song.is320 ? 320_000 : 160_000,
      expiresAt: Date.now() + TTL_MS,
      via: "saavn",
    };
  }
}
