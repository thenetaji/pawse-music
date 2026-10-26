import {
  type AudioTrackOption,
  type CaptionTrack,
  StreamError,
  type StreamPart,
  type VideoStream,
} from "@pawse/music-core";

import { defaultFetch } from "../../util/http";
import { defaultStreamClients } from "../clients";
import {
  type AdaptiveFormat,
  pickAudioFormat,
  type ResolveAttempt,
  type ResolveOptions,
  resolveYouTubeStream,
} from "../stream";

export interface VideoStreamOptions
  extends Partial<Omit<ResolveOptions, "pick" | "onFormat">> {
  /** Tallest picture to return (default 1080). */
  maxHeight?: number;
  /** The audio language to play, an id from `audioTracks`; the original when unset. */
  audioTrack?: string;
}

const isOriginal = (f: AdaptiveFormat) =>
  /original/i.test(f.audioTrack?.displayName ?? "");

/** The id of the audio to play: the one asked for, else the original language, else YouTube's default. */
export function chooseAudioTrack(
  formats: AdaptiveFormat[] | undefined,
  want?: string,
): string | undefined {
  const dubbed = (formats ?? []).filter((f) => f.audioTrack);
  if (!dubbed.length) return undefined;
  if (want && dubbed.some((f) => f.audioTrack?.id === want)) return want;
  return (
    dubbed.find(isOriginal) ??
    dubbed.find((f) => f.audioTrack?.audioIsDefault) ??
    dubbed[0]
  ).audioTrack?.id;
}

/** Each audio language once, the original first. */
export function audioTracksOf(
  formats: AdaptiveFormat[] | undefined,
): AudioTrackOption[] {
  const seen = new Map<string, AudioTrackOption>();
  for (const f of formats ?? []) {
    const t = f.audioTrack;
    if (!t || seen.has(t.id)) continue;
    seen.set(t.id, {
      id: t.id,
      name: (t.displayName ?? t.id).replace(/\s*original\s*/i, " ").trim(),
      original: isOriginal(f),
    });
  }
  return [...seen.values()].sort(
    (a, b) => Number(!!b.original) - Number(!!a.original),
  );
}

/** Caption tracks from a player answer. */
export function captionTracksOf(data: any): CaptionTrack[] {
  const list: any[] =
    data?.captions?.playerCaptionsTracklistRenderer?.captionTracks ?? [];
  return list
    .filter((t) => typeof t?.baseUrl === "string")
    .map((t) => ({
      url: t.baseUrl,
      lang: String(t.languageCode ?? ""),
      name: String(
        t.name?.simpleText ?? t.name?.runs?.[0]?.text ?? t.languageCode ?? "",
      ),
      auto: t.kind === "asr",
    }));
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
  const {
    maxHeight = DEFAULT_MAX_HEIGHT,
    audioTrack: wantTrack,
    ...rest
  } = options;
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
  let captions: CaptionTrack[] = [];
  let audioTracks: AudioTrackOption[] = [];
  let audioTrack: string | undefined;
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
      onPlayerData: (data) => {
        captions = captionTracksOf(data);
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
      // Dubbed videos carry every language; play the original (or the one asked for), not a random dub.
      pick: (formats, ciphered) => {
        audioTracks = audioTracksOf(formats);
        audioTrack = chooseAudioTrack(formats, wantTrack);
        return pickAudioFormat(
          (formats ?? []).filter(
            (f) => !audioTrack || f.audioTrack?.id === audioTrack,
          ),
          "high",
          false,
          ciphered,
        );
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
    audioTracks: audioTracks.length > 1 ? audioTracks : undefined,
    audioTrack,
    captions: captions.length ? captions : undefined,
  };
}
