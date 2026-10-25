import {
  StreamError,
  type StreamPart,
  type VideoStream,
} from "@pawse/music-core";

import { defaultFetch } from "../../util/http";
import { defaultStreamClients } from "../clients";
import {
  type AdaptiveFormat,
  type ResolveAttempt,
  type ResolveOptions,
  resolveYouTubeStream,
} from "../stream";

export interface VideoStreamOptions
  extends Partial<Omit<ResolveOptions, "pick" | "onFormat">> {
  /** Tallest picture to return (default 1080). */
  maxHeight?: number;
}

const DEFAULT_MAX_HEIGHT = 1080;

const usable = (f: AdaptiveFormat, ciphered: boolean): boolean =>
  ciphered ? !!(f.url || f.signatureCipher || f.cipher) : !!f.url;
const isAvc = (f: AdaptiveFormat): boolean =>
  /^video\/mp4\b/i.test(f.mimeType ?? "") && /avc1/i.test(f.mimeType ?? "");

/** Tallest H.264 MP4 video format at or below maxHeight; ties go to higher fps, then bitrate. */
export function pickVideoFormat(
  formats: AdaptiveFormat[] | undefined,
  maxHeight = DEFAULT_MAX_HEIGHT,
  ciphered = false,
): AdaptiveFormat | undefined {
  return (formats ?? [])
    .filter(
      (f) => isAvc(f) && usable(f, ciphered) && (f.height ?? 0) <= maxHeight,
    )
    .sort(
      (a, b) =>
        (b.height ?? 0) - (a.height ?? 0) ||
        (b.fps ?? 0) - (a.fps ?? 0) ||
        (b.bitrate ?? 0) - (a.bitrate ?? 0),
    )[0];
}

const qualityKey = (f: AdaptiveFormat) =>
  `${f.height ?? 0}p${(f.fps ?? 30) > 30 ? 60 : 30}`;

/** One H.264 format per height and frame rate at or below maxHeight (the highest bitrate of each), tallest first. */
export function videoLadder(
  formats: AdaptiveFormat[] | undefined,
  maxHeight = DEFAULT_MAX_HEIGHT,
  ciphered = false,
): AdaptiveFormat[] {
  const best = new Map<string, AdaptiveFormat>();
  for (const f of formats ?? []) {
    if (!isAvc(f) || !usable(f, ciphered) || (f.height ?? 0) > maxHeight)
      continue;
    const k = qualityKey(f);
    const had = best.get(k);
    if (!had || (f.bitrate ?? 0) > (had.bitrate ?? 0)) best.set(k, f);
  }
  return [...best.values()].sort(
    (a, b) =>
      (b.height ?? 0) - (a.height ?? 0) ||
      (b.fps ?? 0) - (a.fps ?? 0) ||
      (b.bitrate ?? 0) - (a.bitrate ?? 0),
  );
}

const range = (r?: { start: string; end: string }) => {
  const start = Number(r?.start);
  const end = Number(r?.end);
  return r && Number.isFinite(start) && Number.isFinite(end)
    ? { start, end }
    : undefined;
};

const part = (
  f: AdaptiveFormat,
  url: string,
  mimeType: string,
  bitrate: number,
  contentLength?: number,
): StreamPart => ({
  url,
  mimeType,
  bitrate,
  ...(f.width ? { width: f.width } : {}),
  ...(f.height ? { height: f.height } : {}),
  ...(f.fps ? { fps: f.fps } : {}),
  ...(contentLength ? { contentLength } : {}),
  initRange: range(f.initRange),
  indexRange: range(f.indexRange),
});

/** Every H.264 quality (<= maxHeight) plus best AAC audio from one stream client; the client that serves the video also serves the audio. */
export async function resolveVideoStream(
  videoId: string,
  options: VideoStreamOptions = {},
  attempts: ResolveAttempt[] = [],
): Promise<VideoStream> {
  const { maxHeight = DEFAULT_MAX_HEIGHT, ...rest } = options;
  const o: ResolveOptions = {
    fetch: defaultFetch,
    clients: defaultStreamClients(),
    hl: "en",
    gl: "US",
    verify: true,
    verifyBudgetMs: 1500,
    ...rest,
  };
  let picked: { format: AdaptiveFormat; via: string } | undefined;
  let extras: { format: AdaptiveFormat; url: string }[] = [];
  const video = await resolveYouTubeStream(
    videoId,
    {
      ...o,
      pick: (formats, ciphered) =>
        pickVideoFormat(formats, maxHeight, ciphered),
      onFormat: (format, via) => {
        picked = { format, via };
      },
      extra: (formats, chosen) =>
        videoLadder(formats, maxHeight, !!o.sandbox).filter(
          (f) => qualityKey(f) !== qualityKey(chosen),
        ),
      onExtra: (list) => {
        extras = list;
      },
    },
    attempts,
  );
  if (!picked) throw new StreamError("no_audio", "no H.264 video format");
  const same = o.clients.filter((c) => `youtube:${c.name}` === picked?.via);
  let audioFormat: AdaptiveFormat | undefined;
  const audio = await resolveYouTubeStream(
    videoId,
    {
      ...o,
      clients: same,
      exclude: undefined,
      avoid: undefined,
      onFormat: (format) => {
        audioFormat = format;
      },
    },
    attempts,
  );
  if (!audioFormat) throw new StreamError("no_audio", "no AAC audio format");
  const top = part(
    picked.format,
    video.url,
    video.mimeType,
    video.bitrate,
    video.contentLength,
  );
  const variants = [
    top,
    ...extras.map(({ format: f, url }) =>
      part(
        f,
        url,
        f.mimeType ?? "video/mp4",
        f.bitrate ?? 0,
        Number(f.contentLength) || undefined,
      ),
    ),
  ].sort(
    (a, b) => (b.height ?? 0) - (a.height ?? 0) || (b.fps ?? 0) - (a.fps ?? 0),
  );
  return {
    video: top,
    variants,
    audio: part(
      audioFormat,
      audio.url,
      audio.mimeType,
      audio.bitrate,
      audio.contentLength,
    ),
    durationSec: video.durationSec ?? audio.durationSec,
    expiresAt: Math.min(video.expiresAt, audio.expiresAt),
    headers: video.headers,
    via: video.via,
  };
}
