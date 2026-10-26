import type { CaptionCue, CaptionTrack } from "@pawse/music-core";

import { defaultFetch, type FetchLike } from "../../util/http";

/** YouTube's timed text as cues; json3 is the easiest of its formats to read. */
export function parseJson3(json: any): CaptionCue[] {
  const out: CaptionCue[] = [];
  for (const e of json?.events ?? []) {
    if (!Array.isArray(e?.segs)) continue;
    const text = e.segs
      .map((s: any) => (typeof s?.utf8 === "string" ? s.utf8 : ""))
      .join("")
      // Some channels pad lines with zero-width characters to place them.
      .replace(/[\u200b-\u200d\ufeff]/g, "")
      .replace(/[ \t]+/g, " ")
      .replace(/ *\n */g, "\n")
      .trim();
    if (!text) continue;
    const start = (Number(e.tStartMs) || 0) / 1000;
    const end = start + (Number(e.dDurationMs) || 0) / 1000;
    out.push({ start, end, text });
  }
  // Auto captions overlap (each line stays while the next types in); end each where the next starts.
  for (let i = 0; i < out.length - 1; i++)
    if (out[i].end > out[i + 1].start) out[i].end = out[i + 1].start;
  // Drop lines with no time on screen, and join a line repeated back to back.
  const kept: CaptionCue[] = [];
  for (const c of out) {
    if (c.end - c.start < 0.05) continue;
    const last = kept.at(-1);
    if (last && last.text === c.text && c.start - last.end < 0.1)
      last.end = c.end;
    else kept.push(c);
  }
  return kept;
}

/** The cues of one caption track; `translate` asks YouTube for them in another language. */
export async function fetchCaptions(
  track: CaptionTrack,
  o: { fetch?: FetchLike; translate?: string } = {},
): Promise<CaptionCue[]> {
  const url = new URL(track.url);
  url.searchParams.set("fmt", "json3");
  if (o.translate) url.searchParams.set("tlang", o.translate);
  const res = await (o.fetch ?? defaultFetch)(url.toString(), {});
  if (!res.ok) throw new Error(`captions HTTP ${res.status}`);
  const text = await res.text();
  if (!text.trim()) throw new Error("captions came back empty");
  return parseJson3(JSON.parse(text));
}
