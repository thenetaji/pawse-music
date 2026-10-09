import type { LyricLine, Lyrics } from "@pawse/music-core";

// Parses LRC (line tags, optional <mm:ss.xx> word tags) into music-core lyrics.
export function parseLrc(
  text: string,
  source: Lyrics["source"] = "lrclib",
): Lyrics {
  const lines: LyricLine[] = [];
  for (const raw of text.split("\n")) {
    const m = raw.match(/^\[(\d+):(\d+(?:\.\d+)?)\](.*)$/);
    if (!m) continue;
    lines.push({
      startMs: Math.round((+m[1] * 60 + +m[2]) * 1000),
      endMs: 0,
      text: m[3].replace(/<\d+:\d+(?:\.\d+)?>/g, "").trim(),
    });
  }
  lines.sort((a, b) => a.startMs - b.startMs);
  lines.forEach(
    (l, i) => (l.endMs = lines[i + 1]?.startMs ?? l.startMs + 5000),
  );
  return { source, synced: lines.length > 0, lines };
}

export function activeLine(lines: LyricLine[], ms: number): number {
  let lo = 0,
    hi = lines.length - 1,
    ans = -1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (lines[mid].startMs <= ms) {
      ans = mid;
      lo = mid + 1;
    } else hi = mid - 1;
  }
  return ans;
}
