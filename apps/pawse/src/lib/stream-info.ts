import type { ResolvedStream } from "@pawse/music-core";
import { normalizeVolume } from "@pawse/player";

// 'audio/mp4; codecs="mp4a.40.2"' → AAC in MP4; 'audio/webm; codecs="opus"' → Opus in WebM.
export function streamFormat(mime: string): {
  codec: string;
  container: string;
} {
  const sub = (mime.split(";")[0].split("/")[1] ?? "").trim().toLowerCase();
  const codecs = (/codecs="?([^";]+)/i.exec(mime)?.[1] ?? "").toLowerCase();
  const container =
    sub === "mp4" || sub === "m4a"
      ? "MP4"
      : sub === "webm"
        ? "WebM"
        : sub === "mpeg"
          ? "MP3"
          : sub.toUpperCase() || "Unknown";
  const codec = codecs.startsWith("mp4a")
    ? "AAC"
    : codecs.includes("opus")
      ? "Opus"
      : codecs.includes("vorbis")
        ? "Vorbis"
        : codecs.includes("flac") || sub === "flac"
          ? "FLAC"
          : sub === "mpeg" || sub === "mp3"
            ? "MP3"
            : sub === "mp4" || sub === "m4a" || sub === "aac"
              ? "AAC"
              : container;
  return { codec, container };
}

/** Kilobits per second; downloads don't record a bitrate, so size over length stands in. */
export function streamKbps(
  st: ResolvedStream,
  durationSec?: number,
): number | undefined {
  if (st.bitrate > 0) return Math.round(st.bitrate / 1000);
  const dur = st.durationSec ?? durationSec;
  return st.contentLength && dur
    ? Math.round((st.contentLength * 8) / dur / 1000)
    : undefined;
}

/** Where the audio comes from, in the app's words. */
export function streamSource(via: string): string {
  if (via === "local") return "This device";
  if (via === "saavn") return "JioSaavn";
  return "YouTube Music";
}

/** The chip's text ("320 kbps", "AAC 256", "Opus 160") and whether it earns the HQ look (256 kbps and up). */
export function qualityBadge(
  st: ResolvedStream,
  durationSec?: number,
): { label: string; hq: boolean } | undefined {
  const kbps = streamKbps(st, durationSec);
  if (!kbps) return undefined;
  // YouTube reports 130 for its "128"; nearest 16 reads as the tier it is.
  const nominal = st.via === "saavn" ? kbps : Math.round(kbps / 16) * 16;
  const label =
    st.via === "saavn"
      ? `${nominal} kbps`
      : `${streamFormat(st.mimeType).codec} ${nominal}`;
  return { label, hq: nominal >= 256 };
}

/** Decibels the song is turned by when loudness is normalised; 0 for none. */
export function normalizeGainDb(loudnessDb?: number): number {
  const db = 20 * Math.log10(normalizeVolume(loudnessDb));
  return Math.abs(db) < 0.05 ? 0 : Math.round(db * 10) / 10;
}

export function sampleRateText(hz?: number): string | undefined {
  return hz && hz > 0 ? `${Number((hz / 1000).toFixed(1))} kHz` : undefined;
}
