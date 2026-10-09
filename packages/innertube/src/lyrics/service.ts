import type { Lyrics, LyricsProvider, Track, UpNext } from "@studio/music-core";

import {
  defaultFetch,
  type FetchLike,
  fetchWithTimeout,
  query,
} from "../util/http";
import { kugouLyrics } from "./kugou";
import { parseLrc, plainLines, unsync } from "./lrc";
import {
  cleanTitle,
  durationFits,
  SYNC_TOLERANCE_SEC,
  sameSong,
  splitArtists,
} from "./match";
import { parseTtml } from "./ttml";

type LyricsTrack = Pick<
  Track,
  "id" | "title" | "artists" | "album" | "durationSec"
>;

/** The YouTube Music calls lyrics needs; YouTubeMusic satisfies it. */
export interface YouTubeLyricsSource {
  upNext(input: { videoId?: string }): Promise<UpNext>;
  lyricsText(lyricsBrowseId: string): Promise<string | undefined>;
}

export interface LyricsServiceOptions {
  fetch?: FetchLike;
  youtube?: YouTubeLyricsSource;
  /** Per-source budget (default 4000 ms). */
  timeoutMs?: number;
}

const LRCLIB = "https://lrclib.net/api";
const BETTER_LYRICS = "https://lyrics-api.boidu.dev/getLyrics";
const LRCLIB_CLIENT = "Flow (https://github.com/thenetaji/studio)";
const VIDEO_ID = /^[\w-]{11}$/;

const hasWords = (l: Lyrics | null | undefined) =>
  !!l?.lines.some((x) => x.words?.length);

const plainLyrics = (source: Lyrics["source"], plain: string): Lyrics => ({
  source,
  synced: false,
  lines: plainLines(plain),
  plain,
});

const uniquePairs = <T>(pairs: [string, T][]) =>
  pairs.filter(([name], i) => pairs.findIndex(([n]) => n === name) === i);

/** Validated LRCLIB + BetterLyrics in parallel (word-synced wins), then KuGou, then unsynced text, YouTube's last. */
export class LyricsService implements LyricsProvider {
  private readonly f: FetchLike;
  private readonly youtube?: YouTubeLyricsSource;
  private readonly timeoutMs: number;

  constructor(options: LyricsServiceOptions = {}) {
    this.f = options.fetch ?? defaultFetch;
    this.youtube = options.youtube;
    this.timeoutMs = options.timeoutMs ?? 4000;
  }

  async lyrics(track: LyricsTrack): Promise<Lyrics | null> {
    const [lrclib, better] = await Promise.all([
      this.bounded(() => this.lrclib(track)),
      this.bounded(() => this.betterLyrics(track)),
    ]);
    const synced = [lrclib, better].filter((l): l is Lyrics => !!l?.synced);
    const best = synced.find(hasWords) ?? synced[0];
    if (best) return best;
    const kugou = await this.bounded(() => this.kugou(track));
    if (kugou?.synced) return kugou;
    return (
      lrclib ??
      kugou ??
      (await this.bounded(() => this.youtubeLyrics(track))) ??
      null
    );
  }

  private async bounded(
    fn: () => Promise<Lyrics | null>,
  ): Promise<Lyrics | null> {
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      return await Promise.race([
        fn(),
        new Promise<null>(
          (r) => (timer = setTimeout(() => r(null), this.timeoutMs)),
        ),
      ]);
    } catch {
      return null;
    } finally {
      clearTimeout(timer);
    }
  }

  private async getJson(
    url: string,
    headers: Record<string, string> = {},
    missOnAuth = false,
  ): Promise<any | undefined> {
    const res = await fetchWithTimeout(
      this.f,
      url,
      {
        headers: { Accept: "application/json", ...headers },
        credentials: "omit",
      },
      this.timeoutMs,
    );
    if (res.status === 404) return undefined;
    // BetterLyrics answers uncached queries with 401 "API key required".
    if (missOnAuth && (res.status === 401 || res.status === 403))
      return undefined;
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return res.json();
  }

  async lrclib(track: LyricsTrack): Promise<Lyrics | null> {
    const artists = track.artists.map((a) => a.name);
    const title = cleanTitle(track.title, artists);
    const headers = { "Lrclib-Client": LRCLIB_CLIENT };
    const valid = (x: any) =>
      !!x &&
      !x.instrumental &&
      (x.syncedLyrics || x.plainLyrics) &&
      sameSong(
        { title: x.trackName, artist: x.artistName },
        { title: track.title, artists },
      );
    const hits: any[] = [];
    const synced = () =>
      hits.find(
        (x) => x.syncedLyrics && durationFits(x.duration, track.durationSec),
      );
    if (track.durationSec) {
      for (const [name, album] of uniquePairs([
        [track.title, track.album?.title],
        [title, track.album?.title && cleanTitle(track.album.title)],
      ])) {
        const hit = await this.getJson(
          `${LRCLIB}/get?${query({ track_name: name, artist_name: artists[0] ?? "", album_name: album, duration: Math.round(track.durationSec) })}`,
          headers,
        );
        if (valid(hit)) hits.push(hit);
        if (synced()) break;
      }
    }
    if (!synced()) {
      const list = await this.getJson(
        `${LRCLIB}/search?${query({ track_name: title, artist_name: splitArtists(artists)[0] ?? "" })}`,
        headers,
      );
      if (Array.isArray(list)) hits.push(...list.filter(valid));
    }
    const hit = synced();
    if (hit) {
      const lines = parseLrc(hit.syncedLyrics, track.durationSec);
      if (lines.length) return { source: "lrclib", synced: true, lines };
    }
    const gap = (x: any) =>
      track.durationSec ? Math.abs(Number(x.duration) - track.durationSec) : 0;
    const best = [...hits].sort(
      (x, y) =>
        Number(!x.plainLyrics) - Number(!y.plainLyrics) || gap(x) - gap(y),
    )[0];
    const plain = best?.plainLyrics || unsync(best?.syncedLyrics);
    return plain ? plainLyrics("lrclib", plain) : null;
  }

  async betterLyrics(track: LyricsTrack): Promise<Lyrics | null> {
    const artists = track.artists.map((a) => a.name);
    const titles = [
      ...new Set([track.title, cleanTitle(track.title, artists)]),
    ];
    for (const s of titles) {
      const json = await this.getJson(
        `${BETTER_LYRICS}?${query({
          s,
          a: artists[0] ?? "",
          d: track.durationSec ? Math.round(track.durationSec) : undefined,
          al: track.album?.title,
        })}`,
        {},
        true,
      );
      const ttml = typeof json?.ttml === "string" ? json.ttml : "";
      const lines = ttml ? parseTtml(ttml) : [];
      const end = lines[lines.length - 1]?.endMs ?? 0;
      // No title or artist comes back, so a lyric running past the track is the only mismatch it shows.
      if (
        track.durationSec &&
        end > (track.durationSec + SYNC_TOLERANCE_SEC) * 1000
      )
        return null;
      if (lines.length) return { source: "betterlyrics", synced: true, lines };
    }
    return null;
  }

  async kugou(track: LyricsTrack): Promise<Lyrics | null> {
    const match = await kugouLyrics(
      this.f,
      {
        title: track.title,
        artists: track.artists.map((a) => a.name),
        durationSec: track.durationSec,
      },
      this.timeoutMs,
    );
    if (!match) return null;
    if (durationFits(match.durationSec, track.durationSec)) {
      const lines = parseLrc(match.lrc, track.durationSec);
      if (lines.length) return { source: "kugou", synced: true, lines };
    }
    const plain = unsync(match.lrc);
    return plain ? plainLyrics("kugou", plain) : null;
  }

  async youtubeLyrics(track: LyricsTrack): Promise<Lyrics | null> {
    if (!this.youtube || !VIDEO_ID.test(track.id)) return null;
    const { lyricsBrowseId } = await this.youtube.upNext({ videoId: track.id });
    const plain = lyricsBrowseId
      ? await this.youtube.lyricsText(lyricsBrowseId)
      : undefined;
    return plain ? plainLyrics("youtube", plain) : null;
  }
}
