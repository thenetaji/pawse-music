import type { LyricLine } from "@pawse/music-core";

import { decodeEntities } from "../saavn";

/** "27.395", "3:21.570", "1:02:03.5" or "12.3s" → ms. */
export function ttmlTime(v: string | undefined): number | undefined {
  if (!v) return undefined;
  const s = v.trim().replace(/s$/, "");
  const parts = s.split(":").map(Number);
  if (!parts.length || parts.some((p) => !Number.isFinite(p))) return undefined;
  const sec = parts.reduce((acc, p) => acc * 60 + p, 0);
  return Math.round(sec * 1000);
}

const attr = (tag: string, name: string) =>
  tag.match(new RegExp(`\\s${name}="([^"]*)"`))?.[1];
const stripTags = (s: string) => decodeEntities(s.replace(/<[^>]+>/g, ""));

/** Apple-style TTML (BetterLyrics): <p> lines with optional word <span>s; background vocals are dropped. */
export function parseTtml(ttml: string): LyricLine[] {
  const out: LyricLine[] = [];
  const body = ttml.replace(
    /<span[^>]*ttm:role="x-(?:bg|translation|roman)"[^>]*>(?:[^<]|<span[^>]*>[^<]*<\/span>)*<\/span>/g,
    "",
  );
  for (const m of body.matchAll(/<p\b([^>]*)>([\s\S]*?)<\/p>/g)) {
    const startMs = ttmlTime(attr(m[1], "begin"));
    const endMs = ttmlTime(attr(m[1], "end"));
    if (startMs === undefined) continue;
    const spans = [...m[2].matchAll(/<span\b([^>]*)>([^<]*)<\/span>(\s?)/g)];
    const words = spans
      .map((s) => ({
        startMs: ttmlTime(attr(s[1], "begin")),
        endMs: ttmlTime(attr(s[1], "end")),
        text: decodeEntities(s[2]) + s[3],
      }))
      .filter(
        (w): w is { startMs: number; endMs: number; text: string } =>
          w.startMs !== undefined && w.endMs !== undefined && !!w.text.trim(),
      );
    const text = stripTags(m[2]).replace(/\s+/g, " ").trim();
    if (!text) continue;
    const line: LyricLine = {
      startMs,
      endMs: endMs ?? words[words.length - 1]?.endMs ?? startMs,
      text,
    };
    if (words.length)
      line.words = words.map((w) => ({
        ...w,
        text: w.text.replace(/\s+$/, " "),
      }));
    out.push(line);
  }
  return out;
}
