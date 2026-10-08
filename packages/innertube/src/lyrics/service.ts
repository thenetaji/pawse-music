import type { Lyrics, LyricsProvider, Track, UpNext } from "@studio/music-core";

import {
  type FetchLike,
  defaultFetch,
  fetchWithTimeout,
  query,
} from "../util/http";
import { kugouLyrics } from "./kugou";
import { parseLrc, plainLines } from "./lrc";
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
const MATCH_TOLERANCE_SEC = 3;
const VIDEO_ID = /^[\w-]{11}$/;

const hasWords = (l: Lyrics | null | undefined) =>
  !!l?.lines.some((x) => x.words?.length);

/** LRCLIB + BetterLyrics in parallel (word-synced wins), then KuGou, then YouTube's unsynced text. */
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
    if (kugou) return kugou;
    if (lrclib) return lrclib;
    return (await this.bounded(() => this.youtubeLyrics(track))) ?? null;
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
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return res.json();
  }

  async lrclib(track: LyricsTrack): Promise<Lyrics | null> {
    const artist = track.artists[0]?.name ?? "";
    const headers = { "Lrclib-Client": LRCLIB_CLIENT };
    let hit: any;
    if (track.durationSec) {
      hit = await this.getJson(
        `${LRCLIB}/get?${query({ track_name: track.title, artist_name: artist, album_name: track.album?.title, duration: Math.round(track.durationSec) })}`,
        headers,
      );
    }
    if (!hit?.syncedLyrics) {
      const list = await this.getJson(
        `${LRCLIB}/search?${query({ track_name: track.title, artist_name: artist })}`,
        headers,
      );
      const close = (Array.isArray(list) ? list : []).filter(
        (x: any) =>
          !x.instrumental &&
          (!track.durationSec ||
            Math.abs(Number(x.duration) - track.durationSec) <=
              MATCH_TOLERANCE_SEC),
      );
      hit =
        close.find((x: any) => x.syncedLyrics) ??
        hit ??
        close.find((x: any) => x.plainLyrics);
    }
    if (hit?.syncedLyrics) {
      const lines = parseLrc(hit.syncedLyrics, track.durationSec);
      if (lines.length) return { source: "lrclib", synced: true, lines };
    }
    if (hit?.plainLyrics)
      return {
        source: "lrclib",
        synced: false,
        lines: plainLines(hit.plainLyrics),
        plain: hit.plainLyrics,
      };
    return null;
  }

  async betterLyrics(track: LyricsTrack): Promise<Lyrics | null> {
    const json = await this.getJson(
      `${BETTER_LYRICS}?${query({
        s: track.title,
        a: track.artists[0]?.name ?? "",
        d: track.durationSec ? Math.round(track.durationSec) : undefined,
        al: track.album?.title,
      })}`,
    );
    const ttml = typeof json?.ttml === "string" ? json.ttml : "";
    const lines = ttml ? parseTtml(ttml) : [];
    return lines.length
      ? { source: "betterlyrics", synced: true, lines }
      : null;
  }

  async kugou(track: LyricsTrack): Promise<Lyrics | null> {
    const lrc = await kugouLyrics(
      this.f,
      track.title,
      track.artists.map((a) => a.name).join(", "),
      track.durationSec,
      this.timeoutMs,
    );
    const lines = lrc ? parseLrc(lrc, track.durationSec) : [];
    return lines.length ? { source: "kugou", synced: true, lines } : null;
  }

  async youtubeLyrics(track: LyricsTrack): Promise<Lyrics | null> {
    if (!this.youtube || !VIDEO_ID.test(track.id)) return null;
    const { lyricsBrowseId } = await this.youtube.upNext({ videoId: track.id });
    const plain = lyricsBrowseId
      ? await this.youtube.lyricsText(lyricsBrowseId)
      : undefined;
    return plain
      ? { source: "youtube", synced: false, lines: plainLines(plain), plain }
      : null;
  }
}
