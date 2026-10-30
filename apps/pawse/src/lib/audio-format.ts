import type {
  AudioQuality,
  ResolvedStream,
  ResolveOptions,
  Track,
} from "@pawse/music-core";
import { Platform } from "react-native";

import { networkKind } from "./net";
import { effectiveQuality } from "./quality";
import { getSetting } from "./settings";

/** Which copy of a song to play; "best" is JioSaavn 320 when certain, else Opus, else AAC. */
export type AudioFormat = "best" | "opus" | "aac" | "saavn";

export const AUDIO_FORMATS: [AudioFormat, string][] = [
  ["best", "Best available"],
  ["opus", "Opus"],
  ["aac", "AAC"],
  ["saavn", "JioSaavn 320"],
];

export const audioFormatLabel = (f: AudioFormat) =>
  AUDIO_FORMATS.find(([v]) => v === f)?.[1] ?? "Best available";

export function audioFormat(): AudioFormat {
  const f = getSetting<string>("audioFormat", "best");
  return f === "opus" || f === "aac" || f === "saavn" ? f : "best";
}

const webOpus =
  Platform.OS === "web" &&
  typeof Audio !== "undefined" &&
  !!new Audio().canPlayType('audio/webm; codecs="opus"');

/** The player decodes WebM/Opus itself: Android, and browsers that do. */
export const opusNative = Platform.OS === "android" || webOpus;

/** Songs JioSaavn had no certain match for this session (it was tried first and YouTube played). */
export const saavnMisses = new Set<string>();

// iOS 17 reads Opus from MP4; before it only CAF carries Opus.
export const remuxContainer = () =>
  Number.parseInt(String(Platform.Version), 10) >= 17 ? "mp4" : "caf";

/** Why Opus can't be had on this iPhone right now, or undefined when it can (or isn't an iPhone). */
function remuxBlock(quality: AudioQuality): string | undefined {
  if (!getSetting("opusIphone", true))
    return "Turn on Opus on iPhone in Settings";
  if (quality !== "high") return "Not at the data saver quality";
  const kind = networkKind();
  if (kind === "offline") return "Needs a connection";
  if (kind === "cellular" && getSetting("wifiOnly", false))
    return "Not on mobile data while downloads are Wi-Fi only";
  return undefined;
}

/** iPhone only: should YouTube's Opus be repackaged for this stream (data saver and Low quality stay on AAC)? */
export const remuxOpusOn = (quality: AudioQuality = effectiveQuality()) =>
  Platform.OS === "ios" && !remuxBlock(quality);

/** What the settings add to a resolve: the chosen format, and Opus alongside AAC where it can be repackaged. */
export function withFormat(o?: ResolveOptions): ResolveOptions {
  const f = audioFormat();
  return {
    saavn: f === "best" || f === "saavn" ? "first" : "never",
    codec: f === "aac" ? "aac" : undefined,
    // Downloads (remoteOnly) keep the plain stream.
    alsoOpus: !o?.remoteOnly && f !== "aac" && remuxOpusOn(o?.quality),
    ...o,
  };
}

/** Why `format` can't be played for this song now, or undefined when it can; shown under the disabled choice. */
export function formatBlock(
  format: AudioFormat,
  track?: Track,
  stream?: ResolvedStream,
): string | undefined {
  if (stream?.via === "local") return "This song plays from a download";
  if (format === "opus") {
    if (Platform.OS === "ios") return remuxBlock(effectiveQuality());
    return opusNative ? undefined : "This device can't play Opus";
  }
  if (format === "saavn") {
    if (track && track.kind !== "song")
      return "Only songs have a JioSaavn copy";
    if (effectiveQuality() !== "high") return "Not at the data saver quality";
    if (track && saavnMisses.has(track.id))
      return "No certain match on JioSaavn for this song";
  }
  return undefined;
}

/** The sentence that says why a small stream was chosen. */
export function lowReason(): string {
  const cell = networkKind() === "cellular";
  const choice = getSetting<string>(
    cell ? "qualityCellular" : "quality",
    "auto",
  );
  if (choice === "saver")
    return `Quality on ${cell ? "mobile data" : "Wi-Fi"} is set to save data.`;
  return effectiveQuality() === "saver"
    ? "Automatic chose it because the connection was slow."
    : "Automatic chose it earlier because the connection was slow.";
}
