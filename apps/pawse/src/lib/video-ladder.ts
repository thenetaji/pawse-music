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
  | { id: string; stream: VideoStream; playlists: Map<string, Promise<string>> }
  | undefined;

async function streamFor(id: string, host: PlaylistHost) {
  if (current?.id === id && current.stream.expiresAt - Date.now() > FRESH_MS)
    return current;
  if (current?.id !== id) host.forget?.();
  const stream = await ytv.resolveStream(id, { maxHeight: 4320 });
  current = { id, stream, playlists: new Map() };
  return current;
}

/** Resolves a video once and builds the master playlist for the chosen quality; switching quality reuses it all. */
export async function buildVideoSource(
  host: PlaylistHost,
  id: string,
  quality: Quality,
): Promise<VideoSource> {
  const entry = await streamFor(id, host);
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
  const audio = await media("audio", stream.audio);
  const key = fixed && quality !== "auto" ? qualityKey(fixed) : "auto";
  const uri = await host.publish(
    `v_${safe}_${key}_master.m3u8`,
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
