import type { LyricLine } from "@studio/music-core";

const TAG = /\[(\d{1,3}):(\d{1,2})(?:[.:](\d{1,3}))?\]/g;
const WORD = /<(\d{1,3}):(\d{1,2})(?:[.:](\d{1,3}))?>/;
const LAST_LINE_MS = 5000;

const ms = (m: string, s: string, frac?: string): number => {
  const f = frac ? Number(frac.padEnd(3, "0").slice(0, 3)) : 0;
  return Number(m) * 60_000 + Number(s) * 1000 + f;
};

function words(
  body: string,
  lineEnd: number,
  offset: number,
): { text: string; words?: LyricLine["words"] } {
  const parts = body.split(new RegExp(WORD.source));
  if (parts.length < 5) return { text: body.trim() };
  // parts: [pre, m, s, frac, word, m, s, frac, word, ...]
  const out: { startMs: number; text: string }[] = [];
  for (let i = 1; i + 3 < parts.length; i += 4) {
    out.push({
      startMs: Math.max(0, ms(parts[i], parts[i + 1], parts[i + 2]) - offset),
      text: parts[i + 3] ?? "",
    });
  }
  const timed = out
    .map((w, i) => ({ ...w, endMs: out[i + 1]?.startMs ?? lineEnd }))
    .filter((w) => w.text.trim());
  const text = (parts[0] + out.map((w) => w.text).join(""))
    .replace(/\s+/g, " ")
    .trim();
  return timed.length
    ? {
        text,
        words: timed.map((w) => ({
          startMs: w.startMs,
          endMs: w.endMs,
          text: w.text,
        })),
      }
    : { text };
}

/** LRC, including repeated time tags, [offset:] and enhanced <mm:ss.xx> word tags. */
export function parseLrc(lrc: string, durationSec?: number): LyricLine[] {
  const offset = Number(lrc.match(/\[offset:\s*([+-]?\d+)\s*\]/i)?.[1] ?? 0);
  const entries: { startMs: number; body: string }[] = [];
  for (const raw of lrc.split(/\r?\n/)) {
    const line = raw.trim();
    TAG.lastIndex = 0;
    const stamps: number[] = [];
    let m: RegExpExecArray | null;
    let end = 0;
    while ((m = TAG.exec(line)) && m.index === end) {
      stamps.push(Math.max(0, ms(m[1], m[2], m[3]) - offset));
      end = TAG.lastIndex;
    }
    const body = line.slice(end);
    for (const startMs of stamps) entries.push({ startMs, body });
  }
  entries.sort((a, b) => a.startMs - b.startMs);
  const out: LyricLine[] = [];
  entries.forEach((e, i) => {
    const endMs =
      entries[i + 1]?.startMs ??
      (durationSec
        ? Math.max(durationSec * 1000, e.startMs)
        : e.startMs + LAST_LINE_MS);
    const { text, words: w } = words(e.body, endMs, offset);
    if (!text) return;
    out.push(
      w
        ? { startMs: e.startMs, endMs, text, words: w }
        : { startMs: e.startMs, endMs, text },
    );
  });
  return out;
}

/** Unsynced text as zero-timed lines. */
export const plainLines = (text: string): LyricLine[] =>
  text
    .split(/\r?\n/)
    .map((t) => t.trim())
    .filter(Boolean)
    .map((t) => ({ startMs: 0, endMs: 0, text: t }));

/** LRC → plain text: time and word tags dropped, metadata lines ([ar:], [offset:]) removed. */
export const unsync = (lrc: string | undefined): string =>
  (lrc ?? "")
    .split(/\r?\n/)
    .filter((l) => !/^\s*\[[a-z]+:[^\]]*\]\s*$/i.test(l))
    .map((l) =>
      l
        .replace(TAG, "")
        .replace(new RegExp(WORD.source, "g"), "")
        .replace(/\s+/g, " ")
        .trim(),
    )
    .filter(Boolean)
    .join("\n");
