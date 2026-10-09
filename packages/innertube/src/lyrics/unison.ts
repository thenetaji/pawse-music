import type { LyricLine } from "@studio/music-core";

import { parseLrc, unsync } from "./lrc";
import { parseTtml } from "./ttml";

export const UNISON = "https://unison.boidu.dev/lyrics";
const BACKGROUND = /\s*\[bg:[^\]]*\]/g;

export interface UnisonEntry {
  title?: string;
  artist?: string;
  lines: LyricLine[];
  plain: string;
}

/** A Unison /lyrics `data` record (TTML, enhanced LRC or plain text) → lines; background vocals are dropped. */
export function parseUnison(
  data: any,
  durationSec?: number,
): UnisonEntry | undefined {
  if (!data || data.hidden || typeof data.lyrics !== "string") return undefined;
  const format = String(data.format ?? "").toLowerCase();
  const raw: string =
    format === "lrc" ? data.lyrics.replace(BACKGROUND, "") : data.lyrics;
  const lines =
    format === "ttml"
      ? parseTtml(raw)
      : format === "lrc"
        ? parseLrc(raw, durationSec)
        : [];
  const plain =
    format === "ttml"
      ? lines.map((l) => l.text).join("\n")
      : format === "lrc"
        ? unsync(raw)
        : raw.trim();
  if (!lines.length && !plain) return undefined;
  return { title: data.song, artist: data.artist, lines, plain };
}
