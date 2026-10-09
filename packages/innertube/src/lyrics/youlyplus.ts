import type { LyricLine } from "@studio/music-core";

import { ttmlTime } from "./ttml";

// Public Lyrics+ (KPoe) backends, tried in this order; the rest are dead.
export const YOULYPLUS_SERVERS = [
  "https://lyricsplus.binimum.org",
  "https://lyricsplus.prjktla.my.id",
  "https://lyricsplus.atomix.one",
  "https://lyrics-plus-backend.vercel.app",
];

// QQ Music opens with "Title - Artist/Artist" and writer lines, some flashed for a few ms.
const CREDIT_HEAD_MS = 1000;
const CREDIT_LINE_MS = 300;
const CREDIT_HEAD_LINES = 4;
const CREDIT = /\/|[:：]|\s[-–—]\s/;

type Word = NonNullable<LyricLine["words"]>[number];

export interface YouLyPlusResult {
  title?: string;
  artist?: string;
  /** Length of the recording the lyrics were timed to, when the server says. */
  durationSec?: number;
  /** False when every line sits at the same time (untimed Apple text). */
  synced: boolean;
  lines: LyricLine[];
}

const num = (v: unknown) =>
  typeof v === "number" && Number.isFinite(v) ? v : undefined;

function words(syllabus: any[]): Word[] {
  const out: Word[] = [];
  for (const s of syllabus) {
    const startMs = num(s?.time);
    const text = typeof s?.text === "string" ? s.text : "";
    if (s?.isBackground || startMs === undefined || !text) continue;
    const prev = out[out.length - 1];
    if (!text.trim()) {
      if (prev) prev.text += " ";
      continue;
    }
    out.push({ startMs, endMs: startMs + (num(s.duration) ?? 0), text });
  }
  return out.map((w) => ({ ...w, text: w.text.replace(/\s+$/, " ") }));
}

/** KPoe JSON → lines with word timings; background vocals are dropped. */
export function parseYouLyPlus(json: any): YouLyPlusResult | undefined {
  if (!json || !Array.isArray(json.lyrics)) return undefined;
  const meta = json.metadata ?? {};
  const picked = json.processingTime?.selectedSongMetadata ?? {};
  const lineOnly = json.type === "Line";
  const lines: LyricLine[] = [];
  for (const l of json.lyrics) {
    const startMs = num(l?.time);
    if (startMs === undefined) continue;
    const timed = Array.isArray(l.syllabus) ? words(l.syllabus) : [];
    const hasBackground =
      Array.isArray(l.syllabus) && l.syllabus.some((s: any) => s?.isBackground);
    const text = (
      hasBackground ? timed.map((w) => w.text).join("") : String(l.text ?? "")
    )
      .replace(/\s+/g, " ")
      .trim();
    if (!text) continue;
    const duration = num(l.duration);
    const endMs = duration
      ? startMs + duration
      : (timed[timed.length - 1]?.endMs ?? startMs);
    const line: LyricLine = { startMs, endMs, text };
    if (timed.length && !lineOnly) line.words = timed;
    lines.push(line);
  }
  const synced = lines.some(
    (l) => l.startMs !== lines[0].startMs || l.endMs > l.startMs,
  );
  const flash = (l: LyricLine) =>
    l.startMs < CREDIT_HEAD_MS &&
    l.endMs > l.startMs &&
    l.endMs - l.startMs < CREDIT_LINE_MS;
  const qq = /qq/i.test(String(meta.source ?? picked.source ?? ""));
  for (let i = 0; synced && i < CREDIT_HEAD_LINES && lines.length > 1; i++) {
    if (!flash(lines[0]) && !(qq && CREDIT.test(lines[0].text))) break;
    lines.shift();
  }
  const total =
    typeof meta.totalDuration === "string"
      ? ttmlTime(meta.totalDuration)
      : undefined;
  return {
    title: meta.title ?? picked.title,
    artist: meta.artist ?? picked.artist,
    durationSec: total ? total / 1000 : num(picked.duration),
    synced,
    lines,
  };
}
