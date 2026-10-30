import {
  fetchSegmentIndex,
  hlsMaster,
  hlsMediaPlaylist,
} from "@pawse/innertube";
import type { StreamPart, VideoStream } from "@pawse/music-core";

import { ytv } from "../data/clients";
import { appFetch } from "./net";

/** "auto" lets the player switch between every quality as the network allows; otherwise one quality's key,
 * or a height to play the tallest quality at or under (the default from Settings). */
export type Quality = "auto" | string | number;

export interface QualityOption {
  /** "720p60", "480p". */
  key: string;
  height: number;
  fps: number;
}

/** A ready-to-play video: an HLS master over small byte ranges of YouTube's separate video and audio files. */
export interface VideoSource {
  uri: string;
  stream: VideoStream;
  /** Every quality this video has, tallest first. */
  options: QualityOption[];
  /** "auto" or the key that's playing. */
  quality: string;
}

/** Where a platform keeps playlists, and how its player reaches the media. */
export interface PlaylistHost {
  publish(name: string, text: string): Promise<string>;
  media(part: StreamPart, stream: VideoStream): string;
  /** A different video is opening; earlier playlists can go. */
  forget?(): void;
}

// Re-resolve this long before YouTube's media urls expire.
const FRESH_MS = 10 * 60 * 1000;
// Auto starts here, then climbs: AVPlayer begins with the first listed variant.
const START_HEIGHT = 480;

export const qualityKey = (p: { height?: number; fps?: number }) =>
  `${p.height ?? 0}p${(p.fps ?? 30) > 30 ? "60" : ""}`;

let current:
  | {
      id: string;
      /** The audio language asked for; undefined is the original. */
      track?: string;
      /** Resolved with AV1 above 1080p. */
      av1: boolean;
      stream: VideoStream;
      playlists: Map<string, Promise<string>>;
    }
  | undefined;

/** Drops the resolved stream, so the next load fetches fresh media urls. */
export const forgetStream = () => {
  current = undefined;
};

// The video that plays after this one, resolved while this one plays so it can start at once.
// Kept for a few minutes only: its media urls expire, and a skipped-past video isn't worth the memory.
const AHEAD_MS = 8 * 60 * 1000;
let ahead:
  | { id: string; at: number; av1: boolean; stream: Promise<VideoStream> }
  | undefined;

/** Resolves a video in the background, so opening it next skips the wait; a failure is just forgotten. */
export function prepareStream(id: string, av1 = false) {
  if (current?.id === id) return;
  if (ahead?.id === id && Date.now() - ahead.at < AHEAD_MS) return;
  const stream = ytv.resolveStream(id, { maxHeight: 4320, av1 });
  ahead = { id, at: Date.now(), av1, stream };
  stream.catch(() => {
    if (ahead?.stream === stream) ahead = undefined;
  });
}

/** The prepared stream for this video, if it's still fresh enough to play through. */
async function preparedStream(
  id: string,
  av1: boolean,
): Promise<VideoStream | undefined> {
  const was = ahead;
  if (was?.id !== id || was.av1 !== av1) return undefined;
  ahead = undefined;
  if (Date.now() - was.at > AHEAD_MS) return undefined;
  const stream = await was.stream.catch(() => undefined);
  return stream && stream.expiresAt - Date.now() > FRESH_MS
    ? stream
    : undefined;
}

// `av1` undefined takes whatever stream is there (the song's video beside the music has no say).
async function streamFor(
  id: string,
  host: PlaylistHost,
  track?: string,
  av1?: boolean,
) {
  if (
    current?.id === id &&
    current.track === track &&
    (av1 === undefined || current.av1 === av1) &&
    current.stream.expiresAt - Date.now() > FRESH_MS
  )
    return current;
  if (current?.id !== id) host.forget?.();
  const stream =
    (!track && (await preparedStream(id, !!av1))) ||
    (await ytv.resolveStream(id, {
      maxHeight: 4320,
      audioTrack: track,
      av1: !!av1,
    }));
  current = { id, track, av1: !!av1, stream, playlists: new Map() };
  return current;
}

/** Resolves a video once and builds the master playlist for the chosen quality; switching quality reuses it all. */
export async function buildVideoSource(
  host: PlaylistHost,
  id: string,
  quality: Quality,
  track?: string,
  av1 = false,
): Promise<VideoSource> {
  const entry = await streamFor(id, host, track, av1);
  const { stream } = entry;
  const safe = id.replace(/\W/g, "_");
  const media = (key: string, part: StreamPart) => {
    let p = entry.playlists.get(key);
    if (!p) {
      p = fetchSegmentIndex(
        appFetch,
        part.url,
        stream.headers,
        part.indexRange?.end,
      ).then((index) => {
        if (!index) throw new Error("this video has no segment index");
        return host.publish(
          `v_${safe}_${key}.m3u8`,
          hlsMediaPlaylist(host.media(part, stream), index),
        );
      });
      p.catch(() => entry.playlists.delete(key));
      entry.playlists.set(key, p);
    }
    return p;
  };
  const variants = stream.variants.length ? stream.variants : [stream.video];
  const options = variants.map((v) => ({
    key: qualityKey(v),
    height: v.height ?? 0,
    fps: v.fps ?? 30,
  }));
  const fixed =
    typeof quality === "number"
      ? (variants.find((v) => (v.height ?? 0) <= quality) ?? variants.at(-1))
      : variants.find((v) => qualityKey(v) === quality);
  const chosen =
    quality === "auto" || !fixed
      ? [...variants].sort(
          (a, b) =>
            Math.abs((a.height ?? 0) - START_HEIGHT) -
            Math.abs((b.height ?? 0) - START_HEIGHT),
        )
      : [fixed];
  // One unreadable quality shouldn't sink Auto; drop it and keep the rest.
  const ready = await Promise.all(
    chosen.map((v) =>
      media(qualityKey(v), v).then(
        (uri) => ({ ...v, uri }),
        () => undefined,
      ),
    ),
  );
  const playable = ready.filter((v) => v !== undefined);
  if (!playable.length) throw new Error("this video has no segment index");
  // Each audio language gets its own playlist name, so switching doesn't reuse the old one.
  const lang = (stream.audioTrack ?? "main").replace(/\W/g, "_");
  const audio = await media(`audio_${lang}`, stream.audio);
  const key = fixed && quality !== "auto" ? qualityKey(fixed) : "auto";
  const uri = await host.publish(
    `v_${safe}_${key}_${lang}_master.m3u8`,
    hlsMaster(playable, { ...stream.audio, uri: audio }),
  );
  return { uri, stream, options, quality: key };
}

/** A video-only playlist of one quality (no sound), for showing a song's video beside the music player. */
export async function buildMutedVideo(
  host: PlaylistHost,
  id: string,
  maxHeight: number,
): Promise<string> {
  const entry = await streamFor(id, host);
  const { stream } = entry;
  const variants = stream.variants.length ? stream.variants : [stream.video];
  const v =
    variants.find((x) => (x.height ?? 0) <= maxHeight && (x.fps ?? 30) <= 30) ??
    variants.at(-1) ??
    stream.video;
  const index = await fetchSegmentIndex(
    appFetch,
    v.url,
    stream.headers,
    v.indexRange?.end,
  );
  if (!index) throw new Error("this video has no segment index");
  return host.publish(
    `m_${id.replace(/\W/g, "_")}_${qualityKey(v)}.m3u8`,
    hlsMediaPlaylist(host.media(v, stream), index),
  );
}
