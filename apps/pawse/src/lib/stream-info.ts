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
          : sub === "x-caf"
            ? "CAF"
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
  if (via === "remux:opus") return "YouTube (Opus, repackaged for iPhone)";
  return "YouTube Music";
}

/** Under 120 kbps (YouTube's 48 kbps AAC, its 50 and 70 kbps Opus, JioSaavn 96): below YouTube's standard 128. */
export function isLowTier(st: ResolvedStream, durationSec?: number): boolean {
  if (st.via === "local") return false;
  const kbps = streamKbps(st, durationSec);
  return !!kbps && kbps < 120;
}

/** The chip's text ("AAC 128 kbps", "Opus 160 kbps", "320 kbps · JioSaavn", "AAC 48 kbps · data saver") and whether it earns the HQ look (256 kbps and up). */
export function qualityBadge(
  st: ResolvedStream,
  durationSec?: number,
): { label: string; hq: boolean } | undefined {
  const kbps = streamKbps(st, durationSec);
  if (!kbps) return undefined;
  if (st.via === "saavn")
    return { label: `${kbps} kbps · JioSaavn`, hq: kbps >= 256 };
  const low = isLowTier(st, durationSec);
  // YouTube reports 130 for its "128", so nearest 16 reads as the tier it is; below that the steps are finer so
  // a 58 kbps stream is never shown as 64.
  const step = low ? 8 : 16;
  const nominal = Math.round(kbps / step) * step;
  const label = `${streamFormat(st.mimeType).codec} ${nominal} kbps`;
  return { label: low ? `${label} · data saver` : label, hq: nominal >= 256 };
}

/** One sentence on what the stream means for sound; `why` (see lowReason) is added when the stream is a small one. */
export function qualityNote(
  st: ResolvedStream,
  durationSec?: number,
  why?: string,
): string | undefined {
  const kbps = streamKbps(st, durationSec);
  if (st.via === "local") return "Played from a download on this device.";
  if (!kbps) return undefined;
  const { codec } = streamFormat(st.mimeType);
  const low = isLowTier(st, durationSec);
  const step = low ? 8 : 16;
  const nominal = Math.round(kbps / step) * step;
  if (st.via === "saavn")
    return kbps >= 256
      ? `${kbps} kbps from JioSaavn: more than YouTube offers, played because it is certainly the same recording.`
      : `${kbps} kbps from JioSaavn.`;
  if (low)
    return `${nominal} kbps saves data but sounds thin and noisy on detailed music.${why ? ` ${why}` : ""}`;
  if (codec === "Opus")
    return st.via === "remux:opus"
      ? `Opus ${nominal} kbps: YouTube's best quality, repackaged for iPhone.`
      : `Opus ${nominal} kbps: YouTube's best quality.`;
  return nominal >= 192
    ? `${nominal} kbps ${codec}: YouTube's high quality.`
    : `${nominal} kbps ${codec}: YouTube's standard quality.`;
}

/** Decibels the song is turned by when loudness is normalised; 0 for none. */
export function normalizeGainDb(loudnessDb?: number): number {
  const db = 20 * Math.log10(normalizeVolume(loudnessDb));
  return Math.abs(db) < 0.05 ? 0 : Math.round(db * 10) / 10;
}

export function sampleRateText(hz?: number): string | undefined {
  return hz && hz > 0 ? `${Number((hz / 1000).toFixed(1))} kHz` : undefined;
}
